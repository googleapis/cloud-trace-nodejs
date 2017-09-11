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

require('./plugins/common'/*.js*/);
var assert = require('assert');
var http = require('http');
var nock = require('nock');
var trace = require('..');

describe('test-agent-stopped', function() {
  var agent;
  var savedProject;

  before(function(done) {
    savedProject = process.env.GCLOUD_PROJECT;

    var scope = nock('http://metadata.google.internal')
                .get('/computeMetadata/v1/project/project-id')
                .reply(404);
    delete process.env.GCLOUD_PROJECT;
    agent = trace.start();
    // Wait 200ms for agent to fail getting remote project id.
    setTimeout(function() {
      assert.ok(!agent.isActive());
      scope.done();
      done();
    }, 200);
  });

  after(function() {
    process.env.GCLOUD_PROJECT = savedProject;
  });

  describe('express', function() {
    it('should not break if no project number is found', function(done) {
      assert.ok(!agent.isActive());
      var app = require('./plugins/fixtures/express4')();
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
      assert.ok(!agent.isActive());
      var hapi = require('./plugins/fixtures/hapi8');
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
      assert.ok(!agent.isActive());
      var restify = require('./plugins/fixtures/restify4');
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

export default {};
