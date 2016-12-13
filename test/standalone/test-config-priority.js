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

var path = require('path');
var assert = require('assert');

// Default configuration:
// { logLevel: 1, stackTraceLimit: 0, flushDelaySeconds: 30, samplingRate: 10 };

// Fixtures configuration:
// { logLevel: 4, stackTraceLimit: 1 };
process.env.GCLOUD_DIAGNOSTICS_CONFIG =
  path.join(__dirname, '..', 'fixtures', 'test-config.js');

process.env.GCLOUD_TRACE_LOGLEVEL = 2;

var agent = require('../..').startAgent({logLevel: 3, stackTraceLimit: 2,
  flushDelaySeconds: 31});

describe('should respect config load order', function() {
  it('should order Default -> start -> env config -> env specific', function() {
    var config = agent.private_().config_;
    assert.equal(config.logLevel, 2);
    assert.equal(config.stackTraceLimit, 1);
    assert.equal(config.flushDelaySeconds, 31);
    assert.equal(config.samplingRate, 10);
  });
});
