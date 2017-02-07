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

// Prereqs:
// Start docker daemon
//   ex) docker -d
// Run a mongo image binding the mongo port
//   ex) docker run -p 27017:27017 -d mongo
var common = require('./common.js');

// TODO: Determine why this test succeeds but causes the
//       test-trace-express.js test to fail if either of
//       (1) or (2) are changed below.

// (1) express needs to be required before the agent is
//     started for this test and test-trace-express.js
//     to both pass.
var express = require('./fixtures/express4');
var assert = require('assert');
var http = require('http');

var server;

describe('mongodb + express', function() {
  var agent;
  var oldDebug;
  var mongoose;
  before(function() {
    agent = require('../..').start().get().private_();
    mongoose = require('./fixtures/mongoose4');
    oldDebug = agent.logger.debug;
    agent.logger.debug = function(error) {
      assert(error.indexOf('mongo') === -1, error);
    };
  });

  after(function() {
    // (2) express needs to be deleted from the require cache
    //     for this test and test-trace-express.js to both
    //     pass.
    delete require.cache[require.resolve('./fixtures/express4')];
    agent.stop();
  });

  it('should not lose context on startup', function(done) {
    var app = express();
    app.get('/', function (req, res) {
      mongoose.connect('mongodb://localhost:27017/testdb', function(err) {
        assert(!err, 'Skipping: no mongo server found at localhost:27017.');
        mongoose.connection.close(function(err) {
          assert(!err);
          res.sendStatus(200);
        });
      });
    });
    server = app.listen(common.serverPort, function() {
      http.get({port: common.serverPort}, function(res) {
        server.close();
        common.cleanTraces(agent);
        agent.logger.debug = oldDebug;
        done();
      });
    });
  });
});
