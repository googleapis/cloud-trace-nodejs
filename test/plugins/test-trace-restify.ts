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

var traceLabels = require('../../src/trace-labels'/*.js*/);
var http = require('http');
var assert = require('assert');
var constants = require('../../src/constants'/*.js*/);
var common = require('./common'/*.js*/);
var semver = require('semver');
var versions: any = {
  restify4: './fixtures/restify4'
};
if (semver.satisfies(process.version, '<7')) {
  versions.restify3 = './fixtures/restify3';
}

describe('restify', function() {
  var agent;

  before(function() {
    agent = require('../..').start({
      projectId: '0',
      ignoreUrls: ['/ignore'],
      samplingRate: 0
    });
  });

  var server;
  var write;

  Object.keys(versions).forEach(function(version) {
    describe(version, function() {
      var restify;
      before(function() {
        restify = require(versions[version]);

        // Mute stderr to satiate appveyor
        write = process.stderr.write;
        process.stderr.write = function(c, e?, cb?) {
          assert(c.indexOf('DeprecationWarning') !== -1);
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

      it('should accurately measure get time, get', function(done) {
        server = restify.createServer();
        server.get('/', function (req, res, next) {
          setTimeout(function() {
            res.writeHead(200, {
              'Content-Type': 'text/plain'
            });
            res.write(common.serverRes);
            res.end();
            return next();
          }, common.serverWait);
        });
        server.listen(common.serverPort, function(){
          common.doRequest('GET', done, restifyPredicate);
        });
      });

      it('should accurately measure get time, post', function(done) {
        server = restify.createServer();
        server.post('/', function (req, res, next) {
          setTimeout(function() {
            res.writeHead(200, {
              'Content-Type': 'text/plain'
            });
            res.write(common.serverRes);
            res.end();
            return next();
          }, common.serverWait);
        });
        server.listen(common.serverPort, function(){
          common.doRequest('POST', done, restifyPredicate);
        });
      });

      it('should accurately measure get time, multiple handlers', function(done) {
        server = restify.createServer();
        server.get('/', function (req, res, next) {
          setTimeout(function() {
            return next();
          }, common.serverWait / 2);
        }, function (req, res, next) {
          setTimeout(function() {
            res.writeHead(200, {
              'Content-Type': 'text/plain'
            });
            res.write(common.serverRes);
            res.end();
            return next();
          }, common.serverWait / 2);
        });
        server.listen(common.serverPort, function(){
          common.doRequest('GET', done, restifyPredicate);
        });
      });

      it('should accurately measure get time, regex path', function(done) {
        server = restify.createServer();
        server.get(/\/([^&=?]*)/, function (req, res, next) {
          setTimeout(function() {
            res.writeHead(200, {
              'Content-Type': 'text/plain'
            });
            res.write(common.serverRes);
            res.end();
            return next();
          }, common.serverWait);
        });
        server.listen(common.serverPort, function(){
          common.doRequest('GET', done, restifyPredicate);
        });
      });

      it('should accurately measure get time, use and get', function(done) {
        server = restify.createServer();
        server.use(function (req, res, next) {
          setTimeout(function() {
            return next();
          }, common.serverWait / 2);
        });
        server.get('/', function (req, res, next) {
          setTimeout(function() {
            res.writeHead(200, {
              'Content-Type': 'text/plain'
            });
            res.write(common.serverRes);
            res.end();
            return next();
          }, common.serverWait / 2);
        });
        server.listen(common.serverPort, function(){
          common.doRequest('GET', done, restifyPredicate);
        });
      });

      it('should have proper labels', function(done) {
        server = restify.createServer();
        server.get('/', function (req, res, next) {
          res.writeHead(200, {
            'Content-Type': 'text/plain'
          });
          res.write(common.serverRes);
          res.end();
          return next();
        });
        server.listen(common.serverPort, function(){
          http.get({port: common.serverPort}, function(res) {
            var labels = common.getMatchingSpan(restifyPredicate).labels;
            assert.equal(labels[traceLabels.HTTP_RESPONSE_CODE_LABEL_KEY], '200');
            assert.equal(labels[traceLabels.HTTP_METHOD_LABEL_KEY], 'GET');
            assert.equal(labels[traceLabels.HTTP_URL_LABEL_KEY], 'http://localhost:9042/');
            assert(labels[traceLabels.HTTP_SOURCE_IP]);
            done();
          });
        });
      });

      it('should remove trace frames from stack', function(done) {
        server = restify.createServer();
        server.get('/', function (req, res, next) {
          res.writeHead(200, {
            'Content-Type': 'text/plain'
          });
          res.write(common.serverRes);
          res.end();
          return next();
        });
        server.listen(common.serverPort, function() {
          http.get({port: common.serverPort}, function(res) {
            var labels = common.getMatchingSpan(restifyPredicate).labels;
            var stackTrace = JSON.parse(labels[traceLabels.STACK_TRACE_DETAILS_KEY]);
            // Ensure that our middleware is on top of the stack
            assert.equal(stackTrace.stack_frame[0].method_name, 'middleware');
            done();
          });
        });
      });

      it('should not include query parameters in span name', function(done) {
        server = restify.createServer();
        server.get('/', function (req, res, next) {
          res.writeHead(200, {
            'Content-Type': 'text/plain'
          });
          res.write(common.serverRes);
          res.end();
          return next();
        });
        server.listen(common.serverPort, function() {
          http.get({path: '/?a=b', port: common.serverPort}, function(res) {
            var span = common.getMatchingSpan(restifyPredicate);
            assert.equal(span.name, '/');
            done();
          });
        });
      });

      it('should set trace context on response', function(done) {
        server = restify.createServer();
        server.get('/', function (req, res, next) {
          res.writeHead(200, {
            'Content-Type': 'text/plain'
          });
          res.write(common.serverRes);
          res.end();
          return next();
        });
        server.listen(common.serverPort, function() {
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
        server = restify.createServer();
        server.get('/ignore/me', function (req, res, next) {
          res.writeHead(200, {
            'Content-Type': 'text/plain'
          });
          res.write(common.serverRes);
          res.end();
          return next();
        });
        server.listen(common.serverPort, function() {
          http.get({port: common.serverPort, path: '/ignore/me'}, function(res) {
            assert.equal(common.getTraces().length, 0);
            done();
          });
        });
      });

      it('should end spans even if client aborts', function(done) {
        server = restify.createServer();
        server.get('/', function (req, res, next) {
          setTimeout(function() {
            res.write(common.serverRes);
            res.end();
            setImmediate(function() {
              var traces = common.getTraces();
              assert.strictEqual(traces.length, 1);
              assert.strictEqual(traces[0].spans.length, 1);
              var span = traces[0].spans[0];
              common.assertSpanDurationCorrect(span, common.serverWait);
              done();
            });
            return next();
          }, common.serverWait);
        });
        server.listen(common.serverPort, function() {
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
  });
});

function restifyPredicate(span) {
  return span.name === '/';
}

export default {};
