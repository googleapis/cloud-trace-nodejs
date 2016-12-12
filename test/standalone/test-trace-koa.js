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

var common = require('../hooks/common.js');
var koa = require('../hooks/fixtures/koa1');
var http = require('http');
var assert = require('assert');
var constants = require('../../src/constants.js');
var TraceLabels = require('../../src/trace-labels.js');

var server;

describe('test-trace-koa', function() {
  afterEach(function() {
    common.cleanTraces();
    server.close();
  });

  it('should accurately measure get time, get', function(done) {
    var app = koa();
    app.use(function* () {
      this.body = yield function(cb) {
        setTimeout(function() {
          cb(null, common.serverRes);
        }, common.serverWait);
      };
    });
    server = app.listen(common.serverPort, function() {
      common.doRequest('GET', done, koaPredicate);
    });
  });

  it('should have required labels', function(done) {
    var app = koa();
    app.use(function* () {
      this.body = yield function(cb) {
        setTimeout(function() {
          cb(null, common.serverRes);
        }, common.serverWait);
      };
    });
    server = app.listen(common.serverPort, function() {
      http.get({port: common.serverPort}, function(res) {
        var result = '';
        res.on('data', function(data) { result += data; });
        res.on('end', function() {
          assert.equal(common.serverRes, result);
          var expectedKeys = [
            TraceLabels.HTTP_METHOD_LABEL_KEY,
            TraceLabels.HTTP_URL_LABEL_KEY,
            TraceLabels.HTTP_SOURCE_IP,
            TraceLabels.HTTP_RESPONSE_CODE_LABEL_KEY
          ];
          var span = common.getMatchingSpan(koaPredicate);
          expectedKeys.forEach(function(key) {
            assert(span.labels[key]);
          });
          done();
        });
      });
    });
  });

  it('should remove trace frames from stack', function(done) {
    var app = koa();
    app.use(function* () {
      this.body = yield function(cb) {
        setTimeout(function() {
          cb(null, common.serverRes);
        }, common.serverWait);
      };
    });
    server = app.listen(common.serverPort, function() {
      http.get({port: common.serverPort}, function(res) {
        var labels = common.getMatchingSpan(koaPredicate).labels;
        var stackTrace = JSON.parse(labels[TraceLabels.STACK_TRACE_DETAILS_KEY]);
        // Ensure that our middleware is on top of the stack
        assert.equal(stackTrace.stack_frame[0].method_name, 'middleware');
        done();
      });
    });
  });

  it('should not include query parameters in span name', function(done) {
    var app = koa();
    app.use(function* () {
      this.body = yield function(cb) {
        setTimeout(function() {
          cb(null, common.serverRes);
        }, common.serverWait);
      };
    });
    server = app.listen(common.serverPort, function() {
      http.get({path: '/?a=b', port: common.serverPort}, function(res) {
        var name = common.getMatchingSpan(koaPredicate).name;
        assert.equal(name, '/');
        done();
      });
    });
  });

  it('should set trace context on response', function(done) {
    var app = koa();
    app.use(function* () {
      this.body = yield function(cb) {
        setTimeout(function() {
          cb(null, common.serverRes);
        }, common.serverWait);
      };
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

function koaPredicate(span) {
  return span.name === '/';
}
