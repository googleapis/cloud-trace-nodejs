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
import {Readable} from 'stream';

import {Patch, Plugin, Span} from '../plugin-types';

import {pg_6, pg_7} from './types';

// TS: Client#query also accepts a callback as a last argument, but TS cannot
// detect this as it's a dependent type. So we don't specify it here.
type ClientQueryArguments =
    [{submit?: Function} & pg_7.QueryConfig]|[string]|[string, {}];
type PG7QueryReturnValue = (pg_7.QueryConfig&({submit: Function}&EventEmitter)|
                            pg_7.Query)|Promise<pg_7.QueryResult>;

// tslint:disable-next-line:no-any
function isSubmittable(obj: any): obj is {submit: Function} {
  return typeof obj.submit === 'function';
}

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
    span: Span, err: Error|null, res?: pg_7.QueryResult) {
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

const plugin: Plugin = [
  {
    file: 'lib/client.js',
    versions: '^6.x',
    // TS: Client is a class name.
    // tslint:disable-next-line:variable-name
    patch: (Client, api) => {
      const maybePopulateLabelsFromInputs =
          api.enhancedDatabaseReportingEnabled() ? populateLabelsFromInputs :
                                                   noOp;
      const maybePopulateLabelsFromOutputs =
          api.enhancedDatabaseReportingEnabled() ? populateLabelsFromOutputs :
                                                   noOp;
      shimmer.wrap(Client.prototype, 'query', (query) => {
        return function query_trace(this: pg_6.Client) {
          const span = api.createChildSpan({name: 'pg-query'});
          if (!api.isRealSpan(span)) {
            return query.apply(this, arguments);
          }
          const argLength = arguments.length;
          if (argLength >= 1) {
            const args: ClientQueryArguments =
                Array.prototype.slice.call(arguments, 0);
            // Extract query text and values, if needed.
            maybePopulateLabelsFromInputs(span, args);
          }
          const pgQuery: pg_6.QueryReturnValue = query.apply(this, arguments);
          api.wrapEmitter(pgQuery);
          const done = pgQuery.callback;
          // TODO(kjin): Clean up this line a little bit by casting the function
          // passed to api.wrap as a NonNullable<typeof done>.
          pgQuery.callback =
              api.wrap((err: Error|null, res?: pg_7.QueryResult) => {
                maybePopulateLabelsFromOutputs(span, err, res);
                span.endSpan();
                if (done) {
                  done(err, res);
                }
              });
          return pgQuery;
        };
      });
    },
    // TS: Client is a class name.
    // tslint:disable-next-line:variable-name
    unpatch(Client) {
      shimmer.unwrap(Client.prototype, 'query');
    }
  } as Patch<typeof pg_6.Client>,
  {
    file: 'lib/client.js',
    versions: '^7.x',
    // TS: Client is a class name.
    // tslint:disable-next-line:variable-name
    patch: (Client, api) => {
      const maybePopulateLabelsFromInputs =
          api.enhancedDatabaseReportingEnabled() ? populateLabelsFromInputs :
                                                   noOp;
      const maybePopulateLabelsFromOutputs =
          api.enhancedDatabaseReportingEnabled() ? populateLabelsFromOutputs :
                                                   noOp;
      shimmer.wrap(Client.prototype, 'query', (query) => {
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
            const args: ClientQueryArguments =
                Array.prototype.slice.call(arguments, 0);

            // Extract query text and values, if needed.
            maybePopulateLabelsFromInputs(span, args);

            // If we received a callback, bind it to the current context,
            // optionally adding labels as well.
            const callback = args[args.length - 1];
            if (typeof callback === 'function') {
              args[args.length - 1] =
                  api.wrap((err: Error|null, res?: pg_7.QueryResult) => {
                    maybePopulateLabelsFromOutputs(span, err, res);
                    span.endSpan();
                    // TS: Type cast is safe as we know that callback is a
                    // Function.
                    (callback as (err: Error|null, res?: pg_7.QueryResult) =>
                         void)(err, res);
                  });
              pgQuery = query.apply(this, args);
            } else {
              pgQuery = query.apply(this, arguments);
            }
          } else {
            pgQuery = query.apply(this, arguments);
          }

          if (pgQuery) {
            if (pgQuery instanceof EventEmitter) {
              api.wrapEmitter(pgQuery);
            } else if (typeof pgQuery.then === 'function') {
              // Ensure that the span is ended, optionally adding labels as
              // well.
              pgQuery = pgQuery.then(
                  (res) => {
                    maybePopulateLabelsFromOutputs(span, null, res);
                    span.endSpan();
                    return res;
                  },
                  (err) => {
                    maybePopulateLabelsFromOutputs(span, err);
                    span.endSpan();
                    throw err;
                  });
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
    }
  } as Patch<typeof pg_7.Client>
];

export = plugin;
