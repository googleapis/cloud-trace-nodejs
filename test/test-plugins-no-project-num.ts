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
var write;

describe('test-plugins-no-project-num', function(){
  var agent;
  var savedProject;

  before(function() {
    savedProject = process.env.GCLOUD_PROJECT;
    delete process.env.GCLOUD_PROJECT;
    agent = require('..').start();
  });

  after(function() {
    process.env.GCLOUD_PROJECT = savedProject;
  });

  describe('should not break without project num', function() {
    before(function() {
      // Mute stderr to satiate appveyor
      write = process.stderr.write;
      process.stderr.write = function(c, e, cb) {
        if (cb) {
          cb();
        }
      };
    });
    after(function() {
      process.stderr.write = write;
    });
    it('mongo', function(done) {
      var mongoose = require('./plugins/fixtures/mongoose4');
      var Simple = mongoose.model('Simple', new mongoose.Schema({
        f1: String,
        f2: Boolean,
        f3: Number
      }));
      mongoose.connect('mongodb://localhost:27017/testdb', function(err) {
        assert(!err, 'Skipping: error connecting to mongo at localhost:27017.');
        Simple.find({}, function(err, results) {
          mongoose.connection.close(function(err) {
            done();
          });
        });
      });
    });

    it('redis', function(done) {
      var redis = require('./plugins/fixtures/redis2.3');
      var client = redis.createClient();
      client.set('i', 1, function() {
        client.quit(function() {
          done();
        });
      });
    });

    it('express', function(done) {
      var http = require('http');
      var express = require('./plugins/fixtures/express4');
      var app = express();
      var server;
      app.get('/', function (req, res) {
        res.send('hi');
        server.close();
        done();
      });
      server = app.listen(8081, function() {
        http.get({ port: 8081 });
      });
    });

    it('restify', function(done) {
      var http = require('http');
      var restify = require('./plugins/fixtures/restify4');
      var server = restify.createServer();
      server.get('/', function (req, res, next) {
        res.writeHead(200, {
          'Content-Type': 'text/plain'
        });
        res.write('hi');
        res.end();
        server.close();
        done();
      });
      server.listen(8081, function() {
        http.get({ port: 8081 });
      });
    });

    it('hapi', function(done) {
      var http = require('http');
      var hapi = require('./plugins/fixtures/hapi8');
      var server = new hapi.Server();
      server.connection({ port: 8081 });
      server.route({
        method: 'GET',
        path: '/',
        handler: function(req, reply) {
          reply('hi');
          server.stop();
          done();
        }
      });
      server.start(function() {
        http.get({ port: 8081 });
      });
    });

    it('http', function(done) {
      var req = require('http').get({ port: 8081 });
      req.on('error', function() {
        done();
      });
    });

    it('mysql', function(done) {
      var mysql = require('./plugins/fixtures/mysql2');
      var pool = mysql.createPool(require('./mysql-config'/*.js*/));
      pool.getConnection(function(err, conn) {
        assert(!err, 'Skipping: Failed to connect to mysql.');
        conn.query('SHOW TABLES', function(err, result) {
          conn.release();
          done();
        });
      });
    });
  });
});

export default {};
