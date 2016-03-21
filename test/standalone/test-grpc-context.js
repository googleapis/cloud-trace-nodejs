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
var grpc = require('../hooks/fixtures/grpc0.13');
var test_proto = grpc.load(__dirname + '/../fixtures/test.proto').nodetest;
var grcPort = 50051;
var debugCount = 0;
agent.logger.debug = function(error) {
  if (error.indexOf('http') !== -1) {
    debugCount++;
  }
};

describe('express + grpc', function() {
  it('grpc should preserve context', function(done) {
    var app = express();
    app.get('/', function (req, res) {
      var client = new test_proto.Tester('localhost:' + grcPort,
        grpc.credentials.createInsecure());
      client.test({message: 'hello'}, function(err, grpcRes) {
        http.get('http://www.google.com/', function(httpRes) {
          httpRes.on('data', function() {});
          httpRes.on('end', function() {
            res.sendStatus(200);
          });
        });
      });
    });
    var server = app.listen(common.serverPort, function() {
      var grpcServer = new grpc.Server();
      grpcServer.addProtoService(test_proto.Tester.service, {
        test: function(call, cb) {
          cb(null, {message: 'world'});
        }
      });
      grpcServer.bind('localhost:' + grcPort,
        grpc.ServerCredentials.createInsecure());
      grpcServer.start();
      http.get({port: common.serverPort}, function(res) {
        grpcServer.forceShutdown();
        server.close();
        assert.equal(common.getTraces().length, 1);
        assert.equal(debugCount, 1);
        done();
      });
    });
  });
});
