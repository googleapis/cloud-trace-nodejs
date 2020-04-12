// Copyright 2015 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as shimmer from 'shimmer';

const SUPPORTED_VERSIONS = '1 - 3';

function createNextWrap(api) {
  return function nextWrap(next) {
    return function next_trace(cb) {
      const span = api.createChildSpan({name: 'mongo-cursor'});
      if (!api.isRealSpan(span)) {
        // eslint-disable-next-line prefer-rest-params
        return next.apply(this, arguments);
      }
      span.addLabel('db', this.ns);
      if (api.enhancedDatabaseReportingEnabled()) {
        span.addLabel('cmd', JSON.stringify(this.cmd));
      }
      return next.call(this, wrapCallback(api, span, cb));
    };
  };
}

function wrapWithLabel(api, label) {
  return function (original) {
    return function mongo_operation_trace(ns, ops, options, callback) {
      const span = api.createChildSpan({name: label});
      if (!api.isRealSpan(span)) {
        // eslint-disable-next-line prefer-rest-params
        return original.apply(this, arguments);
      }
      span.addLabel('db', ns);
      if (api.enhancedDatabaseReportingEnabled()) {
        span.addLabel('operations', JSON.stringify(ops));
      }
      if (typeof options === 'function') {
        return original.call(this, ns, ops, wrapCallback(api, span, options));
      } else {
        return original.call(
          this,
          ns,
          ops,
          options,
          wrapCallback(api, span, callback)
        );
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
function wrapCallback(api, span, done) {
  const fn = function (err, res) {
    if (api.enhancedDatabaseReportingEnabled()) {
      if (err) {
        // Errors may contain sensitive query parameters.
        span.addLabel('mongoError', err);
      }
      if (res) {
        const result = res.result ? res.result : res;
        span.addLabel('result', result);
      }
    }
    span.endSpan();
    if (done) {
      done(err, res);
    }
  };
  return api.wrap(fn);
}

function createOnceWrap(api) {
  return function onceWrap(once) {
    return function once_trace(event, cb) {
      return once.call(this, event, api.wrap(cb));
    };
  };
}

module.exports = [
  {
    file: 'lib/connection/pool.js',
    versions: SUPPORTED_VERSIONS,
    patch: function (pool, api) {
      shimmer.wrap(pool.prototype, 'once', createOnceWrap(api));
    },
    unpatch: function (pool) {
      shimmer.unwrap(pool.prototype, 'once');
    },
  },
  {
    file: '',
    versions: SUPPORTED_VERSIONS,
    patch: function (mongo, api) {
      shimmer.wrap(
        mongo.Server.prototype,
        'command',
        wrapWithLabel(api, 'mongo-command')
      );
      shimmer.wrap(
        mongo.Server.prototype,
        'insert',
        wrapWithLabel(api, 'mongo-insert')
      );
      shimmer.wrap(
        mongo.Server.prototype,
        'update',
        wrapWithLabel(api, 'mongo-update')
      );
      shimmer.wrap(
        mongo.Server.prototype,
        'remove',
        wrapWithLabel(api, 'mongo-remove')
      );
      shimmer.wrap(mongo.Cursor.prototype, 'next', createNextWrap(api));
    },
    unpatch: function (mongo) {
      shimmer.unwrap(mongo.Server.prototype, 'command');
      shimmer.unwrap(mongo.Server.prototype, 'insert');
      shimmer.unwrap(mongo.Server.prototype, 'update');
      shimmer.unwrap(mongo.Server.prototype, 'remove');
      shimmer.unwrap(mongo.Cursor.prototype, 'next');
    },
  },
];

export default {};
