/**
 * Copyright 2018 Google Inc. All Rights Reserved.
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

import * as testTraceModule from './trace';
import { Tracer } from '../src/plugin-types';
import { express_4 } from '../src/plugins/types';
import { Server } from 'http';
import { AddressInfo } from 'net';
import axios from 'axios';
import { SpanKind } from '../src/trace';
import * as assert from 'assert';

const FUNCTION_NAME = 'my-function';

describe('Custom span names in GCF', () => {
  let oldXGoogleFunctionName: string|undefined;
  let tracer: Tracer;
  let server: Server;
  let port: number;

  before(() => {
    // Replace X_GOOGLE_FUNCTION_NAME with a test value.
    oldXGoogleFunctionName = process.env.X_GOOGLE_FUNCTION_NAME;
    process.env.X_GOOGLE_FUNCTION_NAME = FUNCTION_NAME;
    // Don't mock the plugin loader.
    testTraceModule.setPluginLoaderForTest();
    // Start the Trace Agent.
    tracer = testTraceModule.start({
      plugins: {
        express: `${__dirname}/fixtures/plugin-express-gcf`
      }
    });
    // Start the server.
    const express: typeof express_4 = require('express');
    const app = express();
    app.get('/check', (req, res) => {
      res.send('ok');
    });
    app.get('/execute', (req, res) => {
      res.send('hello world');
    });
    server = app.listen(0);
    port = (server.address() as AddressInfo).port;
  });

  after(() => {
    // Restore the plugin loader mock.
    testTraceModule.setPluginLoaderForTest(testTraceModule.TestPluginLoader);
    // Close the server.
    server.close();
    // Restore the value of X_GOOGLE_FUNCTION_NAME.
    process.env.X_GOOGLE_FUNCTION_NAME = oldXGoogleFunctionName;
  });

  afterEach(() => {
    testTraceModule.clearTraceData();
  });

  it('maps /execute to the function name', async () => {
    await axios.get(`http://localhost:${port}/execute`);
    const span = testTraceModule.getOneSpan(span => span.kind === SpanKind.RPC_SERVER);
    assert.strictEqual(span.name, FUNCTION_NAME);
  });

  it('does not map /check to a different span name', async () => {
    await axios.get(`http://localhost:${port}/check`);
    const span = testTraceModule.getOneSpan(span => span.kind === SpanKind.RPC_SERVER);
    assert.strictEqual(span.name, '/check');
  });
});
