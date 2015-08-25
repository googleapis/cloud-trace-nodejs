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
nock.disableNetConnect();

delete process.env.GCLOUD_PROJECT_NUM;

describe('agent stops gracefully', function() {

  it('should stop when the project number cannot be acquired', function(done) {
    this.timeout(4000);

    var scope = nock('http://metadata')
                .get('/computeMetadata/v1/project/numeric-project-id')
                .reply(200, '1729');

    var config = {enabled: true, logLevel: 0};
    require('../..').start(config);
    setTimeout(function() {
      assert.strictEqual(config.enabled, false);
      scope.done();
      done();
    }, 2000);
  });

});
