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

import {Service} from '@google-cloud/common';
import * as assert from 'assert';
import {GoogleAuth} from 'google-auth-library';
import {JWTInput} from 'google-auth-library/build/src/auth/credentials';
import {RefreshOptions} from 'google-auth-library/build/src/auth/oauth2client';
import {OutgoingHttpHeaders} from 'http';
import * as nock from 'nock';
import * as os from 'os';
import * as path from 'path';
import {Response} from 'request';  // Only for type declarations.
import * as shimmer from 'shimmer';

import {SpanKind, Trace} from '../src/trace';
import {TraceLabels} from '../src/trace-labels';
import {TraceWriter, TraceWriterConfig} from '../src/trace-writer';

import {TestLogger} from './logger';
import {hostname, instanceId, oauth2} from './nocks';
import {wait} from './utils';

interface TestCredentials {
  client_id?: string;
  client_secret?: string;
  refresh_token?: string;
  private_key?: string;
  type?: string;
}

interface DecorateRequestOptions {
  method: string;
  uri: string;
  body: string;
  headers: OutgoingHttpHeaders;
}

/**
 * Set up nocks to simulate no metadata server.
 * Returns an object where calling done() can assert that endpoints were hit,
 * unless cancel() was called first.
 */
function mockNoMetadata() {
  const scopes = [instanceId, hostname].map(f => f(404));
  let cancelled = false;
  return {
    done: () => cancelled || scopes.forEach(s => s.done()),
    cancel: () => cancelled = true
  };
}

function createDummyTrace(): Trace {
  return {
    projectId: '',
    traceId: '',
    spans: [{
      labels: {},
      startTime: '',
      endTime: '',
      kind: SpanKind.RPC_SERVER,
      name: '',
      spanId: ''
    }]
  };
}

