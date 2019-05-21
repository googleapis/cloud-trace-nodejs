/**
 * Copyright 2017 Google Inc. All Rights Reserved.
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

import { Constants } from '../src/constants';

import * as traceTestModule from './trace';

describe('maximumLabelValueSize configuration', () => {
  it('should not allow values above server maximum', () => {
    traceTestModule.start({ maximumLabelValueSize: 1000000 });
    const valueMax = traceTestModule.get().getConfig().maximumLabelValueSize;
    assert.strictEqual(valueMax, Constants.TRACE_SERVICE_LABEL_VALUE_LIMIT);
  });

  it('should not modify values below server maximum', () => {
    traceTestModule.start({ maximumLabelValueSize: 10 });
    const valueMax = traceTestModule.get().getConfig().maximumLabelValueSize;
    assert.strictEqual(valueMax, 10);
  });
});
