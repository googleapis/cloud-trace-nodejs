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

describe('express + mongo with trace options header', function() {
  var agent;
  var express;
  before(function() {
    agent = require('..').start({
      projectId: '0',
      samplingRate: 0
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
      var shouldTraceOptions = [1,3,5,7];
      var shouldNotTraceOptions = [0,2,4,6];
      sendRequests(agent, shouldTraceOptions, shouldTraceOptions.length, function() {
        sendRequests(agent, shouldNotTraceOptions, 0, function() {
          server.close();
          done();
        });
      });
    });
  });
});

function sendRequests(agent, options, expectedTraceCount, done) {
  var doneCount = 0;
  options.forEach(function(option) {
    var headers = {};
    headers['x-cloud-trace-context'] = '42/1729;o=' + option;
    http.get({port: common.serverPort, headers: headers}, function(res) {
      res.on('data', function() {});
      res.on('end', function() {
        if (++doneCount === options.length) {
          assert.equal(common.getTraces().length, expectedTraceCount);
          common.cleanTraces();
          done();
        }
      });
    });
  });
}

export default {};
