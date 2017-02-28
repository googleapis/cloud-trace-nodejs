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

process.env.GCLOUD_TRACE_LOGLEVEL = 4;

var assert = require('assert');
var trace = require('..');

var common = require('./plugins/common.js');

describe('should respect environment variables', function() {
  it('should respect GCLOUD_TRACE_LOGLEVEL', function() {
    var agent = trace.start({forceNewAgent_: true});
    assert.equal(common.getConfig(agent).logLevel, 4);
  });

  it('should prefer env to config', function() {
    var agent = trace.start({logLevel: 2, forceNewAgent_: true});
    assert.equal(common.getConfig(agent).logLevel, 4);
  });

  it('should fix out of bounds log level', function() {
    process.env.GCLOUD_TRACE_LOGLEVEL = -5;
    var agent = trace.start({forceNewAgent_: true});
    assert.equal(common.getConfig(agent).logLevel, 0);
    process.env.GCLOUD_TRACE_LOGLEVEL = 300;
    agent = trace.start({forceNewAgent_: true});
    assert.equal(common.getConfig(agent).logLevel, 5);
  });
});
