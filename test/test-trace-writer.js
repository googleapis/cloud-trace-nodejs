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
var nock = require('nock');
var cls = require('../src/cls.js');
var common = require('./hooks/common.js');
var trace = require('..');

nock.disableNetConnect();

var uri = 'https://cloudtrace.googleapis.com';
var path = '/v1/projects/0/traces';

process.env.GCLOUD_PROJECT = 0;

var queueSpans = function(n, agent) {
  for (var i = 0; i < n; i++) {
    common.runInTransaction(agent, function(end) {
      end();
    });
  }
};

describe('tracewriter publishing', function() {

  it('should publish when queue fills', function(done) {
    var buf;
    var scope = nock(uri)
        .intercept(path, 'PATCH', function(body) {
          assert.equal(JSON.stringify(body.traces), JSON.stringify(buf));
          return true;
        }).reply(200);
    var agent = trace.start({
      bufferSize: 2,
      samplingRate: 0,
      forceNewAgent_: true
    });
    common.avoidTraceWriterAuth(agent);
    cls.getNamespace().run(function() {
      queueSpans(2, agent);
      buf = common.getTraces(agent);
      setTimeout(function() {
        scope.done();
        done();
      }, 80);
    });
  });

  it('should publish after timeout', function(done) {
    var buf;
    var scope = nock(uri)
        .intercept(path, 'PATCH', function(body) {
          assert.equal(JSON.stringify(body.traces), JSON.stringify(buf));
          return true;
        }).reply(200);
    var agent = trace.start({
      flushDelaySeconds: 0.01,
      samplingRate: -1,
      forceNewAgent_: true
    });
    common.avoidTraceWriterAuth(agent);
    cls.getNamespace().run(function() {
      queueSpans(1, agent);
      buf = common.getTraces(agent);
      setTimeout(function() {
        scope.done();
        done();
      }, 20);
    });
  });

  it('should drop on server error', function(done) {
    var buf;
    var scope = nock(uri)
        .intercept(path, 'PATCH', function(body) {
          assert.equal(JSON.stringify(body.traces), JSON.stringify(buf));
          return true;
        }).replyWithError('Simulated Network Error');
    var agent = trace.start({
      bufferSize: 2,
      samplingRate: -1,
      forceNewAgent_: true
    });
    common.avoidTraceWriterAuth(agent);
    cls.getNamespace().run(function() {
      queueSpans(2, agent);
      buf = common.getTraces(agent);
      setTimeout(function() {
        scope.done();
        done();
      }, 20);
    });
  });

});
