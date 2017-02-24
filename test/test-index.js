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

if (!process.env.GCLOUD_PROJECT) {
  console.log('The GCLOUD_PROJECT environment variable must be set.');
  process.exit(1);
}

var assert = require('assert');
var trace = require('..');

describe('index.js', function() {
  var agent = trace.start();

  it('should get the agent with `Trace.get`', function() {
    assert.strictEqual(agent, trace.get());
  });

  it('should throw an error if `start` is called on an active agent',
    function() {
      assert.throws(trace.start, Error);
  });
  
  it('should not attach exception handler with ignore option', function() {
    // Mocha attaches 1 exception handler
    assert.equal(process.listeners('uncaughtException').length, 1);
  });

  it('should set agent on global object', function() {
    assert.equal(global._google_trace_agent, agent);
  });
});
