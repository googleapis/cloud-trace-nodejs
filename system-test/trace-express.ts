// Copyright 2017 Google LLC
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

// Note - The service account with the given credentials must have the
// following roles:
// - Cloud Trace Admin (cloudtrace.admin)
// - Cloud Datastore User (datastore.user)

// trace-agent must be loaded before everything else.
const tracer = require('../src').start({
  flushDelaySeconds: 1,
});

import * as assert from 'assert';
import {describe, it} from 'mocha';
import * as uuid from 'uuid';
import * as semver from 'semver';
import {Datastore} from '@google-cloud/datastore';
import {GoogleAuth} from 'google-auth-library';
import * as gaxios from 'gaxios';
import {Readable} from 'stream';

const WRITE_CONSISTENCY_DELAY_MS = 20 * 1000;
const EXPECTED_ENDPOINT = 'google.datastore.v1.Datastore/RunQuery';

const usingAsyncHooks = semver.satisfies(process.version, '>=8');
console.log(`Running system test with usingAsyncHooks=${usingAsyncHooks}`);

interface TraceResponse {
  traces: Array<{traceId: string}>;
}

async function listTraces(testPath: string) {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/trace.readonly'],
  });
  const projectId = await auth.getProjectId();
  const BASE_URI = `https://cloudtrace.googleapis.com/v1/projects/${projectId}`;
  const res = await auth.request<TraceResponse>({
    url: `${BASE_URI}/traces`,
    params: {
      filter: `span:${testPath}`,
    },
  });
  const body = res.data;
  const r = await Promise.all(
    body.traces.map(trace => {
      return auth.request({
        url: `${BASE_URI}/traces/${trace.traceId}`,
      });
    })
  );
  return r.map(r => r.data);
}

describe('express + datastore', () => {
  it('should be able to trace datastore (grpc) calls', async () => {
    // Build a unique path so that we get unique trace span names.
    const testPath = `/test-${uuid.v4()}`;
    const express = require('express');
    const datastore = new Datastore();

    const app = express();
    // tslint:disable-next-line no-any
    app.get(testPath, async (_: {}, res: any) => {
      // Make a query to a non-existent datastore entity. This will get traced
      // regardless.
      const query = datastore.createQuery('Task').order('created');
      const [results] = await datastore.runQuery(query);
      console.log('datastore results:', results);
      res.status(200).send('hello\n');
    });

    // tslint:disable-next-line no-any
    let server: any;
    await new Promise((resolve, reject) => {
      server = app.listen(8080, async () => {
        try {
          console.log('server started');
          const res = await gaxios.request<Readable>({
            url: `http://localhost:8080${testPath}`,
            responseType: 'stream',
          });
          res.data.pipe(process.stdout);
          await new Promise(r => setTimeout(r, WRITE_CONSISTENCY_DELAY_MS));
          const traces = await listTraces(testPath);
          console.log(traces);
          verifyTraces(traces);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });

    // tslint:disable-next-line no-any
    function verifyTraces(traces: any[]) {
      assert.strictEqual(traces.length, 1, 'there should be exactly one trace');
      const trace = traces[0];
      assert.ok(
        trace.spans.length >= 2,
        'should be at least 2 spans: parent, child'
      );
      const parent = trace.spans[0];
      // tslint:disable-next-line no-any
      const child = trace.spans.find((span: any) => {
        const urlLabelValue = span.labels[tracer.labels.HTTP_URL_LABEL_KEY];
        return (
          span.name === `grpc:/${EXPECTED_ENDPOINT}` ||
          (urlLabelValue && urlLabelValue.endsWith(EXPECTED_ENDPOINT))
        );
      });

      assert.strictEqual(parent.name, testPath, 'should match unique path');
      assert.ok(child);
      assert.strictEqual(child.parentSpanId, parent.spanId);
      server.close();
    }
  });
});
