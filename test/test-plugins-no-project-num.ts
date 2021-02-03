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

import * as assert from 'assert';
import {describe, before, after, it} from 'mocha';

let write;

describe('test-plugins-no-project-num', () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let agent;
  let savedProject;

  before(() => {
    savedProject = process.env.GCLOUD_PROJECT;
    delete process.env.GCLOUD_PROJECT;
    agent = require('../..').start();
  });

  after(() => {
    process.env.GCLOUD_PROJECT = savedProject;
  });

  describe('should not break without project num', () => {
    before(() => {
      // Mute stderr to satiate appveyor
      write = process.stderr.write;
      process.stderr.write = function (c, e?, cb?) {
        if (cb) {
          cb();
        }
        return true;
      };
    });
    after(() => {
      process.stderr.write = write;
    });
    it('mongo', done => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mongoose = require('./plugins/fixtures/mongoose4');
      const Simple = mongoose.model(
        'Simple',
        new mongoose.Schema({
          f1: String,
          f2: Boolean,
          f3: Number,
        })
      );
      mongoose.connect('mongodb://localhost:27017/testdb', err => {
        assert(!err, 'Skipping: error connecting to mongo at localhost:27017.');
        Simple.find({}, () => {
          mongoose.connection.close(() => {
            done();
          });
        });
      });
    });

    it('redis', done => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const redis = require('./plugins/fixtures/redis2.3');
      const client = redis.createClient();
      client.set('i', 1, () => {
        client.quit(() => {
          done();
        });
      });
    });

    it('express', done => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const http = require('http');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const express = require('./plugins/fixtures/express4');
      const app = express();
      app.get('/', (req, res) => {
        res.send('hi');
        server.close();
        done();
      });
      const server = app.listen(8081, () => {
        http.get({port: 8081});
      });
    });

    it('restify', done => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const http = require('http');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const restify = require('./plugins/fixtures/restify4');
      const server = restify.createServer();
      server.get('/', (req, res) => {
        res.writeHead(200, {
          'Content-Type': 'text/plain',
        });
        res.write('hi');
        res.end();
        server.close();
        done();
      });
      server.listen(8081, () => {
        http.get({port: 8081});
      });
    });

    it.skip('hapi', done => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const http = require('http');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const hapi = require('./plugins/fixtures/hapi8');
      const server = new hapi.Server();
      server.connection({port: 8081});
      server.route({
        method: 'GET',
        path: '/',
        handler: function (req, reply) {
          reply('hi');
          server.stop();
          done();
        },
      });
      server.start(() => {
        http.get({port: 8081});
      });
    });

    it('http', done => {
      const req = require('http').get({port: 8081});
      req.on('error', () => {
        done();
      });
    });

    const mysql_implementations = ['mysql-2', 'mysql2-1'];
    mysql_implementations.forEach(impl => {
      it(impl, done => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mysql = require('./plugins/fixtures/' + impl);
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pool = mysql.createPool(require('./mysql-config' /*.js*/));
        pool.getConnection((err, conn) => {
          assert(!err, 'Skipping: Failed to connect to mysql.');
          conn.query('SHOW TABLES', () => {
            conn.release();
            pool.end();
            done();
          });
        });
      });
    });
  });
});

export default {};
