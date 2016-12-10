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

var agent = require('..').start({ samplingRate: 0 }).private_();
var TraceLabels = require('../src/trace-labels.js');
var assert = require('assert');
var cls = require('../src/cls.js');

describe('SpanData', function() {

  it('has correct default values', function() {
    cls.getNamespace().run(function() {
      var spanData = agent.createRootSpanData('name', 1, 2);
      assert.ok(spanData.trace);
      assert.equal(spanData.trace.traceId, 1);
      assert.ok(spanData.span.spanId);
      assert.equal(spanData.span.name, 'name');
    });
  });

  it('creates children', function() {
    cls.getNamespace().run(function() {
      var spanData = agent.createRootSpanData('name', 1, 2);
      var child = spanData.createChildSpanData('name2');
      assert.equal(child.span.name, 'name2');
      assert.equal(child.span.parentSpanId, spanData.span.spanId);
      assert.ok(child.trace);
      assert.equal(child.trace.traceId, 1);
    });
  });

  it('closes', function() {
    cls.getNamespace().run(function() {
      var spanData = agent.createRootSpanData('name', 1, 2);
      assert.ok(!spanData.span.isClosed());
      spanData.close();
      assert.ok(spanData.span.isClosed());
    });
  });

  it('captures stack traces', function() {
    agent.config().stackTraceLimit = 25;
    cls.getNamespace().run(function() {
      var spanData = agent.createRootSpanData('name', 1, 2, 1);
      assert.ok(!spanData.span.isClosed());
      spanData.close();
      var stack = spanData.span.labels[TraceLabels.STACK_TRACE_DETAILS_KEY];
      assert.ok(stack);
      assert.ok(typeof stack === 'string');
      var frames = JSON.parse(stack);
      assert.ok(frames && frames.stack_frame);
      assert.ok(Array.isArray(frames.stack_frame));
      assert.equal(frames.stack_frame[0].method_name, 'Namespace.run [as run]');
    });
  });

  it('should close all spans', function() {
    cls.getNamespace().run(function() {
      var spanData = agent.createRootSpanData('hi');
      spanData.createChildSpanData('sub');
      spanData.close();
      var traces = agent.traceWriter.buffer_.map(JSON.parse);
      for (var i = 0; i < traces.length; i++) {
        for (var j = 0; j < traces[i].spans.length; j++) {
          assert.notEqual(traces[i].spans[j].endTime, '');
        }
      }
    });
  });
});
