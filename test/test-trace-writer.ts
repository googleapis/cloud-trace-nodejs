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
import './override-gcp-metadata';
import { Trace, SpanKind } from '../src/trace';
import { TraceLabels } from '../src/trace-labels';
import { traceWriter, TraceWriter, TraceWriterConfig } from '../src/trace-writer';

var assert = require('assert');
var fakeCredentials = require('./fixtures/gcloud-credentials.json');
var nock = require('nock');
var nocks = require('./nocks'/*.js*/);
var os = require('os');
var Service = require('@google-cloud/common').Service;

type createTraceWriterOptions = TraceWriterConfig & { forceNewAgent_: boolean };

interface TestCase {
  description: string,
  config: any,
  metadata: {
    projectId?: string,
    hostname?: string,
    instanceId?: string
  },
  assertResults: (err?: Error | null, tw?: any) => void
}

nock.disableNetConnect();

var PROJECT = 'fake-project';
var DEFAULT_DELAY = 200;

var fakeLogger = {
  warn: () => {},
  info: () => {},
  error: () => {},
  debug: () => {},
  silly: () => {}
};

function createFakeTrace(name): Trace {
  // creates a fake span.
  return {
    spans: [
      {
        labels: {},
        name: name,
        startTime: (new Date()).toISOString(),
        endTime: '',
        kind: SpanKind.RPC_SERVER,
        spanId: '',
        parentSpanId: ''
      }
    ],
    projectId: '',
    traceId: ''
  };
}

describe('TraceWriter', function() {
  it('should be a Service instance', function() {
    var writer = traceWriter.create(fakeLogger, {
      projectId: 'fake project',
      serviceContext: {},
      onUncaughtException: 'ignore',
      forceNewAgent_: true
    } as createTraceWriterOptions);
    assert.ok(writer instanceof Service);
  });
  
  it('should not attach exception handler with ignore option', function() {
    // In Node 9+, this should be 1.
    // Otherwise, it should be 0.
    const numListenersBeforeTraceWriter = process.listeners('uncaughtException').length;
    traceWriter.create(fakeLogger, {
      projectId: '0',
      serviceContext: {},
      onUncaughtException: 'ignore',
      forceNewAgent_: true
    } as createTraceWriterOptions);
    // Mocha attaches 1 exception handler
    assert.equal(process.listeners('uncaughtException').length, numListenersBeforeTraceWriter);
  });

  describe('writeSpan', function() {
    it('should close spans, add defaultLabels and queue', function(done) {
      var writer = traceWriter.create(fakeLogger, {
        projectId: PROJECT,
        bufferSize: 4,
        serviceContext: {},
        onUncaughtException: 'ignore',
        forceNewAgent_: true
      } as createTraceWriterOptions, function() {
        var spanData = createFakeTrace('fake span');
        writer.defaultLabels = {
          fakeKey: 'value'
        };
        writer.queueTrace = function(trace) {
          assert.ok(trace && trace.spans && trace.spans[0]);
          var span = trace.spans[0];
          assert.strictEqual(span.name, 'fake span');
          assert.ok(span.endTime);
          assert.strictEqual(span.labels.fakeKey, 'value');
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

      var writer = traceWriter.create(fakeLogger, {
        projectId: PROJECT,
        credentials: fakeCredentials,
        serviceContext: {},
        onUncaughtException: 'ignore',
        forceNewAgent_: true
      } as createTraceWriterOptions);
      writer.publish('{"valid": "json"}');
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

      var writer = traceWriter.create(fakeLogger, {
        projectId: PROJECT,
        credentials: fakeCredentials,
        serviceContext: {},
        onUncaughtException: 'ignore',
        forceNewAgent_: true
      } as createTraceWriterOptions);
      writer.publish(JSON.stringify(MESSAGE));
      setTimeout(function() {
        assert.ok(scope.isDone());
        assert.equal(writer.buffer.length, 0);
        done();
      }, DEFAULT_DELAY);
    });
  });

  describe('publishing', function() {
    it('should publish when the queue fills', function(done) {
      var writer = traceWriter.create(fakeLogger, {
        projectId: PROJECT,
        bufferSize: 4,
        flushDelaySeconds: 3600,
        serviceContext: {},
        onUncaughtException: 'ignore',
        forceNewAgent_: true
      } as createTraceWriterOptions);
      writer.publish = function() { done(); };
      for (var i = 0; i < 4; i++) {
        writer.writeSpan(createFakeTrace(i));
      }
    });

    it('should publish after timeout', function(done) {
      var published = false;
      var writer = traceWriter.create(fakeLogger, {
        projectId: PROJECT,
        flushDelaySeconds: 0.01,
        serviceContext: {},
        onUncaughtException: 'ignore',
        forceNewAgent_: true
      } as createTraceWriterOptions);
      writer.publish = function() { published = true; };
      writer.initialize(function() {
        writer.writeSpan(createFakeTrace('fake span'));
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
          assert.strictEqual(tw.config.projectId, undefined);
        }
      },
      {
        description: 'not get projectId if it\'s locally available',
        config: { projectId: 'foo' },
        metadata: {},
        assertResults: function(err, tw) {
          assert.ok(!err);
          assert.strictEqual(tw.config.projectId, 'foo');
        }
      },
      {
        description: 'get projectId if it\'s not locally available',
        config: {},
        metadata: { projectId: 'foo' },
        assertResults: function(err, tw) {
          assert.ok(!err);
          assert.strictEqual(tw.config.projectId, 'foo');
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
          assert.strictEqual(tw.defaultLabels[TraceLabels.GCE_HOSTNAME], 'bar');
          assert.strictEqual(tw.defaultLabels[TraceLabels.GAE_MODULE_NAME], 'bar');
          // Having an instanceId is reflected in whether this label is set
          assert.strictEqual(tw.defaultLabels[TraceLabels.GCE_INSTANCE_ID], undefined);
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
          assert.strictEqual(tw.defaultLabels[TraceLabels.GCE_HOSTNAME], os.hostname());
          assert.strictEqual(tw.defaultLabels[TraceLabels.GAE_MODULE_NAME], os.hostname());
          // Having an instanceId is reflected in whether this label is set
          assert.strictEqual(tw.defaultLabels[TraceLabels.GCE_INSTANCE_ID], 'baz');
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
          assert.strictEqual(tw.defaultLabels[TraceLabels.GCE_HOSTNAME], 'bar');
          assert.strictEqual(tw.defaultLabels[TraceLabels.GAE_MODULE_NAME], 'bar');
          assert.strictEqual(tw.defaultLabels[TraceLabels.GCE_INSTANCE_ID], 'baz');
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
          assert.strictEqual(tw.defaultLabels[TraceLabels.GCE_HOSTNAME], 'bar');
          assert.strictEqual(tw.defaultLabels[TraceLabels.GAE_MODULE_NAME], 'barz');
          assert.strictEqual(tw.defaultLabels[TraceLabels.GCE_INSTANCE_ID], 'baz');
          assert.strictEqual(tw.defaultLabels[TraceLabels.GAE_MODULE_VERSION], '1');
          assert.strictEqual(tw.defaultLabels[TraceLabels.GAE_VERSION], 'barz:1.2');
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

        traceWriter.create(fakeLogger, Object.assign({
          forceNewAgent_: true,
          onUncaughtException: 'ignore',
          serviceContext: {}
        }, testCase.config), function(err) {
          testCase.assertResults(err, traceWriter.get());
          done();
        });
      });
    });
  });
});

export default {};
