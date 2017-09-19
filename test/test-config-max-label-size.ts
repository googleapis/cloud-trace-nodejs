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

'use strict';

var assert = require('assert');
var constants = require('../src/constants'/*.js*/);
var trace = require('..');
var TraceWriter = require('../src/trace-writer'/*.js*/);

describe('maximumLabelValueSize configuration', function() {
  it('should not allow values above server maximum', function() {
    trace.start({forceNewAgent_: true, maximumLabelValueSize: 1000000});
    var valueMax = TraceWriter.get().config_.maximumLabelValueSize;
    assert.strictEqual(valueMax, constants.TRACE_SERVICE_LABEL_VALUE_LIMIT);
  });

  it('should not modify values below server maximum', function() {
    trace.start({forceNewAgent_: true, maximumLabelValueSize: 10});
    var valueMax = TraceWriter.get().config_.maximumLabelValueSize;
    assert.strictEqual(valueMax, 10);
  });
});

export default {};