describe('Trace Writer', () => {
  const pjson = require('../../package.json');
  const DEFAULT_CONFIG: TraceWriterConfig = {
    onUncaughtException: 'ignore',
    bufferSize: Infinity,
    flushDelaySeconds: 3600,
    stackTraceLimit: 10,
    maximumLabelValueSize: 1 << 16,
    serviceContext: {}
  };
  const logger = new TestLogger();
  // By default, this is always assigned so that a project ID of '0' is yielded.
  // We override this when we want a different value.
  let getProjectIdOverride: () => Promise<string>;
  // Currently, each individual test always both constructs and initializes
  // a new TraceWriter instance. For that reason we always keep the oauth2
  // endpoint nocked...
  let oauth2Scope: nock.Scope;
  // ...and allow one query to each of the two metadata endpoints per test.
  let metadataScopes: {done: () => void, cancel: () => void};

  before(() => {
    nock.disableNetConnect();
    oauth2Scope = oauth2().persist();
    shimmer.wrap(
        Service.prototype, 'getProjectId', () => function(this: Service) {
          return getProjectIdOverride().then(projectId => {
            this.projectId = projectId;
            return projectId;
          });
        });
  });

  after(() => {
    shimmer.unwrap(Service.prototype, 'getProjectId');
    oauth2Scope.done();  // It will likely be called at least once
    nock.enableNetConnect();
  });

  beforeEach(() => {
    getProjectIdOverride = () => Promise.resolve('0');
    metadataScopes = mockNoMetadata();
    logger.clearLogs();
  });

  afterEach(() => {
    metadataScopes.done();
    nock.cleanAll();
  });

  describe('constructor', () => {
    // Utility method which, for a given config, constructs a new TraceWriter
    // instance, and gets the credentials that would be used upon initiating
    // a trace batch publish.
    const captureCredentialsForConfig =
        async (config: Partial<TraceWriterConfig>) => {
      const writer =
          new TraceWriter(Object.assign({}, DEFAULT_CONFIG, config), logger);
      let capturedJson;
      shimmer.wrap(writer.authClient, 'fromJSON', (fromJSON) => {
        return function(
            this: GoogleAuth, json: JWTInput, options?: RefreshOptions) {
          capturedJson = json;
          return fromJSON.call(this, json, options);
        };
      });
      await writer.authClient.getClient();
      shimmer.unwrap(writer.authClient, 'fromJSON');
      return capturedJson;
    };

    beforeEach(() => {
      // Just for this scenario, use real metadata endpoints
      metadataScopes.cancel();
      nock.cleanAll();
    });

    it('should use the keyFilename field of the config object', async () => {
      const expectedCredentials: TestCredentials =
          require('./fixtures/gcloud-credentials.json');
      const actualCredentials = await captureCredentialsForConfig({
        projectId: 'my-project',
        keyFilename: path.join('test', 'fixtures', 'gcloud-credentials.json')
      });
      assert.deepStrictEqual(actualCredentials, expectedCredentials);
    });

    it('should use the credentials field of the config object', async () => {
      const expectedCredentials: TestCredentials =
          require('./fixtures/gcloud-credentials.json');
      const actualCredentials = await captureCredentialsForConfig(
          {projectId: 'my-project', credentials: expectedCredentials});
      assert.deepStrictEqual(actualCredentials, expectedCredentials);
    });

    it('should ignore keyFilename if credentials is provided', async () => {
      const expectedCredentials: TestCredentials = {
        client_id: 'a',
        client_secret: 'b',
        refresh_token: 'c',
        type: 'authorized_user'
      };
      const actualCredentials = await captureCredentialsForConfig({
        projectId: 'my-project',
        keyFilename: path.join('test', 'fixtures', 'gcloud-credentials.json'),
        credentials: expectedCredentials
      });
      assert.deepStrictEqual(actualCredentials, expectedCredentials);
    });
  });

  describe('initialization process', () => {
    it('gets the project ID when none is passed in', async () => {
      const writer = new TraceWriter(DEFAULT_CONFIG, logger);
      getProjectIdOverride = () => Promise.resolve('my-project');
      await writer.initialize();
      assert.strictEqual(writer.projectId, 'my-project');
      writer.stop();
    });

    it(`doesn't call Service#getProjectId if project ID is passed`,
       async () => {
         const writer = new TraceWriter(
             Object.assign({projectId: 'my-project'}, DEFAULT_CONFIG), logger);
         getProjectIdOverride = () => Promise.resolve('my-different-project');
         await writer.initialize();
         assert.strictEqual(writer.projectId, 'my-project');
         writer.stop();
       });

    it(`errors when a project ID can't be determined`, async () => {
      const writer = new TraceWriter(DEFAULT_CONFIG, logger);
      getProjectIdOverride = () => Promise.reject(new Error());
      try {
        await writer.initialize();
      } catch (e) {
        // We can't know whether the metadata endpoints are called, so don't
        // check them.
        metadataScopes.cancel();
        writer.stop();
        return;
      }
      assert.fail('initialize should have thrown.');
    });

    it('assigns default labels based on metadata', async () => {
      const writer = new TraceWriter(DEFAULT_CONFIG, logger);
      // Just for this scenario, use real metadata endpoints
      metadataScopes.cancel();
      nock.cleanAll();
      // Flakes suggest that nock.cleanAll works asynchronously, so continue
      // the test on a separate tick.
      await new Promise(res => setImmediate(res));
      const gotInstanceId = instanceId(200, () => 'my-instance-id');
      const gotHostname = hostname(200, () => 'my-hostname');
      await writer.initialize();
      assert.strictEqual(
          writer.defaultLabels[TraceLabels.GCE_INSTANCE_ID], 'my-instance-id');
      assert.strictEqual(
          writer.defaultLabels[TraceLabels.GCE_HOSTNAME], 'my-hostname');
      assert.strictEqual(
          writer.defaultLabels[TraceLabels.GAE_MODULE_NAME], 'my-hostname');
      gotInstanceId.done();
      gotHostname.done();
      writer.stop();
    });

    it('assigns values for default labels in lieu of metadata', async () => {
      const writer = new TraceWriter(DEFAULT_CONFIG, logger);
      await writer.initialize();
      assert.ok(!writer.defaultLabels[TraceLabels.GCE_INSTANCE_ID]);
      assert.strictEqual(
          writer.defaultLabels[TraceLabels.GCE_HOSTNAME], os.hostname());
      assert.strictEqual(
          writer.defaultLabels[TraceLabels.GAE_MODULE_NAME], os.hostname());
      writer.stop();
    });

    it('assigns other well-known labels', async () => {
      const writer = new TraceWriter(
          Object.assign({}, DEFAULT_CONFIG, {
            serviceContext:
                {service: 'foo', version: 'bar', minorVersion: 'baz'}
          }),
          logger);
      await writer.initialize();
      assert.strictEqual(
          writer.defaultLabels[TraceLabels.AGENT_DATA],
          `node ${pjson.name} v${pjson.version}`);
      assert.strictEqual(
          writer.defaultLabels[TraceLabels.GAE_MODULE_NAME], 'foo');
      assert.strictEqual(
          writer.defaultLabels[TraceLabels.GAE_MODULE_VERSION], 'bar');
      assert.strictEqual(
          writer.defaultLabels[TraceLabels.GAE_VERSION], 'foo:bar.baz');
      writer.stop();
    });
  });

  describe('writing and publishing', () => {
    // When MockedRequestTraceWriter is used, this function dictates the
    // status code returned when Service#request is called.
    // By default, a 200 status code is always returned.
    let overrideRequestResponse: () => Promise<{statusCode: number}>;
    let capturedRequestOptions: DecorateRequestOptions|null = null;
    // We use this class to mock Service#request. Testing this function is the
    // responsibility of @google-cloud/common.
    // It also allows us to capture arguments upon trace publish.
    class MockedRequestTraceWriter extends TraceWriter {
      request(
          options: DecorateRequestOptions,
          cb?: (err: Error|null, _?: null, response?: Response) => void):
          Promise<Response> {
        capturedRequestOptions = options;
        return overrideRequestResponse().then(
                   (response) => {
                     if (cb) cb(null, null, response as Response);
                     return response;
                   },
                   (err) => {
                     if (cb) cb(err);
                     throw err;
                   }) as Promise<Response>;
      }
    }

    beforeEach(() => {
      overrideRequestResponse = () => Promise.resolve({statusCode: 200});
      capturedRequestOptions = null;
    });

    it('appends project ID and default labels to written traces', async () => {
      const writer = new MockedRequestTraceWriter(
          Object.assign({}, DEFAULT_CONFIG, {bufferSize: 1}), logger);
      await writer.initialize();
      writer.writeTrace(createDummyTrace());
      // TraceWriter#publish should be called soon
      // (Promise task queue drain + immediate).
      await wait(200);
      const publishedTraces: Trace[] =
          JSON.parse(capturedRequestOptions!.body).traces;
      assert.strictEqual(publishedTraces.length, 1);
      assert.strictEqual(publishedTraces[0].projectId, '0');
      assert.ok(publishedTraces[0].spans[0].endTime);
      Object.keys(writer.defaultLabels).forEach(key => {
        assert.strictEqual(
            publishedTraces[0].spans[0].labels[key], writer.defaultLabels[key]);
      });
      writer.stop();
    });

    describe('condition for publishing traces', () => {
      it('is satisfied when the buffer is full', async () => {
        const NUM_SPANS = 5;
        const writer = new MockedRequestTraceWriter(
            Object.assign({}, DEFAULT_CONFIG, {bufferSize: NUM_SPANS}), logger);
        await writer.initialize();
        writer.writeTrace(createDummyTrace());
        await wait(200);
        // Didn't publish yet
        assert.ok(!capturedRequestOptions);
        for (let i = 1; i < NUM_SPANS; i++) {
          writer.writeTrace(createDummyTrace());
        }
        await wait(200);
        const publishedTraces: Trace[] =
            JSON.parse(capturedRequestOptions!.body).traces;
        assert.strictEqual(publishedTraces.length, NUM_SPANS);
        writer.stop();
      });

      it('is satisfied periodically', async () => {
        const writer = new MockedRequestTraceWriter(
            Object.assign({}, DEFAULT_CONFIG, {flushDelaySeconds: 1}), logger);
        await writer.initialize();
        // Two rounds to ensure that it's periodical
        for (let round = 0; round < 2; round++) {
          writer.writeTrace(createDummyTrace());
          await wait(500);
          // Didn't publish yet
          assert.ok(!capturedRequestOptions);
          await wait(600);
          assert.ok(capturedRequestOptions);
          capturedRequestOptions = null;
        }
        writer.stop();
      });
    });

    it('emits an error if there was an error publishing', async () => {
      overrideRequestResponse = () => Promise.reject(new Error());
      const writer = new MockedRequestTraceWriter(
          Object.assign({}, DEFAULT_CONFIG, {bufferSize: 1}), logger);
      await writer.initialize();
      writer.writeTrace(createDummyTrace());
      await wait(200);
      assert.strictEqual(
          logger.getNumLogsWith('error', 'TraceWriter#publish'), 1);
      writer.stop();
    });
  });
});
