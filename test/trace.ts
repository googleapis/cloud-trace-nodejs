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

/**
 * This file exports an interface that is identical to that of the Trace Agent,
 * for testing purposes. The differences are that:
 * - The Trace Writer singleton is mocked to make no network requests, writing
 * traces to a local store instead.
 * - The Plugin Loader singleton is mocked to do nothing.
 * - When started, the Trace Agent is initialized with a samplingRate of zero by
 * default (but this can be overridden).
 * - Additional methods to query/delete spans written locally are exposed.
 * - Additional methods to override singleton values are exposed.
 *
 * Most tests should include this file instead of the main module root.
 */

// This is required for @google-cloud/common types.
// tslint:disable-next-line:no-reference
/// <reference path="../src/types.d.ts" />

import * as common from '@google-cloud/common';
import * as assert from 'assert';
import * as shimmer from 'shimmer';

import * as trace from '../src';
import {Config, PluginTypes} from '../src';
import {RootSpanData} from '../src/span-data';
import {Trace, TraceSpan} from '../src/trace';
import {PluginLoader, pluginLoader, PluginLoaderConfig} from '../src/trace-plugin-loader';
import {LabelObject, TraceWriter, traceWriter, TraceWriterConfig} from '../src/trace-writer';

export {Config, PluginTypes};

const traces = new Map<string, TraceSpan[]>();
const allSpans: TraceSpan[] = [];

export class TestTraceWriter extends TraceWriter {
  initialize(cb: (err?: Error) => void): void {
    this.getConfig().projectId = '0';
    cb();
  }
  writeSpan(trace: Trace): void {
    if (!traces.has(trace.traceId)) {
      traces.set(trace.traceId, []);
    }
    const spans = traces.get(trace.traceId)!;
    trace.spans.forEach(span => {
      spans.push(span);
      allSpans.push(span);
    });
  }
}

export class TestPluginLoader extends PluginLoader {
  activate(): PluginLoader {
    return this;
  }
  deactivate(): PluginLoader {
    return this;
  }
}

setTraceWriter(TestTraceWriter);
setPluginLoader(TestPluginLoader);

export type Predicate<T> = (value: T) => boolean;

export function start(projectConfig?: Config): PluginTypes.TraceAgent {
  const agent = trace.start(
      Object.assign({samplingRate: 0, forceNewAgent_: true}, projectConfig));
  return agent;
}

export function get(): PluginTypes.TraceAgent {
  return trace.get();
}

export function setTraceWriter(impl?: typeof TraceWriter) {
  traceWriter['implementation'] = impl || TraceWriter;
}

export function setPluginLoader(impl?: typeof PluginLoader) {
  pluginLoader['implementation'] = impl || PluginLoader;
}

export function getTraces(predicate?: Predicate<TraceSpan[]>): string[] {
  if (!predicate) {
    predicate = () => true;
  }
  return Array.from(traces.entries())
      .filter((entry: [string, TraceSpan[]]) => predicate!(entry[1]))
      .map(entry => entry[0]);
}

export function getSpans(predicate?: Predicate<TraceSpan>): TraceSpan[] {
  if (!predicate) {
    predicate = () => true;
  }
  return allSpans.filter(predicate);
}

export function getOneSpan(predicate?: Predicate<TraceSpan>): TraceSpan {
  const spans = getSpans(predicate);
  assert.strictEqual(spans.length, 1);
  return spans[0];
}

export function clearTraceData(): void {
  traces.clear();
  allSpans.length = 0;
}
