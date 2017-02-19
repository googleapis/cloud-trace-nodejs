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
'use strict';

var shimmer = require('shimmer');

var SUPPORTED_VERSIONS = '^6.x';

module.exports = [
  {
    file: 'lib/client.js',
    versions: SUPPORTED_VERSIONS,
    patch: function(Client, api) {
      function queryWrap(query) {
        return function query_trace() {
          var span = api.createChildSpan({
            name: 'pg-query'
          });
          var pgQuery = query.apply(this, arguments);
          if (!span) {
            return pgQuery;
          }
          if (api.enhancedDatabaseReportingEnabled()) {
            span.addLabel('query', pgQuery.text);
            if (pgQuery.values) {
              span.addLabel('values', pgQuery.values);
            }
          }
          api.wrapEmitter(pgQuery);
          var done = pgQuery.callback;
          pgQuery.callback = api.wrap(function(err, res) {
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
      }

      shimmer.wrap(Client.prototype, 'query', queryWrap);
    },
    unpatch: function(Client) {
      shimmer.unwrap(Client.prototype, 'query');
    }
  }
];
