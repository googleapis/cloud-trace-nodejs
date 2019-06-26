/**
 * Copyright 2019 Google LLC
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
import axiosModule from 'axios';
import * as semver from 'semver';

import * as testTraceModule from './trace';
import {assertSpanDuration, wait} from './utils';
import {Hapi17} from './web-frameworks/hapi17';
import {Hapi12, Hapi15, Hapi16, Hapi8} from './web-frameworks/hapi8_16';

// The list of web frameworks to test.
const FRAMEWORKS = [Hapi12, Hapi15, Hapi16, Hapi8, Hapi17];

describe('Web framework tracing', () => {
  let axios: typeof axiosModule;
  before(() => {
    testTraceModule.setCLSForTest();
    testTraceModule.setPluginLoaderForTest();
    testTraceModule.start();
    axios = require('axios');
  });

  after(() => {
    testTraceModule.setCLSForTest(testTraceModule.TestCLS);
    testTraceModule.setPluginLoaderForTest(testTraceModule.TestPluginLoader);
  });

  FRAMEWORKS.forEach(webFrameworkConstructor => {
    const commonName = webFrameworkConstructor.commonName;
    const versionRange = webFrameworkConstructor.versionRange;

    // Skip this set for incompatible versions of Node
    const skip = !semver.satisfies(process.version, versionRange);

    (skip ? describe.skip : describe)(`Tracing ${commonName}`, () => {
      // How this test works:
      // On some WebFramework implementations (currently just Hapi), we can
      // add "tail work" that is allowed to finish after the request ends.
      // Hapi 8-16 provides built-in support to keep track of these types of
      // calls, while Hapi 17 provides a more general mechanism for managing
      // request lifecycle (both before and after the response has been sent.)
      // Although the Trace Agent itself doesn't have any special behavior
      // to account for the Hapi APIs, we would expect that a user using the
      // tails API to observe a child span with the correct tail duration.
      it('Traces tail calls correctly', async () => {
        const framework = new webFrameworkConstructor();
        try {
          // "tail work" which will complete independent of the server response.
          framework.addHandler({
            path: '/tail',
            hasResponse: false,
            blocking: false,
            fn: async () => {
              const child = testTraceModule
                .get()
                .createChildSpan({name: 'my-tail-work'});
              await wait(100);
              child.endSpan();
            },
          });
          framework.addHandler({
            path: '/tail',
            hasResponse: true,
            fn: async () => ({
              statusCode: 200,
              message: 'there is still work to be done',
            }),
          });
          // A Promise that resolves when the tail call is finished.
          const tailCallMade = new Promise(resolve =>
            framework.once('tail', resolve)
          );
          // Start listening.
          const port = await framework.listen(0);
          // Hit the server.
          await testTraceModule
            .get()
            .runInRootSpan({name: 'outer'}, async span => {
              await axios.get(`http://localhost:${port}/tail`);
              span.endSpan();
            });
          // A child span should have been observed by the Trace Writer.
          const childSpanBeforeEnd = testTraceModule.getOneSpan(
            span => span.name === 'my-tail-work'
          );
          assert.ok(!childSpanBeforeEnd.endTime);
          // Simulate a "flush". The Trace Writer itself will not publish a
          // span that doesn't have an end time.
          testTraceModule.clearTraceData();
          await tailCallMade;
          // The same child span should have been observed again by the
          // Trace Writer.
          const childSpanAfterEnd = testTraceModule.getOneSpan(
            span => span.name === 'my-tail-work'
          );
          assert.strictEqual(
            childSpanAfterEnd.spanId,
            childSpanBeforeEnd.spanId
          );
          // The child span only needs to be at least 100ms.
          assertSpanDuration(childSpanAfterEnd, [100, Infinity]);
        } finally {
          framework.shutdown();
          testTraceModule.clearTraceData();
        }
      });
    });
  });
});
