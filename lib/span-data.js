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

var TraceSpan = require('./trace-span.js');
var TraceLabels = require('./trace-labels.js');

// Auto-incrementing integer
var uid = 1;

/**
 * Creates a trace context object.
 * @param {Trace} trace The object holding the spans comprising this trace.
 * @param {string} name The name of the span.
 * @param {number} parentSpanId The id of the parent span, 0 for root spans.
 * @constructor
 */
function SpanData(agent, trace, name, parentSpanId) {
  var spanId = uid++;
  this.agent = agent;
  this.span = new TraceSpan(name, spanId, parentSpanId);
  this.trace = trace;
  trace.spans.push(this.span);
  if (agent.config().stackTraceLimit > 0) {
    // This is a mechanism to get the structured stack trace out of V8.
    // prepareStackTrace is called th first time the Error#stack property is
    // accessed. The original behavior is to format the stack as an exception
    // throw, which is not what we like. We customize it.
    //
    // See: https://code.google.com/p/v8-wiki/wiki/JavaScriptStackTraceApi
    //
    var origLimit = Error.stackTraceLimit;
    Error.stackTraceLimit = agent.config().stackTraceLimit;

    var origPrepare = Error.prepareStackTrace;
    Error.prepareStackTrace = function(error, structured) {
      return structured;
    };
    var e = {};
    Error.captureStackTrace(e, SpanData);
    var formatted = e.stack.reduce(function(str, frame) {
      return str + frame.toString() + '\n';
    }, '');
    this.span.setLabel(TraceLabels.STACK_TRACE_DETAILS_KEY, formatted);

    Error.stackTraceLimit = origLimit;
    Error.prepareStackTrace = origPrepare;
  }
}

/**
 * Creates a child span of this span.
 * @param name The name of the child span.
 * @returns {SpanData} The new child trace span data.
 */
SpanData.prototype.createChildSpanData = function(name) {
  return new SpanData(this.agent, this.trace, name, this.span.spanId);
};

/**
 * Closes the span and queues it for publishing if it is a root.
 */
SpanData.prototype.close = function() {
  this.span.close();
  if (this.span.parentSpanId === 0) {
    this.agent.traceWriter.writeSpan(this);
  }
};

/**
 * Adds the current trace context to the provided http headers
 * so it can follow the associated request through other
 * Google services.
 *
 * @param {Object} headers The http headers associated with the
 *   current request.
 */
SpanData.prototype.addContextToHeaders = function(headers) {
  var header = this.trace.traceId + '/' + this.span.spanId;
  if (this.options) {
    header += (';o=' + this.options);
  }
  headers[this.agent.TRACE_CONTEXT_HEADER_NAME] = header;
};

/**
 * Export SpanData.
 */
module.exports = SpanData;
