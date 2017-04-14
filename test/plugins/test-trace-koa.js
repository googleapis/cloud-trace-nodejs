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

var common = require('./common.js');
var http = require('http');
var assert = require('assert');
var constants = require('../../src/constants.js');
var TraceLabels = require('../../src/trace-labels.js');
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
      ignoreUrls: ['/ignore'],
      samplingRate: 0
    });
  });

  Object.keys(appBuilders).forEach(function(version) {
    describe(version, function() {
      var buildKoaApp = appBuilders[version];

      afterEach(function() {
        common.cleanTraces(agent);
        server.close();
      });

      it('should accurately measure get time, get', function(done) {
        var app = buildKoaApp();
        server = app.listen(common.serverPort, function() {
          common.doRequest(agent, 'GET', done, koaPredicate);
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
                TraceLabels.HTTP_METHOD_LABEL_KEY,
                TraceLabels.HTTP_URL_LABEL_KEY,
                TraceLabels.HTTP_SOURCE_IP,
                TraceLabels.HTTP_RESPONSE_CODE_LABEL_KEY
              ];
              var span = common.getMatchingSpan(agent, koaPredicate);
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
            var labels = common.getMatchingSpan(agent, koaPredicate).labels;
            var stackTrace = JSON.parse(labels[TraceLabels.STACK_TRACE_DETAILS_KEY]);
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
            var name = common.getMatchingSpan(agent, koaPredicate).name;
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
            assert.equal(common.getTraces(agent).length, 0);
            done();
          });
        });
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
