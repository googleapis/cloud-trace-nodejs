// Copyright 2015 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as assert from 'assert';
import {describe, it} from 'mocha';

import {cls, TraceCLS, TraceCLSMechanism} from '../src/cls';
import {
  defaultConfig,
  GetHeaderFunction as HeaderGetter,
  OpenCensusPropagation,
  RequestDetails,
  SetHeaderFunction as HeaderSetter,
  TracePolicy,
} from '../src/config';
import {SpanType} from '../src/constants';
import {
  StackdriverTracer,
  StackdriverTracerComponents,
  StackdriverTracerConfig,
} from '../src/trace-api';
import {traceWriter} from '../src/trace-writer';
import {alwaysTrace, neverTrace} from '../src/tracing-policy';
import {FORCE_NEW, TraceContext} from '../src/util';

import {TestLogger} from './logger';
import * as testTraceModule from './trace';
import {getBaseConfig, NoPropagation} from './utils';

describe('Trace Interface', () => {
  const logger = new TestLogger();
  function createTraceAgent(
    config?: Partial<StackdriverTracerConfig>,
    components?: Partial<StackdriverTracerComponents>
  ): StackdriverTracer {
    const result = new StackdriverTracer('test');
    result.enable(
      Object.assign(getBaseConfig(), config),
      Object.assign(
        {
          tracePolicy: alwaysTrace(),
          logger,
          propagation: new NoPropagation(),
        },
        components
      )
    );
    return result;
  }

  before(() => {
    testTraceModule.setCLSForTest(TraceCLS);
    cls.create({mechanism: TraceCLSMechanism.ASYNC_LISTENER}, logger).enable();
    return traceWriter
      .create(
        Object.assign(
          {[FORCE_NEW]: true, authOptions: {projectId: 'project-1'}},
          defaultConfig
        ),
        logger
      )
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
      traceAPI.runInRootSpan({name: 'root'}, rootSpan => {
        const childSpan = traceAPI.createChildSpan({name: 'sub'});
        childSpan.addLabel('key', 'val');
        childSpan.endSpan();
        rootSpan.endSpan();
      });
      const rootSpanData = testTraceModule.getOneSpan(
        span => span.name === 'root'
      );
      const childSpanData = testTraceModule.getOneSpan(
        span => span.name === 'sub'
      );
      assert.strictEqual(childSpanData.parentSpanId, rootSpanData.spanId);
      assert.strictEqual(childSpanData.labels.key, 'val');
    });

    it('should produce real child spans through root span API', () => {
      const traceAPI = createTraceAgent();
      traceAPI.runInRootSpan({name: 'root'}, rootSpan => {
        const childSpan = rootSpan.createChildSpan({name: 'sub'});
        childSpan.addLabel('key', 'val');
        childSpan.endSpan();
        rootSpan.endSpan();
      });
      // getOneSpan asserts that only one such span exists.
      const rootSpanData = testTraceModule.getOneSpan(
        span => span.name === 'root'
      );
      const childSpanData = testTraceModule.getOneSpan(
        span => span.name === 'sub'
      );
      assert.strictEqual(childSpanData.parentSpanId, rootSpanData.spanId);
      assert.strictEqual(childSpanData.labels.key, 'val');
    });

    it('should produce real root spans with runInRootSpan', () => {
      const traceAPI = createTraceAgent();
      const result = traceAPI.runInRootSpan({name: 'root'}, rootSpan => {
        rootSpan.addLabel('key', 'val');
        rootSpan.endSpan();
        return 'result';
      });
      assert.strictEqual(result, 'result');
      // getOneSpan asserts that only one such span exists.
      const rootSpanData = testTraceModule.getOneSpan(
        span => span.name === 'root'
      );
      assert.strictEqual(rootSpanData.labels.key, 'val');
    });

    it('should allow sequential root spans', () => {
      const traceAPI = createTraceAgent();
      traceAPI.runInRootSpan({name: 'root1'}, rootSpan => {
        rootSpan.endSpan();
      });
      traceAPI.runInRootSpan({name: 'root2'}, rootSpan => {
        rootSpan.endSpan();
      });
      assert.strictEqual(testTraceModule.getTraces().length, 2);
    });

    it('should not allow nested root spans', () => {
      const traceAPI = createTraceAgent();
      traceAPI.runInRootSpan({name: 'root1'}, rootSpan => {
        traceAPI.runInRootSpan({name: 'root2'}, notRootSpan => {
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
        traceAPI.getCurrentRootSpan().type,
        SpanType.UNCORRELATED
      );
      traceAPI.runInRootSpan({name: 'root'}, rootSpan => {
        assert.strictEqual(traceAPI.getCurrentRootSpan(), rootSpan);
        rootSpan.endSpan();
      });
    });

    it('should error when the spans per trace soft limit has been exceeded', () => {
      const tracer = createTraceAgent({
        spansPerTraceSoftLimit: 10,
        spansPerTraceHardLimit: 20,
      });
      tracer.runInRootSpan({name: 'root'}, rootSpan => {
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

    it('should return null context ID when one does not exist', () => {
      const traceAPI = createTraceAgent();
      assert.strictEqual(traceAPI.getCurrentContextId(), null);
    });

    it('should return the appropriate context ID', () => {
      const traceAPI = createTraceAgent();
      traceAPI.runInRootSpan({name: 'root'}, rootSpan => {
        const id = traceAPI.getCurrentContextId();
        assert.ok(rootSpan.getTraceContext());
        assert.strictEqual(id, rootSpan.getTraceContext()!.traceId);
        rootSpan.endSpan();
        // getOneTrace asserts that there is exactly one trace.
        testTraceModule.getOneTrace(trace => trace.traceId === id);
      });
    });

    it('should return a context ID even if in an untraced request', () => {
      const traceAPI = createTraceAgent({}, {tracePolicy: neverTrace()});
      traceAPI.runInRootSpan({name: ''}, rootSpan => {
        assert.strictEqual(rootSpan.type, SpanType.UNSAMPLED);
        assert.notStrictEqual(traceAPI.getCurrentContextId(), null);
        assert.ok(rootSpan.getTraceContext());
        assert.strictEqual(
          traceAPI.getCurrentContextId(),
          rootSpan.getTraceContext()!.traceId
        );
        assert.ok(rootSpan.createChildSpan().getTraceContext());
        assert.ok(traceAPI.createChildSpan().getTraceContext());
      });
    });

    it('should return the project ID from the Trace Writer (promise api)', async () => {
      const traceApi = createTraceAgent();
      assert.strictEqual(await traceApi.getProjectId(), 'project-1');
    });

    it('should return get the project ID from the Trace Writer', () => {
      const traceApi = createTraceAgent();
      assert.strictEqual(traceApi.getWriterProjectId(), 'project-1');
    });

    it('should pass relevant fields to the trace policy', () => {
      class CaptureOptionsTracePolicy {
        capturedShouldTraceParam: RequestDetails | null = null;
        shouldTrace(options: RequestDetails) {
          this.capturedShouldTraceParam = options;
          return false;
        }
      }
      const tracePolicy = new CaptureOptionsTracePolicy();
      const traceAPI = createTraceAgent({}, {tracePolicy});
      // All params present
      {
        const rootSpanOptions = {
          name: 'root',
          url: 'foo',
          method: 'bar',
          traceContext: {traceId: '1', spanId: '2', options: 1},
        };
        const beforeRootSpan = Date.now();
        traceAPI.runInRootSpan(rootSpanOptions, rootSpan => {
          assert.strictEqual(rootSpan.type, SpanType.UNSAMPLED);
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
          rootSpanOptions.traceContext
        );
        assert.strictEqual(shouldTraceParam.options, rootSpanOptions);
      }
      tracePolicy.capturedShouldTraceParam = null;
      // Limited params present
      {
        const rootSpanOptions = {name: 'root'};
        traceAPI.runInRootSpan(rootSpanOptions, rootSpan => {
          assert.strictEqual(rootSpan.type, SpanType.UNSAMPLED);
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

    it('should expose methods for trace context header propagation', () => {
      class TestPropagation implements OpenCensusPropagation {
        extract({getHeader}: HeaderGetter) {
          return {traceId: getHeader('a') as string, spanId: '0', options: 1};
        }
        inject({setHeader}: HeaderSetter, traceContext: TraceContext) {
          setHeader(traceContext.traceId, 'y');
        }
      }
      const propagation = new TestPropagation();
      const tracer = createTraceAgent({}, {propagation});
      const result = tracer.propagation.extract(s => `${s}${s}`);
      assert.deepStrictEqual(result, {
        traceId: 'aa',
        spanId: '0',
        options: 1,
      });
      let setHeaderCalled = false;
      tracer.propagation.inject(
        (key: string, value: string) => {
          assert.strictEqual(key, 'x');
          assert.strictEqual(value, 'y');
          setHeaderCalled = true;
        },
        {traceId: 'x', spanId: '0', options: 1}
      );
      assert.ok(setHeaderCalled);
    });

    it('should respect enhancedDatabaseReporting options field', () => {
      [true, false].forEach(enhancedDatabaseReporting => {
        const traceAPI = createTraceAgent({
          enhancedDatabaseReporting,
        });
        assert.strictEqual(
          traceAPI.enhancedDatabaseReportingEnabled(),
          enhancedDatabaseReporting
        );
      });
    });

    it('should use incoming context to set trace ID when available', () => {
      // Propagate from trace context header
      {
        createTraceAgent().runInRootSpan(
          {
            name: 'root1',
            traceContext: {traceId: '123456', spanId: '667', options: 1},
          },
          rootSpan => {
            rootSpan.endSpan();
          }
        );
        const foundTrace = testTraceModule.getOneTrace(
          trace => trace.traceId === '123456'
        );
        assert.strictEqual(foundTrace.spans.length, 1);
        assert.strictEqual(foundTrace.spans[0].name, 'root1');
        assert.strictEqual(foundTrace.spans[0].parentSpanId, '667');
      }
      // Generate a trace context
      {
        createTraceAgent().runInRootSpan({name: 'root2'}, rootSpan => {
          rootSpan.endSpan();
        });
        // The trace ID will not randomly be 123456
        const foundTrace = testTraceModule.getOneTrace(
          trace => trace.traceId !== '123456'
        );
        assert.strictEqual(foundTrace.spans.length, 1);
        assert.strictEqual(foundTrace.spans[0].name, 'root2');
        assert.notStrictEqual(foundTrace.spans[0].parentSpanId, '667');
      }
    });

    it('should trace if no option flags are provided', () => {
      createTraceAgent({enhancedDatabaseReporting: false}).runInRootSpan(
        {name: 'root', traceContext: {traceId: '123456', spanId: '667'}},
        rootSpan => {
          rootSpan.endSpan();
        }
      );
      const foundTrace = testTraceModule.getOneTrace(
        trace => trace.traceId === '123456'
      );
      assert.strictEqual(foundTrace.spans.length, 1);
    });

    describe('getting response trace context', () => {
      it('should behave as expected', () => {
        const fakeTraceId = 'ffeeddccbbaa99887766554433221100';
        const traceApi = createTraceAgent();
        const tracedContext = {traceId: fakeTraceId, spanId: '0', options: 1};
        const untracedContext = {
          traceId: fakeTraceId,
          spanId: '0',
          options: 0,
        };
        const unspecifiedContext = {traceId: fakeTraceId, spanId: '0'};
        assert.deepStrictEqual(
          traceApi.getResponseTraceContext(tracedContext, true),
          tracedContext
        );
        assert.deepStrictEqual(
          traceApi.getResponseTraceContext(tracedContext, false),
          untracedContext
        );
        assert.deepStrictEqual(
          traceApi.getResponseTraceContext(untracedContext, true),
          untracedContext
        );
        assert.deepStrictEqual(
          traceApi.getResponseTraceContext(untracedContext, false),
          untracedContext
        );
        assert.deepStrictEqual(
          traceApi.getResponseTraceContext(unspecifiedContext, true),
          untracedContext
        );
        assert.deepStrictEqual(
          traceApi.getResponseTraceContext(unspecifiedContext, false),
          untracedContext
        );
      });
    });
  });
});
