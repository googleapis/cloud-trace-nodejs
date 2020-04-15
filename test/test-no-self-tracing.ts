// Copyright 2015 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {FORCE_NEW} from '../src/util';
import {HOST_ADDRESS} from 'gcp-metadata';
import {describe, it} from 'mocha';
import * as assert from 'assert';
import * as nock from 'nock';
const newWarn = function (error) {
  if (error.indexOf('http') !== -1) {
    assert(false, error);
  }
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const common = require('./plugins/common' /*.js*/);

nock.disableNetConnect();

describe('test-no-self-tracing', () => {
  it('should not trace metadata queries', done => {
    const scope = nock(HOST_ADDRESS)
      .get('/computeMetadata/v1/instance/hostname')
      .reply(200)
      .get('/computeMetadata/v1/instance/id')
      .reply(200);
    require('../..').start({[FORCE_NEW]: true});
    require('http'); // Must require http to force patching of the module
    const oldWarn = common.replaceWarnLogger(newWarn);
    setTimeout(() => {
      common.replaceWarnLogger(oldWarn);
      scope.done();
      done();
    }, 200); // Need to wait for metadata access attempt
  });

  it('should not trace publishes', done => {
    const metadataScope = nock(HOST_ADDRESS)
      .get('/computeMetadata/v1/instance/hostname')
      .reply(200)
      .get('/computeMetadata/v1/instance/id')
      .reply(200);
    const apiScope = nock('https://cloudtrace.googleapis.com')
      .patch('/v1/projects/0/traces')
      .reply(200);
    delete process.env.GCLOUD_PROJECT;
    require('../..').start({
      projectId: '0',
      bufferSize: 1,
      [FORCE_NEW]: true,
    });
    common.avoidTraceWriterAuth();
    require('http'); // Must require http to force patching of the module
    const oldWarn = common.replaceWarnLogger(newWarn);
    common.runInTransaction(end => {
      end();
      setTimeout(() => {
        assert.strictEqual(common.getTraces().length, 0);
        common.replaceWarnLogger(oldWarn);
        metadataScope.done();
        apiScope.done();
        done();
      }, 200); // Need to wait for publish attempt
    });
  });
});

export default {};
