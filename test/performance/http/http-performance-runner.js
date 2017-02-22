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

var common;
var agent;
if (process.argv[2] === '-i') {
  process.env.GCLOUD_TRACE_ENABLED = true;
  common = require('../../hooks/common.js');
  agent = require('../../..').start();
  // We want to drop all spans and avoid network ops
  common.installNoopTraceWriter(agent);
}

var http = require('http');
var port = 8080;
var N = 30000;
var httpAgent = new http.Agent({maxSockets: 50});

var smileyServer = http.createServer(function(req, res) {
  res.end(':)');
});

var runInTransaction = function(fn) {
  common.runInTransaction(agent, function(end) {
    end();
  });
};

var work = function(endTransaction) {
  var responses = 0;

  var start = process.hrtime();
  for (var i = 0; i < N; ++i) {
    http.get({port: port, agent: httpAgent, path: '/'}, function(res) {
      res.resume();
      res.on('end', function() {
        if (++responses === N) {
          smileyServer.close();
          if (endTransaction) {
            endTransaction();
          }

          var diff = process.hrtime(start);
          console.log((diff[0] * 1e3 + diff[1] / 1e6).toFixed()); // ms.
        }
      });
    });
  }
};

if (agent) {
  work = runInTransaction.bind(null, work);
}

smileyServer.listen(port, work);
