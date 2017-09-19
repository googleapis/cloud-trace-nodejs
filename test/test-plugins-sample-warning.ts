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

describe('express + dbs', function() {
  var untracedHttpSpanCount = 0;
  var oldWarn;
  var agent;

  before(function() {
    agent = require('..').start({
      projectId: '0',
      samplingRate: 0
    });
  });

  beforeEach(function() {
    oldWarn = common.replaceWarnLogger(function(msg) {
      if (msg.indexOf('http') !== -1) {
        untracedHttpSpanCount++;
      }
    });
  });

  afterEach(function() {
    common.replaceWarnLogger(oldWarn);
    untracedHttpSpanCount = 0;
  });

  it('mongo should not warn', function(done) {
    var mongoose = require('./plugins/fixtures/mongoose4');
    var express = require('./plugins/fixtures/express4');

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
    var server = app.listen(common.serverPort, function() {
      http.get({port: common.serverPort}, function(res) {
        http.get({port: common.serverPort}, function(res) {
          server.close();
          common.cleanTraces();
          assert.equal(untracedHttpSpanCount, 2);
          done();
        });
      });
    });
  });

  it('redis should not warn', function(done) {
    var redis = require('./plugins/fixtures/redis2.3');
    var express = require('./plugins/fixtures/express4');

    var app = express();
    app.get('/', function (req, res) {
      var client = redis.createClient();
      client.quit(function() {
        res.sendStatus(200);
      });
    });
    var server = app.listen(common.serverPort + 1, function() {
      http.get({port: common.serverPort + 1}, function(res) {
        http.get({port: common.serverPort + 1}, function(res) {
          server.close();
          common.cleanTraces();
          assert.equal(untracedHttpSpanCount, 2);
          done();
        });
      });
    });
  });

  it('http should not warn', function(done) {
    var express = require('./plugins/fixtures/express4');

    var app = express();
    app.get('/', function (req, res) {
      http.get('http://www.google.com/', function() {
        res.sendStatus(200);
      });
    });
    var server = app.listen(common.serverPort + 2, function() {
      http.get({port: common.serverPort + 2}, function(res) {
        http.get({port: common.serverPort + 2}, function(res) {
          server.close();
          common.cleanTraces();
          assert.equal(untracedHttpSpanCount, 2);
          done();
        });
      });
    });
  });

  it('mysql should not warn', function(done) {
    var mysql = require('./plugins/fixtures/mysql2');
    var express = require('./plugins/fixtures/express4');

    var app = express();
    app.get('/', function (req, res) {
      var pool = mysql.createPool(require('./mysql-config'/*.js*/));
      http.get('http://www.google.com/', function() {
        pool.getConnection(function(err, conn) {
          conn.query('SHOW COLUMNS FROM t', function(err) {
            res.sendStatus(200);
          });
        });
      });
    });
    var server = app.listen(common.serverPort + 3, function() {
      http.get({port: common.serverPort + 3}, function(res) {
        http.get({port: common.serverPort + 3}, function(res) {
          server.close();
          common.cleanTraces();
          assert.equal(untracedHttpSpanCount, 2);
          done();
        });
      });
    });
  });
});

export default {};
