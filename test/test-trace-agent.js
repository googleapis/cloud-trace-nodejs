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

 var constants = require('../src/constants.js');

if (!process.env.GCLOUD_PROJECT) {
  console.log('The GCLOUD_PROJECT environment variable must be set.');
  process.exit(1);
}

var assert = require('assert');
var config = require('../config.js');
var file = require('../src/trace-agent.js');
var SpanData = require('../src/span-data.js');
var agent = file.get(config);
var constants = require('../src/constants.js');
var cls = require('../src/cls.js');

describe('Trace Agent', function() {

  it('should return the same object on repeated application', function() {
    var agent2 = file.get(config);
    assert.strictEqual(agent, agent2);
  });

  describe('isTraceAgentRequest', function() {
    it('should work correctly with various inputs', function() {
      assert.ok(!agent.isTraceAgentRequest());
      assert.ok(!agent.isTraceAgentRequest({}));

      var headers = { 'Foo': constants.TRACE_AGENT_REQUEST_HEADER};
      assert.ok(!agent.isTraceAgentRequest({ headers: headers }));

      headers[constants.TRACE_AGENT_REQUEST_HEADER] = 'something';
      assert.ok(agent.isTraceAgentRequest({ headers: headers }));
    });
  });

  describe('generateTraceContext', function() {
    it('context is well formed', function() {
      cls.getNamespace().run(function() {
        var spanData = agent.createRootSpanData('name', 1, 2);
        var spanId = spanData.span.spanId;
        spanData.options = 1;
        var context = agent.generateTraceContext(spanData, true);
        var parsed = agent.parseContextFromHeader(context);
        assert.equal(parsed.traceId, 1);
        assert.equal(parsed.spanId, spanId);
        assert.equal(typeof parsed.spanId, 'string');
        assert.equal(parsed.options, 1);
      });
    });

    it('sets trace enabled bit when traced', function() {
      cls.getNamespace().run(function() {
        var spanData = agent.createRootSpanData('name', 1, 2);
        spanData.options = 2;
        var context = agent.generateTraceContext(spanData, true);
        var parsed = agent.parseContextFromHeader(context);
        assert.equal(parsed.options, 3);
      });
    });

    it('leaves options alone when untraced', function() {
      cls.getNamespace().run(function() {
        var spanData = agent.createRootSpanData('name', 1, 2);
        spanData.options = 2;
        var context = agent.generateTraceContext(spanData, false);
        var parsed = agent.parseContextFromHeader(context);
        assert.equal(parsed.options, 2);
      });
    });

    it('noop on nullSpan', function() {
      cls.getNamespace().run(function() {
        var context = agent.generateTraceContext(SpanData.nullSpan);
        assert.equal(context, '');
      });
    });
  });

  describe('parseContextFromHeader', function() {
    describe('valid inputs', function() {
      it('should return expected values: 123456/667;o=1', function() {
        var result = agent.parseContextFromHeader(
          '123456/667;o=1');
        assert(result);
        assert.equal(result.traceId, '123456');
        assert.equal(result.spanId, 667);
        assert.equal(result.options, '1');
      });

      it('should return expected values:' +
          '123456/123456123456123456123456123456123456;o=1', function() {
        var result = agent.parseContextFromHeader(
          '123456/123456123456123456123456123456123456;o=1');
        assert(result);
        assert.equal(result.traceId, '123456');
        assert.equal(result.spanId, '123456123456123456123456123456123456');
        assert.equal(result.options, '1');
      });

      it('should return expected values: 123456/667', function() {
        var result = agent.parseContextFromHeader(
          '123456/667');
        assert(result);
        assert.equal(result.traceId, '123456');
        assert.equal(result.spanId, 667);
        assert(!result.options);
      });

      it('should return expected values: 123456;o=1', function() {
        var result = agent.parseContextFromHeader(
          '123456;o=1');
        assert(result);
        assert.equal(result.traceId, '123456');
        assert(!result.spanId);
        assert.equal(result.options, '1');
      });

      it('should return expected values: 123456', function() {
        var result = agent.parseContextFromHeader(
          '123456');
        assert(result);
        assert.equal(result.traceId, '123456');
        assert(!result.spanId);
        assert(!result.options);
      });
    });

    describe('invalid inputs', function() {
      var inputs = [
        '',
        null,
        undefined,
        'o=1;123456',
        '123;456;o=1',
        '123/o=1;456',
        '123/abc/o=1'
      ];
      inputs.forEach(function(s) {
        it('should reject ' + s, function() {
          var result = agent.parseContextFromHeader(s);
          assert.ok(!result);
        });
      });
    });

    describe('when configured to ignore header', function() {
      it('should return expected value: null', function() {
        agent.config_.ignoreContextHeader = true;
        var result = agent.parseContextFromHeader(
          '123456/667;o=1');
        assert(!result);
        agent.config_.ignoreContextHeader = false;
      });
    });
  });

});
