/*
 * Copyright 2017 Google Inc. All Rights Reserved.
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

if (!process.env.TRACE_SYSTEM_TEST_PROJECT ||
    !process.env.TRACE_SYSTEM_TEST_KEYFILE) {
  console.error('system-test requires credentials to be available via ' +
    'environment. Please set TRACE_SYSTEM_TEST_PROJECT and ' +
    'TRACE_SYSTEM_TEST_KEYFILE.');
  process.exit(1);
}

const WRITE_CONSISTENCY_DELAY_MS = 20 * 1000;
const projectId = process.env.TRACE_SYSTEM_TEST_PROJECT;
const keyFilename = process.env.TRACE_SYSTEM_TEST_KEYFILE;

// trace-agent must be loaded before everything else.
require('../').start({
  projectId: projectId,
  keyFilename: keyFilename,
  flushDelaySeconds: 1
});

const assert = require('assert');
const googleAuth = require('google-auto-auth');
const got = require('got');
const queryString = require('querystring');
const uuid = require('uuid');

// TODO(ofrobots): this code should be moved to a better location. Perhaps
// google-auto-auth or google-auth-library.
function makeAuthorizedGot(auth) {
  function authorize(options) {
    return new Promise((resolve, reject) => {
      auth.authorizeRequest(options, (err, authorizedOptions) => {
        if (err) {
          return reject(err);
        }
        return resolve(authorizedOptions);
      });
    });
  }

  return (url, options) => {
    return authorize(options)
      .then((authorizedOptions) => {
        return got(url, authorizedOptions);
      });
  };
}

function listTraces(testPath) {
  const BASE_URI = `https://cloudtrace.googleapis.com/v1/projects/${projectId}`;
  const auth = googleAuth({
    keyFilename: keyFilename,
    scopes: ['https://www.googleapis.com/auth/trace.readonly']
  });
  const agot = makeAuthorizedGot(auth);

  const query = queryString.stringify({
    filter: `span:${testPath}`
  });
  const uri = `${BASE_URI}/traces?${query}`;

  return agot(uri, { json: true })
    .catch((err) => {
      console.error(err);
    })
    .then((response) => {
      const body = response.body;
      const promises = body.traces.map((trace) => {
        const uri = `${BASE_URI}/traces/${trace.traceId}`;
        return agot(uri, { json: true });
      });

      return Promise.all(promises).then((responses) => {
        return responses.map(response => response.body);
      });
    });
}

describe('express + datastore', () => {
  it('should be able to trace datastore (grpc) calls', (done) => {
    // Build a unique path so that we get unique trace span names.
    const testPath = `/test-${uuid.v4()}`;

    const express = require('express');
    const datastore = require('@google-cloud/datastore')({
      projectId: projectId,
      keyFilename: keyFilename,     
    });

    const app = express();
    app.get(testPath, (req, res) => {
      // Make a query to a non-existent datastore entity. This will get traced
      // regardless.
      const query = datastore.createQuery('Task').order('created');
      datastore.runQuery(query)
        .then((results) => {
          console.log('datastore results:', results);
          res.status(200).send('hello\n');
        });
    });

    var server = app.listen(8080, () => {
      console.log('server started');
      got.stream(`http://localhost:8080${testPath}`).pipe(process.stdout);
      setTimeout(() => {
        listTraces(testPath).then(verifyTraces);
      }, WRITE_CONSISTENCY_DELAY_MS);
    });

    function verifyTraces(traces) {
      assert.equal(traces.length, 1, 'there should be exactly one trace');

      const trace = traces[0];
      console.log(trace);
      assert.equal(trace.spans.length, 2, 'should be 2 spans: parent, child');
      const parent = trace.spans[0];
      const child = trace.spans[1];

      assert.equal(parent.name, testPath, 'should match unique path');
      assert.equal(child.name, 'grpc:/google.datastore.v1.Datastore/RunQuery');
      assert.equal(child.parentSpanId, parent.spanId);
      server.close();
      done();
    }
  });
});
