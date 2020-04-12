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
const common = require('./plugins/common' /*.js*/);

import * as assert from 'assert';
import * as http from 'http';
import {describe, it, before, beforeEach, afterEach} from 'mocha';

describe('express + dbs', () => {
  let untracedHttpSpanCount = 0;
  let oldWarn;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let agent;

  before(() => {
    agent = require('../..').start({
      projectId: '0',
      samplingRate: 0,
      ignoreUrls: ['/ignore-me'],
    });
  });

  beforeEach(() => {
    oldWarn = common.replaceWarnLogger(msg => {
      if (msg.indexOf('http') !== -1) {
        untracedHttpSpanCount++;
      }
    });
  });

  afterEach(() => {
    common.replaceWarnLogger(oldWarn);
    untracedHttpSpanCount = 0;
  });

  it('mongo should not warn', done => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mongoose = require('./plugins/fixtures/mongoose4');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const express = require('./plugins/fixtures/express4');

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
    const server = app.listen(common.serverPort, () => {
      http.get({port: common.serverPort}, () => {
        http.get({port: common.serverPort}, () => {
          server.close();
          common.cleanTraces();
          assert.strictEqual(untracedHttpSpanCount, 2);
          done();
        });
      });
    });
  });

  it('redis should not warn', done => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const redis = require('./plugins/fixtures/redis2.3');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const express = require('./plugins/fixtures/express4');

    const app = express();
    app.get('/', (req, res) => {
      const client = redis.createClient();
      client.quit(() => {
        res.sendStatus(200);
      });
    });
    const server = app.listen(common.serverPort + 1, () => {
      http.get({port: common.serverPort + 1}, () => {
        http.get({port: common.serverPort + 1}, () => {
          server.close();
          common.cleanTraces();
          assert.strictEqual(untracedHttpSpanCount, 2);
          done();
        });
      });
    });
  });

  it('http should not warn', done => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const express = require('./plugins/fixtures/express4');

    const app = express();
    app.get('/ignore-me', (req, res) => {
      res.sendStatus(200);
    });
    app.get('/', (req, res) => {
      http.get(`http://localhost:${common.serverPort + 2}/ignore-me`, () => {
        res.sendStatus(200);
      });
    });
    const server = app.listen(common.serverPort + 2, () => {
      http.get({port: common.serverPort + 2}, () => {
        http.get({port: common.serverPort + 2}, () => {
          server.close();
          common.cleanTraces();
          assert.strictEqual(untracedHttpSpanCount, 2);
          done();
        });
      });
    });
  });

  const mysql_implementations = ['mysql-2', 'mysql2-1'];
  mysql_implementations.forEach(impl => {
    it(impl + ' should not warn', done => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mysql = require('./plugins/fixtures/' + impl);
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const express = require('./plugins/fixtures/express4');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pool = mysql.createPool(require('./mysql-config' /*.js*/));

      const app = express();
      app.get('/ignore-me', (req, res) => {
        res.sendStatus(200);
      });
      app.get('/', (req, res) => {
        http.get(`http://localhost:${common.serverPort + 3}/ignore-me`, () => {
          pool.getConnection((err, conn) => {
            conn.query('SHOW COLUMNS FROM t', () => {
              res.sendStatus(200);
            });
          });
        });
      });
      const server = app.listen(common.serverPort + 3, () => {
        http.get({port: common.serverPort + 3}, () => {
          http.get({port: common.serverPort + 3}, () => {
            pool.end();
            server.close();
            common.cleanTraces();
            assert.strictEqual(untracedHttpSpanCount, 2);
            done();
          });
        });
      });
    });
  });
});

export default {};
