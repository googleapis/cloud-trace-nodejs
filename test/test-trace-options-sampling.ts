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
var common = require('./plugins/common'/*.js*/);
var assert = require('assert');
var http = require('http');

describe('express + mongo with trace options header + sampling', function() {
  var agent;
  var express;
  before(function() {
    agent = require('..').start({
      projectId: '0',
      samplingRate: 1
    });
    express = require('./plugins/fixtures/express4');
  });

  it('should trace when enabled', function(done) {
    var app = express();
    app.get('/', function (req, res) {
      setTimeout(function() {
        res.send('Hello World');
      }, 50);
    });
    var server = app.listen(common.serverPort, function() {
      var headers = {};
      headers['x-cloud-trace-context'] = '42/1729;o=1';
      var doneCount = 0;
      var cb = function(res) {
        res.on('data', function() {});
        res.on('end', function() {
          if (++doneCount === 5) {
            // Only one trace should be sampled even though all have enabled header.
            assert.equal(common.getTraces().length, 1);
            common.cleanTraces();
            server.close();
            done();
          }
        });
      };
      for (var i = 0; i < 5; i++) {
        http.get({port: common.serverPort, headers: headers}, cb);
      }
    });
  });
});

export default {};
