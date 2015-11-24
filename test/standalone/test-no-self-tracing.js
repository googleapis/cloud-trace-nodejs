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
var newDebug = function(error) {
  if (error.indexOf('http') !== -1) {
    assert(false, arguments);
  }
};

describe('test-no-self-tracing', function() {
  it('should not trace metadata queries', function(done) {
    delete process.env.GCLOUD_PROJECT_NUM;
    var scope = nock('http://metadata.google.internal')
                .get('/computeMetadata/v1/instance/hostname').reply(200)
                .get('/computeMetadata/v1/instance/id').reply(200)
                .get('/computeMetadata/v1/project/numeric-project-id').reply(200);
    var agent = require('../..').start();
    require('http'); // Must require http to force patching of the module
    var oldDebug = agent.private_().logger.debug;
    agent.private_().logger.debug = newDebug;
    setTimeout(function() {
      agent.private_().logger.debug = oldDebug;
      scope.done();
      agent.stop();
      done();
    }, 20); // Need to wait for metadata access attempt
  });
});
