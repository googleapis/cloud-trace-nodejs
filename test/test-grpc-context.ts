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

import {describeInterop} from './utils';

// Trace agent must be started out of the loop over gRPC versions,
// because express can't be re-patched.
require('../..').start({
  projectId: '0',
  samplingRate: 0,
  ignoreUrls: ['/no-trace'],
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const common = require('./plugins/common' /*.js*/);
import {describe, it, before, beforeEach, after, afterEach} from 'mocha';
import * as assert from 'assert';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require('./plugins/fixtures/express4');
import * as http from 'http';

const grpcPort = 50051;
const protoFile = __dirname + '/fixtures/test-grpc.proto';
let client, grpcServer, server;

function makeHttpRequester(callback, expectedReqs) {
  let pendingHttpReqs = expectedReqs;
  return function () {
    // Make a request to an endpoint that won't create an additional server
    // trace.
    http.get(`http://localhost:${common.serverPort}/no-trace`, httpRes => {
      httpRes.on('data', () => {});
      httpRes.on('end', () => {
        if (--pendingHttpReqs === 0) {
          callback();
        }
      });
    });
  };
}

function requestAndSendHTTPStatus(res, expectedReqs) {
  return makeHttpRequester(() => {
    res.sendStatus(200);
  }, expectedReqs);
}

describeInterop('grpc', fixture => {
  describe('Context Propagation', () => {
    let grpc;
    let httpLogCount;

    before(done => {
      grpc = fixture.require();

      common.replaceWarnLogger(msg => {
        if (msg.indexOf('http') !== -1) {
          httpLogCount++;
        }
      });

      const proto = grpc.load(protoFile).nodetest;
      const app = express();

      app.get('/no-trace', (req, res) => {
        res.sendStatus(200);
      });

      app.get('/unary', (req, res) => {
        const httpRequester = requestAndSendHTTPStatus(res, 1);
        client.testUnary({n: 42}, httpRequester);
      });

      app.get('/client', (req, res) => {
        const httpRequester = requestAndSendHTTPStatus(res, 1);
        const stream = client.testClientStream(httpRequester);
        for (let i = 0; i < 10; ++i) {
          stream.write({n: i});
        }
        stream.end();
      });

      app.get('/server', (req, res) => {
        const httpRequester = requestAndSendHTTPStatus(res, 11);
        const stream = client.testServerStream({n: 3});
        stream.on('data', httpRequester);
        stream.on('status', httpRequester);
      });

      app.get('/bidi', (req, res) => {
        const httpRequester = requestAndSendHTTPStatus(res, 11);
        const stream = client.testBidiStream();
        stream.on('data', httpRequester);
        stream.on('status', httpRequester);
        for (let i = 0; i < 10; ++i) {
          stream.write({n: i});
        }
        stream.end();
      });

      client = new proto.Tester(
        'localhost:' + grpcPort,
        grpc.credentials.createInsecure()
      );

      server = app.listen(common.serverPort, () => {
        grpcServer = new grpc.Server();
        grpcServer.addProtoService(proto.Tester.service, {
          testUnary: function (call, cb) {
            const httpRequester = makeHttpRequester(() => {
              cb(null, {n: call.request.n});
            }, 1);
            httpRequester();
          },
          testClientStream: function (call, cb) {
            const httpRequester = makeHttpRequester(() => {
              cb(null, {n: 43});
            }, 11);
            call.on('data', httpRequester);
            call.on('end', httpRequester);
          },
          testServerStream: function (stream) {
            const httpRequester = makeHttpRequester(() => {
              stream.end();
            }, 1);
            for (let i = 0; i < 10; ++i) {
              stream.write({n: i});
            }
            httpRequester();
          },
          testBidiStream: function (stream) {
            const httpRequester = makeHttpRequester(() => {
              stream.end();
            }, 11);
            stream.on('data', data => {
              stream.write({n: data.n});
              httpRequester();
            });
            stream.on('end', httpRequester);
          },
        });
        grpcServer.bind(
          'localhost:' + grpcPort,
          grpc.ServerCredentials.createInsecure()
        );
        grpcServer.start();
        done();
      });
    });

    beforeEach(() => {
      httpLogCount = 0;
    });

    after(() => {
      grpcServer.forceShutdown();
      server.close();
    });

    afterEach(() => {
      // We expect a single untraced http request for each test cooresponding to the
      // top level request used to start the desired test.
      assert.strictEqual(httpLogCount, 1);
      common.cleanTraces();
    });

    it('grpc should preserve context for unary requests', done => {
      http.get({port: common.serverPort, path: '/unary'}, () => {
        assert.strictEqual(common.getTraces().length, 2);
        // gRPC Server: 1 root span, 1 http span.
        assert.strictEqual(common.getTraces()[0].spans.length, 2);
        assert.strictEqual(common.getTraces()[0].spans[0].kind, 'RPC_SERVER');
        // gRPC Client: 1 root span from express, 1 gRPC span, 1 http span.
        assert.strictEqual(common.getTraces()[1].spans.length, 3);
        done();
      });
    });

    it('grpc should preserve context for client requests', done => {
      http.get({port: common.serverPort, path: '/client'}, () => {
        assert.strictEqual(common.getTraces().length, 2);
        // gRPC Server: 1 root span, 11 http spans (10 from 'data' listeners,
        // 1 from 'end' listener).
        assert.strictEqual(common.getTraces()[0].spans.length, 12);
        assert.strictEqual(common.getTraces()[0].spans[0].kind, 'RPC_SERVER');
        // gRPC Client: 1 root span from express, 1 gRPC span, 1 http span.
        assert.strictEqual(common.getTraces()[1].spans.length, 3);
        done();
      });
    });

    it('grpc should preserve context for server requests', done => {
      http.get({port: common.serverPort, path: '/server'}, () => {
        assert.strictEqual(common.getTraces().length, 2);
        // gRPC Server: 1 root span, 1 http span.
        assert.strictEqual(common.getTraces()[0].spans.length, 2);
        assert.strictEqual(common.getTraces()[0].spans[0].kind, 'RPC_SERVER');
        // gRPC Client: 1 root span from express, 1 gRPC span, and 11 http spans
        // (10 from 'data' listeners and 1 from the 'status' listener).
        assert.strictEqual(common.getTraces()[1].spans.length, 13);
        done();
      });
    });

    it('grpc should preserve context for bidi requests', done => {
      http.get({port: common.serverPort, path: '/bidi'}, () => {
        assert.strictEqual(common.getTraces().length, 2);
        // gRPC Server: 1 root span, 11 http spans (10 from 'data' listeners,
        // 1 from 'end' listener).
        assert.strictEqual(common.getTraces()[0].spans.length, 12);
        assert.strictEqual(common.getTraces()[0].spans[0].kind, 'RPC_SERVER');
        // gRPC Client: 1 root span from express, 1 gRPC span, and 11 http spans
        // (10 from 'data' listeners and 1 from the 'status' listener).
        assert.strictEqual(common.getTraces()[1].spans.length, 13);
        done();
      });
    });
  });
});

export default {};
