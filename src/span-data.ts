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

import * as crypto from 'crypto';
import * as util from 'util';

import {Constants} from './constants';
import {SpanData as SpanDataInterface} from './plugin-types';
import {Trace} from './trace';
import {TraceLabels} from './trace-labels';
import {TraceSpan} from './trace-span';
import {traceWriter} from './trace-writer';
import * as traceUtil from './util';

// Use 6 bytes of randomness only as JS numbers are doubles not 64-bit ints.
const SPAN_ID_RANDOM_BYTES = 6;

// Use the faster crypto.randomFillSync when available (Node 7+) falling back to
// using crypto.randomBytes.
const spanIdBuffer = Buffer.alloc(SPAN_ID_RANDOM_BYTES);
const randomFillSync = crypto.randomFillSync;
const randomBytes = crypto.randomBytes;
const spanRandomBuffer = randomFillSync ?
    () => randomFillSync(spanIdBuffer) :
    () => randomBytes(SPAN_ID_RANDOM_BYTES);

function randomSpanId() {
  // tslint:disable-next-line:ban Needed to parse hexadecimal.
  return parseInt(spanRandomBuffer().toString('hex'), 16).toString();
}

export class SpanData implements SpanDataInterface {
  readonly span: TraceSpan;

  /**
   * Creates a trace context object.
   * @param trace The object holding the spans comprising this trace.
   * @param spanName The name of the span.
   * @param parentSpanId The id of the parent span, 0 for root spans.
   * @param isRoot Whether this is a root span.
   * @param skipFrames the number of frames to remove from the top of the stack.
   * @constructor
   */
  constructor(
      readonly trace: Trace, spanName: string, parentSpanId: string,
      private readonly isRoot: boolean, skipFrames: number) {
    spanName =
        traceUtil.truncate(spanName, Constants.TRACE_SERVICE_SPAN_NAME_LIMIT);
    this.span = new TraceSpan(spanName, randomSpanId(), parentSpanId);
    trace.spans.push(this.span);

    const stackFrames = traceUtil.createStackTrace(
        traceWriter.get().getConfig().stackTraceLimit, skipFrames, SpanData);
    if (stackFrames.length > 0) {
      // Set the label on the trace span directly to bypass truncation to
      // config.maxLabelValueSize.
      this.span.setLabel(
          TraceLabels.STACK_TRACE_DETAILS_KEY,
          traceUtil.truncate(
              JSON.stringify({stack_frame: stackFrames}),
              Constants.TRACE_SERVICE_LABEL_VALUE_LIMIT));
    }
  }

  getTraceContext() {
    return traceUtil.generateTraceContext({
      traceId: this.trace.traceId.toString(),
      spanId: this.span.spanId.toString(),
      options: 1  // always traced
    });
  }

  addLabel(key: string, value: {}) {
    const k = traceUtil.truncate(key, Constants.TRACE_SERVICE_LABEL_KEY_LIMIT);
    const stringValue = typeof value === 'string' ? value : util.inspect(value);
    const v = traceUtil.truncate(
        stringValue, traceWriter.get().getConfig().maximumLabelValueSize);
    this.span.setLabel(k, v);
  }

  endSpan() {
    this.span.close();
    if (this.isRoot) {
      traceWriter.get().writeSpan(this);
    }
  }
}
