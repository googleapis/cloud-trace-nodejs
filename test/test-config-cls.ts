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

import {Logger} from '@google-cloud/common';
import * as assert from 'assert';
import * as semver from 'semver';
import * as util from 'util';

import {TraceCLSConfig, TraceCLSMechanism} from '../src/cls';

import * as trace from './trace';

describe('Behavior set by config for context propagation mechanism', () => {
  const useAH = semver.satisfies(process.version, '>=8') &&
      !!process.env.GCLOUD_TRACE_NEW_CONTEXT;
  const autoMechanism =
      useAH ? TraceCLSMechanism.ASYNC_HOOKS : TraceCLSMechanism.ASYNC_LISTENER;
  let capturedConfig: TraceCLSConfig|null;

  class CaptureConfigTestCLS extends trace.TestCLS {
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
    trace.setCLSForTest(CaptureConfigTestCLS);
  });

  after(() => {
    trace.setCLSForTest(trace.TestCLS);
  });

  const testCases: Array<
      {tracingConfig: trace.Config, contextPropagationConfig: TraceCLSConfig}> =
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
         trace.start(testCase.tracingConfig);
         assert.ok(capturedConfig);
         assert.strictEqual(
             capturedConfig!.mechanism,
             testCase.contextPropagationConfig.mechanism);
       });
  }
});
