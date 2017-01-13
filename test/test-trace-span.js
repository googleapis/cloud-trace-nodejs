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
var tk = require('timekeeper');
var TraceSpan = require('../src/trace-span.js');


describe('TraceSpan', function() {
  afterEach(function() {
    tk.reset();
  });

  it('has correct default values', function() {
    var time = new Date();
    tk.freeze(time);
    var span = new TraceSpan('name', 1, 2);
    assert.equal(span.startTime, time.toISOString());
    assert.equal(span.spanId, 1);
    assert.equal(span.parentSpanId, 2);
    assert.equal(span.name, 'name');
    assert.equal(span.kind, 'RPC_CLIENT');
  });

  it('converts label values to strings', function() {
    var span = new TraceSpan('name', 1, 0);
    span.setLabel('a', 'b');
    assert.equal(span.labels.a, 'b');
    span.setLabel('c', 5);
    assert.equal(span.labels.c, '5');
  });

  it ('serializes object labels correctly', function() {
    var span = new TraceSpan('name', 1, 0);
    span.setLabel('a', [{i: 5}, {j: 6}]);
    assert.equal(span.labels.a, '[ { i: 5 }, { j: 6 } ]');
  });

  it('closes', function() {
    var span = new TraceSpan('name', 1, 0);
    assert.equal(span.endTime, '');
    var time = new Date();
    tk.freeze(time);
    assert.ok(!span.isClosed());
    span.close();
    assert.equal(span.endTime, time.toISOString());
    assert.ok(span.isClosed());
  });
});
