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

if (!process.env.GCLOUD_PROJECT_NUM) {
  console.log('The GCLOUD_PROJECT_NUM environment variable must be set.');
  process.exit(1);
}

var agent = require('..').start().private_();
var TraceLabels = require('../lib/trace-labels.js');
var assert = require('assert');
var cls = require('../lib/cls.js');
var constants = require('../lib/constants.js');

describe('SpanData', function() {

  it('has correct default values', function() {
    cls.getNamespace().run(function() {
      var data = agent.createRootSpanData('name', 1, 2);
      assert.ok(data.trace);
      assert.equal(data.trace.traceId, 1);
      assert.ok(data.span.spanId);
      assert.equal(data.span.name, 'name');
    });
  });

  it('creates children', function() {
    cls.getNamespace().run(function() {
      var data = agent.createRootSpanData('name', 1, 2);
      var child = data.createChildSpanData('name2');
      assert.equal(child.span.name, 'name2');
      assert.equal(child.span.parentSpanId, data.span.spanId);
      assert.ok(child.trace);
      assert.equal(child.trace.traceId, 1);
    });
  });

  it('closes', function() {
    cls.getNamespace().run(function() {
      var data = agent.createRootSpanData('name', 1, 2);
      assert.ok(!data.span.isClosed());
      data.close();
      assert.ok(data.span.isClosed());
    });
  });

  describe('addContextToHeaders', function() {
    it('adds context to headers', function() {
      cls.getNamespace().run(function() {
        var data = agent.createRootSpanData('name', 1, 2);
        var spanId = data.span.spanId;
        data.options = 1;
        var options = {
          headers: {}
        };
        data.addContextToHeaders(options.headers);
        var parsed = agent.parseContextFromHeader(
            options.headers[constants.TRACE_CONTEXT_HEADER_NAME]);
        assert.equal(parsed.traceId, 1);
        assert.equal(parsed.spanId, spanId);
        assert.equal(parsed.options, 1);
      });
    });
  });

  it('captures stack traces', function() {
    agent.config().stackTraceLimit = 25;
    cls.getNamespace().run(function() {
      var data = agent.createRootSpanData('name', 1, 2);
      assert.ok(!data.span.isClosed());
      data.close();
      var stack = data.span.labels[TraceLabels.STACK_TRACE_DETAILS_KEY];
      assert.ok(stack);
      assert.ok(stack.indexOf('createRootSpanData') !== -1);
    });
  });

  it('should close all spans', function() {
    cls.getNamespace().run(function() {
      var span = agent.createRootSpanData('hi');
      span.createChildSpanData('sub');
      span.close();
      var traces = agent.traceWriter.buffer_;
      for (var i = 0; i < traces.length; i++) {
        for (var j = 0; j < traces[i].spans.length; j++) {
          assert.notEqual(traces[i].spans[j].endTime, '');
        }
      }
    });
  });
});
