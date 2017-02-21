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

var traceLabels = require('../../src/trace-labels.js');
var http = require('http');
var assert = require('assert');
var constants = require('../../src/constants.js');
var common = require('./common.js');

var server;
var write;

describe('test-trace-connect', function() {
  var agent;
  var connect;
  before(function() {
    agent = require('../..').start({ samplingRate: 0 });
    connect = require('./fixtures/connect3');
    // Mute stderr to satiate appveyor
    write = process.stderr.write;
    process.stderr.write = function(c, e, cb) {
      assert.equal(c, 1729);
      if (cb) {
        cb();
      }
    };
  });

  after(function() {
    process.stderr.write = write;
  });

  afterEach(function() {
    common.cleanTraces(agent);
    server.close();
  });

  it('should accurately measure time (one middleware layer)', function(done) {
    var app = connect();
    app.use(function(req, res) {
      setTimeout(function() {
        res.end(common.serverRes);
      }, common.serverWait);
    });
    server = app.listen(common.serverPort, function() {
      common.doRequest(agent, 'GET', done, connectPredicate);
    });
  });

  it('should accurately measure time (two middleware layers)', function(done) {
    var app = connect();
    app.use(function(req, res, next) {
      setTimeout(function() {
        next();
      }, common.serverWait / 2);
    });
    app.use(function(req, res) {
      setTimeout(function() {
        res.end(common.serverRes);
      }, common.serverWait / 2);
    });
    server = app.listen(common.serverPort, function() {
      common.doRequest(agent, 'GET', done, connectPredicate);
    });
  });

  it('should accurately measure time up until res.end', function(done) {
    var app = connect();
    app.use(function(req, res, next) {
      setTimeout(function() {
        res.end(common.serverRes);
        setTimeout(next, common.serverWait);
      }, common.serverWait);
    });
    server = app.listen(common.serverPort, function() {
      common.doRequest(agent, 'GET', done, connectPredicate);
    });
  });

  it('should have proper trace labels', function(done) {
    var app = connect();
    app.use('/', function (req, res) {
      res.end(common.serverRes);
    });
    server = app.listen(common.serverPort, function() {
      http.get({port: common.serverPort}, function(res) {
        var labels = common.getMatchingSpan(agent, connectPredicate).labels;
        assert.equal(labels[traceLabels.HTTP_RESPONSE_CODE_LABEL_KEY], '200');
        assert.equal(labels[traceLabels.HTTP_METHOD_LABEL_KEY], 'GET');
        assert.equal(labels[traceLabels.HTTP_URL_LABEL_KEY], 'http://localhost:9042/');
        assert(labels[traceLabels.HTTP_SOURCE_IP]);
        done();
      });
    });
  });

  it('should remove trace frames from stack', function(done) {
    var app = connect();
    app.use(function middleware(req, res) {
      res.end(common.serverRes);
    });
    server = app.listen(common.serverPort, function() {
      http.get({port: common.serverPort}, function(res) {
        var labels = common.getMatchingSpan(agent, connectPredicate).labels;
        var stackTrace = JSON.parse(labels[traceLabels.STACK_TRACE_DETAILS_KEY]);
        // Ensure that our middleware is on top of the stack
        assert.equal(stackTrace.stack_frame[0].method_name, 'middleware');
        done();
      });
    });
  });

  it('should not include query parameters in span name', function(done) {
    var app = connect();
    app.use(function middleware(req, res) {
      res.end(common.serverRes);
    });
    server = app.listen(common.serverPort, function() {
      http.get({path: '/?a=b', port: common.serverPort}, function(res) {
        var span = common.getMatchingSpan(agent, connectPredicate);
        assert.equal(span.name, '/');
        done();
      });
    });
  });

  it('should handle thrown errors', function(done) {
    var app = connect();
    app.use('/', function(req, res) {
      throw common.serverRes;
    });
    server = app.listen(common.serverPort, function() {
      http.get({port: common.serverPort}, function(res) {
        var labels = common.getMatchingSpan(agent, connectPredicate).labels;
        assert.equal(labels[traceLabels.HTTP_RESPONSE_CODE_LABEL_KEY], '500');
        done();
      });
    });
  });

  it('should set trace context on response', function(done) {
    var app = connect();
    app.use(function (req, res) {
      res.end(common.serverRes);
    });
    server = app.listen(common.serverPort, function() {
      http.get({port: common.serverPort}, function(res) {
        assert(
          res.headers[constants.TRACE_CONTEXT_HEADER_NAME].indexOf(';o=1') !== -1);
        done();
      });
    });
  });
});

function connectPredicate(span) {
  return span.name === '/';
}
