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
var agent = require('../..');
var cls = require('../../lib/cls.js');

describe('index.js', function() {

  it('should be harmless to stop before a start', function() {
    agent.stop();
    agent.stop();
    agent.stop();
  });

  function wrapTest(nodule, property) {
    agent.stop(); // harmless to stop before a start.
    assert(!nodule[property].__unwrap,
      property + ' already wrapped before start');
    agent.start();
    assert(nodule[property].__unwrap,
      property + ' should get wrapped on start');
    agent.stop();
    assert(!nodule[property].__unwrap,
      property + ' should get unwrapped on stop');
    agent.start();
    assert(nodule[property].__unwrap,
      property + ' should get wrapped on start');
    agent.stop();
    assert(!nodule[property].__unwrap,
      property + ' should get unwrapped on stop');
  }

  it('should wrap/unwrap module._load on start/stop', function() {
    wrapTest(require('module'), '_load');
  });

  it('should not attach exception handler with ignore option', function() {
    agent.start();
    // Mocha attaches 1 exception handler
    assert.equal(process.listeners('uncaughtException').length, 1);
    agent.stop();
  });

  it('should wrap/unwrap http on start/stop', function() {
    agent.start(); // agent needs to be started before the first require.
    var http = require('http');
    wrapTest(http, 'request');
    agent.stop();
  });

  it('should wrap/unwrap express on start/stop', function() {
    agent.start();
    var express = require('../hooks/fixtures/express4');
    var patchedMethods = require('methods');
    patchedMethods.push('use', 'route', 'param', 'all');
    patchedMethods.forEach(function(method) {
      wrapTest(express.application, method);
    });
    agent.stop();
  });

  it('should wrap/unwrap hapi on start/stop', function() {
    agent.start();
    var hapi = require('../hooks/fixtures/hapi8');
    wrapTest(hapi.Server.prototype, 'connection');
    agent.stop();
  });

  it('should wrap/unwrap mongodb-core on start/stop', function() {
    agent.start();
    var mongo = require('../hooks/fixtures/mongodb-core1');
    wrapTest(mongo.Server.prototype, 'command');
    wrapTest(mongo.Server.prototype, 'insert');
    wrapTest(mongo.Server.prototype, 'update');
    wrapTest(mongo.Server.prototype, 'remove');
    wrapTest(mongo.Cursor.prototype, 'next');
    agent.stop();
  });

  it('should wrap/unwrap redis on start/stop', function() {
    agent.start();
    var redis = require('../hooks/fixtures/redis0.12');
    wrapTest(redis.RedisClient.prototype, 'send_command');
    wrapTest(redis, 'createClient');
    agent.stop();
  });

  it('should wrap/unwrap restify on start/stop', function() {
    agent.start();
    var restify = require('../hooks/fixtures/restify3');
    wrapTest(restify, 'createServer');
    agent.stop();
  });

  it('should have equivalent enabled and disabled structure', function() {
    agent.start();
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

  it('should throw if get called before start', function() {
    assert.throws(function() { agent.get(); }, Error);
  });

  it('should return the initialized agent on get', function() {
    agent.start();
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
    agent.start();
    cls.getNamespace().run(function() {
      agent.private_().createRootSpanData('root', 1, 2);
      var spanData = agent.startSpan('sub');
      agent.endSpan(spanData);
      assert.equal(spanData.span.name, 'sub');
      agent.stop();
    });
  });

  it('should produce real spans runInSpan sync', function() {
    agent.start();
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
      agent.stop();
    });
  });

  it('should produce real spans runInSpan async', function(done) {
    agent.start();
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
          agent.stop();
          done();
        }, 200);
      });
    });
  });

  it('should produce real root spans runInRootSpan sync', function() {
    agent.start();
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
      agent.stop();
    });
  });

  it('should produce real root spans runInRootSpan async', function(done) {
    agent.start();
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
          agent.stop();
          done();
        }, 200);
      });
    });
  });

  it('should not break with no root span', function() {
    agent.start();
    var span = agent.startSpan();
    agent.setTransactionName('noop');
    agent.addTransactionLabel('noop', 'noop');
    agent.endSpan(span);
    agent.stop();
  });

  it('should not allow nested root spans', function(done) {
    agent.start();
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
        agent.stop();
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
    agent.start();
    cls.getNamespace().run(function() {
      var spanData = agent.private_().createRootSpanData('root', 1, 2);
      agent.setTransactionName('root2');
      agent.addTransactionLabel('key', 'value');
      assert.equal(spanData.span.name, 'root2');
      assert.equal(spanData.span.labels.key, 'value');
      agent.stop();
    });
  });

  it('should set agent on global object', function() {
    assert.equal(global._google_trace_agent, agent);
  });
});
