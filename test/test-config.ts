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
import * as semver from 'semver';
import * as util from 'util';

import {TraceCLSConfig, TraceCLSMechanism} from '../src/cls';

import * as testTraceModule from './trace';
import { NormalizedConfig } from '../src/tracing';
import { StackdriverTracer } from '../src/trace-api';
import {Logger} from '../src/logger';

describe('Behavior set by config for CLS', () => {
  const useAH = semver.satisfies(process.version, '>=8');
  const autoMechanism =
      useAH ? TraceCLSMechanism.ASYNC_HOOKS : TraceCLSMechanism.ASYNC_LISTENER;
  let capturedConfig: TraceCLSConfig|null;

  class CaptureConfigTestCLS extends testTraceModule.TestCLS {
    constructor(config: TraceCLSConfig, logger: Logger) {
      super(config, logger);
      // Capture the config object passed into this constructor.
      capturedConfig = config;
    }
  }

  beforeEach(() => {
    capturedConfig = null;
  });

  before(() => {
    testTraceModule.setCLSForTest(CaptureConfigTestCLS);
  });

  after(() => {
    testTraceModule.setCLSForTest(testTraceModule.TestCLS);
  });

  const testCases: Array<{
    tracingConfig: testTraceModule.Config,
    contextPropagationConfig: TraceCLSConfig
  }> =
      [
        {
          tracingConfig: {clsMechanism: 'none'},
          contextPropagationConfig: {mechanism: 'none'}
        },
        {
          tracingConfig: {clsMechanism: 'auto'},
          contextPropagationConfig: {mechanism: autoMechanism}
        },
        {
          tracingConfig: {},
          contextPropagationConfig: {mechanism: autoMechanism}
        },
        {
          tracingConfig: {clsMechanism: 'singular'},
          contextPropagationConfig: {mechanism: 'singular'}
        },
        {
          // tslint:disable:no-any
          tracingConfig: {clsMechanism: 'unknown' as any},
          contextPropagationConfig: {mechanism: 'unknown' as any}
          // tslint:enable:no-any
        }
      ];

  for (const testCase of testCases) {
    it(`should be as expected for config: ${
           util.inspect(testCase.tracingConfig)}`,
       () => {
         testTraceModule.start(testCase.tracingConfig);
         assert.ok(capturedConfig);
         assert.strictEqual(
             capturedConfig!.mechanism,
             testCase.contextPropagationConfig.mechanism);
       });
  }
});

describe('Behavior set by config for Tracer', () => {
  let capturedConfig: NormalizedConfig|null;

  // Convenience function to assert properties of capturedConfig that we want
  // to be true on every test, and return an object with a conveniently
  // sanitized type.
  const getCapturedConfig = () => {
    assert.ok(capturedConfig);
    const config = capturedConfig!;
    // If !config.enabled, then TSC does not permit access to other fields on
    // config. So use this structure instead of assert.ok(config.enabled).
    if (config.enabled) {
      return config;
    } else {
      assert.fail('Configuration was not enabled.');
      throw new Error(); // unreachable.
    }
  };

  class CaptureConfigTestTracing extends testTraceModule.TestTracing {
    constructor(config: NormalizedConfig, traceAgent: StackdriverTracer) {
      super(config, traceAgent);
      // Capture the config object passed into this constructor.
      capturedConfig = config;
    }
  }

  beforeEach(() => {
    capturedConfig = null;
  });

  before(() => {
    testTraceModule.setTracingForTest(CaptureConfigTestTracing);
  });

  after(() => {
    testTraceModule.setTracingForTest(testTraceModule.TestTracing);
  });


  describe('Context header behavior', () => {
    it('should copy over an explicitly-set value', () => {
      testTraceModule.start({
        contextHeaderBehavior: 'require'
      });
      const config = getCapturedConfig();
      assert.strictEqual(config.contextHeaderBehavior, 'require');
    });

    it('should respect the value of ignoreContextHeader if not set', () => {
      testTraceModule.start({
        ignoreContextHeader: false
      });
      let config = getCapturedConfig();
      assert.strictEqual(config.contextHeaderBehavior, 'default');
      capturedConfig = null;
      testTraceModule.start({
        ignoreContextHeader: true
      });
      config = getCapturedConfig();
      assert.strictEqual(config.contextHeaderBehavior, 'ignore');
    });

    it('should override the value of ignoreContextHeader if both set', () => {
      testTraceModule.start({
        ignoreContextHeader: false,
        contextHeaderBehavior: 'require'
      });
      let config = getCapturedConfig();
      assert.strictEqual(config.contextHeaderBehavior, 'require');
      capturedConfig = null;
      testTraceModule.start({
        ignoreContextHeader: true,
        contextHeaderBehavior: 'require'
      });
      config = getCapturedConfig();
      assert.strictEqual(config.contextHeaderBehavior, 'require');
    });
  });

  describe('Overriding root span name', () => {
    it('should convert a string to a function', () => {
      testTraceModule.start({
        rootSpanNameOverride: 'hello'
      });
      const config = getCapturedConfig();
      assert.strictEqual(typeof config.rootSpanNameOverride, 'function');
      assert.strictEqual(config.rootSpanNameOverride(''), 'hello');
    });

    it('should convert a non-string, non-function to the identity fn', () => {
      testTraceModule.start({
        // We should make sure passing in unsupported values at least doesn't
        // result in a crash.
        // tslint:disable-next-line:no-any
        rootSpanNameOverride: 2 as any
      });
      const config = getCapturedConfig();
      assert.strictEqual(typeof config.rootSpanNameOverride, 'function');
      assert.strictEqual(config.rootSpanNameOverride('a'), 'a');
    });
  });
});
