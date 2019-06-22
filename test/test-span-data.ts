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

import {Constants, SpanType} from '../src/constants';
import {BaseSpanData, ChildSpanData, RootSpanData} from '../src/span-data';
import {Trace} from '../src/trace';
import {TraceLabels} from '../src/trace-labels';
import {traceWriter, TraceWriter, TraceWriterConfig} from '../src/trace-writer';

import {TestLogger} from './logger';
import * as traceAgentModule from './trace';
import {wait} from './utils';

describe('SpanData', () => {
  class CaptureSpanTraceWriter extends TraceWriter {
    writeTrace(trace: Trace) {
      assert.strictEqual(capturedTrace, null);
      capturedTrace = trace;
    }
  }
  let capturedTrace: Trace | null;
  let trace: Trace;

  before(() => {
    traceAgentModule.setTraceWriterForTest(CaptureSpanTraceWriter);
    traceWriter.create(
      {
        onUncaughtException: 'ignore',
        maximumLabelValueSize: 16,
        stackTraceLimit: 2,
      } as TraceWriterConfig,
      new TestLogger()
    );
  });

  after(() => {
    traceAgentModule.setTraceWriterForTest(traceAgentModule.TestTraceWriter);
  });

  beforeEach(() => {
    trace = {projectId: '0', traceId: 'trace-id', spans: []};
    capturedTrace = null;
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

    it('accurately records timestamps', async () => {
      const startLowerBound = Date.now();
      const spanData = new CommonSpanData(trace, 'name', '0', 0);
      const startUpperBound = Date.now();
      await wait(100);
      const endLowerBound = Date.now();
      spanData.endSpan();
      const endUpperBound = Date.now();
      const actualStart = new Date(spanData.span.startTime).getTime();
      const actualEnd = new Date(spanData.span.endTime).getTime();
      const expectedTimes = [
        startLowerBound,
        actualStart,
        startUpperBound,
        endLowerBound,
        actualEnd,
        endUpperBound,
      ];
      assert.ok(spanData.span.startTime);
      assert.ok(spanData.span.endTime);
      const ascending = (a: number, b: number) => a - b;
      assert.deepStrictEqual(
        expectedTimes.slice().sort(ascending),
        expectedTimes
      );
    });

    it('accepts a custom span end time', () => {
      const spanData = new CommonSpanData(trace, 'name', '0', 0);
      const startTime = new Date(spanData.span.startTime).getTime();
      // This input Date is far enough in the future that it's unlikely that the
      // time this function was called could be close to it.
      spanData.endSpan(new Date(startTime + 1000000));
      const endTime = new Date(spanData.span.endTime).getTime();
      assert.strictEqual(endTime - startTime, 1000000);
    });

    it('truncates large span names to limit', () => {
      const name = 'a'.repeat(200);
      const spanData = new CommonSpanData(trace, name, '0', 0);
      assert.strictEqual(
        spanData.span.name,
        `${name.slice(0, Constants.TRACE_SERVICE_SPAN_NAME_LIMIT - 3)}...`
      );
    });

    it('adds labels of different types', () => {
      const spanData = new CommonSpanData(trace, 'name', '0', 0);
      spanData.addLabel('key', 'value');
      spanData.addLabel('id', 42);
      spanData.addLabel('obj', {a: true});
      spanData.addLabel('sym', Symbol('a'));
      delete spanData.span.labels[TraceLabels.STACK_TRACE_DETAILS_KEY];
      assert.deepStrictEqual(spanData.span.labels, {
        id: '42',
        key: 'value',
        obj: '{ a: true }',
        sym: 'Symbol(a)',
      });
    });

    it('truncates long keys', () => {
      const spanData = new CommonSpanData(trace, 'name', '0', 0);
      const longKey = 'a'.repeat(200);
      spanData.addLabel(longKey, 'val');
      delete spanData.span.labels[TraceLabels.STACK_TRACE_DETAILS_KEY];
      assert.deepStrictEqual(spanData.span.labels, {
        [`${longKey.slice(
          0,
          Constants.TRACE_SERVICE_LABEL_KEY_LIMIT - 3
        )}...`]: 'val',
      });
    });

    it('truncates long labels', () => {
      const spanData = new CommonSpanData(trace, 'name', '0', 0);
      const longVal = 'value-value-value';
      spanData.addLabel('longKey', longVal);
      delete spanData.span.labels[TraceLabels.STACK_TRACE_DETAILS_KEY];
      assert.deepStrictEqual(spanData.span.labels, {
        longKey: `${longVal.slice(
          0,
          traceWriter.get().getConfig().maximumLabelValueSize - 3
        )}...`,
      });
    });

    it('exposes a method to provide trace context', () => {
      const spanData = new CommonSpanData(trace, 'name', '0', 0);
      assert.deepStrictEqual(spanData.getTraceContext(), {
        traceId: spanData.trace.traceId,
        spanId: spanData.span.spanId,
        options: 1,
      });
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
          traceWriter.get().getConfig().stackTraceLimit
        );
        // Check top frame
        assert.strictEqual(frames.stack_frame[0].method_name, 'myFunction');
      }
      myFunction();
    });

    // Dependent on ./fixtures/source-maps-test
    describe('stack traces with/without source maps', () => {
      const sourceMapTypes = [
        'external-source-map',
        'inline-source-map',
        'inline-sources',
      ];
      const getSourceMapTestStackFrame = (spanData: CommonSpanData) => {
        const stack = spanData.span.labels[TraceLabels.STACK_TRACE_DETAILS_KEY];
        assert.ok(stack);
        const frames = JSON.parse(stack);
        assert.ok(frames && frames.stack_frame);
        assert.ok(Array.isArray(frames.stack_frame));
        const stackFrame = frames.stack_frame[1];
        return stackFrame;
      };

      for (const sourceMapType of sourceMapTypes) {
        it(`uses source maps when available in stack traces: ${sourceMapType}`, () => {
          const {
            applyGeneric,
          } = require(`./fixtures/source-maps-test/${sourceMapType}`) as {
            applyGeneric: <T>(fn: () => T) => T;
          };
          const spanData = applyGeneric(
            () => new CommonSpanData(trace, 'name', '0', 0)
          );
          const stackFrame = getSourceMapTestStackFrame(spanData);
          // Source maps should give us this exact information.
          assert.ok(stackFrame.file_name.endsWith(`${sourceMapType}.ts`));
          assert.strictEqual(stackFrame.line_number, 19);
          assert.strictEqual(stackFrame.column_number, 52);
        });
      }

      it(`doesn't break when there are no source maps`, () => {
        const {
          applyGeneric,
        } = require(`./fixtures/source-maps-test/no-source-map`) as {
          applyGeneric: <T>(fn: () => T) => T;
        };
        const spanData = applyGeneric(
          () => new CommonSpanData(trace, 'name', '0', 0)
        );
        const stackFrame = getSourceMapTestStackFrame(spanData);
        assert.ok(stackFrame.file_name.endsWith('no-source-map.js'));
        assert.strictEqual(stackFrame.line_number, 20);
        assert.strictEqual(stackFrame.column_number, 47);
      });
    });

    it(`doesn't call TraceWriter#writeTrace when ended`, () => {
      const spanData = new CommonSpanData(trace, 'name', '0', 0);
      spanData.endSpan();
      // writeTrace writes to capturedTrace.
      assert.ok(!capturedTrace);
    });
  });

  describe('RootSpanData', () => {
    it('creates child spans', () => {
      const rootSpanData = new RootSpanData(trace, 'root', '0', 0);
      const childSpanData = rootSpanData.createChildSpan({
        name: 'child',
      }) as ChildSpanData;
      assert.strictEqual(
        childSpanData.span.parentSpanId,
        rootSpanData.span.spanId
      );
    });

    it('writes to a Trace Writer when ended', () => {
      const rootSpanData = new RootSpanData(trace, 'root', '0', 0);
      rootSpanData.endSpan();
      assert.strictEqual(capturedTrace, rootSpanData.trace);
    });

    it(`doesn't write to a Trace Writer more than once`, () => {
      const rootSpanData = new RootSpanData(trace, 'root', '0', 0);
      rootSpanData.endSpan();
      assert.strictEqual(capturedTrace, rootSpanData.trace);
      capturedTrace = null;
      rootSpanData.endSpan();
      assert.ok(!capturedTrace);
    });

    it('if already ended, allows open child spans to publish themselves later', () => {
      const rootSpanData = new RootSpanData(trace, 'root', '0', 0);
      const firstChildSpanData = rootSpanData.createChildSpan({
        name: 'short-child',
      }) as ChildSpanData;
      const secondChildSpanData = rootSpanData.createChildSpan({
        name: 'long-child',
      }) as ChildSpanData;
      // End the first child span.
      firstChildSpanData.endSpan();
      // End the root span. Note that the second child span hasn't ended yet.
      rootSpanData.endSpan();
      // writeTrace should've been called from rootSpanData.endSpan.
      assert.ok(capturedTrace);
      // Save the value of capturedTrace, and then clear it, so writeTrace
      // doesn't fail an assertion.
      const firstTrace = capturedTrace!;
      capturedTrace = null;
      // Now end the second child span. This should trigger another call to
      // writeTrace.
      secondChildSpanData.endSpan();
      // writeTrace should've been called again, this time from
      // childSpanData.endSpan.
      assert.ok(capturedTrace);
      assert.strictEqual(firstTrace.traceId, capturedTrace!.traceId);
      // The child span should've written a trace with only itself as a span.
      assert.strictEqual(capturedTrace!.spans.length, 1);
      assert.strictEqual(capturedTrace!.spans[0], secondChildSpanData.span);
      // Ensure that calling endSpan on a span that already ended doesn't
      // do anything.
      capturedTrace = null;
      firstChildSpanData.endSpan();
      secondChildSpanData.endSpan();
      assert.ok(!capturedTrace);
    });
  });
});
