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
'use strict';

var agent = require('../..').start({ samplingRate: 0 }).private_();

var common = require('../hooks/common.js');
var assert = require('assert');
var express = require('../hooks/fixtures/express4');
var http = require('http');

var versions = {
  grpc014: require('../hooks/fixtures/grpc0.14'),
  grpc015: require('../hooks/fixtures/grpc0.15')
};
if (process.platform !== 'win32') {
  // On Windows, skip grpc0.13 due to https://github.com/grpc/grpc/issues/6141.
  // The build error was fixed in grpc0.14.
  versions.grpc013 = require('../hooks/fixtures/grpc0.13');
}

var grpcPort = 50051;
var protoFile = __dirname + '/../fixtures/test-grpc.proto';
var client, grpcServer, server;

agent.logger.debug = function(error, uri) {
  if (error.indexOf('http') !== -1) {
    assert.notStrictEqual(uri.indexOf('localhost'), -1);
  }
};

function makeHttpRequester(res) {
  var pendingHttpReqs = 0;
  return function() {
    ++pendingHttpReqs;
    http.get('http://www.google.com/', function(httpRes) {
      httpRes.on('data', function() {});
      httpRes.on('end', function() {
        if (--pendingHttpReqs === 0) {
          res.sendStatus(200);
        }
      });
    });
  };
}

Object.keys(versions).forEach(function(version) {
  var grpc = versions[version];

  describe('express + grpc', function() {
    before(function(done) {
      var proto = grpc.load(protoFile).nodetest;
      var app = express();

      app.get('/unary', function(req, res) {
        var httpRequester = makeHttpRequester(res);
        client.testUnary({n: 42}, httpRequester);
      });

      app.get('/client', function(req, res) {
        var httpRequester = makeHttpRequester(res);
        var stream = client.testClientStream(httpRequester);
        for (var i = 0; i < 10; ++i) {
          stream.write({n: i});
        }
        stream.end();
      });

      app.get('/server', function(req, res) {
        var httpRequester = makeHttpRequester(res);
        var stream = client.testServerStream();
        stream.on('data', httpRequester);
        stream.on('status', httpRequester);
      });

      app.get('/bidi', function(req, res) {
        var httpRequester = makeHttpRequester(res);
        var stream = client.testBidiStream();
        stream.on('data', httpRequester);
        stream.on('status', httpRequester);
        for (var i = 0; i < 10; ++i) {
          stream.write({n: i});
        }
        stream.end();
      });

      client = new proto.Tester('localhost:' + grpcPort,
          grpc.credentials.createInsecure());

      server = app.listen(common.serverPort, function() {
        grpcServer = new grpc.Server();
        grpcServer.addProtoService(proto.Tester.service, {
          testUnary: function(call, cb) {
            cb(null, {n: call.request.n});
          },
          testClientStream: function(call, cb) {
            call.on('data', function() {});
            call.on('end', function() {
              cb(null, {n: 43});
            });
          },
          testServerStream: function(stream) {
            for (var i = 0; i < 10; ++i) {
              stream.write({n: i});
            }
            stream.end();
          },
          testBidiStream: function(stream) {
            stream.on('data', function(data) {
              stream.write({n: data.n});
            });
            stream.on('end', function() {
              stream.end();
            });
          }
        });
        grpcServer.bind('localhost:' + grpcPort,
            grpc.ServerCredentials.createInsecure());
        grpcServer.start();
        done();
      });
    });

    after(function() {
      grpcServer.forceShutdown();
      server.close();
    });

    afterEach(function() {
      common.cleanTraces();
    });

    it('grpc should preserve context for unary requests', function(done) {
      http.get({port: common.serverPort, path: '/unary'}, function(res) {
        assert.strictEqual(common.getTraces().length, 1);
        // There is 1 span from express, 1 from grpc, and 1 from http.
        assert.strictEqual(common.getTraces()[0].spans.length, 3);
        done();
      });
    });

    it('grpc should preserve context for client requests', function(done) {
      http.get({port: common.serverPort, path: '/client'}, function(res) {
        assert.strictEqual(common.getTraces().length, 1);
        // There is 1 span from express, 1 from grpc, and 1 from http.
        assert.strictEqual(common.getTraces()[0].spans.length, 3);
        done();
      });
    });

    it('grpc should preserve context for server requests', function(done) {
      http.get({port: common.serverPort, path: '/server'}, function(res) {
        assert.strictEqual(common.getTraces().length, 1);
        // There are 11 http requests: 10 from 'data' listeners and 1 from the
        // 'status' listener. The other 2 spans are from express and grpc.
        assert.strictEqual(common.getTraces()[0].spans.length, 13);
        done();
      });
    });

    it('grpc should preserve context for bidi requests', function(done) {
      http.get({port: common.serverPort, path: '/bidi'}, function(res) {
        assert.strictEqual(common.getTraces().length, 1);
        // There are 11 http requests: 10 from 'data' listeners and 1 from the
        // 'status' listener. The other 2 spans are from express and grpc.
        assert.strictEqual(common.getTraces()[0].spans.length, 13);
        done();
      });
    });
  });
});
