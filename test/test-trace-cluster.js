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

var common = require('./plugins/common.js');
var cluster = require('cluster');

describe('test-trace-cluster', function() {
  var agent;
  var express;
  before(function() {
    agent = require('..').start({samplingRate: 0});
    express = require('./plugins/fixtures/express4');
  });

  it('should not interfere with express span', function(done) {
    if (cluster.isMaster) {
      cluster.fork();
      cluster.on('disconnect', function(worker) {
        console.log('Success!');
        done();
      });
    } else {
      var app = express();
      app.get('/', function (req, res) {
        setTimeout(function() {
          res.send(common.serverRes);
        }, common.serverWait);
      });
      var server = app.listen(common.serverPort, function() {
        var finalize = function() {
          cluster.worker.disconnect();
          server.close();
          done();
        };
        common.doRequest(agent, 'GET', finalize, expressPredicate);
      });
    }
  });
});

function expressPredicate(span) {
  return span.name === '/';
}
