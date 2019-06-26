/**
 * Copyright 2017 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {EventEmitter} from 'events';
import * as shimmer from 'shimmer';

import {Patch, Plugin, Span, Tracer} from '../plugin-types';

import {pg_6, pg_7} from './types';

// TS: Client#query also accepts a callback as a last argument, but TS cannot
// detect this as it's a dependent type. So we don't specify it here.
type ClientQueryArguments =
  | [Submittable & pg_7.QueryConfig]
  | [string]
  | [string, {}];
type PG7QueryReturnValue =
  | (pg_7.QueryConfig & ({submit: Function} & EventEmitter) | pg_7.Query)
  | Promise<pg_7.QueryResult>;
type Callback<T> = (err: Error | null, res?: T) => void;

const noOp = () => {};

function populateLabelsFromInputs(span: Span, args: ClientQueryArguments) {
  const queryObj = args[0];
  if (typeof queryObj === 'object') {
    if (queryObj.text) {
      span.addLabel('query', queryObj.text);
    }
    if (queryObj.values) {
      span.addLabel('values', queryObj.values);
    }
  } else if (typeof queryObj === 'string') {
    span.addLabel('query', queryObj);
    if (args.length >= 2 && typeof args[1] !== 'function') {
      span.addLabel('values', args[1]);
    }
  }
}

function populateLabelsFromOutputs(
  span: Span,
  err: Error | null,
  res?: pg_7.QueryResult
) {
  if (err) {
    span.addLabel('error', err);
  }
  if (res) {
    span.addLabel('row_count', res.rowCount);
    span.addLabel('oid', res.oid);
    span.addLabel('rows', res.rows);
    span.addLabel('fields', res.fields);
  }
}

/**
 * Partial shape of objects returned by Client#query. Only contains methods that
 * are significant to the query lifecycle.
 */
interface Submittable {
  // Called when the query is completed.
  handleReadyForQuery: () => void;
  // Called when an error occurs.
  handleError: () => void;
  // A field that is populated when the Submittable is a Query object.
  _result?: pg_7.QueryResult;
}

/**
 * Utility class to help organize patching logic.
 */
class PostgresPatchUtility {
  readonly maybePopulateLabelsFromInputs: typeof populateLabelsFromInputs;
  readonly maybePopulateLabelsFromOutputs: typeof populateLabelsFromOutputs;

  constructor(private readonly tracer: Tracer) {
    this.maybePopulateLabelsFromInputs = tracer.enhancedDatabaseReportingEnabled()
      ? populateLabelsFromInputs
      : noOp;
    this.maybePopulateLabelsFromOutputs = tracer.enhancedDatabaseReportingEnabled()
      ? populateLabelsFromOutputs
      : noOp;
  }

  patchSubmittable(pgQuery: Submittable, span: Span): Submittable {
    let spanEnded = false;
    const {maybePopulateLabelsFromOutputs} = this;
    if (pgQuery.handleError) {
      shimmer.wrap(pgQuery, 'handleError', origCallback => {
        // Elements of args are not individually accessed.
        // tslint:disable:no-any
        return this.tracer.wrap(function(
          this: Submittable,
          ...args: any[]
        ): void {
          // tslint:enable:no-any
          if (!spanEnded) {
            const err: Error = args[0];
            maybePopulateLabelsFromOutputs(span, err);
            span.endSpan();
            spanEnded = true;
          }
          if (origCallback) {
            origCallback.apply(this, args);
          }
        });
      });
    }
    if (pgQuery.handleReadyForQuery) {
      shimmer.wrap(pgQuery, 'handleReadyForQuery', origCallback => {
        // Elements of args are not individually accessed.
        // tslint:disable:no-any
        return this.tracer.wrap(function(
          this: Submittable,
          ...args: any[]
        ): void {
          // tslint:enable:no-any
          if (!spanEnded) {
            maybePopulateLabelsFromOutputs(span, null, this._result);
            span.endSpan();
            spanEnded = true;
          }
          if (origCallback) {
            origCallback.apply(this, args);
          }
        });
      });
    }
    return pgQuery;
  }

  patchCallback(
    callback: Callback<pg_7.QueryResult>,
    span: Span
  ): Callback<pg_7.QueryResult> {
    return this.tracer.wrap((err: Error | null, res?: pg_7.QueryResult) => {
      this.maybePopulateLabelsFromOutputs(span, err, res);
      span.endSpan();
      callback(err, res);
    });
  }

  patchPromise(
    promise: Promise<pg_7.QueryResult>,
    span: Span
  ): Promise<pg_7.QueryResult> {
    return (promise = promise.then(
      res => {
        this.maybePopulateLabelsFromOutputs(span, null, res);
        span.endSpan();
        return res;
      },
      err => {
        this.maybePopulateLabelsFromOutputs(span, err);
        span.endSpan();
        throw err;
      }
    ));
  }
}

