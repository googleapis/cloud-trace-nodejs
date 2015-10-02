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

var cls = require('../../cls.js');
var shimmer = require('shimmer');
var semver = require('semver');
var agent;
var mongo;

var SUPPORTED_VERSIONS = '1.x';

function nextWrap(next) {
  return function next_trace(cb) {
    var root = cls.getRootContext();
    if (!root) {
      agent.logger_.warn('Cannot create mongo span outside of a supported framework.');
      return next.apply(this, arguments);
    }
    var span = agent.startSpan('mongo-cursor', { db: this.ns });
    return next.call(this, wrapCallback(span, cb));
  };
}

function wrapWithLabel(label) {
  return function(original) {
    return function mongo_operation_trace(ns, ops, options, callback) {
      var root = cls.getRootContext();
      if (!root) {
        agent.logger_.warn('Cannot create mongo span outside of a supported framework.');
        return original.apply(this, arguments);
      }
      var span = agent.startSpan(label, { db: ns });
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

function wrapCallback(span, done) {
  var fn = function(err, res) {
    agent.endSpan(span);
    if (done) {
      done(err, res);
    }
  };
  return cls.getNamespace().bind(fn);
}

module.exports = {
  patch: function(mongo_, agent_, version_) {
    if (!semver.satisfies(version_, SUPPORTED_VERSIONS)) {
      return;
    }
    if (!mongo) {
      agent = agent_;
      mongo = mongo_;
      shimmer.wrap(mongo.Server.prototype, 'command', wrapWithLabel('mongo-command'));
      shimmer.wrap(mongo.Server.prototype, 'insert', wrapWithLabel('mongo-insert'));
      shimmer.wrap(mongo.Server.prototype, 'update', wrapWithLabel('mongo-update'));
      shimmer.wrap(mongo.Server.prototype, 'remove', wrapWithLabel('mongo-remove'));
      shimmer.wrap(mongo.Cursor.prototype, 'next', nextWrap);
    }
  },
  unpatch: function() {
    if (mongo) {
      shimmer.unwrap(mongo.Server.prototype, 'command');
      shimmer.unwrap(mongo.Server.prototype, 'insert');
      shimmer.unwrap(mongo.Server.prototype, 'update');
      shimmer.unwrap(mongo.Server.prototype, 'remove');
      shimmer.unwrap(mongo.Cursor.prototype, 'next');
      mongo = null;
      agent = null;
    }
  }
};
