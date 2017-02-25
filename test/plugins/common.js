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

if (!process.env.GCLOUD_PROJECT) {
  console.log('The GCLOUD_PROJECT environment variable must be set.');
  process.exit(1);
}

// We want to disable publishing to avoid conflicts with production.
require('../../src/trace-writer').publish_ = function() {};

var cls = require('../../src/cls.js');
var pluginLoader = require('../../src/trace-plugin-loader.js');

var assert = require('assert');
var http = require('http');
var fs = require('fs');
var path = require('path');
var request = require('request');

var FORGIVENESS = 0.2;
var SERVER_WAIT = 200;
var SERVER_PORT = 9042;
var SERVER_RES = '1729';
var SERVER_KEY = fs.readFileSync(path.join(__dirname, 'fixtures', 'key.pem'));
var SERVER_CERT = fs.readFileSync(path.join(__dirname, 'fixtures', 'cert.pem'));

function init(agent) {
  var privateAgent = agent.private_();
  privateAgent._shouldTraceArgs = [];
  var shouldTrace = privateAgent.shouldTrace;
  privateAgent.shouldTrace = function() {
    privateAgent._shouldTraceArgs.push([].slice.call(arguments, 0));
    return shouldTrace.apply(this, arguments);
  };
}

function replaceFunction(target, prop, fn) {
  var old = target[prop];
  target[prop] = fn;
  return old;
}

function replaceWarnLogger(agent, fn) {
  return replaceFunction(agent.private_().logger, 'warn', fn);
}

function replaceTracingPolicy(agent, fn) {
  return replaceFunction(agent.private_(), 'policy', fn);
}

/**
 * Cleans the tracer state between test runs.
 */
function cleanTraces(agent) {
  if (arguments.length !== 1) {
    throw new Error('cleanTraces() expected 1 argument.  ' +
      'Received: ' + arguments.length);
  }

  var privateAgent = agent.private_();
  privateAgent.traceWriter.buffer_ = [];
  privateAgent._shouldTraceArgs = [];
}

function getTraces(agent) {
  if (arguments.length !== 1) {
    throw new Error('getTraces() expected 1 argument.  ' +
      'Received: ' + arguments.length);
  }

  return agent.private_().traceWriter.buffer_.map(JSON.parse);
}

function getShouldTraceArgs(agent) {
  if (arguments.length !== 1) {
    throw new Error('getSHouldTraceArgs() expected 1 argument.  ' +
      'Received: ' + arguments.length);
  }

  return agent.private_()._shouldTraceArgs;
}

function getMatchingSpan(agent, predicate) {
  if (arguments.length !== 2) {
    throw new Error('getMatchingSpan() expected 2 arguments.  ' +
      'Received: ' + arguments.length);
  }

  var spans = getMatchingSpans(agent, predicate);
  assert.equal(spans.length, 1,
    'predicate did not isolate a single span');
  return spans[0];
}

function getMatchingSpans(agent, predicate) {
  if (arguments.length !== 2) {
    throw new Error('getMatchingSpans() expected 2 arguments.  ' +
      'Received: ' + arguments.length);
  }
  var list = [];
  getTraces(agent).forEach(function(trace) {
    trace.spans.forEach(function(span) {
      if (predicate(span)) {
        list.push(span);
      }
    });
  });
  return list;
}

function assertSpanDurationCorrect(span, expectedDuration) {
  if (arguments.length !== 2) {
    throw new Error('assertSpanDurationCorrect() expected 2 argument.  ' +
      'Received: ' + arguments.length);
  }

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
function assertDurationCorrect(agent, expectedDuration, predicate) {
  if (arguments.length < 2) {
    throw new Error('assertDurationCorrect() expected at least two argument.  ' +
      'Received: ' + arguments.length);
  }

  // We assume that the tests never care about top level transactions created
  // by the harness itself
  predicate = predicate || function(span) { return span.name !== 'outer'; };
  var span = getMatchingSpan(agent, predicate);
  assertSpanDurationCorrect(span, expectedDuration);
}

function doRequest(agent, method, done, tracePredicate, path) {
  if (arguments.length < 4) {
    throw new Error('doRequest() expected at least 4 arguments.  ' +
      'Received: ' + arguments.length);
  }

  var start = Date.now();
  http.get({port: SERVER_PORT, method: method, path: path || '/'}, function(res) {
    var result = '';
    res.on('data', function(data) { result += data; });
    res.on('end', function() {
      assert.equal(SERVER_RES, result);
      assertDurationCorrect(agent, Date.now() - start, tracePredicate);
      done();
    });
  });
}

function runInTransaction(agent, fn) {
  if (arguments.length !== 2) {
    throw new Error('runInTransaction() expected 2 arguments.  ' +
      'Received: ' + arguments.length);
  }

  cls.getNamespace().run(function() {
    var spanData = agent.private_().createRootSpanData('outer');
    fn(function() {
      spanData.close();
    });
  });
}

// Creates a child span that closes after the given duration.
// Also calls cb after that duration.
// Returns a method which, when called, closes the child span
// right away and cancels callback from being called after the duration.
function createChildSpan(agent, cb, duration) {
  if (arguments.length !== 3) {
    throw new Error('createChildSpan() expected 3 arguments.  ' +
      'Received: ' + arguments.length);
  }

  var privateAgent = agent.private_();
  var span = privateAgent.startSpan('inner');
  var t = setTimeout(function() {
    privateAgent.endSpan(span);
    if (cb) {
      cb();
    }
  }, duration);
  return function() {
    privateAgent.endSpan(span);
    clearTimeout(t);
  };
}

function createRootSpanData(agent, name, traceId, parentId, skipFrames,
                            spanKind) {
  return agent.private_().createRootSpanData(name, traceId, parentId,
                                             skipFrames, spanKind);
}

function getConfig(agent) {
  return agent.private_().config();
}

function installNoopTraceWriter(agent) {
  agent.private_().traceWriter.writeSpan = function() {};
}

function avoidTraceWriterAuth(agent) {
  agent.private_().traceWriter.request = request;
}

function stopAgent(agent) {
  if (agent.isActive()) {
    agent.private_().stop();
    agent.disable_();
    pluginLoader.deactivate();
  }
}

function clearNamespace(agent) {
  cls.destroyNamespace();
  agent.private_().namespace = cls.createNamespace();
}

module.exports = {
  init: init,
  assertSpanDurationCorrect: assertSpanDurationCorrect,
  assertDurationCorrect: assertDurationCorrect,
  cleanTraces: cleanTraces,
  getMatchingSpan: getMatchingSpan,
  getMatchingSpans: getMatchingSpans,
  doRequest: doRequest,
  createChildSpan: createChildSpan,
  getTraces: getTraces,
  runInTransaction: runInTransaction,
  getShouldTraceArgs: getShouldTraceArgs,
  replaceWarnLogger: replaceWarnLogger,
  replaceTracingPolicy: replaceTracingPolicy,
  createRootSpanData: createRootSpanData,
  clearNamespace: clearNamespace,
  getConfig: getConfig,
  installNoopTraceWriter: installNoopTraceWriter,
  avoidTraceWriterAuth: avoidTraceWriterAuth,
  stopAgent: stopAgent,
  serverWait: SERVER_WAIT,
  serverRes: SERVER_RES,
  serverPort: SERVER_PORT,
  serverKey: SERVER_KEY,
  serverCert: SERVER_CERT
};
