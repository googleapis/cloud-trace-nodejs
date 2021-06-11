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
import * as semver from 'semver';
import {describe, it, before} from 'mocha';

// hapi 13 and hapi-plugin-mysql uses const
if (semver.satisfies(process.version, '>=4')) {
  describe('test-trace-mysql', () => {
    let Hapi;
    before(() => {
      require('../..').start({
        projectId: '0',
        samplingRate: 0,
        enhancedDatabaseReporting: true,
      });
      Hapi = require('./plugins/fixtures/hapi16');
    });

    it('should work with connection pool access', done => {
      const server = new Hapi.Server();
      server.connection({port: common.serverPort});
      server.register(
        {
          register: require('./plugins/fixtures/hapi-plugin-mysql3'),
          options: require('./mysql-config' /*.js*/),
        },
        err => {
          assert(!err);
          server.route({
            method: 'GET',
            path: '/',
            handler: function (request, reply) {
              request.app.db.query('SELECT * FROM t', () => {
                return reply('hello');
              });
            },
          });
          server.start(err => {
            assert(!err);
            http.get({port: common.serverPort}, res => {
              let result = '';
              res.on('data', data => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                result += data;
              });
              res.on('end', () => {
                const spans = common.getMatchingSpans(span => {
                  return span.name === 'mysql-query';
                });
                assert.strictEqual(spans.length, 1);
                assert.strictEqual(spans[0].labels.sql, 'SELECT * FROM t');
                server.stop(done);
              });
            });
          });
        }
      );
    });
  });
}

export default {};
