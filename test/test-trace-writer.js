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
require('./plugins/common.js');
var assert = require('assert');
var fakeCredentials = require('./fixtures/gcloud-credentials.json');
var nock = require('nock');
var nocks = require('./nocks.js');
var os = require('os');
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
    var writer = TraceWriter.create(fakeLogger, {
      projectId: 'fake project',
      serviceContext: {},
      onUncaughtException: 'ignore',
      forceNewAgent_: true
    });
    assert.ok(writer instanceof Service);
  });

  describe('writeSpan', function(done) {
    it('should close spans, add defaultLabels and queue', function(done) {
      var writer = TraceWriter.create(fakeLogger, {
        projectId: PROJECT,
        bufferSize: 4,
        serviceContext: {},
        onUncaughtException: 'ignore',
        forceNewAgent_: true
      });
      writer.defaultLabels_ = {
        fakeKey: 'value'
      };
      var spanData = createFakeSpan('fake span');
      writer.queueTrace_ = function(trace) {
        assert.ok(trace && trace.spans && trace.spans[0]);
        var span = trace.spans[0];
        assert.strictEqual(span.name, 'fake span');
        assert.ok(span.closed_);
        assert.strictEqual(spanData.labels_.fakeKey, 'value');
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

  describe('getMetadata_', function() {
    var testCases = [
      {
        description: 'reject if no projectId is available',
        localProjectId: undefined,
        metadataProjectId: undefined,
        assertResults: function(err, metadata) {
          assert.ok(err);
        }
      },
      {
        description: 'not get projectId if it\'s locally available',
        localProjectId: 'foo',
        metadataProjectId: undefined,
        assertResults: function(err, metadata) {
          assert.ok(!err);
          assert.deepStrictEqual(metadata, {});
        }
      },
      {
        description: 'get projectId if it\'s not locally available',
        localProjectId: undefined,
        metadataProjectId: 'foo',
        assertResults: function(err, metadata) {
          assert.ok(!err);
          assert.deepStrictEqual(metadata, {
            projectId: 'foo'
          });
        }
      },
      {
        description: 'get hostname even if instanceId isn\'t available',
        localProjectId: undefined,
        metadataProjectId: 'foo',
        metadataHostname: 'bar',
        assertResults: function(err, metadata) {
          assert.ok(!err);
          assert.deepStrictEqual(metadata, {
            projectId: 'foo',
            hostname: 'bar'
          });
        }
      },
      {
        description: 'get instanceId even if hostname isn\'t available',
        localProjectId: undefined,
        metadataProjectId: 'foo',
        metadataInstanceId: 'baz',
        assertResults: function(err, metadata) {
          assert.ok(!err);
          assert.deepStrictEqual(metadata, {
            projectId: 'foo',
            instanceId: 'baz'
          });
        }
      },
      {
        description: 'get all fields if they exist',
        localProjectId: undefined,
        metadataProjectId: 'foo',
        metadataHostname: 'bar',
        metadataInstanceId: 'baz',
        assertResults: function(err, metadata) {
          assert.ok(!err);
          assert.deepStrictEqual(metadata, {
            projectId: 'foo',
            hostname: 'bar',
            instanceId: 'baz'
          });
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
        if (testCase.metadataProjectId) {
          nocks.projectId(function() { return testCase.metadataProjectId; });
        }
        if (testCase.metadataHostname) {
          nocks.hostname(function() { return testCase.metadataHostname; });
        }
        if (testCase.metadataInstanceId) {
          nocks.instanceId(function() { return testCase.metadataInstanceId; });
        }

        TraceWriter.create(fakeLogger, {
          forceNewAgent_: true,
          projectId: testCase.localProjectId,
          onUncaughtException: 'ignore'
        });
        // Use setImmediate so assert failures don't show up as rejected promises
        TraceWriter.get().getMetadata_().then(function(metadata) {
          setImmediate(function() {
            testCase.assertResults(null, metadata);
            done();
          });
        }, function(err) {
          setImmediate(function() {
            testCase.assertResults(err);
            done();
          });
        });
      });
    });
  });

  describe('initialize', function() {
    it('handles getMetadata_ rejection', function(done) {
      TraceWriter.create(fakeLogger, {
        forceNewAgent_: true,
        projectId: undefined,
        onUncaughtException: 'ignore'
      });
      var metadataErr = new Error('');
      TraceWriter.get().getMetadata_ = function() {
        return Promise.reject(metadataErr);
      };
      TraceWriter.get().initialize(function(err) {
        assert.strictEqual(metadataErr, err);
        done();
      });
    });

    var testCases = [
      {
        description: 'set labels to os.hostname() if metadata isn\'t available',
        config: {
          projectId: 'foo',
          serviceContext: {}
        },
        metadata: {},
        assertResults: function(tw) {
          assert.strictEqual(tw.defaultLabels_[traceLabels.GCE_HOSTNAME], os.hostname());
          assert.strictEqual(tw.defaultLabels_[traceLabels.GAE_MODULE_NAME], os.hostname());
        }
      },
      {
        description: 'set labels to metadata-provided information',
        config: {
          serviceContext: {}
        },
        metadata: {
          projectId: 'foo',
          hostname: 'bar',
          instanceId: 'baz'
        },
        assertResults: function(tw) {
          assert.strictEqual(tw.defaultLabels_[traceLabels.GCE_HOSTNAME], 'bar');
          assert.strictEqual(tw.defaultLabels_[traceLabels.GAE_MODULE_NAME], 'bar');
          assert.strictEqual(tw.defaultLabels_[traceLabels.GCE_INSTANCE_ID], 'baz');
        }
      },
      {
        description: 'prioritizes config-provided information when setting labels',
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
        assertResults: function(tw) {
          assert.strictEqual(tw.defaultLabels_[traceLabels.GCE_HOSTNAME], 'bar');
          assert.strictEqual(tw.defaultLabels_[traceLabels.GAE_MODULE_NAME], 'barz');
          assert.strictEqual(tw.defaultLabels_[traceLabels.GCE_INSTANCE_ID], 'baz');
          assert.strictEqual(tw.defaultLabels_[traceLabels.GAE_MODULE_VERSION], '1');
          assert.strictEqual(tw.defaultLabels_[traceLabels.GAE_VERSION], 'barz:1.2');
        }
      }
    ];

    testCases.forEach(function(testCase) {
      it('should ' + testCase.description, function(done) {
        TraceWriter.create(fakeLogger, Object.assign({
          forceNewAgent_: true,
          onUncaughtException: 'ignore'
        }, testCase.config));
        TraceWriter.get().getMetadata_ = function() {
          return Promise.resolve(testCase.metadata);
        };
        TraceWriter.get().scheduleFlush_ = function() {};
        TraceWriter.get().initialize(function(err) {
          assert.ok(!err, err);
          testCase.assertResults(TraceWriter.get());
          done();
        });
      });
    });
  });
});
