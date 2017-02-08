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
var TraceLabels = require('../src/trace-labels.js');

describe('index.js', function() {
  var agent;
  beforeEach(function() {
    agent = trace.start();
  });

  afterEach(function(){
    agent.stop();
  });

  it('should get the agent with `Trace.get`', function() {
    assert.strictEqual(agent, trace.get());
  });

  it('should throw an error if `get` is called on an inactive agent',
    function() {
      agent.stop();
      assert.throws(agent.get, Error);
      assert.throws(trace.get, Error);
  });

  it('should throw an error if `start` is called on an active agent',
    function() {
      assert.throws(agent.start, Error);
      assert.throws(trace.start, Error);
  });

  it('can be allowed to let `start` be called multiple times ' +
     'without a call to `stop`',
     function() {
       agent.stop();
       // If the disabling of the start check failed, the following
       // line will throw an error
       agent.start({
         forceNewAgent_: true
       });
       agent.start({
         forceNewAgent_: true
       });
     }
  );

  it('should report if it is active', function() {
    assert.strictEqual(agent.isActive(), true);
    assert.strictEqual(trace.isActive(), true);
    agent.stop();
    assert.strictEqual(agent.isActive(), false);
    assert.strictEqual(trace.isActive(), false);
  });

  it('should be harmless to stop before a start', function() {
    agent.stop();
    agent.stop();
    agent.stop();
  });

  function wrapTest(agent, nodule, property) {
    agent.stop(); // harmless to stop before a start.
    assert(!nodule[property].__unwrap,
      property + ' already wrapped before start');
    agent = trace.start();
    assert(nodule[property].__unwrap,
      property + ' should get wrapped on start');
    agent.stop();
    assert(!nodule[property].__unwrap,
      property + ' should get unwrapped on stop');
    agent = trace.start();
    assert(nodule[property].__unwrap,
      property + ' should get wrapped on start');
    agent.stop();
    assert(!nodule[property].__unwrap,
      property + ' should get unwrapped on stop');
  }

  it('should wrap/unwrap module._load on start/stop', function() {
    wrapTest(agent, require('module'), '_load');
  });

  it('should not attach exception handler with ignore option', function() {
    // Mocha attaches 1 exception handler
    assert.equal(process.listeners('uncaughtException').length, 1);
  });

  it('should wrap/unwrap http on start/stop', function() {
    var http = require('http');
    wrapTest(agent, http, 'request');
  });

  it('should wrap/unwrap express on start/stop', function() {
    var express = require('./hooks/fixtures/express4');
    var patchedMethods = require('methods');
    patchedMethods.push('use', 'route', 'param', 'all');
    patchedMethods.forEach(function(method) {
      wrapTest(agent, express.application, method);
    });
  });

  it('should wrap/unwrap hapi on start/stop', function() {
    var hapi = require('./hooks/fixtures/hapi8');
    wrapTest(agent, hapi.Server.prototype, 'connection');
  });

  it('should wrap/unwrap mongodb-core on start/stop', function() {
    var mongo = require('./hooks/fixtures/mongodb-core1');
    wrapTest(agent, mongo.Server.prototype, 'command');
    wrapTest(agent, mongo.Server.prototype, 'insert');
    wrapTest(agent, mongo.Server.prototype, 'update');
    wrapTest(agent, mongo.Server.prototype, 'remove');
    wrapTest(agent, mongo.Cursor.prototype, 'next');
  });

  it('should wrap/unwrap redis on start/stop', function() {
    var redis = require('./hooks/fixtures/redis0.12');
    wrapTest(agent, redis.RedisClient.prototype, 'send_command');
    wrapTest(agent, redis, 'createClient');
  });

  it('should wrap/unwrap restify on start/stop', function() {
    var restify = require('./hooks/fixtures/restify4');
    wrapTest(agent, restify, 'createServer');
  });

  it('should have equivalent enabled and disabled structure', function() {
    assert.equal(typeof agent, 'object');
    assert.equal(typeof agent.startSpan, 'function');
    assert.equal(typeof agent.endSpan, 'function');
    assert.equal(typeof agent.runInSpan, 'function');
    assert.equal(typeof agent.runInRootSpan, 'function');
    assert.equal(typeof agent.setTransactionName, 'function');
    assert.equal(typeof agent.addTransactionLabel, 'function');
    agent.stop();
    assert.equal(typeof agent, 'object');
    assert.equal(typeof agent.startSpan, 'function');
    assert.equal(typeof agent.endSpan, 'function');
    assert.equal(typeof agent.runInSpan, 'function');
    assert.equal(typeof agent.runInRootSpan, 'function');
    assert.equal(typeof agent.setTransactionName, 'function');
    assert.equal(typeof agent.addTransactionLabel, 'function');
  });

  it('should return the initialized agent on get', function() {
    assert.equal(agent.get(), agent);
  });

  it('should allow start, end, runIn span calls when disabled', function() {
    agent.stop();
    var span = agent.startSpan();
    agent.endSpan(span);
    assert(span);
    var reached = false;
    agent.runInSpan('custom', function() {
      reached = true;
    });
    assert(reached);
  });

  it('should produce real spans when enabled', function() {
    cls.getNamespace().run(function() {
      agent.private_().createRootSpanData('root', 1, 2);
      var spanData = agent.startSpan('sub');
      agent.endSpan(spanData);
      assert.equal(spanData.span.name, 'sub');
    });
  });

  describe('labels', function(){
    it('should add labels to spans', function() {
      cls.getNamespace().run(function() {
        agent.private_().createRootSpanData('root', 1, 2);
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
        agent.private_().createRootSpanData('root', 1, 2);

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
      var root = agent.private_().createRootSpanData('root', 1, 0);
      var testLabel = { key: 'val' };
      agent.runInSpan('sub', testLabel, function() {});
      root.close();
      var spanPredicate = function(spanData) {
        return spanData.spans[1].name === 'sub';
      };
      var matchingSpans = agent.private_().traceWriter.buffer_
                            .map(JSON.parse)
                            .filter(spanPredicate);
      assert.equal(matchingSpans.length, 1);
      assert.equal(matchingSpans[0].spans[1].labels.key, 'val');
    });
  });

  it('should produce real spans runInSpan async', function(done) {
    cls.getNamespace().run(function() {
      var root = agent.private_().createRootSpanData('root', 1, 0);
      var testLabel = { key: 'val' };
      agent.runInSpan('sub', function(endSpan) {
        setTimeout(function() {
          endSpan(testLabel);
          root.close();
          var spanPredicate = function(spanData) {
            return spanData.spans[1].name === 'sub';
          };
          var matchingSpans = agent.private_().traceWriter.buffer_
                                .map(JSON.parse)
                                .filter(spanPredicate);
          assert.equal(matchingSpans.length, 1);
          var span = matchingSpans[0].spans[1];
          var duration = Date.parse(span.endTime) - Date.parse(span.startTime);
          assert(duration > 190);
          assert(duration < 300);
          assert.equal(span.labels.key, 'val');
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
      var matchingSpans = agent.private_().traceWriter.buffer_
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
          var matchingSpans = agent.private_().traceWriter.buffer_
                                .map(JSON.parse)
                                .filter(spanPredicate);
          assert.equal(matchingSpans.length, 1);
          var span = matchingSpans[0].spans[0];
          var duration = Date.parse(span.endTime) - Date.parse(span.startTime);
          assert(duration > 190);
          assert(duration < 300);
          assert.equal(span.labels.key, 'val');
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
        var matchingSpans = agent.private_().traceWriter.buffer_
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
      var spanData = agent.private_().createRootSpanData('root', 1, 2);
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
