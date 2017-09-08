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

var common = require('./common'/*.js*/);
var http = require('http');
var assert = require('assert');
var semver = require('semver');

var server;

var versions = {
  hapi8: './fixtures/hapi8',
  hapi9: './fixtures/hapi9',
  hapi10: './fixtures/hapi10',
  hapi11: './fixtures/hapi11',
  hapi12: './fixtures/hapi12',
  hapi13: './fixtures/hapi13',
  hapi14: './fixtures/hapi14',
  hapi15: './fixtures/hapi15',
  hapi16: './fixtures/hapi16'
};

describe('hapi', function() {
  var agent;

  before(function() {
    agent = require('../..').start({
      projectId: '0',
      ignoreUrls: ['/ignore'],
      samplingRate: 0
    });
  });

  Object.keys(versions).forEach(function(version) {
    if (Number(version.substring(4)) > 10 && semver.satisfies(process.version, '<4')) {
      // v11 started using ES6 features (const)
      return;
    }
    describe(version, function() {
      var hapi;

      before(function() {
        hapi = require(versions[version]);
      });

      afterEach(function(done) {
        common.cleanTraces();
        server.stop(done);
      });

      it('should accurately measure get time, get', function(done) {
        server = new hapi.Server();
        server.connection({ port: common.serverPort });
        server.route({
          method: 'GET',
          path: '/',
          handler: function(req, reply) {
            setTimeout(function() {
              reply(common.serverRes);
            }, common.serverWait);
          }
        });
        server.start(function() {
          common.doRequest('GET', done, hapiPredicate);
        });
      });

      it('should accurately measure get time, post', function(done) {
        server = new hapi.Server();
        server.connection({ port: common.serverPort });
        server.route({
          method: 'POST',
          path: '/',
          handler: function(req, reply) {
            setTimeout(function() {
              reply(common.serverRes);
            }, common.serverWait);
          }
        });
        server.start(function() {
          common.doRequest('POST', done, hapiPredicate);
        });
      });

      it('should accurately measure get time, custom handlers', function(done) {
        server = new hapi.Server();
        server.connection({ port: common.serverPort });
        server.handler('custom', function(route, options) {
          return function(requeset, reply) {
            setTimeout(function() {
              reply(options.val);
            }, common.serverWait);
          };
        });
        server.route({
          method: 'GET',
          path: '/',
          handler: { custom: { val: common.serverRes } }
        });
        server.start(function() {
          common.doRequest('GET', done, hapiPredicate);
        });
      });

      it('should accurately measure get time, custom plugin', function(done) {
        var plugin = Object.assign(function(server, options, next) {
          server.route({
            method: 'GET',
            path: '/',
            handler: function(req, reply) {
              setTimeout(function() {
                reply(common.serverRes);
              }, common.serverWait);
            }
          });
          return next();
        }, {
          attributes: {
            name: 'plugin',
            version: '1.0.0'
          }
        });
        server = new hapi.Server();
        server.connection({ port: common.serverPort });
        server.register({
          register: plugin,
          options : {}
        }, function(err) {
          assert(!err);
          server.start(function() {
            common.doRequest('GET', done, hapiPredicate);
          });
        });
      });

      it('should accurately measure get time, after + get', function(done) {
        if (Number(version.substring(4)) > 10) {
          // after was removed in v11 https://github.com/hapijs/hapi/issues/2850
          return done();
        }
        var afterSuccess = false;
        server = new hapi.Server();
        server.connection({ port: common.serverPort });
        server.after(function(server, next) {
          afterSuccess = true;
          next();
        });
        server.route({
          method: 'GET',
          path: '/',
          handler: function(req, reply) {
            setTimeout(function() {
              reply(common.serverRes);
            }, common.serverWait);
          }
        });
        server.start(function() {
          assert(afterSuccess);
          common.doRequest('GET', done, hapiPredicate);
        });
      });

      it('should accurately measure get time, extension + get', function(done) {
        var extensionSuccess = false;
        server = new hapi.Server();
        server.connection({ port: common.serverPort });
        server.ext('onRequest', function(request, reply) {
          setTimeout(function() {
            extensionSuccess = true;
            return reply.continue();
          }, common.serverWait / 2);
        });
        server.route({
          method: 'GET',
          path: '/',
          handler: function(req, reply) {
            setTimeout(function() {
              reply(common.serverRes);
            }, common.serverWait / 2);
          }
        });
        server.start(function() {
          var cb = function() {
            assert(extensionSuccess);
            done();
          };
          common.doRequest('GET', cb, hapiPredicate);
        });
      });

      it('should have proper labels', function(done) {
        server = new hapi.Server();
        server.connection({ port: common.serverPort });
        server.route({
          method: 'GET',
          path: '/',
          handler: function(req, reply) {
            reply(common.serverRes);
          }
        });
        server.start(function() {
          http.get({port: common.serverPort}, function(res) {
            var labels = common.getMatchingSpan(hapiPredicate).labels;
            assert.equal(labels[TraceLabels.HTTP_RESPONSE_CODE_LABEL_KEY], '200');
            assert.equal(labels[TraceLabels.HTTP_METHOD_LABEL_KEY], 'GET');
            assert.equal(labels[TraceLabels.HTTP_URL_LABEL_KEY], 'http://localhost:9042/');
            assert(labels[TraceLabels.HTTP_SOURCE_IP]);
            done();
          });
        });
      });

      it('should remove trace frames from stack', function(done) {
        server = new hapi.Server();
        server.connection({ port: common.serverPort });
        server.route({
          method: 'GET',
          path: '/',
          handler: function(req, reply) {
            reply(common.serverRes);
          }
        });
        server.start(function() {
          http.get({port: common.serverPort}, function(res) {
            var labels = common.getMatchingSpan(hapiPredicate).labels;
            var stackTrace = JSON.parse(labels[TraceLabels.STACK_TRACE_DETAILS_KEY]);
            // Ensure that our middleware is on top of the stack
            assert.equal(stackTrace.stack_frame[0].method_name, 'middleware');
            done();
          });
        });
      });

      it('should not include query parameters in span name', function(done) {
        server = new hapi.Server();
        server.connection({ port: common.serverPort });
        server.route({
          method: 'GET',
          path: '/',
          handler: function(req, reply) {
            reply(common.serverRes);
          }
        });
        server.start(function() {
          http.get({path: '/?a=b', port: common.serverPort}, function(res) {
            var span = common.getMatchingSpan(hapiPredicate);
            assert.equal(span.name, '/');
            done();
          });
        });
      });

      it('should set trace context on response', function(done) {
        server = new hapi.Server();
        server.connection({ port: common.serverPort });
        server.route({
          method: 'GET',
          path: '/',
          handler: function(req, reply) {
            reply(common.serverRes);
          }
        });
        server.start(function() {
          var headers = {};
          headers[Constants.TRACE_CONTEXT_HEADER_NAME] = '123456/1;o=1';
          http.get({port: common.serverPort}, function(res) {
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
        server = new hapi.Server();
        server.connection({ port: common.serverPort });
        server.route({
          method: 'GET',
          path: '/ignore/me',
          handler: function (req, reply) {
            reply(common.serverRes);
          }
        });
        server.start(function() {
          http.get({port: common.serverPort, path: '/ignore/me'}, function(res) {
            assert.equal(common.getTraces().length, 0);
            done();
          });
        });
      });

      it('should end spans when client aborts request', function(done) {
        server = new hapi.Server();
        server.connection({ port: common.serverPort });
        server.route({
          method: 'GET',
          path: '/',
          handler: function (req, reply) {
            // Unlike with express and other frameworks, hapi doesn't call
            // res.end if the request was aborted. As a call to res.end is
            // conditional on this client-side behavior, we also listen for the
            // 'aborted' event, and end the span there.
            req.raw.req.on('aborted', function() {
              var traces = common.getTraces();
              assert.strictEqual(traces.length, 1);
              assert.strictEqual(traces[0].spans.length, 1);
              var span = traces[0].spans[0];
              assert.strictEqual(span.labels[TraceLabels.ERROR_DETAILS_NAME],
                'aborted');
              assert.strictEqual(span.labels[TraceLabels.ERROR_DETAILS_MESSAGE],
                'client aborted the request');
              common.assertSpanDurationCorrect(span, common.serverWait);
              done();
            });
          }
        });
        server.start(function() {
          var req = http.get({port: common.serverPort, path: '/'},
            function(res) {
              assert.fail();
            });
          // Need error handler to catch socket hangup error
          req.on('error', function() {});
          // Give enough time for server to receive request
          setTimeout(function() {
            req.abort();
          }, common.serverWait);
        });
      });
    });
  });
});

function hapiPredicate(span) {
  return span.name === '/';
}

export default {};
