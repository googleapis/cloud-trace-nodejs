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

var SUPPORTED_VERSIONS = '^2.9.x';

function createCreateQueryWrap(api) {
  return function createQueryWrap(createQuery) {
    return function createQuery_trace(sql, values, cb) {
      var span = api.createChildSpan({
        name: 'mysql-query'
      });
      var query = createQuery.apply(this, arguments);
      if (!span) {
        return query;
      }
      if (api.enhancedDatabaseReportingEnabled()) {
        span.addLabel('sql', query.sql);
        if (query.values) {
          span.addLabel('values', query.values);
        }
      }
      api.wrapEmitter(query);
      if (query._callback) {
        query._callback = wrapCallback(api, span, query._callback);
      } else {
        query.on('end', function() {
          span.endSpan();
        });
      }
      return query;
    };
  };
}

function wrapCallback(api, span, done) {
  var fn = function(err, res) {
    if (api.enhancedDatabaseReportingEnabled()) {
      if (err) {
        span.addLabel('error', err);
      }
      if (res) {
        span.addLabel('result', res);
      }
    }
    span.endSpan();
    if (done) {
      done(err, res);
    }
  };
  return api.wrap(fn);
}

function createWrapGetConnection(api) {
  return function wrapGetConnection(getConnection) {
    return function getConnection_trace(cb) {
      return getConnection.call(this, api.wrap(cb));
    };
  };
}

module.exports = [
  {
    file: 'lib/Connection.js',
    versions: SUPPORTED_VERSIONS,
    patch: function(Connection, api) {
      shimmer.wrap(Connection, 'createQuery', createCreateQueryWrap(api));
    },
    unpatch: function(Connection) {
      shimmer.unwrap(Connection, 'createQuery');
    }
  },
  {
    file: 'lib/Pool.js',
    versions: SUPPORTED_VERSIONS,
    patch: function(Pool, api) {
      shimmer.wrap(Pool.prototype, 'getConnection',
                   createWrapGetConnection(api));
    },
    unpatch: function(Pool) {
      shimmer.unwrap(Pool.prototype, 'getConnection');
    }
  }
];
