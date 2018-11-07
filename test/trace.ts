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
 * - The Trace Agent is also initialized with a TestLogger instance. The only
 * observable difference is that GCLOUD_TEST_LOG_LEVEL now tweaks the verbosity.
 * This is preferable to GCLOUD_LOG_LEVEL because the latter is a testable
 * "API", and GCLOUD_TEST_LOG_LEVEL can also control console log level when we
 * are testing isolated components such as _just_ the Trace Writer or the
 * Plugin Loader.
 * - Additional methods to query/delete spans written locally are exposed.
 * - Additional methods to override singleton values are exposed.
 *
 * Most tests should include this file instead of the main module root.
 */

import * as assert from 'assert';
import * as shimmer from 'shimmer';

import * as trace from '../src';
import {Config, PluginTypes} from '../src';
import {cls, TraceCLS, TraceCLSMechanism} from '../src/cls';
import * as logger from '../src/logger';
import {Trace, TraceSpan} from '../src/trace';
import {PluginLoader, pluginLoader} from '../src/trace-plugin-loader';
import {TraceWriter, traceWriter, TraceWriterConfig} from '../src/trace-writer';
import {tracing, Tracing} from '../src/tracing';
import {FORCE_NEW} from '../src/util';

import {TestLogger} from './logger';

export {Config, PluginTypes};

const traces: Trace[] = [];
const spans: TraceSpan[] = [];

export class TestCLS extends TraceCLS {
  constructor(config: {}, logger: logger.Logger) {
    super({mechanism: TraceCLSMechanism.NONE}, logger);
  }
}

export class TestTraceWriter extends TraceWriter {
  constructor(config: TraceWriterConfig, logger: logger.Logger) {
    super(config, logger);
    this.getConfig().projectId = '0';
  }

  async initialize(): Promise<void> {}

  writeTrace(trace: Trace): void {
    traces.push(trace);
    trace.spans.forEach(span => {
      spans.push(span);
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

// Make no modifications to Tracing. This class exists for symmetricality
// purposes.
export class TestTracing extends Tracing {}

setCLSForTest(TestCLS);
setLoggerForTest(TestLogger);
setTraceWriterForTest(TestTraceWriter);
setPluginLoaderForTest(TestPluginLoader);
setTracingForTest(TestTracing);

export type Predicate<T> = (value: T) => boolean;

export function start(projectConfig?: Config): PluginTypes.Tracer {
  const agent = trace.start(Object.assign(
      {samplingRate: 0, logLevel: 4, [FORCE_NEW]: true}, projectConfig));
  return agent;
}

export function get(): PluginTypes.Tracer {
  return trace.get();
}

export function setLoggerForTest(impl?: typeof logger.Logger) {
  if (logger.Logger.__wrapped) {
    shimmer.unwrap(logger, 'Logger');
  }
  if (impl) {
    const wrap = () => shimmer.wrap(logger, 'Logger', () => impl);
    wrap();
  }
}

export function setCLSForTest(impl?: typeof TraceCLS) {
  cls['implementation'] = impl || TraceCLS;
}

export function setTraceWriterForTest(impl?: typeof TraceWriter) {
  traceWriter['implementation'] = impl || TraceWriter;
}

export function setPluginLoaderForTest(impl?: typeof PluginLoader) {
  pluginLoader['implementation'] = impl || PluginLoader;
}

export function setTracingForTest(impl?: typeof Tracing) {
  tracing['implementation'] = impl || Tracing;
}

export function getTraces(predicate?: Predicate<Trace>): Trace[] {
  if (!predicate) {
    predicate = () => true;
  }
  return traces.filter(predicate);
}

export function getOneTrace(predicate?: Predicate<Trace>): Trace {
  const traces = getTraces(predicate);
  assert.strictEqual(traces.length, 1);
  return traces[0];
}

export function getSpans(predicate?: Predicate<TraceSpan>): TraceSpan[] {
  if (!predicate) {
    predicate = () => true;
  }
  return spans.filter(predicate);
}

export function getOneSpan(predicate?: Predicate<TraceSpan>): TraceSpan {
  const spans = getSpans(predicate);
  assert.strictEqual(spans.length, 1);
  return spans[0];
}

export function clearTraceData(): void {
  traces.length = 0;
  spans.length = 0;
}
