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
var cls = require('../src/cls.js');
var common = require('./hooks/common.js');
var TraceLabels = require('../src/trace-labels.js');

describe('index.js', function() {
  var agent = trace.start();

  afterEach(function() {
    common.getTraceWriter(agent).buffer_ = [];
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
      cls.getNamespace().run(function() {
        common.createRootSpanData(agent, 'root', 1, 2);
        var spanData = agent.startSpan('sub', {test1: 'value'});
        agent.endSpan(spanData);
        var traceSpan = spanData.span;
        assert.equal(traceSpan.name, 'sub');
        assert.ok(traceSpan.labels);
        assert.equal(traceSpan.labels.test1, 'value');
      });
    });

    it('should ignore non-object labels', function() {
      cls.getNamespace().run(function() {
        common.createRootSpanData(agent, 'root', 1, 2);

        var testLabels = [
          'foo',
          5,
          undefined,
          null,
          true,
          false,
          [4,5,6],
          function () {}
        ];

        testLabels.forEach(function(labels) {
          var spanData = agent.startSpan('sub', labels);
          agent.endSpan(spanData);
          var spanLabels = spanData.span.labels;
          // Only the default labels should be there.
          var keys = Object.keys(spanLabels);
          assert.equal(keys.length, 1, 'should have only 1 key');
          assert.equal(keys[0], TraceLabels.STACK_TRACE_DETAILS_KEY);
        });
      });
    });

  });


  it('should produce real spans runInSpan sync', function() {
    cls.getNamespace().run(function() {
      var root = common.createRootSpanData(agent, 'root', 1, 0);
      var testLabel = { key: 'val' };
      agent.runInSpan('sub', testLabel, function() {});
      root.close();
      var spanPredicate = function(spanData) {
        return spanData.spans[1].name === 'sub';
      };
      var matchingSpans = common.getTraceWriter(agent).buffer_
                            .map(JSON.parse)
                            .filter(spanPredicate);
      assert.equal(matchingSpans.length, 1);
      assert.equal(matchingSpans[0].spans[1].labels.key, 'val');
    });
  });

  it('should produce real spans runInSpan async', function(done) {
    cls.getNamespace().run(function() {
      var root = common.createRootSpanData(agent, 'root', 1, 0);
      var testLabel = { key: 'val' };
      agent.runInSpan('sub', function(endSpan) {
        setTimeout(function() {
          endSpan(testLabel);
          root.close();
          var spanPredicate = function(spanData) {
            return spanData.spans[1].name === 'sub';
          };
          var matchingSpans = common.getTraceWriter(agent).buffer_
                                .map(JSON.parse)
                                .filter(spanPredicate);
          assert.equal(matchingSpans.length, 1);
          var span = matchingSpans[0].spans[1];
          var duration = Date.parse(span.endTime) - Date.parse(span.startTime);
          assert(duration > 190);
          assert(duration < 300);
          assert.equal(span.labels.key, 'val');
          // mocha seems to schedule the next test in the same context in 0.12.
          cls.setRootContext(null);
          done();
        }, 200);
      });
    });
  });

  it('should produce real root spans runInRootSpan sync', function() {
    cls.getNamespace().run(function() {
      var testLabel = { key: 'val' };
      agent.runInRootSpan('root', testLabel, function() {
        var childSpan = agent.startSpan('sub');
        agent.endSpan(childSpan);
      });
      var spanPredicate = function(spanData) {
        return spanData.spans[0].name === 'root' && spanData.spans[1].name === 'sub';
      };
      var matchingSpans = common.getTraceWriter(agent).buffer_
                            .map(JSON.parse)
                            .filter(spanPredicate);
      assert.equal(matchingSpans.length, 1);
      assert.equal(matchingSpans[0].spans[0].labels.key, 'val');
    });
  });

  it('should produce real root spans runInRootSpan async', function(done) {
    cls.getNamespace().run(function() {
      var testLabel = { key: 'val' };
      agent.runInRootSpan('root', testLabel, function(endSpan) {
        var childSpan = agent.startSpan('sub');
        setTimeout(function() {
          agent.endSpan(childSpan);
          endSpan(testLabel);
          var spanPredicate = function(spanData) {
            return spanData.spans[0].name === 'root' && spanData.spans[1].name === 'sub';
          };
          var matchingSpans = common.getTraceWriter(agent).buffer_
                                .map(JSON.parse)
                                .filter(spanPredicate);
          assert.equal(matchingSpans.length, 1);
          var span = matchingSpans[0].spans[0];
          var duration = Date.parse(span.endTime) - Date.parse(span.startTime);
          assert(duration > 190);
          assert(duration < 300);
          assert.equal(span.labels.key, 'val');
          // mocha seems to schedule the next test in the same context in 0.12.
          cls.setRootContext(null);
          done();
        }, 200);
      });
    });
  });

  it('should not break with no root span', function() {
    var span = agent.startSpan();
    agent.setTransactionName('noop');
    agent.addTransactionLabel('noop', 'noop');
    agent.endSpan(span);
  });

  it('should not allow nested root spans', function(done) {
    agent.runInRootSpan('root', function(cb1) {
      var finished = false;
      var finish = function () {
        assert(!finished);
        finished = true;
        cb1();
        var spanPredicate = function(spanData) {
          return spanData.spans[0].name === 'root';
        };
        var matchingSpans = common.getTraceWriter(agent).buffer_
          .map(JSON.parse)
          .filter(spanPredicate);
        assert.equal(matchingSpans.length, 1);
        var span = matchingSpans[0].spans[0];
        var duration = Date.parse(span.endTime) - Date.parse(span.startTime);
        assert(duration > 190);
        assert(duration < 300);
        done();
      };
      setTimeout(function() {
        agent.runInRootSpan('root2', function(cb2) {
          setTimeout(function() {
            // We shouldn't reach this point
            cb2();
            finish();
          }, 200);
        });
        finish();
      }, 200);
    });
  });

  it('should set transaction name and labels', function() {
    cls.getNamespace().run(function() {
      var spanData = common.createRootSpanData(agent, 'root', 1, 2);
      agent.setTransactionName('root2');
      agent.addTransactionLabel('key', 'value');
      assert.equal(spanData.span.name, 'root2');
      assert.equal(spanData.span.labels.key, 'value');
    });
  });

  it('should set agent on global object', function() {
    assert.equal(global._google_trace_agent, agent);
  });
});
