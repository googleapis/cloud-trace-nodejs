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

import { defaultConfig } from '../config';

var assert = require('assert');
var cls = require('../src/cls'/*.js*/);
var common = require('./plugins/common'/*.js*/);
var EventEmitter = require('events');
var request = require('request');
var TraceAgent = require('../src/trace-api'/*.js*/);
var TracingPolicy = require('../src/tracing-policy'/*.js*/);
var TraceWriter = require('../src/trace-writer'/*.js*/);

var logger = require('@google-cloud/common').logger();

function createTraceAgent(policy?, config?) {
  var result = new TraceAgent('test');
  result.enable(logger, config || {
    enhancedDatabaseReporting: false,
    ignoreContextHeader: false
  });
  result.policy_ = policy || new TracingPolicy.TraceAllPolicy();
  return result;
}

function assertAPISurface(traceAPI) {
  assert.strictEqual(typeof traceAPI.enhancedDatabaseReportingEnabled(), 'boolean');
  traceAPI.runInRootSpan({ name: 'root' }, function(root) {
    // TODO: Once NullSpans are in the functional implementation,
    // remove the conditional check
    if (root) {
      assert.strictEqual(typeof root.addLabel, 'function');
      assert.strictEqual(typeof root.endSpan, 'function');
      assert.strictEqual(typeof root.getTraceContext(), 'string');
    }
  });
  assert.strictEqual(typeof traceAPI.getCurrentContextId, 'function');
  assert.strictEqual(typeof traceAPI.getWriterProjectId, 'function');
  var child = traceAPI.createChildSpan({ name: 'child' });
  // TODO: Ditto but with child spans
  if (child) {
    assert.strictEqual(typeof child.addLabel, 'function');
    assert.strictEqual(typeof child.endSpan, 'function');
    assert.strictEqual(typeof child.getTraceContext(), 'string');
  }
  assert.strictEqual(typeof traceAPI.wrap(function() {}), 'function');
  assert.strictEqual(typeof traceAPI.wrapEmitter(new EventEmitter()), 'undefined');
  assert.strictEqual(typeof traceAPI.constants, 'object');
  assert.strictEqual(typeof traceAPI.labels, 'object');
}

