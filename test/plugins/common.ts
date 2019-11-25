// Copyright 2015 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
'use strict';

import '../override-gcp-metadata';
import {v1 as stackdriverPropagation} from '@opencensus/propagation-stackdriver';
import { cls, TraceCLS } from '../../src/cls';
import { StackdriverTracer } from '../../src/trace-api';
import { traceWriter } from '../../src/trace-writer';
import { SpanType } from '../../src/constants';
import { TestLogger } from '../logger';
import { getBaseConfig } from '../utils';
import { alwaysTrace } from '../../src/tracing-policy';

var semver = require('semver');

var trace = require('../../..');
if (semver.satisfies(process.version, '>=8')) {
  // Monkeypatch Mocha's it() to create a fresh context with each test case.
  var oldIt = global.it;
  global.it = Object.assign(function it(title, fn) {
    // it.skip calls it without a function argument
    if (!fn) {
      return oldIt.call(this, title);
    }
    function wrappedFn() {
      if (cls.exists()) {
        return cls.get().runWithContext(() => fn.apply(this, arguments), TraceCLS.UNCORRELATED);
      } else {
        return fn.apply(this, arguments);
      }
    };
    // Mocha uses a function's length property to determine whether the
    // test case is async or not.
    Object.defineProperty(wrappedFn, 'length', {
      enumerable: false,
      configurable: true,
      writable: false,
      value: fn.length
    });
    return oldIt.call(this, title, wrappedFn);
  }, oldIt);
}

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var { teenyRequest: request } = require('teeny-request');
var shimmer = require('shimmer');

var testTraceAgent: StackdriverTracer;
shimmer.wrap(trace, 'start', function(original) {
  return function() {
    var result = original.apply(this, arguments);
    testTraceAgent = new StackdriverTracer('test');
    testTraceAgent.enable(getBaseConfig(), {
      tracePolicy: alwaysTrace(),
      logger: new TestLogger(),
      propagation: stackdriverPropagation
    });
    return result;
  };
});

var SERVER_PORT = 9042;

function replaceFunction(target, prop, fn) {
  var old = target[prop];
  target[prop] = fn;
  return old;
}

function replaceWarnLogger(fn) {
  var agent = trace.get();
  return replaceFunction(agent.logger, 'warn', fn);
}

/**
 * Cleans the tracer state between test runs.
 */
function cleanTraces() {
  traceWriter.get()['buffer'].drain();
}

function getTraces() {
  return traceWriter.get()['buffer']['traces'];
}

function getMatchingSpan(predicate) {
  var spans = getMatchingSpans(predicate);
  assert.strictEqual(spans.length, 1,
    'predicate did not isolate a single span');
  return spans[0];
}

function getMatchingSpans(predicate) {
  var list: any[] = [];
  getTraces().forEach(function(trace) {
    trace.spans.forEach(function(span) {
      if (predicate(span)) {
        list.push(span);
      }
    });
  });
  return list;
}

function runInTransaction(fn) {
  testTraceAgent.runInRootSpan({ name: 'outer' }, function(span) {
    return fn(function() {
      assert.strictEqual(span.type, SpanType.ROOT);
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
  assert.ok(span);
  var t = setTimeout(function() {
    assert.strictEqual(span.type, SpanType.CHILD);
    span.endSpan();
    if (cb) {
      cb();
    }
  }, duration);
  return function() {
    assert.strictEqual(span.type, SpanType.CHILD);
    span.endSpan();
    clearTimeout(t);
  };
}

function installNoopTraceWriter() {
  traceWriter.get().writeTrace = function() {};
}

function avoidTraceWriterAuth() {
  traceWriter.get().request = request;
}

function hasContext() {
  return cls.get().getContext().type !== SpanType.UNCORRELATED;
}

module.exports = {
  cleanTraces: cleanTraces,
  getMatchingSpan: getMatchingSpan,
  getMatchingSpans: getMatchingSpans,
  createChildSpan: createChildSpan,
  getTraces: getTraces,
  runInTransaction: runInTransaction,
  replaceFunction: replaceFunction,
  replaceWarnLogger: replaceWarnLogger,
  hasContext: hasContext,
  installNoopTraceWriter: installNoopTraceWriter,
  avoidTraceWriterAuth: avoidTraceWriterAuth,
  serverPort: SERVER_PORT,
};

export default {};
