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

import { Constants } from '../../src/constants';
import { TraceLabels } from '../../src/trace-labels';

var http = require('http');
var assert = require('assert');
var common = require('./common'/*.js*/);

var server;
var write;

describe('test-trace-connect', function() {
  var agent;
  var connect;
  before(function() {
    agent = require('../..').start({
      projectId: '0',
      ignoreUrls: ['/ignore'],
      samplingRate: 0
    });
    connect = require('./fixtures/connect3');
    // Mute stderr to satiate appveyor
    write = process.stderr.write;
    process.stderr.write = function(c, e?, cb?) {
      assert.equal(c, 1729);
      if (cb) {
        cb();
      }
      return true;
    };
  });

  after(function() {
    process.stderr.write = write;
  });

  afterEach(function() {
    common.cleanTraces();
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
      common.doRequest('GET', done, connectPredicate);
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
      common.doRequest('GET', done, connectPredicate);
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
      common.doRequest('GET', done, connectPredicate);
    });
  });

  it('should have proper trace labels', function(done) {
    var app = connect();
    app.use('/', function (req, res) {
      res.end(common.serverRes);
    });
    server = app.listen(common.serverPort, function() {
      http.get({port: common.serverPort}, function(res) {
        var labels = common.getMatchingSpan(connectPredicate).labels;
        assert.equal(labels[TraceLabels.HTTP_RESPONSE_CODE_LABEL_KEY], '200');
        assert.equal(labels[TraceLabels.HTTP_METHOD_LABEL_KEY], 'GET');
        assert.equal(labels[TraceLabels.HTTP_URL_LABEL_KEY], 'http://localhost:9042/');
        assert(labels[TraceLabels.HTTP_SOURCE_IP]);
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
        var labels = common.getMatchingSpan(connectPredicate).labels;
        var stackTrace = JSON.parse(labels[TraceLabels.STACK_TRACE_DETAILS_KEY]);
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
        var span = common.getMatchingSpan(connectPredicate);
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
        var labels = common.getMatchingSpan(connectPredicate).labels;
        assert.equal(labels[TraceLabels.HTTP_RESPONSE_CODE_LABEL_KEY], '500');
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
      var headers = {};
      headers[Constants.TRACE_CONTEXT_HEADER_NAME] = '123456/1;o=1';
      http.get({
        port: common.serverPort
      }, function(res) {
        assert(!res.headers[Constants.TRACE_CONTEXT_HEADER_NAME]);
        http.get({
          port: common.serverPort,
          headers: headers
        }, function(res) {
          assert(res.headers[Constants.TRACE_CONTEXT_HEADER_NAME].indexOf(';o=1') !== -1);
          done();
        });
      });
    });
  });

  it('should not trace ignored urls', function(done) {
    var app = connect();
    app.use('/ignore/me', function (req, res) {
      res.end(common.serverRes);
    });
    server = app.listen(common.serverPort, function() {
      http.get({port: common.serverPort, path: '/ignore/me'}, function(res) {
        assert.equal(common.getTraces().length, 0);
        done();
      });
    });
  });

  it('should end spans even if client aborts', function(done) {
    var app = connect();
    app.use('/', function (req, res) {
      setTimeout(function() {
        res.end(common.serverRes);
        setImmediate(function() {
          var traces = common.getTraces();
          assert.strictEqual(traces.length, 1);
          assert.strictEqual(traces[0].spans.length, 1);
          var span = traces[0].spans[0];
          common.assertSpanDurationCorrect(span, common.serverWait);
          done();
        });
      }, common.serverWait);
    });
    server = app.listen(common.serverPort, function() {
      var req = http.get({port: common.serverPort, path: '/'},
        function(res) {
          assert.fail();
        });
      // Need error handler to catch socket hangup error
      req.on('error', function() {});
      // Give enough time for server to receive request
      setTimeout(function() {
        req.abort();
      }, common.serverWait / 2);
    });
  });
});

function connectPredicate(span) {
  return span.name === '/';
}

export default {};
