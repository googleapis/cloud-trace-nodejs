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

var proxyquire  = require('proxyquire');
var assert = require('assert');
var nock = require('nock');
var traceLabels = require('../src/trace-labels.js');

nock.disableNetConnect();

describe('agent interaction with metadata service', function() {
  var agent;
  var trace;
  var common;

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
    common = require('./plugins/common.js');
    trace = require('..');
    delete process.env.GCLOUD_PROJECT;
  });

  it('should stop when the project number cannot be acquired', function(done) {
    nock.disableNetConnect();
    var scope = nock('http://metadata.google.internal')
                .get('/computeMetadata/v1/project/project-id')
                .times(2)
                .reply(404, 'foo');

    agent = trace.start({logLevel: 0});
    setTimeout(function() {
      assert.ok(!agent.isActive());
      scope.done();
      done();
    }, 500);
  });

  it('should preserve public interface when stopped', function(done) {
      assert.equal(typeof agent, 'object');
      assert.equal(typeof agent.isActive, 'function');
      assert.equal(typeof agent.enhancedDatabaseReportingEnabled, 'function');
      assert.equal(typeof agent.runInRootSpan, 'function');
      assert.equal(typeof agent.createChildSpan, 'function');
      assert.equal(typeof agent.wrap, 'function');
      assert.equal(typeof agent.wrapEmitter, 'function');
      assert.equal(typeof agent.constants, 'object');
      assert.equal(typeof agent.labels, 'object');
      agent = trace.start({logLevel: 0, enabled: false});
      setTimeout(function() {
        assert.equal(typeof agent, 'object');
        assert.equal(agent.isActive(), false);
        assert.equal(agent.enhancedDatabaseReportingEnabled(), false);
        agent.runInRootSpan({}, function(root) {
          assert.equal(typeof root.addLabel, 'function');
          assert.equal(typeof root.endSpan, 'function');
          assert.equal(root.getTraceContext(), '');
        });
        var child = agent.createChildSpan({});
        assert.equal(typeof child.addLabel, 'function');
        assert.equal(typeof child.endSpan, 'function');
        assert.equal(child.getTraceContext(), '');
        assert.strictEqual(agent.wrap(agent), agent);
        assert.strictEqual(agent.wrapEmitter(agent), agent);
        assert.equal(typeof agent.constants, 'object');
        assert.equal(typeof agent.labels, 'object');
        done();
      }, 500);
  });

  it('should activate with projectId from metadata service', function(done) {
    nock.disableNetConnect();
    var scope = nock('http://metadata.google.internal')
                .get('/computeMetadata/v1/project/project-id')
                .times(2)
                .reply(200, '1234');
    agent = trace.start({logLevel: 0, forceNewAgent_: true});
    setTimeout(function() {
      assert.ok(agent.isActive());
      assert.equal(common.getConfig(agent).projectId, '1234');
      scope.done();
      done();
    }, 500);
  });

  it('should not query metadata service when config.projectId is set',
    function() {
      nock.disableNetConnect();
      agent = trace.start({projectId: '0', logLevel: 0, forceNewAgent_: true});
    });

  it('should not query metadata service when env. var. is set', function() {
    nock.disableNetConnect();
    process.env.GCLOUD_PROJECT=0;
    agent = trace.start({logLevel: 0, forceNewAgent_: true});
    delete process.env.GCLOUD_PROJECT;
  });

  it('should attach hostname to spans when provided', function(done) {
    nock.disableNetConnect();
    var scope = nock('http://metadata.google.internal')
                .get('/computeMetadata/v1/instance/hostname')
                .times(1)
                .reply(200, 'host');

    agent = trace.start({projectId: '0', logLevel: 0, forceNewAgent_: true});
    setTimeout(function() {
      common.runInTransaction(agent, function(end) {
        end();
        var span = common.getMatchingSpan(agent, spanPredicate);
        assert.equal(span.labels[traceLabels.GCE_HOSTNAME], 'host');
        scope.done();
        done();
      });
    }, 500);
  });

  it('should attach instance id to spans when provided', function(done) {
    nock.disableNetConnect();
    var scope = nock('http://metadata.google.internal')
                .get('/computeMetadata/v1/instance/id')
                .times(1)
                .reply(200, '1729');

    agent = trace.start({projectId: '0', logLevel: 0, forceNewAgent_: true});
    setTimeout(function() {
      common.runInTransaction(agent, function(end) {
        end();
        var span = common.getMatchingSpan(agent, spanPredicate);
        assert.equal(span.labels[traceLabels.GCE_INSTANCE_ID], 1729);
        scope.done();
        done();
      });
    }, 500);
  });

  it('shouldn\'t add id or hostname labels if not present', function(done) {
    nock.disableNetConnect();
    agent = trace.start({projectId: '0', logLevel: 0, forceNewAgent_: true});
    setTimeout(function() {
      common.runInTransaction(agent, function(end) {
        end();
        var span = common.getMatchingSpan(agent, spanPredicate);
        assert(span.labels[traceLabels.GCE_HOSTNAME],
            require('os').hostname());
        assert(!span.labels[traceLabels.GCE_INSTANCE_ID]);
        done();
      });
    }, 500);
  });

  it('should attach gae_module labels when available', function(done) {
    process.env.GAE_MODULE_NAME = 'foo';
    process.env.GAE_MODULE_VERSION = '20151119t120000';
    process.env.GAE_MINOR_VERSION = '91992';
    agent = trace.start({projectId: '0', logLevel: 0, forceNewAgent_: true});
    setTimeout(function() {
      common.runInTransaction(agent, function(end) {
        end();
        var span = common.getMatchingSpan(agent, spanPredicate);
        assert.equal(span.labels[traceLabels.GAE_MODULE_NAME], 'foo');
        assert.equal(span.labels[traceLabels.GAE_MODULE_VERSION],
          '20151119t120000');
        assert.equal(span.labels[traceLabels.GAE_VERSION],
          'foo:20151119t120000.91992');
        done();
      });
    }, 500);
  });

  it('should omit module name from gae_version label when default', function(done) {
    process.env.GAE_MODULE_NAME = 'default';
    process.env.GAE_MODULE_VERSION = '20151119t130000';
    process.env.GAE_MINOR_VERSION = '81818';
    agent = trace.start({projectId: '0', logLevel: 0, forceNewAgent_: true});
    setTimeout(function() {
      common.runInTransaction(agent, function(end) {
        end();
        var span = common.getMatchingSpan(agent, spanPredicate);
        assert.equal(span.labels[traceLabels.GAE_MODULE_NAME],
          'default');
        assert.equal(span.labels[traceLabels.GAE_MODULE_VERSION],
          '20151119t130000');
        assert.equal(span.labels[traceLabels.GAE_VERSION],
          '20151119t130000.81818');
        done();
      });
    }, 500);
  });

  it('gae_module_name should default to the metadata hostname if env. var. ' +
     'absent',
    function(done) {
      nock.disableNetConnect();
      var scope = nock('http://metadata.google.internal')
                  .get('/computeMetadata/v1/instance/hostname')
                  .times(1)
                  .reply(200, 'host');

      delete process.env.GAE_MODULE_NAME;
      agent = trace.start({projectId: '0', logLevel: 0, forceNewAgent_: true});
      setTimeout(function() {
        common.runInTransaction(agent, function(end) {
          end();
          var span = common.getMatchingSpan(agent, spanPredicate);
          assert.equal(span.labels[traceLabels.GAE_MODULE_NAME],
            'host');
          scope.done();
          done();
        });
      }, 500);
    });

  it('gae_module_name should default to the local hostname as last resort',
    function(done) {
      nock.disableNetConnect();
      var scope = nock('http://metadata.google.internal')
                  .get('/computeMetadata/v1/instance/hostname')
                  .times(1)
                  .reply(404);

      delete process.env.GAE_MODULE_NAME;
      agent = trace.start({projectId: '0', logLevel: 0, forceNewAgent_: true});
      setTimeout(function() {
        common.runInTransaction(agent, function(end) {
          end();
          var span = common.getMatchingSpan(agent, spanPredicate);
          scope.done();
          assert.equal(span.labels[traceLabels.GAE_MODULE_NAME],
            require('os').hostname());
          done();
        });
      }, 500);
    });
});

function spanPredicate(span) {
  return span.name === 'outer';
}
