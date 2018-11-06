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
import axiosModule from 'axios';
import * as cluster from 'cluster';
import {Server} from 'http';
import {AddressInfo} from 'net';

import * as cls from '../src/cls';
import {express_4 as expressModule} from '../src/plugins/types';

import * as testTraceModule from './trace';
import {assertSpanDuration, DEFAULT_SPAN_DURATION, isServerSpan, wait} from './utils';

describe('test-trace-cluster', () => {
  let axios: typeof axiosModule;
  let express: typeof expressModule;
  before(() => {
    testTraceModule.setCLSForTest();
    testTraceModule.setPluginLoaderForTest();
    testTraceModule.start();
    express = require('express');
    axios = require('axios');
  });

  after(() => {
    testTraceModule.setCLSForTest(testTraceModule.TestCLS);
    testTraceModule.setPluginLoaderForTest(testTraceModule.TestPluginLoader);
  });

  it('should not interfere with express span', async () => {
    if (cluster.isMaster) {
      await new Promise(resolve => {
        const worker = cluster.fork();
        worker.on('exit', code => {
          assert.strictEqual(code, 0);
          console.log('Success!');
          resolve();
        });
      });
    } else {
      const app = express();
      app.get('/', async (req, res) => {
        await wait(DEFAULT_SPAN_DURATION);
        res.send('hello!');
      });
      const server = await new Promise<Server>(resolve => {
        const server = app.listen(0, () => resolve(server));
      });
      const port = (server.address() as AddressInfo).port;

      let recordedTime = Date.now();
      await testTraceModule.get().runInRootSpan({name: 'outer'}, async span => {
        assert.ok(span);
        await axios.get(`http://localhost:${port}`);
        span!.endSpan();
      });
      recordedTime = Date.now() - recordedTime;
      const serverSpan = testTraceModule.getOneSpan(isServerSpan);
      assertSpanDuration(serverSpan, [DEFAULT_SPAN_DURATION, recordedTime]);
      cluster.worker.disconnect();
      server.close();
    }
  });
});
