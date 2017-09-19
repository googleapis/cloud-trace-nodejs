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

import * as TracingPolicy from '../src/tracing-policy';

var assert = require('assert');

describe('FilterPolicy', function() {
  it('should not allow filtered urls', function() {
    var policy = TracingPolicy.createTracePolicy({
      samplingRate: 0,
      ignoreUrls: ['/_ah/health', /\/book*/]
    });
    assert(!policy.shouldTrace(0, '/_ah/health'));
    assert(!policy.shouldTrace(0, '/book/test'));
  });

  it('should allow non-filtered urls', function() {
    var policy = TracingPolicy.createTracePolicy({
      samplingRate: 0,
      ignoreUrls: ['/_ah/health']
    });
    assert(policy.shouldTrace(0, '/_ah/background'));
  });
});

describe('RateLimiterPolicy', function() {
  var tracesPerSecond = [10, 50, 150, 200, 500, 1000];
  tracesPerSecond.forEach(function(traceCount) {
    it('should throttle traces, ' + traceCount, function() {
      var policy = TracingPolicy.createTracePolicy({samplingRate: traceCount});
      testAllowedTraces(policy, traceCount);
    });
  });
});

function testAllowedTraces(policy, expected) {
  var successes = runForSecond(policy);
  assert(successes <= expected, 'Got ' + successes);
  assert(successes > expected * 0.8, 'Got ' + successes);
}

function runForSecond(policy) {
  var successes = 0;
  var start = Date.now();
  for (var time = start; time < start + 1000; time++) {
    if (policy.shouldTrace(time)) {
      successes++;
    }
  }
  return successes;
}

export default {};
