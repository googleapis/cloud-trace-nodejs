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

import * as shimmer from 'shimmer';
import {Readable} from 'stream';

import {Patch, Plugin} from '../plugin-types';

import {pg_6 as pg} from './types';

const SUPPORTED_VERSIONS = '^6.x || ^7.x';

// tslint:disable-next-line:no-any
function isSubmittable(obj: any): obj is {submit: Function} {
  return typeof obj.submit === 'function';
}

const plugin: Plugin = [{
  file: 'lib/client.js',
  versions: SUPPORTED_VERSIONS,
  // TS: Client is a class name.
  // tslint:disable-next-line:variable-name
  patch: (Client, api) => {
    shimmer.wrap(Client.prototype, 'query', (query) => {
      return function query_trace(this: pg.Client) {
        const span = api.createChildSpan({name: 'pg-query'});
        const pgQuery: pg.QueryReturnValue = query.apply(this, arguments);
        if (!api.isRealSpan(span)) {
          return pgQuery;
        }
        if (api.enhancedDatabaseReportingEnabled()) {
          if (pgQuery.text) {
            span.addLabel('query', pgQuery.text);
          }
          if (pgQuery.values) {
            span.addLabel('values', pgQuery.values);
          }
        }
        api.wrapEmitter(pgQuery);
        const done = pgQuery.callback;
        pgQuery.callback = api.wrap((err, res) => {
          if (api.enhancedDatabaseReportingEnabled()) {
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
} as Patch<typeof pg.Client>];

export = plugin;
