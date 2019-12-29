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
import * as shimmer from 'shimmer';

import * as log from '../src/logger';

import {TestLogger} from './logger';
import * as testTraceModule from './trace';

const UNTRACED_LOGS_WARNING = /StackdriverTracer#start.*modules.*loaded.*before.*trace agent.*: \[.*shimmer.*\]/;

describe('modules loaded before agent', () => {
  let logger: CaptureTestLogger | null = null;

  class CaptureTestLogger extends TestLogger {
    constructor() {
      super();
      logger = this;
    }
  }

  before(() => {
    shimmer.wrap(log, 'Logger', () => CaptureTestLogger);
  });

  after(() => {
    shimmer.unwrap(log, 'Logger');
  });

  afterEach(() => {
    logger = null;
  });

  it('should log if modules were loaded before agent', () => {
    testTraceModule.start();
    assert.ok(logger);
    assert.strictEqual(
      logger!.getNumLogsWith('warn', UNTRACED_LOGS_WARNING),
      1
    );
  });

  it('should not log if disableUntracedModulesWarning is set to true', () => {
    testTraceModule.start({disableUntracedModulesWarning: true});
    assert.ok(logger);
    assert.strictEqual(
      logger!.getNumLogsWith('warn', UNTRACED_LOGS_WARNING),
      0
    );
  });
});