const plugin: Plugin = [
  {
    file: 'lib/client.js',
    versions: '^6.x',
    // TS: Client is a class name.
    // tslint:disable-next-line:variable-name
    patch: (Client, api) => {
      const pgPatch = new PostgresPatchUtility(api);

      shimmer.wrap(Client.prototype, 'query', query => {
        // Every call to Client#query will have a Submittable object associated
        // with it. We need to patch two handlers (handleReadyForQuery and
        // handleError) to end a span.
        // There are a few things to note here:
        // * query accepts a Submittable or a string. A Query is a Submittable.
        //   So if we can get a Submittable from the input we patch it
        //   proactively, otherwise (in the case of a string) we patch the
        //   output Query instead.
        // * If query is passed a callback, the callback will be invoked from
        //   either handleReadyForQuery or handleError. So we don't need to
        //   separately patch the callback.
        return function query_trace(
          this: pg_6.Client,
          ...args: ClientQueryArguments
        ) {
          if (args.length >= 1) {
            const span = api.createChildSpan({name: 'pg-query'});
            if (!api.isRealSpan(span)) {
              return query.apply(this, args);
            }
            // Extract query text and values, if needed.
            pgPatch.maybePopulateLabelsFromInputs(span, args);
            if (typeof args[0] === 'object') {
              pgPatch.patchSubmittable(args[0], span);
              return query.apply(this, args);
            } else {
              return pgPatch.patchSubmittable(
                query.apply(this, args) as Submittable,
                span
              );
            }
          } else {
            // query was called with no arguments.
            // This doesn't make sense, but don't do anything that might cause
            // an error to get thrown here, or a span to be started.
            return query.apply(this, args);
          }
        };
      });
    },
    // TS: Client is a class name.
    // tslint:disable-next-line:variable-name
    unpatch(Client) {
      shimmer.unwrap(Client.prototype, 'query');
    },
  } as Patch<typeof pg_6.Client>,
  {
    file: 'lib/client.js',
    versions: '^7.x',
    // TS: Client is a class name.
    // tslint:disable-next-line:variable-name
    patch: (Client, api) => {
      const pgPatch = new PostgresPatchUtility(api);
      shimmer.wrap(Client.prototype, 'query', query => {
        return function query_trace(this: pg_7.Client) {
          const span = api.createChildSpan({name: 'pg-query'});
          if (!api.isRealSpan(span)) {
            return query.apply(this, arguments);
          }

          let pgQuery: PG7QueryReturnValue;
          // In 7.x, the value of pgQuery depends on how the query() was called.
          // It can be one of:
          // - (query: pg.Submittable) => EventEmitter
          //   - Note: return value is the same as the argument.
          // - ([*], callback: (err, res: pg.Result) => void) => void
          // - ([*]) => Promise<pg.Result>
          // where [*] is one of:
          // - ...[query: { text: string, values?: Array<any> }]
          // - ...[text: string, values?: Array<any>]
          // See: https://node-postgres.com/guides/upgrading
          const argLength = arguments.length;
          if (argLength >= 1) {
            const args: ClientQueryArguments = Array.prototype.slice.call(
              arguments,
              0
            );

            // Extract query text and values, if needed.
            pgPatch.maybePopulateLabelsFromInputs(span, args);

            // If we received a callback, bind it to the current context,
            // optionally adding labels as well.
            const callback = args[args.length - 1];
            if (typeof callback === 'function') {
              args[args.length - 1] = pgPatch.patchCallback(
                callback as Callback<pg_7.QueryResult>,
                span
              );
            } else if (typeof args[0] === 'object') {
              pgPatch.patchSubmittable(args[0] as Submittable, span);
            }
            pgQuery = query.apply(this, args);
          } else {
            pgQuery = query.apply(this, arguments);
          }

          if (pgQuery) {
            if (pgQuery instanceof EventEmitter) {
              api.wrapEmitter(pgQuery);
            } else if (typeof pgQuery.then === 'function') {
              // Unlike in pg 6, the returned value can't be both a Promise and
              // a Submittable. So we don't run the risk of double-patching
              // here.
              pgPatch.patchPromise(pgQuery, span);
            }
          }
          return pgQuery;
        };
      });
    },
    // TS: Client is a class name.
    // tslint:disable-next-line:variable-name
    unpatch(Client) {
      shimmer.unwrap(Client.prototype, 'query');
    },
  } as Patch<typeof pg_7.Client>,
];

export = plugin;
