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
import * as shimmer from 'shimmer';

import * as logger from '../src/logger';

import {TestLogger} from './logger';
import * as traceTestModule from './trace';

describe('should respect environment variables', () => {
  let logLevel: string | null = null;

  class CaptureLogLevelTestLogger extends TestLogger {
    constructor(opts: {level: string | false}) {
      super(opts);
      if (opts.level === false) {
        throw new Error('Unexpected value for opts.level');
      }
      logLevel = opts.level;
    }
  }

  before(() => {
    process.env.GCLOUD_TRACE_LOGLEVEL = '4';
    // Wrap logger constructor so that the log level (string) is saved
    // in logLevel
    shimmer.wrap(logger, 'Logger', () => CaptureLogLevelTestLogger);
  });

  after(() => {
    delete process.env.GCLOUD_TRACE_LOGLEVEL;
    shimmer.unwrap(logger, 'Logger');
  });

  afterEach(() => {
    logLevel = null;
  });

  it('should respect GCLOUD_TRACE_LOGLEVEL', () => {
    traceTestModule.start();
    assert.strictEqual(logLevel, logger.LEVELS[4]);
  });

  it('should prefer env to config', () => {
    traceTestModule.start({logLevel: 2});
    assert.strictEqual(logLevel, logger.LEVELS[4]);
  });

  it('should fix out of bounds log level', () => {
    process.env.GCLOUD_TRACE_LOGLEVEL = '-5';
    traceTestModule.start();
    assert.strictEqual(logLevel, logger.LEVELS[0]);
    process.env.GCLOUD_TRACE_LOGLEVEL = '300';
    traceTestModule.start();
    assert.strictEqual(logLevel, logger.LEVELS[4]);
  });
});
