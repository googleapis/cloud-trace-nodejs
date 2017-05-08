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

require('./plugins/common.js');
var assert = require('assert');
var fakeCredentials = require('./fixtures/gcloud-credentials.json');
var nock = require('nock');
var nocks = require('./nocks.js');
var Service = require('@google-cloud/common').Service;
var traceLabels = require('../src/trace-labels.js');

nock.disableNetConnect();

var PROJECT = 'fake-project';
var DEFAULT_DELAY = 200;


var fakeLogger = {
  warn: function() {},
  info: function() {},
  error: function() {},
  debug: function() {}
};

function createFakeSpan(name) {
  // creates a fake span.
  return {
    trace: {
      spans: [
        {
          name: name,
          startTime: 'fake startTime',
          endTime: '',
          closed_: false,
          labels_: {},
          close: function() { this.closed_ = true; },
        }
      ]
    },
    labels_: {},
    addLabel: function(k, v) { this.labels_[k] = v; },
  };
}

describe('TraceWriter', function() {
  var TraceWriter = require('../src/trace-writer.js');

  it('should be a Service instance', function() {
    var writer = new TraceWriter(fakeLogger, {
      projectId: 'fake project',
      serviceContext: {}
    });
    assert.ok(writer instanceof Service);
  });

  describe('projectId', function() {
    it('should request project from metadata if not locally available',
       function(done) {
         var scope = nocks.projectId('from metadata');
         // the constructor should fetch the projectId.
         new TraceWriter(fakeLogger, { serviceContext: {} });
         setTimeout(function() {
           assert.ok(scope.isDone());
           done();
         }, DEFAULT_DELAY);
       });
  });

  describe('writeSpan', function(done) {

    it('should close spans, add defaultLabels and queue', function(done) {
      var writer =
          new TraceWriter(fakeLogger, {
            projectId: PROJECT,
            bufferSize: 4,
            serviceContext: {}
          });
      var spanData = createFakeSpan('fake span');
      writer.queueTrace_ = function(trace) {
        assert.ok(trace && trace.spans && trace.spans[0]);
        var span = trace.spans[0];
        assert.strictEqual(span.name, 'fake span');
        assert.ok(span.closed_);
        assert.ok(spanData.labels_[traceLabels.AGENT_DATA]);
        // TODO(ofrobots): check serviceContext labels as well.
        done();
      };

      // TODO(ofrobots): the delay is needed to allow async initialization of
      // labels.
      setTimeout(function() { writer.writeSpan(spanData); }, DEFAULT_DELAY);
    });
  });

  describe('publish', function() {
    it('should submit a PATCH request to the API', function(done) {
      nocks.oauth2();
      var scope = nocks.patchTraces(PROJECT);

      var writer = new TraceWriter(
          fakeLogger, {
            projectId: PROJECT,
            credentials: fakeCredentials,
            serviceContext: {}
          });
      writer.publish_(PROJECT, '{"valid": "json"}');
      setTimeout(function() {
        assert.ok(scope.isDone());
        done();
      }, DEFAULT_DELAY);
    });

    it('should drop on server error', function(done) {
      var MESSAGE = {valid: 'json'};
      nocks.oauth2();
      var scope = nocks.patchTraces(PROJECT, null, 'Simulated Network Error',
                                    true /* withError */);

      var writer = new TraceWriter(
          fakeLogger, {
            projectId: PROJECT,
            credentials: fakeCredentials,
            serviceContext: {}
          });
      writer.publish_(PROJECT, JSON.stringify(MESSAGE));
      setTimeout(function() {
        assert.ok(scope.isDone());
        assert.equal(writer.buffer_.length, 0);
        done();
      }, DEFAULT_DELAY);
    });
  });

  describe('publishing', function() {
    it('should publish when the queue fills', function(done) {
      var writer = new TraceWriter(
          fakeLogger, {
            projectId: PROJECT,
            bufferSize: 4,
            flushDelaySeconds: 3600,
            serviceContext: {}
          });
      writer.publish_ = function() { done(); };
      for (var i = 0; i < 4; i++) {
        writer.writeSpan(createFakeSpan(i));
      }
    });

    it('should publish after timeout', function(done) {
      var published = false;
      var writer = new TraceWriter(
          fakeLogger, {
            projectId: PROJECT,
            flushDelaySeconds: 0.01,
            serviceContext: {}
          });
      writer.publish_ = function() { published = true; };
      writer.writeSpan(createFakeSpan('fake span'));
      setTimeout(function() {
        assert.ok(published);
        done();
      }, DEFAULT_DELAY);
    });
  });
});
