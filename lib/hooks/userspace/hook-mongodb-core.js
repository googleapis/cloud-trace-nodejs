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

var traceUtil = require('../../util.js');
var cls = require('../../cls.js');
var shimmer = require('shimmer');
var semver = require('semver');
var SpanData = require('../../span-data.js');
var agent;

var SUPPORTED_VERSIONS = '1 - 2';

function nextWrap(next) {
  return function next_trace(cb) {
    var root = cls.getRootContext();
    if (!root) {
      agent.logger.debug('Untraced mongo command:', this.cmd);
      return next.apply(this, arguments);
    } else if (root === SpanData.nullSpan) {
      return next.apply(this, arguments);
    }
    var labels = { db: this.ns };
    if (agent.config_.enhancedDatabaseReporting) {
      labels.cmd = JSON.stringify(this.cmd);
    }
    var span = agent.startSpan('mongo-cursor', labels);
    return next.call(this, wrapCallback(span, cb));
  };
}

function wrapWithLabel(label) {
  return function(original) {
    return function mongo_operation_trace(ns, ops, options, callback) {
      var root = cls.getRootContext();
      if (!root) {
        agent.logger.debug('Untraced mongo command:', ops);
        return original.apply(this, arguments);
      } else if (root === SpanData.nullSpan) {
        return original.apply(this, arguments);
      }
      var labels = { db: ns };
      if (agent.config_.enhancedDatabaseReporting) {
        labels.operations = JSON.stringify(ops);
      }
      var span = agent.startSpan(label, labels);
      if (typeof options === 'function') {
        return original.call(this, ns, ops,
          wrapCallback(span, options));
      } else {
        return original.call(this, ns, ops, options,
          wrapCallback(span, callback));
      }
    };
  };
}

/**
 * Wraps the provided callback so that the provided span will
 * be closed immediately after the callback is invoked.
 *
 * @param {Span} span The span to be closed.
 * @param {Function} done The callback to be wrapped.
 * @return {Function} The wrapped function.
 */
function wrapCallback(span, done) {
  var fn = function(err, res) {
    var labels = {};
    if (agent.config_.enhancedDatabaseReporting) {
      if (err) {
        // Errors may contain sensitive query parameters.
        labels.mongoError = err;
      }
      if (res) {
        var result = res.result ? res.result : res;
        labels.results = traceUtil.stringifyPrefix(result,
          agent.config_.databaseResultReportingSize);
      }
    }
    agent.endSpan(span, labels);
    if (done) {
      done(err, res);
    }
  };
  return cls.getNamespace().bind(fn);
}

function onceWrap(once) {
  return function once_trace(event, cb) {
    return once.call(this, event, cls.getNamespace().bind(cb));
  };
}

module.exports = function(version_, agent_) {
  if (!semver.satisfies(version_, SUPPORTED_VERSIONS)) {
    agent_.logger.info('Mongo: unsupported version ' + version_ + ' loaded');
    return {};
  }
  return {
    'lib/connection/pool.js': {
      patch: function(pool) {
        shimmer.wrap(pool.prototype, 'once', onceWrap);
      },
      unpatch: function(pool) {
        shimmer.unwrap(pool.prototype, 'once');
        agent_.logger.info('Mongo connection pool: unpatched');
      }
    },
    // An empty relative path here matches the root module being loaded.
    '': {
      patch: function(mongo) {
        agent = agent_;
        shimmer.wrap(mongo.Server.prototype, 'command', wrapWithLabel('mongo-command'));
        shimmer.wrap(mongo.Server.prototype, 'insert', wrapWithLabel('mongo-insert'));
        shimmer.wrap(mongo.Server.prototype, 'update', wrapWithLabel('mongo-update'));
        shimmer.wrap(mongo.Server.prototype, 'remove', wrapWithLabel('mongo-remove'));
        shimmer.wrap(mongo.Cursor.prototype, 'next', nextWrap);
      },
      unpatch: function(mongo) {
        shimmer.unwrap(mongo.Server.prototype, 'command');
        shimmer.unwrap(mongo.Server.prototype, 'insert');
        shimmer.unwrap(mongo.Server.prototype, 'update');
        shimmer.unwrap(mongo.Server.prototype, 'remove');
        shimmer.unwrap(mongo.Cursor.prototype, 'next');
        agent_.logger.info('Mongo: unpatched');
      }
    }
  };
};