describe('Trace Interface', function() {
  before(function(done) {
    TraceWriter.create(logger,
      Object.assign(defaultConfig, {
        projectId: '0'
      }), function(err) {
        assert.ok(!err);
        done();
      });
    cls.createNamespace();
  });

  it('should correctly manage internal state', function() {
    var traceAPI = createTraceAgent();
    assert.ok(traceAPI.isActive(),
      'Newly created instances are active');
    traceAPI.disable();
    assert.ok(!traceAPI.isActive(),
      'Being disabled sets isActive to false');
  });

  it('should expose the same interface regardless of state', function() {
    var traceAPI = createTraceAgent();
    assertAPISurface(traceAPI);
    traceAPI.disable();
    assertAPISurface(traceAPI);
  });

  describe('constants', function() {
    it('have correct values', function() {
      var traceAPI = createTraceAgent();
      assert.equal(traceAPI.constants.TRACE_CONTEXT_HEADER_NAME,
        'x-cloud-trace-context');
      assert.equal(traceAPI.constants.TRACE_AGENT_REQUEST_HEADER,
        'x-cloud-trace-agent-request');
    });
  });

  describe('behavior when initialized', function() {
    before(function() {
      TraceWriter.get().request = request;
      common.avoidTraceWriterAuth();
    });

    afterEach(function() {
      common.cleanTraces();
    });

    it('should produce real child spans', function(done) {
      var traceAPI = createTraceAgent();
      traceAPI.runInRootSpan({name: 'root'}, function(root) {
        var child = traceAPI.createChildSpan({name: 'sub'});
        setTimeout(function() {
          child.addLabel('key', 'val');
          child.endSpan();
          root.endSpan();
          var spanPredicate = function(span) {
            return span.name === 'sub';
          };
          var matchingSpan = common.getMatchingSpan(spanPredicate);
          var duration = Date.parse(matchingSpan.endTime) - Date.parse(matchingSpan.startTime);
          assert(duration > 190);
          assert(duration < 300);
          assert.equal(matchingSpan.labels.key, 'val');
          done();
        }, 200);
      });
    });

    it('should produce real root spans runInRootSpan', function(done) {
      var traceAPI = createTraceAgent();
      traceAPI.runInRootSpan({name: 'root', url: 'root'}, function(rootSpan) {
        rootSpan.addLabel('key', 'val');
        var childSpan = traceAPI.createChildSpan({name: 'sub'});
        setTimeout(function() {
          childSpan.endSpan();
          rootSpan.endSpan();
          var spanPredicate = function(span) {
            return span.name === 'root';
          };
          var matchingSpan = common.getMatchingSpan(spanPredicate);
          var duration = Date.parse(matchingSpan.endTime) - Date.parse(matchingSpan.startTime);
          assert(duration > 190);
          assert(duration < 300);
          assert.equal(matchingSpan.labels.key, 'val');
          done();
        }, 200);
      });
    });

    it('should not allow nested root spans', function(done) {
      var traceAPI = createTraceAgent();
      traceAPI.runInRootSpan({name: 'root', url: 'root'}, function(rootSpan1) {
        setTimeout(function() {
          traceAPI.runInRootSpan({name: 'root2', url: 'root2'}, function(rootSpan2) {
            assert.strictEqual(rootSpan2, null);
          });
          rootSpan1.endSpan();
          var span = common.getMatchingSpan(function() { return true; });
          assert.equal(span.name, 'root');
          var duration = Date.parse(span.endTime) - Date.parse(span.startTime);
          assert(duration > 190);
          assert(duration < 300);
          done();
        }, 200);
      });
    });

    it('should return null context id when one does not exist', function() {
      var traceAPI = createTraceAgent();
      assert.strictEqual(traceAPI.getCurrentContextId(), null);
    });

    it('should return the appropriate trace id', function() {
      var traceAPI = createTraceAgent();
      traceAPI.runInRootSpan({name: 'root', url: 'root'}, function(rootSpan) {
        var id = traceAPI.getCurrentContextId();
        assert.strictEqual(id, rootSpan.trace.traceId);
      });
    });

    it('should return get the project ID if set in config', function() {
      var config = {projectId: 'project-1'};
      var traceApi = createTraceAgent(null /* policy */, config);
      assert.equal(traceApi.getWriterProjectId(), 'project-1');
    });

    it('should add labels to spans', function() {
      var traceAPI = createTraceAgent();
      traceAPI.runInRootSpan({name: 'root', url: 'root'}, function(root) {
        var child = traceAPI.createChildSpan({name: 'sub'});
        child.addLabel('test1', 'value');
        child.endSpan();
        assert.equal(child.span.name, 'sub');
        assert.ok(child.span.labels);
        assert.equal(child.span.labels.test1, 'value');
        root.endSpan();
      });
    });

    it('should respect trace policy', function(done) {
      var traceAPI = createTraceAgent(new TracingPolicy.TraceNonePolicy());
      traceAPI.runInRootSpan({name: 'root', url: 'root'}, function(rootSpan) {
        assert.strictEqual(rootSpan, null);
        done();
      });
    });

    it('should respect filter urls', function() {
      var url = 'rootUrl';
      var traceAPI = createTraceAgent(new TracingPolicy.FilterPolicy(
        new TracingPolicy.TraceAllPolicy(),
        [url]));
      traceAPI.runInRootSpan({name: 'root1', url: url}, function(rootSpan) {
        assert.strictEqual(rootSpan, null);
      });
      traceAPI.runInRootSpan({name: 'root2', url: 'alternativeUrl'}, function(rootSpan) {
        assert.strictEqual(rootSpan.span.name, 'root2');
      });
    });

    it('should respect enhancedDatabaseReporting options field', function() {
      [true, false].forEach(function(enhancedDatabaseReporting) {
        var traceAPI = createTraceAgent(null, {
          enhancedDatabaseReporting: enhancedDatabaseReporting,
          ignoreContextHeader: false
        });
        assert.strictEqual(traceAPI.enhancedDatabaseReportingEnabled(),
          enhancedDatabaseReporting);
      });
    });

    it('should respect ignoreContextHeader options field', function() {
      var traceAPI;
      // ignoreContextHeader: true
      traceAPI = createTraceAgent(null, {
        enhancedDatabaseReporting: false,
        ignoreContextHeader: true
      });
      traceAPI.runInRootSpan({
        name: 'root',
        traceContext: '123456/667;o=1'
      }, function(rootSpan) {
        assert.ok(rootSpan);
        assert.strictEqual(rootSpan.span.name, 'root');
        assert.notEqual(rootSpan.trace.traceId, '123456');
        assert.notEqual(rootSpan.span.parentSpanId, '667');
      });
      // ignoreContextHeader: false
      traceAPI = createTraceAgent(null, {
        enhancedDatabaseReporting: false,
        ignoreContextHeader: false
      });
      traceAPI.runInRootSpan({
        name: 'root',
        traceContext: '123456/667;o=1'
      }, function(rootSpan) {
        assert.ok(rootSpan);
        assert.strictEqual(rootSpan.span.name, 'root');
        assert.strictEqual(rootSpan.trace.traceId, '123456');
        assert.strictEqual(rootSpan.span.parentSpanId, '667');
      });
    });
  });
});

export default {};
