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

var common;
var agent;
if (process.argv[2] === '-i') {
  process.env.GCLOUD_TRACE_ENABLED = true;
  common = require('../../hooks/common.js');
  agent = require('../../..').start();
  // We want to drop all spans and avoid network ops
  common.installNoopTraceWriter(agent);
}

var mongoose = require('mongoose');
var N = 30000;
var Schema = mongoose.Schema;

var simpleSchema = new Schema({
  f1: String,
  f2: Boolean,
  f3: Number
});

var Simple = mongoose.model('Simple', simpleSchema);

var sim = new Simple({
  f1: 'sim',
  f2: true,
  f3: 42
});

var runInTransaction = function(fn) {
  common.runInTransaction(agent, function(end) {
    end();
  });
};

var work = function(endTransaction) {
  var responses = 0;

  mongoose.connect('mongodb://localhost:27017/testdb', function(err) {
    if (err) {
      console.log('Skipping: no mongo server found at localhost:27017.');
      process.exit(0);
    }
    var start = process.hrtime();
    var saveWork = function(err) {
      Simple.findOne({f1: 'sim'}, function(err, res) {
        if (++responses === N) {
          mongoose.connection.db.dropDatabase(function(err) {
            mongoose.connection.close(function(err) {
              if (endTransaction) {
                endTransaction();
              }

              var diff = process.hrtime(start);
              console.log((diff[0] * 1e3 + diff[1] / 1e6).toFixed()); // ms.
            });
          });
        }
      });
    };
    for (var i = 0; i < N; ++i) {
      sim.save(saveWork);
    }
  });
};

if (agent) {
  work = runInTransaction.bind(null, work);
}

work();
