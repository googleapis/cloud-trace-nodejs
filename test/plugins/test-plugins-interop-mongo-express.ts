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

// Prereqs:
// Start docker daemon
//   ex) docker -d
// Run a mongo image binding the mongo port
//   ex) docker run -p 27017:27017 -d mongo
// eslint-disable-next-line @typescript-eslint/no-var-requires
const common = require('./common' /*.js*/);

import * as assert from 'assert';
import * as http from 'http';
import {describe, it, before} from 'mocha';

let server;

describe('mongodb + express', () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let agent;
  let oldWarn;
  let mongoose;
  let express;
  before(() => {
    agent = require('../../..').start({projectId: '0'});
    express = require('./fixtures/express4');
    mongoose = require('./fixtures/mongoose4');
    oldWarn = common.replaceWarnLogger(error => {
      assert(error.indexOf('mongo') === -1, error);
    });
  });

  it('should not lose context on startup', done => {
    const app = express();
    app.get('/', (req, res) => {
      mongoose.connect('mongodb://localhost:27017/testdb', err => {
        assert(!err, 'Skipping: no mongo server found at localhost:27017.');
        mongoose.connection.close(err => {
          assert(!err);
          res.sendStatus(200);
        });
      });
    });
    server = app.listen(common.serverPort, () => {
      http.get({port: common.serverPort}, () => {
        server.close();
        common.cleanTraces();
        common.replaceWarnLogger(oldWarn);
        done();
      });
    });
  });
});

export default {};
