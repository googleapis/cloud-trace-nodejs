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

var common = require('./common'/*.js*/);
var http = require('http');
var assert = require('assert');
var constants = require('../../src/constants'/*.js*/);
var traceLabels = require('../../src/trace-labels'/*.js*/);
var semver = require('semver');
var appBuilders = {
  koa1: buildKoa1App
};
if (semver.satisfies(process.version, '>4')) {
  appBuilders.koa2 = buildKoa2App;
}

describe('koa', function() {
  var server;
  var agent;

  before(function() {
    agent = require('../..').start({
      projectId: '0',
      ignoreUrls: ['/ignore'],
      samplingRate: 0
    });
  });

  Object.keys(appBuilders).forEach(function(version) {
    describe(version, function() {
      var buildKoaApp = appBuilders[version];

      afterEach(function() {
        common.cleanTraces();
        server.close();
      });

      it('should accurately measure get time, get', function(done) {
        var app = buildKoaApp();
        server = app.listen(common.serverPort, function() {
          common.doRequest('GET', done, koaPredicate);
        });
      });

      it('should have required labels', function(done) {
        var app = buildKoaApp();
        server = app.listen(common.serverPort, function() {
          http.get({port: common.serverPort}, function(res) {
            var result = '';
            res.on('data', function(data) { result += data; });
            res.on('end', function() {
              assert.equal(common.serverRes, result);
              var expectedKeys = [
                traceLabels.HTTP_METHOD_LABEL_KEY,
                traceLabels.HTTP_URL_LABEL_KEY,
                traceLabels.HTTP_SOURCE_IP,
                traceLabels.HTTP_RESPONSE_CODE_LABEL_KEY
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
        var app = buildKoaApp();
        server = app.listen(common.serverPort, function() {
          http.get({port: common.serverPort}, function(res) {
            var labels = common.getMatchingSpan(koaPredicate).labels;
            var stackTrace = JSON.parse(labels[traceLabels.STACK_TRACE_DETAILS_KEY]);
            // Ensure that our middleware is on top of the stack
            assert.equal(stackTrace.stack_frame[0].method_name, 'middleware');
            done();
          });
        });
      });

      it('should not include query parameters in span name', function(done) {
        var app = buildKoaApp();
        server = app.listen(common.serverPort, function() {
          http.get({path: '/?a=b', port: common.serverPort}, function(res) {
            var name = common.getMatchingSpan(koaPredicate).name;
            assert.equal(name, '/');
            done();
          });
        });
      });

      it('should set trace context on response', function(done) {
        var app = buildKoaApp();
        server = app.listen(common.serverPort, function() {
          var headers = {};
          headers[constants.TRACE_CONTEXT_HEADER_NAME] = '123456/1;o=1';
          http.get({port: common.serverPort}, function(res) {
            assert(!res.headers[constants.TRACE_CONTEXT_HEADER_NAME]);
            http.get({
              port: common.serverPort,
              headers: headers
            }, function(res) {
              assert(res.headers[constants.TRACE_CONTEXT_HEADER_NAME].indexOf(';o=1') !== -1);
              done();
            });
          });
        });
      });

      it('should not trace ignored urls', function(done) {
        var app = buildKoaApp();
        server = app.listen(common.serverPort, function() {
          http.get({port: common.serverPort, path: '/ignore/me'}, function(res) {
            assert.equal(common.getTraces().length, 0);
            done();
          });
        });
      });

      it('should end spans when client aborts request', function(done) {
        var app = buildKoaApp();
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
        setTimeout(function() {
          // Unlike with express and other frameworks, koa doesn't call
          // res.end if the request was aborted. As a call to res.end is
          // conditional on this client-side behavior, we also end a span in
          // koa if the 'aborted' event is emitted.
          var traces = common.getTraces();
          assert.strictEqual(traces.length, 1);
          assert.strictEqual(traces[0].spans.length, 1);
          var span = traces[0].spans[0];
          assert.strictEqual(span.labels[traceLabels.ERROR_DETAILS_NAME],
            'aborted');
          assert.strictEqual(span.labels[traceLabels.ERROR_DETAILS_MESSAGE],
            'client aborted the request');
          common.assertSpanDurationCorrect(span, common.serverWait / 2);
          done();
        }, common.serverWait);
      });
    });
  });
});

function koaPredicate(span) {
  return span.name === '/';
}

function buildKoa1App() {
  var koa = require('./fixtures/koa1');
  var app = koa();
  app.use(function* () {
    this.body = yield function(cb) {
      setTimeout(function() {
        cb(null, common.serverRes);
      }, common.serverWait);
    };
  });
  return app;
}

function buildKoa2App() {
  var Koa = require('./fixtures/koa2');
  var app = new Koa();
  app.use(function(ctx, next) {
    return new Promise(function(res, rej) {
      setTimeout(function() {
        next().then(function() {
          ctx.body = common.serverRes;
          res();
        });
      }, common.serverWait);
    });
  });
  return app;
}

export default {};
