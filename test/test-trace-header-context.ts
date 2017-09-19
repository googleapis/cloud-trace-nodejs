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

var common = require('./plugins/common'/*.js*/);
var http = require('http');
var assert = require('assert');
var constants = require('../src/constants'/*.js*/);

var fakeTraceId = 'ffeeddccbbaa99887766554433221100';

describe('test-trace-header-context', function() {
  var agent;
  var express;
  before(function() {
    agent = require('..').start({
      projectId: '0',
      samplingRate: 0
    });
    express = require('./plugins/fixtures/express4');
  });

  it('should give correct context', function() {
    var tracedContext = fakeTraceId + '/0;o=1';
    var untracedContext = fakeTraceId + '/0;o=0';
    var unspecifiedContext = fakeTraceId + '/0';
    assert.strictEqual(agent.getResponseTraceContext(tracedContext, true), tracedContext);
    assert.strictEqual(agent.getResponseTraceContext(tracedContext, false), untracedContext);
    assert.strictEqual(agent.getResponseTraceContext(untracedContext, true), untracedContext);
    assert.strictEqual(agent.getResponseTraceContext(untracedContext, false), untracedContext);
    assert.strictEqual(agent.getResponseTraceContext(unspecifiedContext, true), untracedContext);
    assert.strictEqual(agent.getResponseTraceContext(unspecifiedContext, false), untracedContext);
  });

  it('should work with string url', function(done) {
    var app = express();
    var server;
    app.get('/', function (req, res) {
      http.get('http://localhost:' + common.serverPort + '/self');
      res.send(common.serverRes);
    });
    app.get('/self', function(req, res) {
      assert(req.headers[constants.TRACE_CONTEXT_HEADER_NAME]);
      res.send(common.serverRes);
      var traces = common.getTraces();
      assert.equal(traces.length, 2);
      assert.equal(traces[0].spans.length, 2);
      assert.equal(traces[1].spans.length, 1);
      assert.equal(traces[0].spans[0].name, '/');
      assert.equal(traces[0].spans[1].name, 'localhost');
      assert.equal(traces[1].spans[0].name, '/self');
      common.cleanTraces();
      server.close();
      done();
    });
    server = app.listen(common.serverPort, function() {
      http.get({ port: common.serverPort });
    });
  });

  it('should work with options object url', function(done) {
    var app = express();
    var server;
    app.get('/', function (req, res) {
      http.get({ port: common.serverPort, path: '/self'});
      res.send(common.serverRes);
    });
    app.get('/self', function(req, res) {
      assert(req.headers[constants.TRACE_CONTEXT_HEADER_NAME]);
      res.send(common.serverRes);
      var traces = common.getTraces();
      assert.equal(traces.length, 2);
      assert.equal(traces[0].spans.length, 2);
      assert.equal(traces[1].spans.length, 1);
      assert.equal(traces[0].spans[0].name, '/');
      assert.equal(traces[0].spans[1].name, 'localhost');
      assert.equal(traces[1].spans[0].name, '/self');
      common.cleanTraces();
      server.close();
      done();
    });
    server = app.listen(common.serverPort, function() {
      http.get({ port: common.serverPort });
    });
  });

  it('should parse incoming header', function(done) {
    var app = express();
    var server;
    var context = '123456/2;o=1';
    app.get('/', function (req, res) {
      http.get({ port: common.serverPort, path: '/self'});
      res.send(common.serverRes);
    });
    app.get('/self', function(req, res) {
      assert.equal(
        req.headers[constants.TRACE_CONTEXT_HEADER_NAME].slice(0, 6),
        context.slice(0, 6));
      assert.equal(
        req.headers[constants.TRACE_CONTEXT_HEADER_NAME].slice(8),
        ';o=1');
      res.send(common.serverRes);
      var traces = common.getTraces();
      assert.equal(traces.length, 2);
      assert.equal(traces[0].spans.length, 2);
      assert.equal(traces[1].spans.length, 1);
      assert.equal(traces[0].spans[0].name, '/');
      assert.equal(traces[0].spans[1].name, 'localhost');
      assert.equal(traces[1].spans[0].name, '/self');
      common.cleanTraces();
      server.close();
      done();
    });
    server = app.listen(common.serverPort, function() {
      var headers = {};
      headers[constants.TRACE_CONTEXT_HEADER_NAME] = context;
      http.get({ port: common.serverPort, headers: headers });
    });
  });
});

export default {};
