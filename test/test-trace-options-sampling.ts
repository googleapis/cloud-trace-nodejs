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

describe('express + http with trace options header + sampling', () => {
  let express;
  before(() => {
    require('../..').start({
      projectId: '0',
      samplingRate: 1,
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
      const headers = {};
      headers['x-cloud-trace-context'] = '42/1729;o=1';
      let doneCount = 0;
      const cb = function (res) {
        res.on('data', () => {});
        res.on('end', () => {
          if (++doneCount === 5) {
            // Only one trace should be sampled even though all have enabled header.
            assert.strictEqual(common.getTraces().length, 1);
            common.cleanTraces();
            server.close();
            done();
          }
        });
      };
      for (let i = 0; i < 5; i++) {
        http.get({port: common.serverPort, headers: headers}, cb);
      }
    });
  });
});

export default {};
