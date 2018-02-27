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

import {Constants, SpanDataType} from './constants';
import {SpanData as SpanData} from './plugin-types';
import {SpanKind, Trace, TraceSpan} from './trace';
import {TraceLabels} from './trace-labels';
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

/**
 * Represents a real trace span.
 */
export abstract class BaseSpanData implements SpanData {
  readonly span: TraceSpan;
  readonly trace: Trace;
  abstract readonly type: SpanDataType;

  /**
   * Creates a trace context object.
   * @param trace The object holding the spans comprising this trace.
   * @param spanName The name of the span.
   * @param parentSpanId The ID of the parent span, or '0' to specify that there
   *                     is none.
   * @param skipFrames the number of frames to remove from the top of the stack
   *                   when collecting the stack trace.
   */
  constructor(
      trace: Trace, spanName: string, parentSpanId: string,
      skipFrames: number) {
    this.trace = trace;
    this.span = {
      name:
          traceUtil.truncate(spanName, Constants.TRACE_SERVICE_SPAN_NAME_LIMIT),
      startTime: (new Date()).toISOString(),
      endTime: '',
      spanId: randomSpanId(),
      kind: SpanKind.SPAN_KIND_UNSPECIFIED,
      parentSpanId,
      labels: {}
    };
    this.trace.spans.push(this.span);

    const stackFrames = traceUtil.createStackTrace(
        traceWriter.get().getConfig().stackTraceLimit, skipFrames,
        this.constructor);
    if (stackFrames.length > 0) {
      // Developer note: This is not equivalent to using addLabel, because the
      // stack trace label has its own size constraints.
      this.span.labels[TraceLabels.STACK_TRACE_DETAILS_KEY] =
          traceUtil.truncate(
              JSON.stringify({stack_frame: stackFrames}),
              Constants.TRACE_SERVICE_LABEL_VALUE_LIMIT);
    }
  }

  getTraceContext() {
    return traceUtil.generateTraceContext({
      traceId: this.trace.traceId.toString(),
      spanId: this.span.spanId.toString(),
      options: 1  // always traced
    });
  }

  // tslint:disable-next-line:no-any
  addLabel(key: string, value: any) {
    const k = traceUtil.truncate(key, Constants.TRACE_SERVICE_LABEL_KEY_LIMIT);
    const stringValue = typeof value === 'string' ? value : util.inspect(value);
    const v = traceUtil.truncate(
        stringValue, traceWriter.get().getConfig().maximumLabelValueSize);
    this.span.labels[k] = v;
  }

  endSpan() {
    this.span.endTime = (new Date()).toISOString();
  }
}

/**
 * Represents a real root span, which corresponds to an incoming request.
 */
export class RootSpanData extends BaseSpanData {
  readonly type = SpanDataType.ROOT;

  constructor(
      trace: Trace, spanName: string, parentSpanId: string,
      skipFrames: number) {
    super(trace, spanName, parentSpanId, skipFrames);
    this.span.kind = SpanKind.RPC_SERVER;
  }

  endSpan() {
    super.endSpan();
    traceWriter.get().writeSpan(this.trace);
  }
}

/**
 * Represents a real child span, which corresponds to an outgoing RPC.
 */
export class ChildSpanData extends BaseSpanData {
  readonly type = SpanDataType.CHILD;

  constructor(
      trace: Trace, spanName: string, parentSpanId: string,
      skipFrames: number) {
    super(trace, spanName, parentSpanId, skipFrames);
    this.span.kind = SpanKind.RPC_CLIENT;
  }
}

// Helper function to generate static virtual trace spans.
const createDummySpanData =
    <T extends SpanDataType>(spanType: T): SpanData&{readonly type: T} => {
      return Object.freeze({
        type: spanType,
        getTraceContext() {
          return '';
        },
        // tslint:disable-next-line:no-any
        addLabel(key: string, value: any) {},
        endSpan() {}
      } as SpanData & {readonly type: T});
    };

/**
 * A virtual trace span that indicates that a real trace span couldn't be
 * created because context was lost.
 */
export const UNCORRELATED_SPAN = createDummySpanData(SpanDataType.UNCORRELATED);

/**
 * A virtual trace span that indicates that a real trace span couldn't be
 * created because it was disallowed by user configuration.
 */
export const UNTRACED_SPAN = createDummySpanData(SpanDataType.UNTRACED);
