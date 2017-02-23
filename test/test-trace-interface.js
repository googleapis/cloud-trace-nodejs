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

var assert = require('assert');
var EventEmitter = require('events');
var traceInterface = require('../src/trace-plugin-interface.js');
var common = require('./plugins/common.js');
var TracingPolicy = require('../src/tracing-policy.js');

var config = Object.assign({}, require('../config.js').trace,
  { samplingRate: 0, projectId: '0' });
var logger = require('@google-cloud/common').logger();
var agent = require('../src/trace-agent.js').get(config, logger);

function assertAPISurface(traceAPI) {
  assert.strictEqual(typeof traceAPI.enhancedDatabaseReportingEnabled(), 'boolean');
  assert.strictEqual(typeof traceAPI.summarizeDatabaseResults(''), 'string');
  traceAPI.runInRootSpan({ name: 'root' }, function(root) {
    // TODO: Once NullSpans are in the functional implementation,
    // remove the conditional check
    if (root) {
      assert.strictEqual(typeof root.addLabel, 'function');
      assert.strictEqual(typeof root.endSpan, 'function');
      assert.strictEqual(typeof root.getTraceContext(), 'string');
    }
  });
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
  it('should correctly manage internal state', function() {
    var traceAPI = traceInterface.create('test');
    assert.ok(!traceAPI.isActive(),
      'Being uninitalized internally sets no-op implementation');
    assert.throws(traceAPI.disable_,
      'Can\'t go from uninitialized to disabled');
    traceAPI.initialize_(agent);
    assert.ok(traceAPI.isActive(),
      'Being initialized internally sets operational implementation');
    assert.throws(traceAPI.initialize_.bind(traceAPI, agent),
      'Can\'t reinitialize');
    traceAPI.disable_(agent);
    assert.ok(!traceAPI.isActive(),
      'Being disabled internally sets no-op implementation');
    assert.throws(traceAPI.initialize_.bind(traceAPI, agent),
      'Can\'t reinitialize even when disabled');
    assert.throws(traceAPI.disable_, 'Can\'t re-disable');
  });

  it('should expose the same interface regardless of state', function() {
    var traceAPI = traceInterface.create('test');
    assertAPISurface(traceAPI);
    traceAPI.initialize_(agent);
    assertAPISurface(traceAPI);
    traceAPI.disable_(agent);
    assertAPISurface(traceAPI);
  });

  describe('behavior when initialized', function() {
    var traceAPI = traceInterface.create('test');
    
    before(function() {
      traceAPI.initialize_(agent);
      common.init(traceAPI);
      common.avoidTraceWriterAuth(traceAPI);
    });

    afterEach(function() {
      common.cleanTraces(traceAPI);
      common.clearNamespace(traceAPI);
    });

    it('should produce real child spans', function(done) {
      traceAPI.runInRootSpan({name: 'root'}, function(root) {
        var child = traceAPI.createChildSpan({name: 'sub'});
        setTimeout(function() {
          child.addLabel('key', 'val');
          child.endSpan();
          root.endSpan();
          var spanPredicate = function(span) {
            return span.name === 'sub';
          };
          var matchingSpan = common.getMatchingSpan(traceAPI, spanPredicate);
          var duration = Date.parse(matchingSpan.endTime) - Date.parse(matchingSpan.startTime);
          assert(duration > 190);
          assert(duration < 300);
          assert.equal(matchingSpan.labels.key, 'val');
          done();
        }, 200);
      });
    });

    it('should produce real root spans runInRootSpan', function(done) {
      traceAPI.runInRootSpan({name: 'root', url: 'root'}, function(rootSpan) {
        rootSpan.addLabel('key', 'val');
        var childSpan = traceAPI.createChildSpan({name: 'sub'});
        setTimeout(function() {
          childSpan.endSpan();
          rootSpan.endSpan();
          var spanPredicate = function(span) {
            return span.name === 'root';
          };
          var matchingSpan = common.getMatchingSpan(traceAPI, spanPredicate);
          var duration = Date.parse(matchingSpan.endTime) - Date.parse(matchingSpan.startTime);
          assert(duration > 190);
          assert(duration < 300);
          assert.equal(matchingSpan.labels.key, 'val');
          done();
        }, 200);
      });
    });

    it('should not allow nested root spans', function(done) {
      traceAPI.runInRootSpan({name: 'root', url: 'root'}, function(rootSpan1) {
        setTimeout(function() {
          traceAPI.runInRootSpan({name: 'root2', url: 'root2'}, function(rootSpan2) {
            assert.strictEqual(rootSpan2, null);
          });
          rootSpan1.endSpan();
          var span = common.getMatchingSpan(traceAPI, function() { return true; });
          assert.equal(span.name, 'root');
          var duration = Date.parse(span.endTime) - Date.parse(span.startTime);
          assert(duration > 190);
          assert(duration < 300);
          done();
        }, 200);
      });
    });

    it('should add labels to spans', function() {
      traceAPI.runInRootSpan({name: 'root', url: 'root'}, function(root) {
        var child = traceAPI.createChildSpan({name: 'sub'});
        child.addLabel('test1', 'value');
        child.endSpan();
        var traceSpan = child.span_.span;
        assert.equal(traceSpan.name, 'sub');
        assert.ok(traceSpan.labels);
        assert.equal(traceSpan.labels.test1, 'value');
        root.endSpan();
      });
    });

    it('should respect sampling policy', function(done) {
      var oldPolicy = common.replaceTracingPolicy(traceAPI, new TracingPolicy.TraceNonePolicy());
      traceAPI.runInRootSpan({name: 'root', url: 'root'}, function(rootSpan) {
        assert.strictEqual(rootSpan, null);
        common.replaceTracingPolicy(traceAPI, oldPolicy);
        done();
      });
    });

    it('should respect filter urls', function() {
      var url = 'rootUrl';
      var filterPolicy = new TracingPolicy.FilterPolicy(new TracingPolicy.TraceAllPolicy(), [url]);
      var oldPolicy = common.replaceTracingPolicy(traceAPI, filterPolicy);
      traceAPI.runInRootSpan({name: 'root1', url: url}, function(rootSpan) {
        assert.strictEqual(rootSpan, null);
      });
      traceAPI.runInRootSpan({name: 'root2', url: 'alternativeUrl'}, function(rootSpan) {
        assert.strictEqual(rootSpan.span_.span.name, 'root2');
      });
      common.replaceTracingPolicy(traceAPI, oldPolicy);
    });
  });
});
