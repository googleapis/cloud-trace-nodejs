// Copyright 2019 Google LLC
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

import * as fetchTypes from 'node-fetch'; // For types only.
import * as testTraceModule from '../trace';
import * as assert from 'assert';
import {describe, it} from 'mocha';
import {describeInterop} from '../utils';
import {Express4} from '../web-frameworks/express';
import {Express4Secure} from '../web-frameworks/express-secure';
import {Agent} from 'https';
import {SpanKind} from '../../src/trace';

// Server abstraction class definitions. These are borrowed from web framework
// tests -- which are useful because they already expose a Promise API.
const servers = {
  http: Express4,
  https: Express4Secure,
};

/**
 * This test is needed because @google-cloud/common uses node-fetch under the
 * covers, so there is a possibility that we miss the opportunity to patch
 * http/https core modules. This occurs when the user requires `node-fetch`,
 * and never transitively requires (one of) `http` or `https` outside of
 * `node-fetch`, because then the plugin loader will never get the chance to
 * hook into a `http` or `https` module require.
 */
describeInterop<typeof fetchTypes & typeof fetchTypes.default>(
  'node-fetch',
  fixture => {
    before(() => {
      testTraceModule.setPluginLoaderForTest();
      testTraceModule.setCLSForTest();
    });

    after(() => {
      testTraceModule.setPluginLoaderForTest(testTraceModule.TestPluginLoader);
      testTraceModule.setCLSForTest(testTraceModule.TestCLS);
    });

    beforeEach(() => {
      testTraceModule.clearTraceData();
    });

    for (const protocol of Object.keys(servers) as Array<
      keyof typeof servers
    >) {
      it(`works with the Trace Agent, ${protocol}`, async () => {
        // Set up a server. To preserve the condition described in the top-level
        // description of this test, we ensure that this constructor is called
        // before the Trace Agent is started, so that the Trace Agent never has
        // an opportunity to patch http or https upon user require.
        const server = new servers[protocol]();
        // Require node-fetch once before starting the Trace Agent. We do this
        // in lieu of letting it be required when the Trace Agent is started,
        // because we've mocked out the Trace Writer instance that would
        // require node-fetch in typical usage.
        fixture.require();
        const tracer = testTraceModule.start();
        const fetch = fixture.require();

        // Set up the server.
        server.addHandler({
          path: '/',
          hasResponse: true,
          fn: async () => ({statusCode: 200, message: 'OK'}),
        });
        const port = server.listen(0);

        // Allow self-signed certificates.
        let agent: Agent | undefined;
        if (protocol === 'https') {
          agent = new Agent({
            rejectUnauthorized: false,
          });
        }

        try {
          // Make a request against the above server.
          await tracer.runInRootSpan({name: 'outer'}, async span => {
            assert.ok(tracer.isRealSpan(span));
            const response = await fetch(`${protocol}://localhost:${port}`, {
              agent,
            });
            assert.strictEqual(await response.text(), 'OK');
            span.endSpan();
          });

          // Get the trace that represents the root span from above..
          const traces = testTraceModule.getOneTrace(trace =>
            trace.spans.some(span => span.name === 'outer')
          );
          // There should be an HTTP client span.
          assert.ok(
            traces.spans.some(span => span.kind === SpanKind.RPC_CLIENT)
          );
        } finally {
          server.shutdown();
        }
      });
    }
  }
);
