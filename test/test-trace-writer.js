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
var trace = require('..');
var request = require('request');
var proxyquire = require('proxyquire');

nock.disableNetConnect();

var uri = 'https://cloudtrace.googleapis.com';
var path = '/v1/projects/0/traces';

process.env.GCLOUD_PROJECT = 0;

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
  before(function() {
    // Setup: Monkeypatch gcp-metadata to not ask for retries at all.
    var retryRequest = require('retry-request');
    proxyquire('gcp-metadata', {
      'retry-request': function(requestOps, callback) {
        return retryRequest(requestOps, {
          retries: 0
        }, callback);
      }
    });
  });

  it('should stop when the project number cannot be acquired', function(done) {
    nock.disableNetConnect();
    var scope = nock('http://metadata.google.internal')
                .get('/computeMetadata/v1/project/project-id')
                .times(1)
                .reply(404);
    
    var projectId = process.env.GCLOUD_PROJECT;

    delete process.env.GCLOUD_PROJECT;
    var agent = trace.start({logLevel: 0, forceNewAgent_: true});
    var privateAgent = agent.private_();
    process.env.GCLOUD_PROJECT = projectId;
    setTimeout(function() {
      // Check that the trace writer is not active.
      assert.ok(!privateAgent.traceWriter.isActive);
      cls.getNamespace().run(function() {
        queueSpans(2, privateAgent);
        // Make sure the trace writer buffer is still empty.
        // It should be because the trace writer should have been disabled when
        // the project ID couldn't be discovered.
        assert.strictEqual(privateAgent.traceWriter.buffer_.length, 0);
        scope.done();
        done();
      });
    }, 100);
  });

  it('should publish when queue fills', function(done) {
    var buf;
    var scope = nock(uri)
        .intercept(path, 'PATCH', function(body) {
          var parsedOriginal = formatBuffer(buf);
          assert.equal(JSON.stringify(body), JSON.stringify(parsedOriginal));
          return true;
        }).reply(200);
    var agent = trace.start({
      bufferSize: 2,
      samplingRate: 0,
      forceNewAgent_: true
    });
    var privateAgent = agent.private_();
    privateAgent.traceWriter.request_ = request; // Avoid authing
    cls.getNamespace().run(function() {
      queueSpans(2, privateAgent);
      buf = privateAgent.traceWriter.buffer_;
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
          var parsedOriginal = formatBuffer(buf);
          assert.equal(JSON.stringify(body), JSON.stringify(parsedOriginal));
          return true;
        }).reply(200);
    var agent = trace.start({
      flushDelaySeconds: 0.01,
      samplingRate: -1,
      forceNewAgent_: true
    });
    var privateAgent = agent.private_();
    privateAgent.traceWriter.request_ = request; // Avoid authing
    cls.getNamespace().run(function() {
      queueSpans(1, privateAgent);
      buf = privateAgent.traceWriter.buffer_;
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
          var parsedOriginal = formatBuffer(buf);
          assert.equal(JSON.stringify(body), JSON.stringify(parsedOriginal));
          return true;
        }).replyWithError('Simulated Network Error');
    var agent = trace.start({
      bufferSize: 2,
      samplingRate: -1,
      forceNewAgent_: true
    });
    var privateAgent = agent.private_();
    privateAgent.traceWriter.request_ = request; // Avoid authing
    cls.getNamespace().run(function() {
      queueSpans(2, privateAgent);
      buf = privateAgent.traceWriter.buffer_;
      setTimeout(function() {
        scope.done();
        done();
      }, 20);
    });
  });

});
