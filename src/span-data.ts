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

import { Constants } from './constants';
import { Trace } from './trace';
import { TraceLabels } from './trace-labels';
import { TraceSpan } from './trace-span';
import { traceWriter } from './trace-writer';
import * as traceUtil from './util';
import * as util from 'util';

/**
 * Trace API expects stack frames to be a JSON string with the following
 * structure:
 * STACK_TRACE := { "stack_frame" : [ FRAMES ] }
 * FRAMES := { "class_name" : CLASS_NAME, "file_name" : FILE_NAME,
 *             "line_number" : LINE_NUMBER, "method_name" : METHOD_NAME }*
 *
 * While the API doesn't expect a columnNumber at this point, it does accept,
 * and ignore it.
 */
interface StackFrame {
  class_name?: string,
  method_name?: string,
  file_name?: string,
  line_number?: number,
  column_number?: number
}

// Auto-incrementing integer
let uid = 1;

export class SpanData {
  public readonly span: TraceSpan;

  /**
   * Creates a trace context object.
   * @param trace The object holding the spans comprising this trace.
   * @param name The name of the span.
   * @param parentSpanId The id of the parent span, 0 for root spans.
   * @param isRoot Whether this is a root span.
   * @param skipFrames the number of frames to remove from the top of the stack.
   * @constructor
   */
  constructor(
    readonly trace: Trace,
    name: string,
    parentSpanId: string,
    private readonly isRoot: boolean,
    skipFrames: number
  ) {
    const spanId = '' + (uid++);
    const spanName = traceUtil.truncate(name, Constants.TRACE_SERVICE_SPAN_NAME_LIMIT);
    this.span = new TraceSpan(spanName, spanId, parentSpanId);
    trace.spans.push(this.span);
    if (traceWriter.get().config().stackTraceLimit > 0) {
      // This is a mechanism to get the structured stack trace out of V8.
      // prepareStackTrace is called the first time the Error#stack property is
      // accessed. The original behavior is to format the stack as an exception
      // throw, which is not what we like. We customize it.
      //
      // See: https://code.google.com/p/v8-wiki/wiki/JavaScriptStackTraceApi
      //
      const origLimit = Error.stackTraceLimit;
      Error.stackTraceLimit = traceWriter.get().config().stackTraceLimit + skipFrames;
  
      const origPrepare = Error.prepareStackTrace;
      Error.prepareStackTrace = function(error: Error, structured: CallSite[]): CallSite[] {
        return structured;
      };
      const e: { stack?: CallSite[] } = {};
      Error.captureStackTrace(e, SpanData);
  
      const stackFrames: StackFrame[] = [];
      if (e.stack) {
        e.stack.forEach(function(callSite, i) {
          if (i < skipFrames) {
            return;
          }
          const functionName = callSite.getFunctionName();
          const methodName = callSite.getMethodName();
          const name = (methodName && functionName) ?
            functionName + ' [as ' + methodName + ']' :
            functionName || methodName || '<anonymous function>';
          const stackFrame: StackFrame = {
            method_name: name,
            file_name: callSite.getFileName() || undefined,
            line_number: callSite.getLineNumber() || undefined,
            column_number: callSite.getColumnNumber() || undefined
          };
          // TODO(kjin): Check if callSite getters actually return null or undefined.
          // Docs say undefined but we guard it here just in case.
          stackFrames.push(stackFrame);
        });
        // Set the label on the trace span directly to bypass truncation to
        // config.maxLabelValueSize.
        this.span.setLabel(TraceLabels.STACK_TRACE_DETAILS_KEY,
          traceUtil.truncate(JSON.stringify({stack_frame: stackFrames}),
            Constants.TRACE_SERVICE_LABEL_VALUE_LIMIT));
      }
      Error.stackTraceLimit = origLimit;
      Error.prepareStackTrace = origPrepare;
    }
  }

  getTraceContext() {
    return traceUtil.generateTraceContext({
      traceId: this.trace.traceId.toString(),
      spanId: this.span.spanId.toString(),
      options: 1 // always traced
    });
  }

  addLabel(key: string, value: any) {
    const k = traceUtil.truncate(key, Constants.TRACE_SERVICE_LABEL_KEY_LIMIT);
    const string_val = typeof value === 'string' ? value : util.inspect(value);
    const v = traceUtil.truncate(string_val, traceWriter.get().config().maximumLabelValueSize);
    this.span.setLabel(k, v);
  }

  endSpan() {
    this.span.close();
    if (this.isRoot) {
      traceWriter.get().writeSpan(this);
    }
  }
}
