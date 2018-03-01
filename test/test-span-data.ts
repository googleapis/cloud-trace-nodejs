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

import './override-gcp-metadata';
import * as cls from '../src/cls';
import { Constants } from '../src/constants';
import {TraceLabels} from '../src/trace-labels';
import { RootSpanData, ChildSpanData } from '../src/span-data';
import { Trace } from '../src/trace';
import { traceWriter } from '../src/trace-writer';

var assert = require('assert');
var common = require('./plugins/common'/*.js*/);

function createRootSpanData(name, traceId?, parentId?, skipFrames?) {
  return new RootSpanData(
    { projectId: '', traceId: traceId, spans: [] },
    name,
    parentId,
    skipFrames
  );
}

describe('SpanData', function() {
  var agent;
  before(function() {
    agent = require('../..').start({
      projectId: '0',
      samplingRate: 0
    });
  });

  it('has correct default values', function() {
    cls.getNamespace().run(function() {
      var spanData = createRootSpanData('name', 1, 2);
      assert.ok(spanData.trace);
      assert.strictEqual(spanData.trace.traceId, 1);
      assert.ok(spanData.span.spanId);
      assert.strictEqual(spanData.span.name, 'name');
    });
  });

  it('generates unique numeric span ID strings', function() {
    cls.getNamespace().run(function() {
      var spans = [];
      var spanIds = new Set<string>();
      var rootSpanData = createRootSpanData('hi');
      var numSpanIdsToCheck = 5;
      for (var i = 0; i < numSpanIdsToCheck; i++) {
        var spanData = new ChildSpanData(
            rootSpanData.trace, 'child', rootSpanData.span.spanId, 0);
        var spanId = spanData.span.spanId;
        spanIds.add(spanId);
        // Check that the span IDs are numeric positive number strings
        assert.ok(typeof spanId === 'string');
        assert.ok(spanId.match(/\d+/));
        assert.ok(Number(spanId) > 0);
        assert.strictEqual(Number(spanId).toString(), spanId);
      }
    });
  });

  it('converts label values to strings', function() {
    cls.getNamespace().run(function() {
      var spanData = createRootSpanData('name', 1, 2);
      spanData.addLabel('a', 'b');
      assert.strictEqual(spanData.span.labels.a, 'b');
      spanData.addLabel('c', 5);
      assert.strictEqual(spanData.span.labels.c, '5');
    });
  });

  it('serializes object labels correctly', function() {
    cls.getNamespace().run(function() {
      var spanData = createRootSpanData('name', 1, 2);
      spanData.addLabel('a', [{i: 5}, {j: 6}]);
      assert.strictEqual(spanData.span.labels.a, '[ { i: 5 }, { j: 6 } ]');
    });
  });

  it('serializes symbol labels correctly', function() {
    cls.getNamespace().run(function() {
      var spanData = createRootSpanData('name', 1, 2);
      spanData.addLabel('a', Symbol('b'));
      assert.strictEqual(spanData.span.labels.a, 'Symbol(b)');
    });
  });

  it('truncates large span names to limit', function() {
    cls.getNamespace().run(function() {
      var spanData = createRootSpanData(Array(200).join('a'), 1, 2);
      assert.strictEqual(
        spanData.span.name,
        Array(Constants.TRACE_SERVICE_SPAN_NAME_LIMIT - 2).join('a') + '...');
    });
  });

  it('truncates large label keys to limit', function() {
    cls.getNamespace().run(function() {
      var spanData = createRootSpanData('name', 1, 2);
      var longLabelKey = Array(200).join('a');
      spanData.addLabel(longLabelKey, 5);
      assert.strictEqual(
        spanData.span.labels[Array(Constants.TRACE_SERVICE_LABEL_KEY_LIMIT - 2).join('a') + '...'],
        '5');
    });
  });

  it('truncates large label values to limit', function() {
    cls.getNamespace().run(function() {
      var spanData = createRootSpanData('name', 1, 2);
      var longLabelVal = Array(16550).join('a');
      spanData.addLabel('a', longLabelVal);
      assert.strictEqual(spanData.span.labels.a,
        Array(traceWriter.get().getConfig().maximumLabelValueSize - 2).join('a') +
          '...');
    });
  });

  // TODO Add addLabel test

  it('closes when endSpan is called', function() {
    cls.getNamespace().run(function() {
      var spanData = createRootSpanData('name', 1, 2);
      assert.ok(!spanData.span.endTime);
      spanData.endSpan();
      assert.ok(spanData.span.endTime);
    });
  });

  it('captures stack traces', function() {
    traceWriter.get().getConfig().stackTraceLimit = 25;
    cls.getNamespace().run(function awesome() {
      var spanData = createRootSpanData('name', 1, 2, 1);
      assert.ok(!spanData.span.endTime);
      spanData.endSpan();
      var stack = spanData.span.labels[TraceLabels.STACK_TRACE_DETAILS_KEY];
      assert.ok(stack);
      assert.ok(typeof stack === 'string');
      var frames = JSON.parse(stack);
      assert.ok(frames && frames.stack_frame);
      assert.ok(Array.isArray(frames.stack_frame));
      assert.strictEqual(frames.stack_frame[0].method_name, 'awesome');
    });
  });

  it('does not limit stack trace', function() {
    traceWriter.get().getConfig().maximumLabelValueSize = 10;
    cls.getNamespace().run(function awesome() {
      var spanData = createRootSpanData('name', 1, 2, 1);
      spanData.endSpan();
      var stack = spanData.span.labels[TraceLabels.STACK_TRACE_DETAILS_KEY];
      assert.ok(stack.length > 10);
      var frames = JSON.parse(stack);
      assert.strictEqual(frames.stack_frame[0].method_name, 'awesome');
    });
  });

  it('should close nested spans', function() {
    cls.getNamespace().run(function() {
      var spanData = createRootSpanData('hi');
      // create a child span
      new ChildSpanData(spanData.trace, 'child', spanData.span.spanId, 0);
      spanData.endSpan();
      var traces = common.getTraces();
      for (var i = 0; i < traces.length; i++) {
        for (var j = 0; j < traces[i].spans.length; j++) {
          assert.notEqual(traces[i].spans[j].endTime, '');
        }
      }
    });
  });
});

export default {};
