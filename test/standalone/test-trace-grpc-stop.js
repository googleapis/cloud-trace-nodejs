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

var assert = require('assert');

var versions = {
  grpc014: '../hooks/fixtures/grpc0.14',
  grpc015: '../hooks/fixtures/grpc0.15',
  grpc1: '../hooks/fixtures/grpc1'
};
if (process.platform !== 'win32') {
  // On Windows, skip grpc0.13 due to https://github.com/grpc/grpc/issues/6141.
  // The build error was fixed in grpc0.14.
  versions.grpc013 = '../hooks/fixtures/grpc0.13';
}

var agent = require('../../index.js');

Object.keys(versions).forEach(function(version) {
  describe('grpc', function() {
    it('should not record traces', function(done) {
      agent.start();
      var grpc = require(versions[version]);
      var protoFile = __dirname + '/../fixtures/test-grpc.proto';
      var proto = grpc.load(protoFile).nodetest;

      var server = new grpc.Server();
      server.addProtoService(proto.Tester.service, {
        testUnary: function(call, cb) { cb(null, {n: 0}); },
        testClientStream: function(call, cb) { cb(null, {n: 0}); },
        testServerStream: function(stream) {
          stream.write({n: 0});
          stream.end();
        },
        testBidiStream: function(stream) {
          stream.on('data', function() {});
          stream.end();
        }
      });
      server.bind('localhost:50051',
        grpc.ServerCredentials.createInsecure());
      server.start();

      var client = new proto.Tester('localhost:50051',
        grpc.credentials.createInsecure());

      agent.stop();

      var run = function() {
        server.forceShutdown();
        assert(!agent.private_().traceWriter);
        done();
      };
      function test(fn) {
        var next = run;
        run = function () {
          fn(next);
        };
      }

      test(function(next) {
        client.testUnary({n: 0}, function() { next(); });
      });
      test(function(next) {
        var stream = client.testClientStream(function() { next(); });
        setTimeout(function() { stream.end(); }, 1000);
      });
      test(function(next) {
        var stream = client.testServerStream({n: 0});
        stream.on('data', function() {});
        stream.on('status', function() { next(); });
      });
      test(function(next) {
        var stream = client.testBidiStream();
        stream.on('data', function() {});
        stream.on('status', function() { next(); });
      });

      run();
    });
  });
});
