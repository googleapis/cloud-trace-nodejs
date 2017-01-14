'use strict';

var traceUtil = require('../../src/util.js');
var shimmer = require('shimmer');
var semver = require('semver');

var SUPPORTED_VERSIONS = '1 - 2';

/**
 * Wraps the provided callback so that the provided span will
 * be closed immediately after the callback is invoked.
 *
 * @param {Span} span The span to be closed.
 * @param {Function} done The callback to be wrapped.
 * @return {Function} The wrapped function.
 */
function wrapCallback(transaction, done) {
  return function(err, res) {
    if (transaction.config.enhancedDatabaseReporting) {
      if (err) {
        // Errors may contain sensitive query parameters.
        transaction.addLabel('mongoError', err);
      }
      if (res) {
        var result = res.result ? res.result : res;
        transaction.addLabel('results', traceUtil.stringifyPrefix(
          result, transaction.config.databaseResultReportingSize));
      }
    }
    transaction.endSpan();
    if (done) {
      done(err, res);
    }
  };
}

module.exports = function(version_, api) {
  if (!semver.satisfies(version_, SUPPORTED_VERSIONS)) {
    return {};
  }
  return {
    'lib/connection/pool.js': {
      patch: function(pool) {
        function onceWrap(once) {
          return function once_trace(event, cb) {
            api.wrap(cb);
            return once.call(this, event, cb);
          };
        }
        
        shimmer.wrap(pool.prototype, 'once', onceWrap);
      },
      unpatch: function(pool) {
        shimmer.unwrap(pool.prototype, 'once');
      }
    },
    // An empty relative path here matches the root module being loaded.
    '': {
      patch: function(mongo) {
        function nextWrap(next) {
          return function next_trace(cb) {
            var args = arguments;
            api.runInSpan('mongo-cursor', function(transaction) {
              if (!transaction) {
                return next.apply(this, args);
              }
              transaction.addLabel('db', this.ns);
              if (transaction.enhancedReporting) {
                transaction.addLabel('cmd', this.cmd);
              }
              return next.call(this, wrapCallback(transaction, cb));
            }.bind(this), {
              stackFrames: 1
            });
          };
        }

        function wrapWithLabel(label) {
          return function(original) {
            return function mongo_operation_trace(ns, ops, options, callback) {
              var args = arguments;
              api.runInSpan(label, function(transaction) {
                if (!transaction) {
                  return original.apply(this, args);
                }
                transaction.addLabel('db', ns);
                if (transaction.enhancedReporting) {
                  transaction.addLabel('operations', JSON.stringify(ops));
                }
                if (typeof options === 'function') {
                  return original.call(this, ns, ops,
                    wrapCallback(transaction, options));
                } else {
                  return original.call(this, ns, ops, options,
                    wrapCallback(transaction, callback));
                }
              }.bind(this), {
                stackFrames: 1
              });
            };
          };
        }

        shimmer.wrap(mongo.Server.prototype, 'command', wrapWithLabel('mongo-command'));
        shimmer.wrap(mongo.Server.prototype, 'insert', wrapWithLabel('mongo-insert'));
        shimmer.wrap(mongo.Server.prototype, 'update', wrapWithLabel('mongo-update'));
        shimmer.wrap(mongo.Server.prototype, 'remove', wrapWithLabel('mongo-remove'));
        shimmer.wrap(mongo.Cursor.prototype, 'next', nextWrap);
        mongo._plugin_patched = true;
      },
      unpatch: function(mongo) {
        shimmer.unwrap(mongo.Server.prototype, 'command');
        shimmer.unwrap(mongo.Server.prototype, 'insert');
        shimmer.unwrap(mongo.Server.prototype, 'update');
        shimmer.unwrap(mongo.Server.prototype, 'remove');
        shimmer.unwrap(mongo.Cursor.prototype, 'next');
      }
    }
  };
};
