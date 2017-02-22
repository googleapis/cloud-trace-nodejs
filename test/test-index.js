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

if (!process.env.GCLOUD_PROJECT) {
  console.log('The GCLOUD_PROJECT environment variable must be set.');
  process.exit(1);
}

var assert = require('assert');
var trace = require('..');
var common = require('./hooks/common.js');
var TracingPolicy = require('../src/tracing-policy.js');

describe('index.js', function() {
  var agent = trace.start();

  afterEach(function() {
    common.cleanTraces(agent);
    common.clearNamespace(agent);
  });

  it('should get the agent with `Trace.get`', function() {
    assert.strictEqual(agent, trace.get());
  });

  it('should throw an error if `start` is called on an active agent',
    function() {
      assert.throws(agent.start, Error);
      assert.throws(trace.start, Error);
  });
  
  it('should not attach exception handler with ignore option', function() {
    // Mocha attaches 1 exception handler
    assert.equal(process.listeners('uncaughtException').length, 1);
  });

  describe('labels', function(){
    it('should add labels to spans', function() {
      agent.runInRootSpan({name: 'root', url: 'root'}, function(root) {
        var child = agent.createChildSpan({name: 'sub'});
        child.addLabel('test1', 'value');
        child.endSpan();
        var traceSpan = child.span_.span;
        assert.equal(traceSpan.name, 'sub');
        assert.ok(traceSpan.labels);
        assert.equal(traceSpan.labels.test1, 'value');
        root.endSpan();
      });
    });
  });

  it('should produce real child spans', function(done) {
    agent.runInRootSpan({name: 'root'}, function(root) {
      var child = agent.createChildSpan({name: 'sub'});
      setTimeout(function() {
        child.addLabel('key', 'val');
        child.endSpan();
        root.endSpan();
        var spanPredicate = function(span) {
          return span.name === 'sub';
        };
        var matchingSpan = common.getMatchingSpan(agent, spanPredicate);
        var duration = Date.parse(matchingSpan.endTime) - Date.parse(matchingSpan.startTime);
        assert(duration > 190);
        assert(duration < 300);
        assert.equal(matchingSpan.labels.key, 'val');
        done();
      }, 200);
    });
  });

  it('should produce real root spans runInRootSpan', function(done) {
    agent.runInRootSpan({name: 'root', url: 'root'}, function(rootSpan) {
      rootSpan.addLabel('key', 'val');
      var childSpan = agent.createChildSpan({name: 'sub'});
      setTimeout(function() {
        childSpan.endSpan();
        rootSpan.endSpan();
        var spanPredicate = function(span) {
          return span.name === 'root';
        };
        var matchingSpan = common.getMatchingSpan(agent, spanPredicate);
        var duration = Date.parse(matchingSpan.endTime) - Date.parse(matchingSpan.startTime);
        assert(duration > 190);
        assert(duration < 300);
        assert.equal(matchingSpan.labels.key, 'val');
        done();
      }, 200);
    });
  });

  it('should not allow nested root spans', function(done) {
    agent.runInRootSpan({name: 'root', url: 'root'}, function(rootSpan1) {
      setTimeout(function() {
        agent.runInRootSpan({name: 'root2', url: 'root2'}, function(rootSpan2) {
          assert.strictEqual(rootSpan2, null);
        });
        rootSpan1.endSpan();
        var span = common.getMatchingSpan(agent, function() { return true; });
        assert.equal(span.name, 'root');
        var duration = Date.parse(span.endTime) - Date.parse(span.startTime);
        assert(duration > 190);
        assert(duration < 300);
        done();
      }, 200);
    });
  });

  it('should respect sampling policy', function(done) {
    var oldPolicy = common.replaceTracingPolicy(agent, new TracingPolicy.TraceNonePolicy());
    agent.runInRootSpan({name: 'root', url: 'root'}, function(rootSpan) {
      assert.strictEqual(rootSpan, null);
      common.replaceTracingPolicy(agent, oldPolicy);
      done();
    });
  });

  it('should respect filter urls', function() {
    var url = 'rootUrl';
    var filterPolicy = new TracingPolicy.FilterPolicy(new TracingPolicy.TraceAllPolicy(), [url]);
    var oldPolicy = common.replaceTracingPolicy(agent, filterPolicy);
    agent.runInRootSpan({name: 'root1', url: url}, function(rootSpan) {
      assert.strictEqual(rootSpan, null);
    });
    agent.runInRootSpan({name: 'root2', url: 'alternativeUrl'}, function(rootSpan) {
      assert.strictEqual(rootSpan.span_.span.name, 'root2');
    });
    common.replaceTracingPolicy(agent, oldPolicy);
  });

  it('should set agent on global object', function() {
    assert.equal(global._google_trace_agent, agent);
  });
});
