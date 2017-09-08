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

var assert = require('assert');
var gcloudCommon = require('@google-cloud/common');
var shimmer = require('shimmer');
var trace = require('..');

describe('should respect environment variables', function() {
  var logLevel;

  before(function() {
    process.env.GCLOUD_TRACE_LOGLEVEL = '4';
    // Wrap logger constructor so that the log level (string) is saved
    // in logLevel
    shimmer.wrap(gcloudCommon, 'logger', function(original) {
      var wrapped = Object.assign(function(options) {
        logLevel = options.level;
        return original.apply(this, arguments);
      }, original);
      return wrapped;
    });
  });

  after(function() {
    delete process.env.GCLOUD_TRACE_LOGLEVEL;
    shimmer.unwrap(gcloudCommon, 'logger');
  });

  afterEach(function() {
    logLevel = null;
  });

  it('should respect GCLOUD_TRACE_LOGLEVEL', function() {
    trace.start({forceNewAgent_: true});
    assert.strictEqual(logLevel, gcloudCommon.logger.LEVELS[4]);
  });

  it('should prefer env to config', function() {
    trace.start({logLevel: 2, forceNewAgent_: true});
    assert.strictEqual(logLevel, gcloudCommon.logger.LEVELS[4]);
  });

  it('should fix out of bounds log level', function() {
    process.env.GCLOUD_TRACE_LOGLEVEL = '-5';
    trace.start({forceNewAgent_: true});
    assert.strictEqual(logLevel, gcloudCommon.logger.LEVELS[0]);
    process.env.GCLOUD_TRACE_LOGLEVEL = '300';
    trace.start({forceNewAgent_: true});
    assert.strictEqual(logLevel, gcloudCommon.logger.LEVELS[5]);
  });
});

export default {};
