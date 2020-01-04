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
import * as path from 'path';

import {Trace} from '../src/trace';
import {StackdriverTracer} from '../src/trace-api';
import {TraceWriter} from '../src/trace-writer';
import {TopLevelConfig, Tracing} from '../src/tracing';

import * as traceTestModule from './trace';

describe('should respect config load order', () => {
  let capturedConfig: TopLevelConfig | null = null;
  class CaptureConfigTracing extends Tracing {
    constructor(config: TopLevelConfig) {
      super(config, new StackdriverTracer(''));
      capturedConfig = config;
    }
  }

  class NoopTraceWriter extends TraceWriter {
    async initialize(): Promise<void> {}
    writeTrace(trace: Trace): void {}
  }

  function getCapturedConfig() {
    assert.ok(capturedConfig!);
    assert.ok(capturedConfig!.enabled);
    // For coercing a desired return type.
    if (capturedConfig && capturedConfig.enabled) {
      return capturedConfig;
    } else {
      throw new Error('unreachable');
    }
  }

  before(() => {
    traceTestModule.setTraceWriterForTest(NoopTraceWriter);
    traceTestModule.setTracingForTest(CaptureConfigTracing);
  });

  afterEach(() => {
    capturedConfig = null;
  });

  after(() => {
    traceTestModule.setTraceWriterForTest(traceTestModule.TestTraceWriter);
    traceTestModule.setTracingForTest(traceTestModule.TestTracing);
  });

  describe('for config object', () => {
    before(() => {
      // Default configuration:
      // { logLevel: 1, stackTraceLimit: 0, flushDelaySeconds: 30 };
      // Fixtures configuration:
      // { logLevel: 4, stackTraceLimit: 1, flushDelaySeconds: 31 };
      process.env.GCLOUD_TRACE_CONFIG = path.resolve(
        __dirname,
        '..',
        'test',
        'fixtures',
        'test-config.js'
      );
      process.env.GCLOUD_TRACE_LOGLEVEL = '2';
    });

    after(() => {
      delete process.env.GCLOUD_TRACE_CONFIG;
      delete process.env.GCLOUD_TRACE_LOGLEVEL;
    });

    it('should order Default -> env config -> start -> env specific', () => {
      traceTestModule.start({logLevel: 3, stackTraceLimit: 2});
      const config = getCapturedConfig();
      assert.strictEqual(config.logLevel, 2);
      assert.strictEqual(config.writerConfig.stackTraceLimit, 2);
      assert.strictEqual(config.writerConfig.flushDelaySeconds, 31);
    });
  });

  describe('for project ID', () => {
    before(() => {
      process.env.GCLOUD_PROJECT = '1729';
    });

    after(() => {
      delete process.env.GCLOUD_PROJECT;
    });

    it('should respect GCLOUD_PROJECT', () => {
      traceTestModule.start();
      const config = getCapturedConfig();
      assert.strictEqual(config.writerConfig.authOptions.projectId, '1729');
    });

    it('should prefer env to config', () => {
      traceTestModule.start({projectId: '1927'});
      const config = getCapturedConfig();
      assert.strictEqual(config.writerConfig.authOptions.projectId, '1729');
    });
  });
});
