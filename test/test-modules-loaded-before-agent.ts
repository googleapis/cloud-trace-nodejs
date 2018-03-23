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

import * as common from '@google-cloud/common';
import * as assert from 'assert';
import * as shimmer from 'shimmer';

import {TestLogger} from './logger';
import * as trace from './trace';

describe('modules loaded before agent', () => {
  const logger = new TestLogger();

  before(() => {
    const LEVELS = common.logger.LEVELS;
    shimmer.wrap(common, 'logger', () => {
      return Object.assign(() => logger, {LEVELS});
    });
  });

  after(() => {
    shimmer.unwrap(common, 'logger');
  });

  it('should log if modules were loaded before agent', () => {
    trace.start();
    assert.strictEqual(
        logger.getNumLogsWith(
            'error', /modules.*loaded.*before.*trace agent.*: .*shimmer/),
        1);
  });
});
