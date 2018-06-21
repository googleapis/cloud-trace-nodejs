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

'use strict';

import './override-gcp-metadata';
import { TraceAgent } from '../src/trace-api';
import { SpanType } from '../src/constants';
import { FORCE_NEW } from '../src/util';

var assert = require('assert');
var trace = require('../..');

var disabledAgent: TraceAgent = trace.get();

describe('index.js', function() {
  it('should get a disabled agent with `Trace.get`', async function() {
    assert.ok(!disabledAgent.isActive()); // ensure it's disabled first
    let ranInRootSpan = false;
    disabledAgent.runInRootSpan({ name: '' }, (span) => {
      assert.strictEqual(span.type, SpanType.UNTRACED);
      ranInRootSpan = true;
    });
    assert.ok(ranInRootSpan);
    assert.strictEqual(disabledAgent.enhancedDatabaseReportingEnabled(), false);
    assert.strictEqual(disabledAgent.getPluginOptions(), null);
    assert.strictEqual(disabledAgent.getCurrentContextId(), null);
    assert.strictEqual(disabledAgent.getWriterProjectId(), null);
    assert.strictEqual(disabledAgent.getCurrentRootSpan().type, SpanType.UNTRACED);
    // getting project ID should reject.
    await disabledAgent.getProjectId().then(
        () => Promise.reject(new Error()), () => Promise.resolve());
    assert.strictEqual(disabledAgent.createChildSpan({ name: '' }).type, SpanType.UNTRACED);
    assert.strictEqual(disabledAgent.getResponseTraceContext('', false), '');
    const fn = () => {};
    assert.strictEqual(disabledAgent.wrap(fn), fn);
    // TODO(kjin): Figure out how to test wrapEmitter
  });

  describe('in valid environment', function() {
    var agent;
    before(function() {
      agent = trace.start({ projectId: '0', [FORCE_NEW]: true });
    });

    it('should get the agent with `Trace.get`', function() {
      assert.strictEqual(agent, trace.get());
    });

    it('should throw an error if `start` is called on an active agent',
      function() {
        assert.throws(trace.start, Error);
    });

    it('should set agent on global object', function() {
      assert.equal(global._google_trace_agent, agent);
    });
  });
});

export default {};
