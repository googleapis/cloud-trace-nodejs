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

var TraceLabels = require('../src/trace-labels.js');
var assert = require('assert');
var cls = require('../src/cls.js');
var constants = require('../src/constants.js');
var common = require('./plugins/common.js');

describe('SpanData', function() {

  var agent;
  before(function() {
    agent = require('..').start({samplingRate: 0});
  });

  it('has correct default values', function() {
    cls.getNamespace().run(function() {
      var spanData = common.createRootSpanData(agent, 'name', 1, 2);
      assert.ok(spanData.trace);
      assert.strictEqual(spanData.trace.traceId, 1);
      assert.ok(spanData.span.spanId);
      assert.strictEqual(spanData.span.name, 'name');
    });
  });

  it('converts label values to strings', function() {
    cls.getNamespace().run(function() {
      var spanData = common.createRootSpanData(agent, 'name', 1, 2);
      spanData.addLabel('a', 'b');
      assert.strictEqual(spanData.span.labels.a, 'b');
      spanData.addLabel('c', 5);
      assert.strictEqual(spanData.span.labels.c, '5');
    });
  });

  it('serializes object labels correctly', function() {
    cls.getNamespace().run(function() {
      var spanData = common.createRootSpanData(agent, 'name', 1, 2);
      spanData.addLabel('a', [{i: 5}, {j: 6}]);
      assert.strictEqual(spanData.span.labels.a, '[ { i: 5 }, { j: 6 } ]');
    });
  });

  it('serializes symbol labels correctly', function() {
    cls.getNamespace().run(function() {
      var spanData = common.createRootSpanData(agent, 'name', 1, 2);
      spanData.addLabel('a', Symbol('b'));
      assert.strictEqual(spanData.span.labels.a, 'Symbol(b)');
    });
  });

  it('truncate large span names to limit', function() {
    cls.getNamespace().run(function() {
      var spanData = common.createRootSpanData(agent, Array(200).join('a'), 1, 2);
      assert.strictEqual(
        spanData.span.name,
        Array(constants.TRACE_SERVICE_SPAN_NAME_LIMIT - 2).join('a') + '...');
    });
  });

  it('truncate large label keys to limit', function() {
    cls.getNamespace().run(function() {
      var spanData = common.createRootSpanData(agent, 'name', 1, 2);
      var longLabelKey = Array(200).join('a');
      spanData.addLabel(longLabelKey, 5);
      assert.strictEqual(
        spanData.span.labels[Array(constants.TRACE_SERVICE_LABEL_KEY_LIMIT - 2).join('a') + '...'],
        '5');
    });
  });

  it('truncate large label values to limit', function() {
    cls.getNamespace().run(function() {
      var spanData = common.createRootSpanData(agent, 'name', 1, 2);
      var longLabelVal = Array(16550).join('a');
      spanData.addLabel('a', longLabelVal);
      assert.strictEqual(spanData.span.labels.a,
        Array(common.getConfig(agent).maximumLabelValueSize - 2).join('a') + '...');
    });
  });

  it('creates children', function() {
    cls.getNamespace().run(function() {
      var spanData = common.createRootSpanData(agent, 'name', 1, 2);
      var child = spanData.createChildSpanData('name2');
      assert.strictEqual(child.span.name, 'name2');
      assert.strictEqual(child.span.parentSpanId, spanData.span.spanId);
      assert.ok(child.trace);
      assert.strictEqual(child.trace.traceId, 1);
    });
  });

  it('closes', function() {
    cls.getNamespace().run(function() {
      var spanData = common.createRootSpanData(agent, 'name', 1, 2);
      assert.ok(!spanData.span.isClosed());
      spanData.close();
      assert.ok(spanData.span.isClosed());
    });
  });

  it('captures stack traces', function() {
    common.getConfig(agent).stackTraceLimit = 25;
    cls.getNamespace().run(function() {
      var spanData = common.createRootSpanData(agent, 'name', 1, 2, 1);
      assert.ok(!spanData.span.isClosed());
      spanData.close();
      var stack = spanData.span.labels[TraceLabels.STACK_TRACE_DETAILS_KEY];
      assert.ok(stack);
      assert.ok(typeof stack === 'string');
      var frames = JSON.parse(stack);
      assert.ok(frames && frames.stack_frame);
      assert.ok(Array.isArray(frames.stack_frame));
      assert.strictEqual(frames.stack_frame[1].method_name, 'Namespace.run [as run]');
    });
  });

  it('does not limit stack trace', function() {
    common.getConfig(agent).maximumLabelValueSize = 10;
    cls.getNamespace().run(function() {
      var spanData = common.createRootSpanData(agent, 'name', 1, 2, 1);
      spanData.close();
      var stack = spanData.span.labels[TraceLabels.STACK_TRACE_DETAILS_KEY];
      assert.ok(stack.length > 10);
      var frames = JSON.parse(stack);
      assert.strictEqual(frames.stack_frame[1].method_name, 'Namespace.run [as run]');
    });
  });

  it('should close all spans', function() {
    cls.getNamespace().run(function() {
      var spanData = common.createRootSpanData(agent, 'hi');
      spanData.createChildSpanData('sub');
      spanData.close();
      var traces = common.getTraces(agent);
      for (var i = 0; i < traces.length; i++) {
        for (var j = 0; j < traces[i].spans.length; j++) {
          assert.notEqual(traces[i].spans[j].endTime, '');
        }
      }
    });
  });
});
