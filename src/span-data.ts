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

declare global {
  interface CallSite {
    getThis: (...args: any[]) => any;
    getTypeName: (...args: any[]) => any;
    getFunction: (...args: any[]) => any;
    getFunctionName: (...args: any[]) => any;
    getMethodName: (...args: any[]) => any;
    getFileName: (...args: any[]) => any;
    getLineNumber: (...args: any[]) => any;
    getColumnNumber: (...args: any[]) => any;
    getEvalOrigin: (...args: any[]) => any;
    isToplevel: (...args: any[]) => any;
    isEval: (...args: any[]) => any;
    isNative: (...args: any[]) => any;
    isConstructor: (...args: any[]) => any;
  }

  interface ErrorConstructor {
    prepareStackTrace?: (
      error: Error,
      structuredStackTrace: CallSite[]
    ) => CallSite[] | string;
    captureStackTrace(targetObject: Object, constructorOpt?: Function): void;
    stackTraceLimit: number;
  }
}

import { Constants } from './constants';
import { TraceLabels } from './trace-labels';

var TraceSpan = require('./trace-span'/*.js*/);
var traceUtil = require('./util'/*.js*/);
var util = require('util');
var TraceWriter = require('./trace-writer'/*.js*/);

// Auto-incrementing integer
var uid = 1;

/**
 * Creates a trace context object.
 * @param {Trace} trace The object holding the spans comprising this trace.
 * @param {string} name The name of the span.
 * @param {number} parentSpanId The id of the parent span, 0 for root spans.
 * @param {boolean} isRoot Whether this is a root span.
 * @param {number} skipFrames the number of frames to remove from the top of the stack.
 * @constructor
 */
function SpanData(trace, name, parentSpanId, isRoot, skipFrames) {
  var spanId = uid++;
  var spanName = traceUtil.truncate(name, Constants.TRACE_SERVICE_SPAN_NAME_LIMIT);
  this.span = new TraceSpan(spanName, spanId, parentSpanId);
  this.trace = trace;
  this.isRoot = isRoot;
  this.serializedTraceContext = traceUtil.generateTraceContext({
    traceId: this.trace.traceId,
    spanId: this.span.spanId,
    options: 1 // always traced
  });
  trace.spans.push(this.span);
  if (TraceWriter.get().config().stackTraceLimit > 0) {
    // This is a mechanism to get the structured stack trace out of V8.
    // prepareStackTrace is called the first time the Error#stack property is
    // accessed. The original behavior is to format the stack as an exception
    // throw, which is not what we like. We customize it.
    //
    // See: https://code.google.com/p/v8-wiki/wiki/JavaScriptStackTraceApi
    //
    var origLimit = Error.stackTraceLimit;
    Error.stackTraceLimit = TraceWriter.get().config().stackTraceLimit + skipFrames;

    var origPrepare = Error.prepareStackTrace;
    Error.prepareStackTrace = function(error, structured) {
      return structured;
    };
    var e: { stack?: any } = {};
    Error.captureStackTrace(e, SpanData);

    var stackFrames: any[] = [];
    e.stack.forEach(function(callSite, i) {
      if (i < skipFrames) {
        return;
      }
      var functionName = callSite.getFunctionName();
      var methodName = callSite.getMethodName();
      var name = (methodName && functionName) ?
        functionName + ' [as ' + methodName + ']' :
        functionName || methodName || '<anonymous function>';
      stackFrames.push(new StackFrame(undefined, name,
        callSite.getFileName(), callSite.getLineNumber(),
        callSite.getColumnNumber()));
    });
    // Set the label on the trace span directly to bypass truncation to
    // config.maxLabelValueSize.
    this.span.setLabel(TraceLabels.STACK_TRACE_DETAILS_KEY,
      traceUtil.truncate(JSON.stringify({stack_frame: stackFrames}),
        Constants.TRACE_SERVICE_LABEL_VALUE_LIMIT));

    Error.stackTraceLimit = origLimit;
    Error.prepareStackTrace = origPrepare;
  }
}

SpanData.prototype.getTraceContext = function() {
  return this.serializedTraceContext;
};

SpanData.prototype.addLabel = function(key, value) {
  var k = traceUtil.truncate(key, Constants.TRACE_SERVICE_LABEL_KEY_LIMIT);
  var string_val = typeof value === 'string' ? value : util.inspect(value);
  var v = traceUtil.truncate(string_val, TraceWriter.get().config().maximumLabelValueSize);
  this.span.setLabel(k, v);
};

/**
 * Closes the span.
 */
SpanData.prototype.endSpan = function() {
  this.span.close();
  if (this.isRoot) {
    TraceWriter.get().writeSpan(this);
  }
};

/**
 * Trace API expects stack frames to be a JSON string with the following
 * structure:
 * STACK_TRACE := { "stack_frame" : [ FRAMES ] }
 * FRAMES := { "class_name" : CLASS_NAME, "file_name" : FILE_NAME,
 *             "line_number" : LINE_NUMBER, "method_name" : METHOD_NAME }*
 *
 * While the API doesn't expect a columnNumber at this point, it does accept,
 * and ignore it.
 *
 * @param {string|undefined} className
 * @param {string|undefined} methodName
 * @param {string|undefined} fileName
 * @param {number|undefined} lineNumber
 * @param {number|undefined} columnNumber
 * @constructor @private
 */
function StackFrame(className, methodName, fileName, lineNumber, columnNumber) {
  if (className) {
    this.class_name = className;
  }
  if (methodName) {
    this.method_name = methodName;
  }
  if (fileName) {
    this.file_name = fileName;
  }
  if (typeof lineNumber === 'number') {
    this.line_number = lineNumber;
  }
  if (typeof columnNumber === 'number') {
    this.column_number = columnNumber;
  }
}

/**
 * Export SpanData.
 */
module.exports = SpanData;

export default {};
