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

import {SpanType} from '../src/constants';
import {Tracer} from '../src/plugin-types';

import * as testTraceModule from './trace';
import {asChildSpanData, asRootSpanData} from './utils';

const identity = <T>(x: T) => x;

describe('Custom Trace API with CLS disabled', () => {
  let traceApi: Tracer;

  before(() => {
    testTraceModule.setCLSForTest();
  });

  after(() => {
    testTraceModule.setCLSForTest(testTraceModule.TestCLS);
  });

  beforeEach(() => {
    traceApi = testTraceModule.start({clsMechanism: 'none'});
  });

  afterEach(() => {
    testTraceModule.clearTraceData();
  });

  it('should allow root spans to be created without constraints', () => {
    traceApi.runInRootSpan({name: 'root1'}, root1 => {
      assert.strictEqual(root1.type, SpanType.ROOT);
      traceApi.runInRootSpan({name: 'root2'}, root2 => {
        assert.strictEqual(root2.type, SpanType.ROOT);
        assert.notStrictEqual(
          asRootSpanData(root2).trace.traceId,
          asRootSpanData(root1).trace.traceId
        );
        root2.endSpan();
      });
      root1.endSpan();
    });
  });

  it('should allow child spans to be created using root span API', () => {
    const root = asRootSpanData(
      traceApi.runInRootSpan({name: 'root'}, identity)
    );
    const child = asChildSpanData(root.createChildSpan({name: 'child'}));
    assert.strictEqual(child.span.parentSpanId, root.span.spanId);
    assert.strictEqual(child.trace.traceId, root.trace.traceId);
    child.endSpan();
    root.endSpan();
  });

  it('should create phantom child spans thru trace API', () => {
    const root = asRootSpanData(
      traceApi.runInRootSpan({name: 'root'}, identity)
    );
    const child = traceApi.createChildSpan({name: 'child'});
    assert.strictEqual(child.type, SpanType.UNCORRELATED);
    child.endSpan();
    root.endSpan();
  });
});
