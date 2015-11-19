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
var agent = require('../..');
var traceLabels = require('../../lib/trace-labels.js');

nock.disableNetConnect();

delete process.env.GCLOUD_PROJECT_NUM;

describe('agent interaction with metadata service', function() {

  afterEach(function() {
    agent.stop();
  });

  it('should stop when the project number cannot be acquired', function(done) {
    nock.disableNetConnect();
    var scope = nock('http://metadata.google.internal')
                .get('/computeMetadata/v1/project/numeric-project-id')
                .times(2)
                .reply(404, 'foo');

    agent.start({logLevel: 0});
    setTimeout(function() {
      assert.ok(!agent.isActive());
      scope.done();
      done();
    }, 500);
  });

  it('should activate with projectId from metadata service', function(done) {
    nock.disableNetConnect();
    var scope = nock('http://metadata.google.internal')
                .get('/computeMetadata/v1/project/numeric-project-id')
                .times(2)
                .reply(200, '1234');
    agent.start({logLevel: 0});
    setTimeout(function() {
      assert.ok(agent.isActive());
      assert.equal(agent.private_().config().projectId, '1234');
      scope.done();
      done();
    }, 500);
  });

  it('should not query metadata service when config.projectId is set',
    function() {
      nock.disableNetConnect();
      agent.start({projectId: 0, logLevel: 0});
    });

  it('should not query metadata service when env. var. is set', function() {
    nock.disableNetConnect();
    process.env.GCLOUD_PROJECT_NUM=0;
    agent.start({logLevel: 0});
    delete process.env.GCLOUD_PROJECT_NUM;
  });

  it('should attach hostname to spans when provided', function(done) {
    nock.disableNetConnect();
    var scope = nock('http://metadata.google.internal')
                .get('/computeMetadata/v1/instance/hostname')
                .times(1)
                .reply(200, 'host');

    agent.start({projectId: 0, logLevel: 0});
    setTimeout(function() {
      agent.private_().namespace.run(function() {
        var spanData = agent.private_().createRootSpanData('name', 5, 0);
        spanData.close();
        assert.equal(spanData.span.labels[traceLabels.GCE_HOSTNAME], 'host');
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

    agent.start({projectId: 0, logLevel: 0});
    setTimeout(function() {
      agent.private_().namespace.run(function() {
        var spanData = agent.private_().createRootSpanData('name', 5, 0);
        spanData.close();
        assert.equal(spanData.span.labels[traceLabels.GCE_INSTANCE_ID], 1729);
        scope.done();
        done();
      });
    }, 500);
  });

  it('shouldn\'t add id or hostname labels if not present', function(done) {
    nock.disableNetConnect();
    agent.start({projectId: 0, logLevel: 0});
    setTimeout(function() {
      agent.private_().namespace.run(function() {
        var spanData = agent.private_().createRootSpanData('name', 5, 0);
        spanData.close();
        assert(spanData.span.labels[traceLabels.GCE_HOSTNAME],
            require('os').hostname());
        assert(!spanData.span.labels[traceLabels.GCE_INSTANCE_ID]);
        done();
      });
    }, 500);
  });

  it('should attach gae_module labels when available', function(done) {
    process.env.GAE_MODULE_NAME = 'foo';
    process.env.GAE_MODULE_VERSION = '20151119t120000';
    process.env.GAE_MINOR_VERSION = '91992';
    agent.start({projectId: 0, logLevel: 0});
    setTimeout(function() {
      agent.private_().namespace.run(function() {
        var spanData = agent.private_().createRootSpanData('name', 5, 0);
        spanData.close();
        assert.equal(spanData.span.labels[traceLabels.GAE_MODULE_NAME], 'foo');
        assert.equal(spanData.span.labels[traceLabels.GAE_MODULE_VERSION],
          '20151119t120000');
        assert.equal(spanData.span.labels[traceLabels.GAE_VERSION],
          'foo:20151119t120000.91992');
        done();
      });
    }, 500);
  });

  it('should omit module name from gae_version label when default', function(done) {
    process.env.GAE_MODULE_NAME = 'default';
    process.env.GAE_MODULE_VERSION = '20151119t130000';
    process.env.GAE_MINOR_VERSION = '81818';
    agent.start({projectId: 0, logLevel: 0});
    setTimeout(function() {
      agent.private_().namespace.run(function() {
        var spanData = agent.private_().createRootSpanData('name', 5, 0);
        spanData.close();
        assert.equal(spanData.span.labels[traceLabels.GAE_MODULE_NAME],
          'default');
        assert.equal(spanData.span.labels[traceLabels.GAE_MODULE_VERSION],
          '20151119t130000');
        assert.equal(spanData.span.labels[traceLabels.GAE_VERSION],
          '20151119t130000.81818');
        done();
      });
    }, 500);
  });

  it('gae_module_name should default to the hostname when env. var absent',
    function(done) {
      nock.disableNetConnect();
      var scope = nock('http://metadata.google.internal')
                  .get('/computeMetadata/v1/instance/hostname')
                  .times(1)
                  .reply(200, 'host');

      delete process.env.GAE_MODULE_NAME;
      agent.start({projectId: 0, logLevel: 0});
      setTimeout(function() {
        agent.private_().namespace.run(function() {
          var spanData = agent.private_().createRootSpanData('name', 5, 0);
          spanData.close();
          assert.equal(spanData.span.labels[traceLabels.GAE_MODULE_NAME],
            'host');
          scope.done();
          done();
        });
      }, 500);
    });
});
