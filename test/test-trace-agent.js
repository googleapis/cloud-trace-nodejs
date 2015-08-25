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

if (!process.env.GCLOUD_PROJECT_NUM) {
  console.log('The GCLOUD_PROJECT_NUM environment variable must be set.');
  process.exit(1);
}

var assert = require('assert');
var config = require('../config.js');
var file = require('../lib/trace-agent.js');
var agent = file.get(config);

describe('Trace Agent', function() {

  it('should return the same object on repeated application', function() {
    var agent2 = file.get(config);
    assert.strictEqual(agent, agent2);
  });

  describe('isTraceAPIRequest', function() {
    it('should work correctly with various inputs', function() {
      assert.ok(!agent.isTraceAPIRequest());
      assert.ok(!agent.isTraceAPIRequest({}));
      assert.ok(!agent.isTraceAPIRequest({
          headers: {
            'Foo': agent.TRACE_API_HEADER_NAME
          }
        }));
      assert.ok(agent.isTraceAPIRequest({
          headers: {
            'X-Cloud-Trace-Agent': 'something'
          }
        }));
    });
  });

  describe('parseContextFromHeader', function() {
    describe('valid inputs', function() {
      it('should return expected values: 123456/667;o=1', function() {
        var result = agent.parseContextFromHeader(
          '123456/667;o=1');
        assert(result);
        assert.equal(result.traceId, '123456');
        assert.equal(result.spanId, '667');
        assert.equal(result.options, '1');
      });

      it('should return expected values: 123456/667', function() {
        var result = agent.parseContextFromHeader(
          '123456/667');
        assert(result);
        assert.equal(result.traceId, '123456');
        assert.equal(result.spanId, '667');
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
        '123/o=1;456'
      ];
      inputs.forEach(function(s) {
        it('should reject ' + s, function() {
          var result = agent.parseContextFromHeader(s);
          assert.ok(!result);
        });
      });
    });
  });

});
