/**
 * Copyright 2015 Google Inc. All Rights Reserved.
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

var cls = require('../../../src/cls.js');
var shimmer = require('shimmer');
var semver = require('semver');
var SpanData = require('../../../src/span-data.js');
var agent;

var SUPPORTED_VERSIONS = '^2.9.x';

function createQueryWrap(createQuery) {
  return function createQuery_trace(sql, values, cb) {
    var root = cls.getRootContext();
    if (!root) {
      agent.logger.debug('Untraced mysql query:', sql);
      return createQuery.apply(this, arguments);
    } else if (root === SpanData.nullSpan) {
      return createQuery.apply(this, arguments);
    }
    var span = agent.startSpan('mysql-query');
    var query = createQuery.apply(this, arguments);
    if (agent.config_.enhancedDatabaseReporting) {
      span.addLabel('sql', query.sql);
      if (query.values) {
        span.addLabel('values', query.values);
      }
    }
    cls.getNamespace().bindEmitter(query);
    if (query._callback) {
      query._callback = wrapCallback(span, query._callback);
    } else {
      query.on('end', function() {
        agent.endSpan(span);
      });
    }
    return query;
  };
}

function wrapCallback(span, done) {
  var fn = function(err, res) {
    var labels = {};
    if (agent.config_.enhancedDatabaseReporting) {
      if (err) {
        labels.error = err;
      }
      if (res) {
        labels.result = res;
      }
    }
    agent.endSpan(span, labels);
    if (done) {
      done(err, res);
    }
  };
  return cls.getNamespace().bind(fn);
}

function wrapGetConnection(getConnection) {
  return function getConnection_trace(cb) {
    return getConnection.call(this, cls.getNamespace().bind(cb));
  };
}

module.exports = function(version_, agent_) {
  if (!semver.satisfies(version_, SUPPORTED_VERSIONS)) {
    agent_.logger.info('Mysql: unsupported version ' + version_ + ' loaded');
    return {};
  }
  return {
    'lib/Connection.js': {
      patch: function(Connection) {
        if (!agent) {
          agent = agent_;
        }
        shimmer.wrap(Connection, 'createQuery', createQueryWrap);
      },
      unpatch: function(Connection) {
        shimmer.unwrap(Connection, 'createQuery');
        agent_.logger.info('Mysql: unpatched');
      }
    },
    'lib/Pool.js': {
      patch: function(Pool) {
        if (!agent) {
          agent = agent_;
        }
        shimmer.wrap(Pool.prototype, 'getConnection', wrapGetConnection);
      },
      unpatch: function(Pool) {
        shimmer.unwrap(Pool.prototype, 'getConnection');
        agent_.logger.info('Mysql connection pool: unpatched');
      }
    }
  };
};
