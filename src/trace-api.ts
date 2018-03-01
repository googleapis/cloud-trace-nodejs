/**
 * Copyright 2017 Google Inc. All Rights Reserved.
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

import {Logger} from '@google-cloud/common';
import * as is from 'is';
import * as semver from 'semver';
import * as uuid from 'uuid';

import * as cls from './cls';
import {Constants} from './constants';
import {Func, RootSpanOptions, SpanOptions, TraceAgent as TraceAgentInterface} from './plugin-types';
import {SpanData} from './span-data';
import {Trace} from './trace';
import {TraceLabels} from './trace-labels';
import * as TracingPolicy from './tracing-policy';
import * as util from './util';

/**
 * An interface describing configuration fields read by the TraceAgent object.
 * This includes fields read by the trace policy.
 */
export interface TraceAgentConfig extends TracingPolicy.TracePolicyConfig {
  enhancedDatabaseReporting: boolean;
  ignoreContextHeader: boolean;
  projectId?: string;
}

interface IncomingTraceContext {
  traceId?: string;
  spanId?: string;
  options?: number;
}

/**
 * Type guard that returns whether an object is a string or not.
 */
// tslint:disable-next-line:no-any
function isString(obj: any): obj is string {
  return is.string(obj);
}

/**
 * Type guard that returns whether an object is a SpanData object or not.
 *
 * @param obj
 */
function isSpanData(obj: cls.RootContext): obj is SpanData {
  // The second condition ensures that obj is not nullSpan.
  return !!obj && !!(obj as SpanData).span;
}

// A sentinal stored in CLS to indicate that the current request was not
// sampled.
const nullSpan = Object.freeze({});

/**
 * TraceAgent exposes a number of methods to create trace spans and propagate
 * trace context across asynchronous boundaries.
 */
export class TraceAgent implements TraceAgentInterface {
  readonly constants = Constants;
  readonly labels = TraceLabels;

  private pluginName: string;
  private logger: Logger|null = null;
  private config: TraceAgentConfig|null = null;
  // TODO(kjin): Make this private.
  policy: TracingPolicy.TracePolicy|null = null;
  private namespace: cls.Namespace|null = null;

  /**
   * Constructs a new TraceAgent instance.
   * @param name A string identifying this TraceAgent instance in logs.
   */
  constructor(name: string) {
    this.pluginName = name;
    this.disable();  // disable immediately
  }

  /**
   * Enables this instance. This function is only for internal use and
   * unit tests. A separate TraceWriter instance should be initialized
   * beforehand.
   * @param logger A logger object.
   * @param config An object specifying how this instance should
   * be configured.
   * @private
   */
  enable(logger: Logger, config: TraceAgentConfig) {
    this.logger = logger;
    this.config = config;
    this.policy = TracingPolicy.createTracePolicy(config);
    this.namespace = cls.getNamespace();
  }

  /**
   * Disable this instance. This function is only for internal use and
   * unit tests.
   * @private
   */
  disable() {
    // Even though plugins should be unpatched, setting a new policy that
    // never generates traces allows persisting wrapped methods (either because
    // they are already instantiated or the plugin doesn't unpatch them) to
    // short-circuit out of trace generation logic.
    this.policy = new TracingPolicy.TraceNonePolicy();
    this.namespace = null;
  }

  /**
   * Returns whether the TraceAgent instance is active. This function is only
   * for internal use and unit tests; under normal circumstances it will always
   * return true.
   * @private
   */
  isActive(): boolean {
    return !!this.namespace;
  }

  enhancedDatabaseReportingEnabled(): boolean {
    return !!this.config && this.config.enhancedDatabaseReporting;
  }

