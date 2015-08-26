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

nock.disableNetConnect();

delete process.env.GCLOUD_PROJECT_NUM;

describe('agent interaction with metadata service', function() {

  it('should stop when the project number cannot be acquired', function(done) {
    var scope = nock('http://metadata')
                .get('/computeMetadata/v1/project/numeric-project-id')
                .reply(404, 'foo');

    agent.start({logLevel: 0});
    setTimeout(function() {
      assert.strictEqual(agent.isActive(), false);
      scope.done();
      done();
    }, 500);
    agent.stop();
  });

  it('should not query metadata service when config.projectId is set',
    function() {
      agent.start({projectId: 0, logLevel: 0});
      agent.stop();
    });

  it('should not query metadata service when env. var. is set', function() {
    process.env.GCLOUD_PROJECT_NUM=0;
    agent.start({logLevel: 0});
    agent.stop();
    delete process.env.GCLOUD_PROJECT_NUM;
  });
});
