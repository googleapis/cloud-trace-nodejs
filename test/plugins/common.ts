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

var proxyquire  = require('proxyquire');
// Monkeypatch gcp-metadata to not ask for retries at all.
proxyquire('gcp-metadata', {
  'retry-request': require('request')
});

var semver = require('semver');

var logger = require('@google-cloud/common').logger;
var trace = require('../..');
var cls = require('../../src/cls'/*.js*/);
if (semver.satisfies(process.version, '>=8') && process.env.GCLOUD_TRACE_NEW_CONTEXT) {
  // Monkeypatch the monkeypatcher
  var oldIt = global.it;
  global.it = function it(title, fn) {
    return oldIt.call(this, title, cls.createNamespace().bind(fn));
  };
}
var tracePolicy = require('../../src/tracing-policy'/*.js*/);
var TraceWriter = require('../../src/trace-writer'/*.js*/);

var assert = require('assert');
var http = require('http');
var fs = require('fs');
var path = require('path');
var request = require('request');
var shimmer = require('shimmer');

var TraceAgent = require('../../src/trace-api'/*.js*/);
var testTraceAgent;
shimmer.wrap(trace, 'start', function(original) {
  return function() {
    var result = original.apply(this, arguments);
    testTraceAgent = new TraceAgent('test');
    testTraceAgent.enable(logger(), {
      enhancedDatabaseReporting: false,
      ignoreTraceContext: false
    });
    testTraceAgent.policy_ = new tracePolicy.TraceAllPolicy();
    return result;
  };
});

var FORGIVENESS = 0.2;
var SERVER_WAIT = 200;
var SERVER_PORT = 9042;
var SERVER_RES = '1729';
var SERVER_KEY = fs.readFileSync(path.join(__dirname, 'fixtures', 'key.pem'));
var SERVER_CERT = fs.readFileSync(path.join(__dirname, 'fixtures', 'cert.pem'));

function replaceFunction(target, prop, fn) {
  var old = target[prop];
  target[prop] = fn;
  return old;
}

function replaceWarnLogger(fn) {
  var agent = trace.get();
  return replaceFunction(agent.logger_, 'warn', fn);
}

/**
 * Cleans the tracer state between test runs.
 */
function cleanTraces() {
  TraceWriter.get().buffer_ = [];
}

function getTraces() {
  return TraceWriter.get().buffer_.map(JSON.parse);
}

function getMatchingSpan(predicate) {
  var spans = getMatchingSpans(predicate);
  assert.equal(spans.length, 1,
    'predicate did not isolate a single span');
  return spans[0];
}

function getMatchingSpans(predicate) {
  var list = [];
  getTraces().forEach(function(trace) {
    trace.spans.forEach(function(span) {
      if (predicate(span)) {
        list.push(span);
      }
    });
  });
  return list;
}

function assertSpanDurationCorrect(span, expectedDuration) {
  var duration = Date.parse(span.endTime) - Date.parse(span.startTime);
  assert(duration > expectedDuration * (1 - FORGIVENESS),
      'Duration was ' + duration + ', expected ' + expectedDuration);
  assert(duration < expectedDuration * (1 + FORGIVENESS),
      'Duration was ' + duration + ', expected ' + expectedDuration);
}

/**
 * Verifies that the duration of the span captured
 * by the tracer matching the predicate `predicate`
 * is greater than the expected duration but within the
 * forgiveness factor of it.
 *
 * If no span predicate is supplied, it is assumed that
 * exactly one span has been recorded and the predicate
 * (t -> True) will be used.
 *
 * @param {function(?)=} predicate
 */
function assertDurationCorrect(expectedDuration, predicate) {
  // We assume that the tests never care about top level transactions created
  // by the harness itself
  predicate = predicate || function(span) { return span.name !== 'outer'; };
  var span = getMatchingSpan(predicate);
  assertSpanDurationCorrect(span, expectedDuration);
}

function doRequest(method, done, tracePredicate, path) {
  var start = Date.now();
  http.get({port: SERVER_PORT, method: method, path: path || '/'}, function(res) {
    var result = '';
    res.on('data', function(data) { result += data; });
    res.on('end', function() {
      assert.equal(SERVER_RES, result);
      assertDurationCorrect(Date.now() - start, tracePredicate);
      done();
    });
  });
}

function runInTransaction(fn) {
  testTraceAgent.runInRootSpan({ name: 'outer' }, function(span) {
    assert.ok(span);
    fn(function() {
      span.endSpan();
    });
  });
}

// Creates a child span that closes after the given duration.
// Also calls cb after that duration.
// Returns a method which, when called, closes the child span
// right away and cancels callback from being called after the duration.
function createChildSpan(cb, duration) {
  var span = testTraceAgent.createChildSpan({ name: 'inner' });
  assert(span);
  var t = setTimeout(function() {
    span.endSpan();
    if (cb) {
      cb();
    }
  }, duration);
  return function() {
    span.endSpan();
    clearTimeout(t);
  };
}

function installNoopTraceWriter() {
  TraceWriter.get().writeSpan = function() {};
}

function avoidTraceWriterAuth() {
  TraceWriter.get().request = request;
}

function hasContext() {
  return !!cls.getRootContext();
}

module.exports = {
  assertSpanDurationCorrect: assertSpanDurationCorrect,
  assertDurationCorrect: assertDurationCorrect,
  cleanTraces: cleanTraces,
  getMatchingSpan: getMatchingSpan,
  getMatchingSpans: getMatchingSpans,
  doRequest: doRequest,
  createChildSpan: createChildSpan,
  getTraces: getTraces,
  runInTransaction: runInTransaction,
  replaceFunction: replaceFunction,
  replaceWarnLogger: replaceWarnLogger,
  hasContext: hasContext,
  installNoopTraceWriter: installNoopTraceWriter,
  avoidTraceWriterAuth: avoidTraceWriterAuth,
  serverWait: SERVER_WAIT,
  serverRes: SERVER_RES,
  serverPort: SERVER_PORT,
  serverKey: SERVER_KEY,
  serverCert: SERVER_CERT
};

export default {};
