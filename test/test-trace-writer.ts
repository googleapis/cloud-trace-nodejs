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

// Loading this file patches gcpMetadata so requests don't time out.
require('./plugins/common'/*.js*/);
var assert = require('assert');
var fakeCredentials = require('./fixtures/gcloud-credentials.json');
var nock = require('nock');
var nocks = require('./nocks'/*.js*/);
var os = require('os');
var Service = require('@google-cloud/common').Service;
var traceLabels = require('../src/trace-labels'/*.js*/);

interface TestCase {
  description: string,
  config: any,
  metadata: {
    projectId?: string,
    hostname?: string,
    instanceId?: string
  },
  assertResults: (err: Error, tw: any) => void
}

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
  var TraceWriter = require('../src/trace-writer'/*.js*/);

  it('should be a Service instance', function() {
    var writer = TraceWriter.create(fakeLogger, {
      projectId: 'fake project',
      serviceContext: {},
      onUncaughtException: 'ignore',
      forceNewAgent_: true
    });
    assert.ok(writer instanceof Service);
  });
  
  it('should not attach exception handler with ignore option', function() {
    TraceWriter.create(fakeLogger, {
      projectId: '0',
      onUncaughtException: 'ignore',
      forceNewAgent_: true
    });
    // Mocha attaches 1 exception handler
    assert.equal(process.listeners('uncaughtException').length, 1);
  });

  describe('writeSpan', function() {
    it('should close spans, add defaultLabels and queue', function(done) {
      var writer = TraceWriter.create(fakeLogger, {
        projectId: PROJECT,
        bufferSize: 4,
        serviceContext: {},
        onUncaughtException: 'ignore',
        forceNewAgent_: true
      }, function() {
        var spanData = createFakeSpan('fake span');
        writer.defaultLabels_ = {
          fakeKey: 'value'
        };
        writer.queueTrace_ = function(trace) {
          assert.ok(trace && trace.spans && trace.spans[0]);
          var span = trace.spans[0];
          assert.strictEqual(span.name, 'fake span');
          assert.ok(span.closed_);
          assert.strictEqual((spanData.labels_ as any).fakeKey, 'value');
          // TODO(ofrobots): check serviceContext labels as well.
          done();
        };
        writer.writeSpan(spanData);
      });
    });
  });

  describe('publish', function() {
    it('should submit a PATCH request to the API', function(done) {
      nocks.oauth2();
      var scope = nocks.patchTraces(PROJECT);

      var writer = TraceWriter.create(fakeLogger, {
        projectId: PROJECT,
        credentials: fakeCredentials,
        serviceContext: {},
        onUncaughtException: 'ignore',
        forceNewAgent_: true
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

      var writer = TraceWriter.create(fakeLogger, {
        projectId: PROJECT,
        credentials: fakeCredentials,
        serviceContext: {},
        onUncaughtException: 'ignore',
        forceNewAgent_: true
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
      var writer = TraceWriter.create(fakeLogger, {
        projectId: PROJECT,
        bufferSize: 4,
        flushDelaySeconds: 3600,
        serviceContext: {},
        onUncaughtException: 'ignore',
        forceNewAgent_: true
      });
      writer.publish_ = function() { done(); };
      for (var i = 0; i < 4; i++) {
        writer.writeSpan(createFakeSpan(i));
      }
    });

    it('should publish after timeout', function(done) {
      var published = false;
      var writer = TraceWriter.create(fakeLogger, {
        projectId: PROJECT,
        flushDelaySeconds: 0.01,
        serviceContext: {},
        onUncaughtException: 'ignore',
        forceNewAgent_: true
      });
      writer.publish_ = function() { published = true; };
      writer.initialize(function() {
        writer.writeSpan(createFakeSpan('fake span'));
        setTimeout(function() {
          assert.ok(published);
          done();
        }, DEFAULT_DELAY);
      });
    });
  });

  describe('initialize', function() {
    var testCases: TestCase[] = [
      {
        description: 'yield error if no projectId is available',
        config: {},
        metadata: {},
        assertResults: function(err, tw) {
          assert.ok(err);
          assert.strictEqual(tw.config_.projectId, undefined);
        }
      },
      {
        description: 'not get projectId if it\'s locally available',
        config: { projectId: 'foo' },
        metadata: {},
        assertResults: function(err, tw) {
          assert.ok(!err);
          assert.strictEqual(tw.config_.projectId, 'foo');
        }
      },
      {
        description: 'get projectId if it\'s not locally available',
        config: {},
        metadata: { projectId: 'foo' },
        assertResults: function(err, tw) {
          assert.ok(!err);
          assert.strictEqual(tw.config_.projectId, 'foo');
        }
      },
      {
        description: 'get hostname even if instanceId isn\'t available',
        config: {},
        metadata: {
          projectId: 'foo',
          hostname: 'bar'
        },
        assertResults: function(err, tw) {
          assert.ok(!err);
          // Having a hostname is reflected in whether these labels are set
          assert.strictEqual(tw.defaultLabels_[traceLabels.GCE_HOSTNAME], 'bar');
          assert.strictEqual(tw.defaultLabels_[traceLabels.GAE_MODULE_NAME], 'bar');
          // Having an instanceId is reflected in whether this label is set
          assert.strictEqual(tw.defaultLabels_[traceLabels.GCE_INSTANCE_ID], undefined);
        }
      },
      {
        description: 'get instanceId even if hostname isn\'t available',
        config: {},
        metadata: {
          projectId: 'foo',
          instanceId: 'baz'
        },
        assertResults: function(err, tw) {
          assert.ok(!err);
          // Having a hostname is reflected in whether these labels are set
          assert.strictEqual(tw.defaultLabels_[traceLabels.GCE_HOSTNAME], os.hostname());
          assert.strictEqual(tw.defaultLabels_[traceLabels.GAE_MODULE_NAME], os.hostname());
          // Having an instanceId is reflected in whether this label is set
          assert.strictEqual(tw.defaultLabels_[traceLabels.GCE_INSTANCE_ID], 'baz');
        }
      },
      {
        description: 'get all fields if they exist',
        config: {},
        metadata: {
          projectId: 'foo',
          hostname: 'bar',
          instanceId: 'baz'
        },
        assertResults: function(err, tw) {
          assert.ok(!err);
          assert.strictEqual(tw.defaultLabels_[traceLabels.GCE_HOSTNAME], 'bar');
          assert.strictEqual(tw.defaultLabels_[traceLabels.GAE_MODULE_NAME], 'bar');
          assert.strictEqual(tw.defaultLabels_[traceLabels.GCE_INSTANCE_ID], 'baz');
        }
      },
      {
        description: 'prioritize config-provided information when setting labels',
        config: {
          serviceContext: {
            service: 'barz',
            version: '1',
            minorVersion: '2'
          }
        },
        metadata: {
          projectId: 'foo',
          hostname: 'bar',
          instanceId: 'baz'
        },
        assertResults: function(err, tw) {
          assert.ok(!err);
          assert.strictEqual(tw.defaultLabels_[traceLabels.GCE_HOSTNAME], 'bar');
          assert.strictEqual(tw.defaultLabels_[traceLabels.GAE_MODULE_NAME], 'barz');
          assert.strictEqual(tw.defaultLabels_[traceLabels.GCE_INSTANCE_ID], 'baz');
          assert.strictEqual(tw.defaultLabels_[traceLabels.GAE_MODULE_VERSION], '1');
          assert.strictEqual(tw.defaultLabels_[traceLabels.GAE_VERSION], 'barz:1.2');
        }
      }
    ];

    before(function() {
      nock.disableNetConnect();
    });

    after(function() {
      nock.enableNetConnect();
    });

    testCases.forEach(function(testCase) {
      it('should ' + testCase.description, function(done) {
        if (testCase.metadata.projectId) {
          nocks.projectId(function() { return testCase.metadata.projectId; });
        }
        if (testCase.metadata.hostname) {
          nocks.hostname(function() { return testCase.metadata.hostname; });
        }
        if (testCase.metadata.instanceId) {
          nocks.instanceId(function() { return testCase.metadata.instanceId; });
        }

        TraceWriter.create(fakeLogger, Object.assign({
          forceNewAgent_: true,
          onUncaughtException: 'ignore',
          serviceContext: {}
        }, testCase.config), function(err) {
          testCase.assertResults(err, TraceWriter.get());
          done();
        });
      });
    });
  });
});

export default {};
