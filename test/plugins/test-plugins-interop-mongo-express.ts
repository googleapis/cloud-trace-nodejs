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
var common = require('./common'/*.js*/);

var assert = require('assert');
var http = require('http');

var server;

describe('mongodb + express', function() {
  var agent;
  var oldWarn;
  var mongoose;
  var express;
  before(function() {
    agent = require('../..').start({ projectId: '0' });
    express = require('./fixtures/express4');
    mongoose = require('./fixtures/mongoose4');
    oldWarn = common.replaceWarnLogger(
      function(error) {
        assert(error.indexOf('mongo') === -1, error);
    });
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
        common.cleanTraces();
        common.replaceWarnLogger(oldWarn);
        done();
      });
    });
  });
});

export default {};
