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
import {describe, it, before, after} from 'mocha';
import * as http from 'http';
import * as traceTestModule from './trace';
import {pluginLoader, PluginLoaderState} from '../src/trace-plugin-loader';
import {TraceWriter} from '../src/trace-writer';
import {StackdriverTracer} from '../src/trace-api';

describe('test-agent-stopped', () => {
  class InitErrorTraceWriter extends TraceWriter {
    getProjectId() {
      return Promise.reject(new Error('foo'));
    }
  }

  before(done => {
    traceTestModule.setPluginLoaderForTest();
    traceTestModule.setTraceWriterForTest(InitErrorTraceWriter);
    traceTestModule.start();
    // Wait for agent to fail getting remote project id.
    setImmediate(() => {
      assert.ok(!(traceTestModule.get() as StackdriverTracer).isActive());
      done();
    });
  });

  after(() => {
    traceTestModule.setPluginLoaderForTest(traceTestModule.TestPluginLoader);
    traceTestModule.setTraceWriterForTest(traceTestModule.TestTraceWriter);
  });

  it('deactivates the plugin loader', () => {
    assert.notStrictEqual(
      pluginLoader.get()!.state,
      PluginLoaderState.ACTIVATED
    );
  });

  describe('express', () => {
    it('should not break if no project number is found', done => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const app = require('./plugins/fixtures/express4')();
      app.get('/', (req, res) => {
        res.send('hi');
      });
      const server = app.listen(8080, () => {
        http.get('http://localhost:8080', res => {
          let result = '';
          res.on('data', data => {
            result += data;
          });
          res.on('end', () => {
            assert.strictEqual('hi', result);
            server.close();
            done();
          });
        });
      });
    });
  });

  describe('hapi', () => {
    it.skip('should not break if no project number is found', done => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const hapi = require('./plugins/fixtures/hapi8');
      const server = new hapi.Server();
      server.connection({port: 8081});
      server.route({
        method: 'GET',
        path: '/',
        handler: function (req, reply) {
          reply('hi');
        },
      });
      server.start(() => {
        http.get('http://localhost:8081', res => {
          let result = '';
          res.on('data', data => {
            result += data;
          });
          res.on('end', () => {
            assert.strictEqual('hi', result);
            server.stop();
            done();
          });
        });
      });
    });
  });

  describe('restify', () => {
    it('should not break if no project number is found', done => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const restify = require('./plugins/fixtures/restify4');
      const server = restify.createServer();
      server.get('/', (req, res, next) => {
        res.writeHead(200, {
          'Content-Type': 'text/plain',
        });
        res.write('hi');
        res.end();
        return next();
      });
      server.listen(8082, () => {
        http.get('http://localhost:8082', res => {
          let result = '';
          res.on('data', data => {
            result += data;
          });
          res.on('end', () => {
            assert.strictEqual('hi', result);
            server.close();
            done();
          });
        });
      });
    });
  });
});
