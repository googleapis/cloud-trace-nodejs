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

import * as assert from 'assert';
import * as nock from 'nock';
import {disableNetConnect, enableNetConnect} from 'nock';
import * as path from 'path';

import {oauth2, patchTraces} from './nocks';
import * as trace from './trace';
import {plan} from './utils';

interface TestCredentials {
  client_id?: string;
  client_secret?: string;
  refresh_token?: string;
  private_key?: string;
  type?: string;
}

function queueSpans(n: number) {
  const traceApi = trace.get();
  for (let i = 0; i < n; i++) {
    traceApi.runInRootSpan({name: `trace-${i}`}, (rootSpan) => {
      assert.ok(rootSpan);
      rootSpan!.endSpan();
    });
  }
}

describe('Credentials Configuration', () => {
  let savedProject: string|undefined;

  before(() => {
    savedProject = process.env.GCLOUD_PROJECT;
    process.env.GCLOUD_PROJECT = '0';
    trace.setTraceWriter();
    disableNetConnect();
  });

  after(() => {
    process.env.GCLOUD_PROJECT = savedProject;
    trace.setTraceWriter(trace.TestTraceWriter);
    enableNetConnect();
  });

  it('should use the keyFilename field of the config object', (done) => {
    const progress = plan(done, 2);
    const credentials: TestCredentials =
        require('./fixtures/gcloud-credentials.json');
    const config = {
      bufferSize: 2,
      keyFilename: path.join('test', 'fixtures', 'gcloud-credentials.json'),
      forceNewAgent_: true
    };
    const agent = trace.start(config);
    const scope = oauth2<TestCredentials>((body) => {
      assert.strictEqual(body.client_id, credentials.client_id);
      assert.strictEqual(body.client_secret, credentials.client_secret);
      assert.strictEqual(body.refresh_token, credentials.refresh_token);
      progress();
      return true;
    });
    // Since we have to get an auth token, this always gets intercepted second
    patchTraces('0', () => {
      scope.done();
      progress();
      return true;
    });
    queueSpans(2);
  });

  it('should use the credentials field of the config object', (done) => {
    const progress = plan(done, 2);
    const credentials: TestCredentials =
        require('./fixtures/gcloud-credentials.json');
    const config = {bufferSize: 2, credentials, forceNewAgent_: true};
    const agent = trace.start(config);
    const scope = oauth2<TestCredentials>((body) => {
      assert.strictEqual(body.client_id, credentials.client_id);
      assert.strictEqual(body.client_secret, credentials.client_secret);
      assert.strictEqual(body.refresh_token, credentials.refresh_token);
      progress();
      return true;
    });
    // Since we have to get an auth token, this always gets intercepted second
    patchTraces('0', () => {
      scope.done();
      progress();
      return true;
    });
    queueSpans(2);
  });

  it('should ignore keyFilename if credentials is provided', (done) => {
    const progress = plan(done, 2);
    const correctCredentials: TestCredentials = {
      client_id: 'a',
      client_secret: 'b',
      refresh_token: 'c',
      type: 'authorized_user'
    };
    const config = {
      bufferSize: 2,
      credentials: correctCredentials,
      keyFilename: path.join('test', 'fixtures', 'gcloud-credentials.json'),
      forceNewAgent_: true
    };
    const agent = trace.start(config);
    const scope = oauth2<TestCredentials>((body) => {
      assert.strictEqual(body.client_id, correctCredentials.client_id);
      assert.strictEqual(body.client_secret, correctCredentials.client_secret);
      assert.strictEqual(body.refresh_token, correctCredentials.refresh_token);
      progress();
      return true;
    });
    // Since we have to get an auth token, this always gets intercepted second
    patchTraces('0', () => {
      scope.done();
      progress();
      return true;
    });
    queueSpans(2);
  });
});
