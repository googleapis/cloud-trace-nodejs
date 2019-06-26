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

import {RequestDetails} from '../src/config';
import {
  BuiltinTracePolicy,
  TraceContextHeaderBehavior,
  TracePolicyConfig,
} from '../src/tracing-policy';

const traceContext = {
  traceId: '0',
  spanId: '0',
  options: 1,
};

/**
 * A wrapper of TracePolicy for testing purposes.
 */
class TracePolicyForTest extends BuiltinTracePolicy {
  /**
   * Constructs a new TracePolicy instance, filling in default arguments.
   * @param config A partial TracePolicy configuration.
   */
  constructor(config: Partial<TracePolicyConfig>) {
    super(
      Object.assign(
        {
          samplingRate: 0,
          ignoreUrls: [],
          ignoreMethods: [],
          contextHeaderBehavior: TraceContextHeaderBehavior.DEFAULT,
        },
        config
      )
    );
  }

  /**
   * Calls shouldTrace with default parameters, and the given parameter mixed
   * in.
   * @param requestDetails A partial object passed to shouldTrace.
   */
  shouldTraceForTest(requestDetails: Partial<RequestDetails>): boolean {
    return this.shouldTrace(
      Object.assign(
        {timestamp: 0, url: '', method: '', traceContext, options: {}},
        requestDetails
      )
    );
  }
}

describe('TracePolicy', () => {
  describe('URL Filtering', () => {
    it('should not allow filtered urls', () => {
      const policy = new TracePolicyForTest({
        ignoreUrls: ['/_ah/health', /\/book*/],
      });
      assert.ok(
        !policy.shouldTraceForTest({
          url: '/_ah/health',
        })
      );
      assert.ok(
        !policy.shouldTraceForTest({
          url: '/book/test',
        })
      );
    });

    it('should allow non-filtered urls', () => {
      const policy = new TracePolicyForTest({ignoreUrls: ['/_ah/health']});
      assert.ok(policy.shouldTraceForTest({url: '/_ah/background'}));
    });
  });

  describe('Method Filtering', () => {
    it('should not allow filtered methods', () => {
      const policy = new TracePolicyForTest({
        ignoreMethods: ['method1', 'method2'],
      });
      assert.ok(!policy.shouldTraceForTest({method: 'method1'}));
      assert.ok(!policy.shouldTraceForTest({method: 'method2'}));
    });

    it('should allow non-filtered methods', () => {
      const policy = new TracePolicyForTest({ignoreMethods: ['method']});
      assert.ok(
        policy.shouldTraceForTest({
          method: 'method1',
        })
      );
    });
  });

  describe('Context Header Options Field', () => {
    describe('when contextHeaderBehavior = IGNORE', () => {
      const policy = new TracePolicyForTest({
        contextHeaderBehavior: TraceContextHeaderBehavior.IGNORE,
      });

      it('should ignore options bit', () => {
        assert.ok(
          policy.shouldTraceForTest({
            traceContext: {traceId: '0', spanId: '0', options: 1},
          })
        );
        assert.ok(
          policy.shouldTraceForTest({
            traceContext: {traceId: '0', spanId: '0', options: 0},
          })
        );
      });

      it('should not require that header exists', () => {
        assert.ok(policy.shouldTraceForTest({traceContext: null}));
        assert.ok(policy.shouldTraceForTest({traceContext: undefined}));
      });
    });

    describe('when contextHeaderBehavior = REQUIRE', () => {
      const policy = new TracePolicyForTest({
        contextHeaderBehavior: TraceContextHeaderBehavior.REQUIRE,
      });

      it('should respect options bit', () => {
        assert.ok(
          policy.shouldTraceForTest({
            traceContext: {traceId: '0', spanId: '0', options: 1},
          })
        );
        assert.ok(
          !policy.shouldTraceForTest({
            traceContext: {traceId: '0', spanId: '0', options: 0},
          })
        );
      });

      it('should require that header exists', () => {
        assert.ok(!policy.shouldTraceForTest({traceContext: null}));
        assert.ok(!policy.shouldTraceForTest({traceContext: undefined}));
      });
    });

    describe('when contextHeaderBehavior = DEFAULT', () => {
      const policy = new TracePolicyForTest({
        contextHeaderBehavior: TraceContextHeaderBehavior.DEFAULT,
      });

      it('should respect options bit', () => {
        assert.ok(
          policy.shouldTraceForTest({
            traceContext: {traceId: '0', spanId: '0', options: 1},
          })
        );
        assert.ok(
          !policy.shouldTraceForTest({
            traceContext: {traceId: '0', spanId: '0', options: 0},
          })
        );
      });

      it('should not require that header exists', () => {
        assert.ok(policy.shouldTraceForTest({traceContext: null}));
        assert.ok(policy.shouldTraceForTest({traceContext: undefined}));
      });
    });
  });

  describe('Sampling', () => {
    const NUM_SECONDS = 10;
    const testCases = [0.1, 0.5, 1, 10, 50, 150, 200, 500, 1000];
    for (const testCase of testCases) {
      it(`should throttle traces when samplingRate = ` + testCase, () => {
        const policy = new TracePolicyForTest({samplingRate: testCase});
        const expected = NUM_SECONDS * testCase;
        let actual = 0;
        const start = Date.now();
        for (
          let timestamp = start;
          timestamp < start + 1000 * NUM_SECONDS;
          timestamp++
        ) {
          if (policy.shouldTraceForTest({timestamp})) {
            actual++;
          }
        }
        assert.ok(
          actual <= expected,
          `Expected less than ${expected} traced but got ${actual}`
        );
        assert.ok(
          actual > expected * 0.8,
          `Expected close to (>=0.8*) ${expected} traced but got ${actual}`
        );
      });
    }

    it('should always sample when samplingRate = 0', () => {
      const policy = new TracePolicyForTest({samplingRate: 0});
      let numSamples = 0;
      const start = Date.now();
      for (let timestamp = start; timestamp < start + 1000; timestamp++) {
        if (policy.shouldTraceForTest({timestamp})) {
          numSamples++;
        }
      }
      assert.strictEqual(numSamples, 1000);
    });

    it('should never sample when samplingRate < 0', () => {
      const policy = new TracePolicyForTest({samplingRate: -1});
      let numSamples = 0;
      const start = Date.now();
      for (let timestamp = start; timestamp < start + 1000; timestamp++) {
        if (policy.shouldTraceForTest({timestamp})) {
          numSamples++;
        }
      }
      assert.strictEqual(numSamples, 0);
    });
  });
});