  runInRootSpan<T>(options: RootSpanOptions, fn: (span: SpanData|null) => T):
      T {
    if (!this.isActive()) {
      return fn(null);
    }

    // TODO validate options
    // Don't create a root span if we are already in a root span
    if (cls.getRootContext()) {
      this.logger!.warn(this.pluginName + ': Cannot create nested root spans.');
      return fn(null);
    }

    return this.namespace!.runAndReturn(() => {
      // Attempt to read incoming trace context.
      let incomingTraceContext: IncomingTraceContext = {};
      if (isString(options.traceContext) && !this.config!.ignoreContextHeader) {
        const parsedContext = util.parseContextFromHeader(options.traceContext);
        if (parsedContext) {
          incomingTraceContext = parsedContext;
        }
      }

      // Consult the trace policy, and don't create a root span if the trace
      // policy disallows it.
      const locallyAllowed =
          this.policy!.shouldTrace(Date.now(), options.url || '');
      const remotelyAllowed = incomingTraceContext.options === undefined ||
          !!(incomingTraceContext.options &
             Constants.TRACE_OPTIONS_TRACE_ENABLED);
      if (!locallyAllowed || !remotelyAllowed) {
        cls.setRootContext(nullSpan);
        return fn(null);
      }

      // Create a new root span, and invoke fn with it.
      const traceId =
          incomingTraceContext.traceId || (uuid.v4().split('-').join(''));
      const parentId = incomingTraceContext.spanId || '0';
      const rootContext = new SpanData(
          new Trace('', traceId), /* Trace object */
          options.name,           /* Span name */
          parentId,               /* Parent's span ID */
          true,                   /* Is root span */
          cls.ROOT_SPAN_STACK_OFFSET + (options.skipFrames || 0));
      rootContext.span.kind = 'RPC_SERVER';
      cls.setRootContext(rootContext);
      return fn(rootContext);
    });
  }

  getCurrentContextId(): string|null {
    if (!this.isActive()) {
      return null;
    }

    const rootSpan = cls.getRootContext();
    if (!isSpanData(rootSpan)) {
      return null;
    }
    return rootSpan.trace.traceId;
  }

  getWriterProjectId(): string|null {
    if (this.config) {
      return this.config.projectId || null;
    } else {
      return null;
    }
  }

  createChildSpan(options: SpanOptions): SpanData|null {
    if (!this.isActive()) {
      return null;
    }

    const rootSpan = cls.getRootContext();
    if (!rootSpan) {
      // Context was lost.
      this.logger!.warn(
          this.pluginName + ': Attempted to create child span ' +
          'without root');
      return null;
    } else if (!isSpanData(rootSpan)) {
      // Context wasn't lost, but there's no root span, indicating that this
      // request should not be traced.
      return null;
    } else {
      if (rootSpan.span.isClosed()) {
        // A closed root span suggests that we either have context confusion or
        // some work is being done after the root request has been completed.
        // The first case could lead to a memory leak, if somehow all spans end
        // up getting misattributed to the same root span – we get a root span
        // with continuously growing number of child spans. The second case
        // seems to have some value, but isn't representable. The user probably
        // needs a custom outer span that encompasses the entirety of work.
        this.logger!.warn(
            this.pluginName + ': creating child for an already closed span',
            options.name, rootSpan.span.name);
        return null;
      }
      // Create a new child span and return it.
      options = options || {name: ''};
      const skipFrames = options.skipFrames ? options.skipFrames + 1 : 1;
      const childContext = new SpanData(
          rootSpan.trace,       /* Trace object */
          options.name,         /* Span name */
          rootSpan.span.spanId, /* Parent's span ID */
          false,                /* Is root span */
          skipFrames);          /* # of frames to skip in stack trace */
      return childContext;
    }
  }

  getResponseTraceContext(incomingTraceContext: string|null, isTraced: boolean):
      string {
    if (!this.isActive() || !incomingTraceContext) {
      return '';
    }

    const traceContext = util.parseContextFromHeader(incomingTraceContext);
    if (!traceContext) {
      return '';
    }
    traceContext.options = (traceContext.options || 0) & (isTraced ? 1 : 0);
    return util.generateTraceContext(traceContext);
  }

  wrap<T>(fn: Func<T>): Func<T> {
    if (!this.isActive()) {
      return fn;
    }

    return this.namespace!.bind<T>(fn);
  }

  wrapEmitter(emitter: NodeJS.EventEmitter): void {
    if (!this.isActive()) {
      return;
    }

    this.namespace!.bindEmitter(emitter);
  }
}
