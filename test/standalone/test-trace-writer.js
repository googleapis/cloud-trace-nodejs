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
var cls = require('../../lib/cls.js');
var agent = require('../..');
var request = require('request');

nock.disableNetConnect();

var uri = 'https://cloudtrace.googleapis.com';
var path = '/v1/projects/0/traces';

process.env.GCLOUD_PROJECT_NUM = 0;

var queueSpans = function(n, privateAgent) {
  for (var i = 0; i < n; i++) {
    privateAgent.createRootSpanData('name', 1, 0).close();
  }
};

var formatBuffer = function(buffer) {
  return {
    traces: buffer.map(function(e) { return JSON.parse(e); })
  };
};

describe('tracewriter publishing', function() {

  it('should publish when queue fills', function(done) {
    var buf;
    var scope = nock(uri)
        .intercept(path, 'PATCH', function(body) {
          var parsedOriginal = formatBuffer(buf);
          assert.equal(JSON.stringify(body), JSON.stringify(parsedOriginal));
          return true;
        }).reply(200);
    var privateAgent = agent.start({bufferSize: 2, samplingRate: -1}).private_();
    privateAgent.traceWriter.request_ = request; // Avoid authing
    cls.getNamespace().run(function() {
      queueSpans(2, privateAgent);
      buf = privateAgent.traceWriter.buffer_;
      setTimeout(function() {
        agent.stop();
        scope.done();
        done();
      }, 20);
    });
  });

  it('should publish after timeout', function(done) {
    var buf;
    var scope = nock(uri)
        .intercept(path, 'PATCH', function(body) {
          var parsedOriginal = formatBuffer(buf);
          assert.equal(JSON.stringify(body), JSON.stringify(parsedOriginal));
          return true;
        }).reply(200);
    var privateAgent = agent.start({flushDelaySeconds: 0.01, samplingRate: -1}).private_();
    privateAgent.traceWriter.request_ = request; // Avoid authing
    cls.getNamespace().run(function() {
      queueSpans(1, privateAgent);
      buf = privateAgent.traceWriter.buffer_;
      setTimeout(function() {
        agent.stop();
        scope.done();
        done();
      }, 20);
    });
  });

  it('should drop on server error', function(done) {
    var buf;
    var scope = nock(uri)
        .intercept(path, 'PATCH', function(body) {
          var parsedOriginal = formatBuffer(buf);
          assert.equal(JSON.stringify(body), JSON.stringify(parsedOriginal));
          return true;
        }).replyWithError('Simulated Network Error');
    var privateAgent = agent.start({bufferSize: 2, samplingRate: -1}).private_();
    privateAgent.traceWriter.request_ = request; // Avoid authing
    cls.getNamespace().run(function() {
      queueSpans(2, privateAgent);
      buf = privateAgent.traceWriter.buffer_;
      setTimeout(function() {
        agent.stop();
        scope.done();
        done();
      }, 20);
    });
  });

});
