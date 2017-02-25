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
var newWarn = function(error) {
  if (error.indexOf('http') !== -1) {
    assert(false, error);
  }
};

var common = require('./plugins/common.js');

nock.disableNetConnect();

describe('test-no-self-tracing', function() {
  it('should not trace metadata queries', function(done) {
    delete process.env.GCLOUD_PROJECT;
    var scope = nock('http://metadata.google.internal')
                .get('/computeMetadata/v1/instance/hostname').reply(200)
                .get('/computeMetadata/v1/instance/id').reply(200)
                .get('/computeMetadata/v1/project/project-id').reply(200);
    var agent = require('..').start({forceNewAgent_: true});
    require('http'); // Must require http to force patching of the module
    var oldWarn = common.replaceWarnLogger(agent, newWarn);
    setTimeout(function() {
      common.replaceWarnLogger(agent, oldWarn);
      scope.done();
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
    var agent = require('..').start({
      projectId: '0',
      bufferSize: 1,
      forceNewAgent_: true
    });
    common.avoidTraceWriterAuth(agent);
    require('http'); // Must require http to force patching of the module
    var oldWarn = common.replaceWarnLogger(agent, newWarn);
    common.runInTransaction(agent, function(end) {
      end();
      setTimeout(function() {
        assert.equal(common.getTraces(agent).length, 0);
        common.replaceWarnLogger(agent, oldWarn);
        metadataScope.done();
        apiScope.done();
        done();
      }, 200); // Need to wait for publish attempt
    });
  });
});
