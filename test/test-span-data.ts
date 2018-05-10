/**
 * Copyright 2018 Google LLC
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

import * as assert from 'assert';

import {Constants, SpanDataType} from '../src/constants';
import {BaseSpanData, ChildSpanData, RootSpanData} from '../src/span-data';
import {Trace} from '../src/trace';
import {TraceLabels} from '../src/trace-labels';
import {traceWriter, TraceWriter, TraceWriterConfig} from '../src/trace-writer';

import {TestLogger} from './logger';
import * as traceAgentModule from './trace';

describe('SpanData', () => {
  class CaptureSpanTraceWriter extends TraceWriter {
    writeSpan(trace: Trace) {
      capturedTrace = trace;
    }
  }
  let capturedTrace: Trace;
  let trace: Trace;

  before(() => {
    traceAgentModule.setTraceWriter(CaptureSpanTraceWriter);
    traceWriter.create(
        {
          onUncaughtException: 'ignore',
          maximumLabelValueSize: 16,
          stackTraceLimit: 5
        } as TraceWriterConfig,
        new TestLogger());
  });

  after(() => {
    traceAgentModule.setTraceWriter(traceAgentModule.TestTraceWriter);
  });

  beforeEach(() => {
    trace = {projectId: '0', traceId: 'trace-id', spans: []};
  });

  describe('BaseSpanData', () => {
    // We use the ChildSpanData constructor, but what we are really testing
    // is the API that is common between child and root spans -- which is
    // BaseSpanData.
    class CommonSpanData extends ChildSpanData {}

    it('exposes a Trace field', () => {
      const spanData = new CommonSpanData(trace, 'name', '0', 0);
      assert.strictEqual(spanData.trace, trace);
    });

    it('creates a TraceSpan structure with expected fields', () => {
      const spanData = new CommonSpanData(trace, 'name', '400', 0);
      assert.strictEqual(spanData.span.name, 'name');
      assert.strictEqual(spanData.span.parentSpanId, '400');
      assert.ok(spanData.span.spanId.match(/[0-9A-F]{12}/));
    });

    it('creates spans with unique span IDs', () => {
      const numSpans = 5;
      const spanIds: Set<string> = new Set();
      for (let i = 0; i < numSpans; i++) {
        const spanData = new CommonSpanData(trace, 'name', '400', 0);
        spanIds.add(spanData.span.spanId);
      }
      assert.strictEqual(spanIds.size, numSpans);
    });

    it('accurately records timestamps', () => {
      // Create another span, to determine start time correctness
      const startLowerBound = Date.now();
      const spanData = new CommonSpanData(trace, 'name', '0', 0);
      const startUpperBound = Date.now();
      const endLowerBound = Date.now();
      spanData.endSpan();
      const endUpperBound = Date.now();
      const actualStart = new Date(spanData.span.startTime).getTime();
      const actualEnd = new Date(spanData.span.endTime).getTime();
      const expectedTimes = [
        startLowerBound, actualStart, startUpperBound, endLowerBound, actualEnd,
        endUpperBound
      ];
      assert.ok(spanData.span.startTime);
      assert.ok(spanData.span.endTime);
      assert.deepStrictEqual(expectedTimes.map(x => x).sort(), expectedTimes);
    });

    it('truncates large span names to limit', () => {
      const name = new Array(200).fill('a').join('');
      const spanData = new CommonSpanData(trace, name, '0', 0);
      assert.strictEqual(
          spanData.span.name,
          `${name.slice(0, Constants.TRACE_SERVICE_SPAN_NAME_LIMIT - 3)}...`);
    });

    it('adds labels of different types', () => {
      const spanData = new CommonSpanData(trace, 'name', '0', 0);
      spanData.addLabel('key', 'value');
      spanData.addLabel('id', 42);
      spanData.addLabel('obj', {a: true});
      spanData.addLabel('sym', Symbol('a'));
      delete spanData.span.labels[TraceLabels.STACK_TRACE_DETAILS_KEY];
      assert.deepStrictEqual(
          spanData.span.labels,
          {id: '42', key: 'value', obj: '{ a: true }', sym: 'Symbol(a)'});
    });

    it('truncates long keys', () => {
      const spanData = new CommonSpanData(trace, 'name', '0', 0);
      const longKey = new Array(200).fill('a').join('');
      spanData.addLabel(longKey, 'val');
      delete spanData.span.labels[TraceLabels.STACK_TRACE_DETAILS_KEY];
      assert.deepStrictEqual(spanData.span.labels, {
        [`${longKey.slice(0, Constants.TRACE_SERVICE_LABEL_KEY_LIMIT - 3)}...`]:
            'val'
      });
    });

    it('truncates long labels', () => {
      const spanData = new CommonSpanData(trace, 'name', '0', 0);
      const longVal = 'value-value-value';
      spanData.addLabel('longKey', longVal);
      delete spanData.span.labels[TraceLabels.STACK_TRACE_DETAILS_KEY];
      assert.deepStrictEqual(spanData.span.labels, {
        longKey: `${
            longVal.slice(
                0, traceWriter.get().getConfig().maximumLabelValueSize - 3)}...`
      });
    });

    it('exposes a method to provide serialized trace context', () => {
      const spanData = new CommonSpanData(trace, 'name', '0', 0);
      assert.deepStrictEqual(
          spanData.getTraceContext(),
          `${spanData.trace.traceId}/${spanData.span.spanId};o=1`);
    });

    it('captures stack traces', () => {
      function myFunction() {
        const spanData = new CommonSpanData(trace, 'name', '0', 0);
        const stack = spanData.span.labels[TraceLabels.STACK_TRACE_DETAILS_KEY];
        assert.ok(stack);
        const frames = JSON.parse(stack);
        assert.ok(frames && frames.stack_frame);
        assert.ok(Array.isArray(frames.stack_frame));
        // Check stack size
        assert.strictEqual(
            frames.stack_frame.length,
            traceWriter.get().getConfig().stackTraceLimit);
        // Check top frame
        assert.strictEqual(frames.stack_frame[0].method_name, 'myFunction');
      }
      myFunction();
    });
  });

  describe('RootSpanData', () => {
    it('creates child spans', () => {
      const rootSpanData = new RootSpanData(trace, 'root', '0', 0);
      const childSpanData =
          rootSpanData.createChildSpan({name: 'child'}) as ChildSpanData;
      assert.strictEqual(
          childSpanData.span.parentSpanId, rootSpanData.span.spanId);
    });

    it('writes to a Trace Writer when ended', () => {
      const rootSpanData = new RootSpanData(trace, 'root', '0', 0);
      rootSpanData.endSpan();
      assert.strictEqual(capturedTrace, rootSpanData.trace);
    });
  });
});
