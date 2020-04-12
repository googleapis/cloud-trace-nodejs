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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const common = require('./plugins/common' /*.js*/);
import * as assert from 'assert';
import * as http from 'http';
import {describe, it, before} from 'mocha';

describe('express + http with trace options header', () => {
  let agent;
  let express;
  before(() => {
    agent = require('../..').start({
      projectId: '0',
      samplingRate: 0,
    });
    express = require('express');
  });

  it('should trace when enabled', done => {
    const app = express();
    app.get('/', (req, res) => {
      setTimeout(() => {
        res.send('Hello World');
      }, 50);
    });
    const server = app.listen(common.serverPort, () => {
      const shouldTraceOptions = [1, 3, 5, 7];
      const shouldNotTraceOptions = [0, 2, 4, 6];
      sendRequests(agent, shouldTraceOptions, shouldTraceOptions.length, () => {
        sendRequests(agent, shouldNotTraceOptions, 0, () => {
          server.close();
          done();
        });
      });
    });
  });
});

function sendRequests(agent, options, expectedTraceCount, done) {
  let doneCount = 0;
  options.forEach(option => {
    const headers = {};
    headers['x-cloud-trace-context'] = '42/1729;o=' + option;
    http.get({port: common.serverPort, headers: headers}, res => {
      res.on('data', () => {});
      res.on('end', () => {
        if (++doneCount === options.length) {
          assert.strictEqual(common.getTraces().length, expectedTraceCount);
          common.cleanTraces();
          done();
        }
      });
    });
  });
}

export default {};
