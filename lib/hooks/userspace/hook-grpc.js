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

var SUPPORTED_VERSIONS = '0.13.x';

function startBatchWrap(startBatch) {
  return function startBatchTrace(thing, callback) {
    // TODO: maybe we only want to do this if a root context exists.
    return startBatch.call(this, thing, cls.getNamespace().bind(callback));
  };
}

module.exports = function(version_, agent_) {
  if (!semver.satisfies(version_, SUPPORTED_VERSIONS)) {
    agent_.logger.info('grpc: unsupported version ' + version_ + ' loaded');
    return {};
  }
  return {
    'src/node/src/grpc_extension.js': {
      patch: function(extension) {
        agent = agent_;
        shimmer.wrap(extension.Call.prototype, 'startBatch', startBatchWrap);
      },
      unpatch: function(extension) {
        shimmer.unwrap(extension.Call.prototype, 'startBatch');
      }
    }
  };
};
