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
var http = require('http');
var nock = require('nock');
var proxyquire  = require('proxyquire');

describe('test-agent-stopped', function() {
  var agent;
  before(function(done) {
<<<<<<< HEAD
    // Setup: Monkeypatch gcp-metadata to not ask for retries at all.
    var retryRequest = require('retry-request');
    proxyquire('gcp-metadata', {
      'retry-request': function(requestOps, callback) {
        return retryRequest(requestOps, {
          retries: 0
        }, callback);
      }
    });
    var scope = nock('http://metadata.google.internal')
                .get('/computeMetadata/v1/project/project-id')
                .reply(404);
    delete process.env.GCLOUD_PROJECT;
    agent = require('..').start();
    // Wait 20ms for agent to fail getting remote project id.
    setTimeout(function() {
      assert.ok(!agent.isActive());
      scope.done();
      done();
    }, 20);
=======
    delete process.env.GCLOUD_PROJECT;
    agent = require('..').start({ logLevel: 1 });
    setTimeout(function() {
      assert.ok(!agent.isActive());
      done();
    }, 500);
>>>>>>> Make trace interface uniform between agent module exports and plugins
  });

  after(function() {
    process.env.GCLOUD_PROJECT = 0;
  });

  describe('express', function() {
    it('should not break if no project number is found', function(done) {
<<<<<<< HEAD
      assert.ok(!agent.isActive());
      var app = require('./plugins/fixtures/express4')();
=======
      var app = require('./hooks/fixtures/express4')();
>>>>>>> Make trace interface uniform between agent module exports and plugins
      app.get('/', function (req, res) {
        res.send('hi');
      });
      var server = app.listen(8080, function() {
        http.get('http://localhost:8080', function(res) {
          var result = '';
          res.on('data', function(data) { result += data; });
          res.on('end', function() {
            assert.equal('hi', result);
            server.close();
            done();
          });
        });
      });
    });
  });

  describe('hapi', function() {
    it('should not break if no project number is found', function(done) {
<<<<<<< HEAD
      assert.ok(!agent.isActive());
      var hapi = require('./plugins/fixtures/hapi8');
=======
      var hapi = require('./hooks/fixtures/hapi8');
>>>>>>> Make trace interface uniform between agent module exports and plugins
      var server = new hapi.Server();
      server.connection({ port: 8081 });
      server.route({
        method: 'GET',
        path: '/',
        handler: function(req, reply) {
          reply('hi');
        }
      });
      server.start(function() {
        http.get('http://localhost:8081', function(res) {
          var result = '';
          res.on('data', function(data) { result += data; });
          res.on('end', function() {
            assert.equal('hi', result);
            server.stop();
            done();
          });
        });
      });
    });
  });

  describe('restify', function() {
    it('should not break if no project number is found', function(done) {
<<<<<<< HEAD
      assert.ok(!agent.isActive());
      var restify = require('./plugins/fixtures/restify4');
=======
      var restify = require('./hooks/fixtures/restify4');
>>>>>>> Make trace interface uniform between agent module exports and plugins
      var server = restify.createServer();
      server.get('/', function (req, res, next) {
        res.writeHead(200, {
          'Content-Type': 'text/plain'
        });
        res.write('hi');
        res.end();
        return next();
      });
      server.listen(8082, function() {
        http.get('http://localhost:8082', function(res) {
          var result = '';
          res.on('data', function(data) { result += data; });
          res.on('end', function() {
            assert.equal('hi', result);
            server.close();
            done();
          });
        });
      });
    });
  });
});
