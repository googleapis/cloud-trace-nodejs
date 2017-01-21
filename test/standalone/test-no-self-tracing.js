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
var request = require('request');
var newDebug = function(error) {
  if (error.indexOf('http') !== -1) {
    assert(false, error);
  }
};

nock.disableNetConnect();

describe('test-no-self-tracing', function() {
  it('should not trace metadata queries', function(done) {
    delete process.env.GCLOUD_PROJECT;
    var scope = nock('http://metadata.google.internal')
                .get('/computeMetadata/v1/instance/hostname').reply(200)
                .get('/computeMetadata/v1/instance/id').reply(200)
                .get('/computeMetadata/v1/project/project-id').reply(200);
    var agent = require('../..')().startAgent();
    require('http'); // Must require http to force patching of the module
    var oldDebug = agent.private_().logger.debug;
    agent.private_().logger.debug = newDebug;
    setTimeout(function() {
      agent.private_().logger.debug = oldDebug;
      scope.done();
      agent.stop();
      done();
    }, 200); // Need to wait for metadata access attempt
  });

  it('should not trace publishes', function(done) {
    process.env.GCLOUD_PROJECT = 0;
    var metadataScope = nock('http://metadata.google.internal')
                .get('/computeMetadata/v1/instance/hostname').reply(200)
                .get('/computeMetadata/v1/instance/id').reply(200);
    var apiScope = nock('https://cloudtrace.googleapis.com')
                .patch('/v1/projects/0/traces').reply(200);
    var agent = require('../..')().startAgent({ projectId: '0', bufferSize: 1 });
    agent.private_().traceWriter.request_ = request;
    require('http'); // Must require http to force patching of the module
    var oldDebug = agent.private_().logger.debug;
    agent.private_().logger.debug = newDebug;
    agent.private_().namespace.run(function() {
      agent.private_().createRootSpanData('hi').close();
      setTimeout(function() {
        assert.equal(agent.private_().traceWriter.buffer_.length, 0);
        agent.private_().logger.debug = oldDebug;
        metadataScope.done();
        apiScope.done();
        agent.stop();
        done();
      }, 200); // Need to wait for publish attempt
    });
  });
});
