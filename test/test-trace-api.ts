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

import * as assert from 'assert';

import {cls, TraceCLS, TraceCLSMechanism} from '../src/cls';
import {defaultConfig, RequestDetails, TracePolicy} from '../src/config';
import {SpanType} from '../src/constants';
import {StackdriverTracer, StackdriverTracerConfig} from '../src/trace-api';
import {traceWriter} from '../src/trace-writer';
import {alwaysTrace, TraceContextHeaderBehavior} from '../src/tracing-policy';
import {FORCE_NEW} from '../src/util';

import {TestLogger} from './logger';
import * as testTraceModule from './trace';
import {getBaseConfig} from './utils';

describe('Trace Interface', () => {
  const logger = new TestLogger();
  function createTraceAgent(
      config?: Partial<StackdriverTracerConfig>,
      policy?: TracePolicy): StackdriverTracer {
    const result = new StackdriverTracer('test');
    result.enable(
        Object.assign(getBaseConfig(), config), policy || alwaysTrace(),
        logger);
    return result;
  }

  before(() => {
    testTraceModule.setCLSForTest(TraceCLS);
    cls.create({mechanism: TraceCLSMechanism.ASYNC_LISTENER}, logger).enable();
    return traceWriter
        .create(
            Object.assign(
                {[FORCE_NEW]: true, projectId: 'project-1'}, defaultConfig),
            logger)
        .initialize();
  });

  after(() => {
    testTraceModule.setCLSForTest(testTraceModule.TestCLS);
  });

  it('should correctly manage internal state', () => {
    const traceAPI = createTraceAgent();
    assert.ok(traceAPI.isActive());
    traceAPI.disable();
    assert.ok(!traceAPI.isActive(), 'Being disabled sets isActive to false');
  });

  describe('behavior when initialized', () => {
    afterEach(() => {
      testTraceModule.clearTraceData();
    });

    it('should produce real child spans with createChildSpan', () => {
      const traceAPI = createTraceAgent();
      traceAPI.runInRootSpan({name: 'root'}, (rootSpan) => {
        const childSpan = traceAPI.createChildSpan({name: 'sub'});
        childSpan.addLabel('key', 'val');
        childSpan.endSpan();
        rootSpan.endSpan();
      });
      const rootSpanData =
          testTraceModule.getOneSpan(span => span.name === 'root');
      const childSpanData =
          testTraceModule.getOneSpan(span => span.name === 'sub');
      assert.strictEqual(childSpanData.parentSpanId, rootSpanData.spanId);
      assert.strictEqual(childSpanData.labels.key, 'val');
    });

    it('should produce real child spans through root span API', () => {
      const traceAPI = createTraceAgent();
      traceAPI.runInRootSpan({name: 'root'}, (rootSpan) => {
        const childSpan = rootSpan.createChildSpan({name: 'sub'});
        childSpan.addLabel('key', 'val');
        childSpan.endSpan();
        rootSpan.endSpan();
      });
      // getOneSpan asserts that only one such span exists.
      const rootSpanData =
          testTraceModule.getOneSpan(span => span.name === 'root');
      const childSpanData =
          testTraceModule.getOneSpan(span => span.name === 'sub');
      assert.strictEqual(childSpanData.parentSpanId, rootSpanData.spanId);
      assert.strictEqual(childSpanData.labels.key, 'val');
    });

    it('should produce real root spans with runInRootSpan', () => {
      const traceAPI = createTraceAgent();
      const result = traceAPI.runInRootSpan({name: 'root'}, (rootSpan) => {
        rootSpan.addLabel('key', 'val');
        rootSpan.endSpan();
        return 'result';
      });
      assert.strictEqual(result, 'result');
      // getOneSpan asserts that only one such span exists.
      const rootSpanData =
          testTraceModule.getOneSpan(span => span.name === 'root');
      assert.strictEqual(rootSpanData.labels.key, 'val');
    });

    it('should allow sequential root spans', () => {
      const traceAPI = createTraceAgent();
      traceAPI.runInRootSpan({name: 'root1'}, (rootSpan) => {
        rootSpan.endSpan();
      });
      traceAPI.runInRootSpan({name: 'root2'}, (rootSpan) => {
        rootSpan.endSpan();
      });
      assert.strictEqual(testTraceModule.getTraces().length, 2);
    });

    it('should not allow nested root spans', () => {
      const traceAPI = createTraceAgent();
      traceAPI.runInRootSpan({name: 'root1'}, (rootSpan) => {
        traceAPI.runInRootSpan({name: 'root2'}, (notRootSpan) => {
          assert.strictEqual(notRootSpan.type, SpanType.UNCORRELATED);
          notRootSpan.endSpan();
        });
        rootSpan.endSpan();
      });
      assert.strictEqual(testTraceModule.getTraces().length, 1);
    });

    it('should return a root span when getCurrentRootSpan is called', () => {
      const traceAPI = createTraceAgent();
      // When a root span isn't running, return UNCORRELATED.
      assert.strictEqual(
          traceAPI.getCurrentRootSpan().type, SpanType.UNCORRELATED);
      traceAPI.runInRootSpan({name: 'root'}, (rootSpan) => {
        assert.strictEqual(traceAPI.getCurrentRootSpan(), rootSpan);
        rootSpan.endSpan();
      });
    });

    it('should error when the spans per trace soft limit has been exceeded',
       () => {
         const tracer = createTraceAgent(
             {spansPerTraceSoftLimit: 10, spansPerTraceHardLimit: 20});
         tracer.runInRootSpan({name: 'root'}, (rootSpan) => {
           for (let i = 0; i < 10; i++) {
             tracer.createChildSpan({name: `span-${i}`}).endSpan();
           }
           assert.strictEqual(logger.getNumLogsWith('error', '[span-9]'), 1);
           for (let i = 0; i < 9; i++) {
             tracer.createChildSpan({name: `span-${i + 10}`}).endSpan();
           }
           const child = tracer.createChildSpan({name: `span-19`});
           assert.ok(!tracer.isRealSpan(child));
           assert.strictEqual(logger.getNumLogsWith('error', '[span-19]'), 1);
           rootSpan.endSpan();
         });
       });

    it('should return null context id when one does not exist', () => {
      const traceAPI = createTraceAgent();
      assert.strictEqual(traceAPI.getCurrentContextId(), null);
    });

    it('should return the appropriate trace id', () => {
      const traceAPI = createTraceAgent();
      traceAPI.runInRootSpan({name: 'root'}, (rootSpan) => {
        const id = traceAPI.getCurrentContextId();
        rootSpan.endSpan();
        // getOneTrace asserts that there is exactly one trace.
        testTraceModule.getOneTrace(trace => trace.traceId === id);
      });
    });

    it('should return the project ID from the Trace Writer (promise api)',
       async () => {
         const traceApi = createTraceAgent();
         assert.strictEqual(await traceApi.getProjectId(), 'project-1');
       });

    it('should return get the project ID from the Trace Writer', () => {
      const traceApi = createTraceAgent();
      assert.strictEqual(traceApi.getWriterProjectId(), 'project-1');
    });

    it('should pass relevant fields to the trace policy', () => {
      class CaptureOptionsTracePolicy {
        capturedShouldTraceParam: RequestDetails|null = null;
        shouldTrace(options: RequestDetails) {
          this.capturedShouldTraceParam = options;
          return false;
        }
      }
      const tracePolicy = new CaptureOptionsTracePolicy();
      const traceAPI = createTraceAgent({}, tracePolicy);
      // All params present
      {
        const rootSpanOptions =
            {name: 'root', url: 'foo', method: 'bar', traceContext: '1/2;o=1'};
        const beforeRootSpan = Date.now();
        traceAPI.runInRootSpan(rootSpanOptions, (rootSpan) => {
          assert.strictEqual(rootSpan.type, SpanType.UNTRACED);
          rootSpan.endSpan();
        });
        const afterRootSpan = Date.now();
        assert.ok(tracePolicy.capturedShouldTraceParam);
        const shouldTraceParam = tracePolicy.capturedShouldTraceParam!;
        assert.strictEqual(shouldTraceParam.url, 'foo');
        assert.strictEqual(shouldTraceParam.method, 'bar');
        assert.ok(shouldTraceParam.timestamp >= beforeRootSpan);
        assert.ok(shouldTraceParam.timestamp <= afterRootSpan);
        assert.ok(shouldTraceParam.timestamp <= afterRootSpan);
        assert.deepStrictEqual(
            shouldTraceParam.traceContext,
            {traceId: '1', spanId: '2', options: 1});
        assert.strictEqual(shouldTraceParam.options, rootSpanOptions);
      }
      tracePolicy.capturedShouldTraceParam = null;
      // Limited params present
      {
        const rootSpanOptions = {name: 'root', traceContext: 'unparseable'};
        traceAPI.runInRootSpan(rootSpanOptions, (rootSpan) => {
          assert.strictEqual(rootSpan.type, SpanType.UNTRACED);
          rootSpan.endSpan();
        });
        assert.ok(tracePolicy.capturedShouldTraceParam);
        const shouldTraceParam = tracePolicy.capturedShouldTraceParam!;
        assert.strictEqual(shouldTraceParam.url, '');
        assert.strictEqual(shouldTraceParam.method, '');
        assert.strictEqual(shouldTraceParam.traceContext, null);
        assert.strictEqual(shouldTraceParam.options, rootSpanOptions);
      }
    });

    it('should respect enhancedDatabaseReporting options field', () => {
      [true, false].forEach((enhancedDatabaseReporting) => {
        const traceAPI = createTraceAgent({
          enhancedDatabaseReporting,
        });
        assert.strictEqual(
            traceAPI.enhancedDatabaseReportingEnabled(),
            enhancedDatabaseReporting);
      });
    });

    it('should respect propagateTraceContextFromHeader options field', () => {
      // Don't propagate from trace context header
      createTraceAgent({
        enhancedDatabaseReporting: false,
        propagateTraceContextFromHeader: false
      })
          .runInRootSpan(
              {name: 'root1', traceContext: '123456/667;o=1'}, (rootSpan) => {
                rootSpan.endSpan();
              });
      // The trace ID will not randomly be 123456
      let foundTrace =
          testTraceModule.getOneTrace(trace => trace.traceId !== '123456');
      assert.strictEqual(foundTrace.spans.length, 1);
      assert.strictEqual(foundTrace.spans[0].name, 'root1');
      assert.notStrictEqual(foundTrace.spans[0].parentSpanId, '667');
      // Propagate from trace context header
      createTraceAgent({
        enhancedDatabaseReporting: false,
        propagateTraceContextFromHeader: true
      })
          .runInRootSpan(
              {name: 'root2', traceContext: '123456/667;o=1'}, (rootSpan) => {
                rootSpan.endSpan();
              });
      foundTrace =
          testTraceModule.getOneTrace(trace => trace.traceId === '123456');
      assert.strictEqual(foundTrace.spans.length, 1);
      assert.strictEqual(foundTrace.spans[0].name, 'root2');
      assert.strictEqual(foundTrace.spans[0].parentSpanId, '667');
    });

    it('should trace if no option flags are provided', () => {
      createTraceAgent({enhancedDatabaseReporting: false})
          .runInRootSpan(
              {name: 'root', traceContext: '123456/667'}, (rootSpan) => {
                rootSpan.endSpan();
              });
      const foundTrace =
          testTraceModule.getOneTrace(trace => trace.traceId === '123456');
      assert.strictEqual(foundTrace.spans.length, 1);
    });

    describe('getting response trace context', () => {
      it('should behave as expected', () => {
        const fakeTraceId = 'ffeeddccbbaa99887766554433221100';
        const traceApi = createTraceAgent();
        const tracedContext = fakeTraceId + '/0;o=1';
        const untracedContext = fakeTraceId + '/0;o=0';
        const unspecifiedContext = fakeTraceId + '/0';
        assert.strictEqual(
            traceApi.getResponseTraceContext(tracedContext, true),
            tracedContext);
        assert.strictEqual(
            traceApi.getResponseTraceContext(tracedContext, false),
            untracedContext);
        assert.strictEqual(
            traceApi.getResponseTraceContext(untracedContext, true),
            untracedContext);
        assert.strictEqual(
            traceApi.getResponseTraceContext(untracedContext, false),
            untracedContext);
        assert.strictEqual(
            traceApi.getResponseTraceContext(unspecifiedContext, true),
            untracedContext);
        assert.strictEqual(
            traceApi.getResponseTraceContext(unspecifiedContext, false),
            untracedContext);
      });
    });
  });
});
