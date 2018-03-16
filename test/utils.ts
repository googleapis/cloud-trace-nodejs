/**
 * Copyright 2018 Google LLC
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

// TODO(kjin): This file should supercede plugins/common.ts.

import * as assert from 'assert';

import {SpanDataType} from '../src/constants';
import {SpanData} from '../src/plugin-types';
import {BaseSpanData} from '../src/span-data';
import {TraceSpan} from '../src/trace';

/**
 * Constants
 */

// The duration to give a span when it's important
export const DEFAULT_SPAN_DURATION = 200;
// The acceptable window of variation in span duration
export const ASSERT_SPAN_TIME_TOLERANCE_MS = 40;

/**
 * Helper Functions
 */

export function isServerSpan(span: TraceSpan) {
  return span.kind === 'RPC_SERVER' && span.name !== 'outer';
}

// Convenience function that, when awaited, stalls for a given duration of time
export function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Assert that the given span's duration is within the given range.
export function assertSpanDuration(span: TraceSpan, bounds: [number, number]) {
  const spanDuration = Date.parse(span.endTime) - Date.parse(span.startTime);
  assert.ok(
      spanDuration >= bounds[0] && spanDuration <= bounds[1],
      `Span duration of ${
          spanDuration} ms is not in the acceptable expected range of [${
          bounds[0]}, ${bounds[1]}] ms`);
}

export function asBaseSpanData(arg: SpanData): BaseSpanData {
  assert.notStrictEqual(arg.type, SpanDataType.UNCORRELATED);
  assert.notStrictEqual(arg.type, SpanDataType.UNTRACED);
  return arg as BaseSpanData;
}

export function plan(done: MochaDone, num: number): MochaDone {
  return (err?: Error) => {
    if (err) {
      num = 0;
      setImmediate(done, err);
    } else {
      num--;
      if (num === 0) {
        setImmediate(done);
      } else if (num < 0) {
        throw new Error('done called too many times');
      }
    }
  };
}
