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

import {EventEmitter} from 'events';
import * as is from 'is';
import * as uuid from 'uuid';

import {cls, RootContext} from './cls';
import {Constants, SpanType} from './constants';
import {Logger} from './logger';
import {Func, RootSpan, RootSpanOptions, Span, SpanOptions, Tracer} from './plugin-types';
import {RootSpanData, UNCORRELATED_CHILD_SPAN, UNCORRELATED_ROOT_SPAN, UNTRACED_CHILD_SPAN, UNTRACED_ROOT_SPAN} from './span-data';
import {TraceLabels} from './trace-labels';
import {traceWriter} from './trace-writer';
import {TracePolicy, TracePolicyConfig} from './tracing-policy';
import * as util from './util';

/**
 * An enumeration of the different possible types of behavior when dealing with
 * incoming trace context. Requests are still subject to local tracing policy.
 */
export enum TraceContextHeaderBehavior {
  /**
   * Respect the trace context header if it exists; otherwise, trace the
   * request as a new trace.
   */
  DEFAULT = 'default',
  /**
   * Respect the trace context header if it exists; otherwise, treat the
   * request as unsampled and don't trace it.
   */
  REQUIRE = 'require',
  /**
   * Trace every request as a new trace, even if trace context exists.
   */
  IGNORE = 'ignore'
}

/**
 * An interface describing configuration fields read by the StackdriverTracer
 * object. This includes fields read by the trace policy.
 */
export interface StackdriverTracerConfig extends TracePolicyConfig {
  enhancedDatabaseReporting: boolean;
  contextHeaderBehavior: TraceContextHeaderBehavior;
  rootSpanNameOverride: (path: string) => string;
  spansPerTraceSoftLimit: number;
  spansPerTraceHardLimit: number;
}

interface IncomingTraceContext {
  traceId?: string;
  spanId?: string;
  options: number;
}

/**
 * Type guard that returns whether an object is a string or not.
 */
// tslint:disable-next-line:no-any
function isString(obj: any): obj is string {
  return is.string(obj);
}

/**
 * StackdriverTracer exposes a number of methods to create trace spans and
 * propagate trace context across asynchronous boundaries.
 */
export class StackdriverTracer implements Tracer {
  readonly constants = Constants;
  readonly labels = TraceLabels;
  readonly spanTypes = SpanType;
  readonly traceContextUtils = {
    encodeAsString: util.generateTraceContext,
    decodeFromString: util.parseContextFromHeader,
    encodeAsByteArray: util.serializeTraceContext,
    decodeFromByteArray: util.deserializeTraceContext
  };

  private enabled = false;
  private pluginName: string;
  private logger: Logger|null = null;
  private config: StackdriverTracerConfig|null = null;
  private policy: TracePolicy|null = null;

  /**
   * Constructs a new StackdriverTracer instance.
   * @param name A string identifying this StackdriverTracer instance in logs.
   */
  constructor(name: string) {
    this.pluginName = name;
    this.disable();  // disable immediately
  }

  /**
   * Enables this instance. This function is only for internal use and
   * unit tests. A separate TraceWriter instance should be initialized
   * beforehand.
   * @param config An object specifying how this instance should
   * be configured.
   * @param logger A logger object.
   * @private
   */
  enable(config: StackdriverTracerConfig, logger: Logger) {
    this.logger = logger;
    this.config = config;
    this.policy = new TracePolicy(config);
    this.enabled = true;
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
    this.policy = TracePolicy.never();
    this.enabled = false;
  }

  /**
   * Returns whether the StackdriverTracer instance is active. This function is
   * only for internal use and unit tests; under normal circumstances it will
   * always return true.
   * @private
   */
  isActive(): boolean {
    return this.enabled;
  }

  enhancedDatabaseReportingEnabled(): boolean {
    return !!this.config && this.config.enhancedDatabaseReporting;
  }

  getConfig(): StackdriverTracerConfig {
    if (!this.config) {
      throw new Error('Configuration is not available.');
    }
    return this.config;
  }

  runInRootSpan<T>(options: RootSpanOptions, fn: (span: RootSpan) => T): T {
    if (!this.isActive()) {
      return fn(UNTRACED_ROOT_SPAN);
    }

    options = options || {name: ''};

    // Don't create a root span if we are already in a root span
    const rootSpan = cls.get().getContext();
    if (rootSpan.type === SpanType.ROOT && !rootSpan.span.endTime) {
      this.logger!.warn(`TraceApi#runInRootSpan: [${
          this.pluginName}] Cannot create nested root spans.`);
      return fn(UNCORRELATED_ROOT_SPAN);
    }

    // Attempt to read incoming trace context.
    const incomingTraceContext: IncomingTraceContext = {options: 1};
    let parsedContext: util.TraceContext|null = null;
    if (isString(options.traceContext) &&
        this.config!.contextHeaderBehavior !==
            TraceContextHeaderBehavior.IGNORE) {
      parsedContext = util.parseContextFromHeader(options.traceContext);
    }
    if (parsedContext) {
      if (parsedContext.options === undefined) {
        // If there are no incoming option flags, default to 0x1.
        parsedContext.options = 1;
      }
      Object.assign(incomingTraceContext, parsedContext);
    } else if (
        this.config!.contextHeaderBehavior ===
        TraceContextHeaderBehavior.REQUIRE) {
      incomingTraceContext.options = 0;
    }

    // Consult the trace policy.
    const locallyAllowed = this.policy!.shouldTrace({
      timestamp: Date.now(),
      url: options.url || '',
      method: options.method || ''
    });
    const remotelyAllowed = !!(
        incomingTraceContext.options & Constants.TRACE_OPTIONS_TRACE_ENABLED);

    let rootContext: RootSpan&RootContext;
    // Don't create a root span if the trace policy disallows it.
    if (!locallyAllowed || !remotelyAllowed) {
      rootContext = UNTRACED_ROOT_SPAN;
    } else {
      // Create a new root span, and invoke fn with it.
      const traceId =
          incomingTraceContext.traceId || (uuid.v4().split('-').join(''));
      const parentId = incomingTraceContext.spanId || '0';
      const name = this.config!.rootSpanNameOverride(options.name);
      rootContext = new RootSpanData(
          {projectId: '', traceId, spans: []}, /* Trace object */
          name,                                /* Span name */
          parentId,                            /* Parent's span ID */
          options.skipFrames || 0);
    }

    return cls.get().runWithContext(() => {
      return fn(rootContext);
    }, rootContext);
  }

  getCurrentRootSpan(): RootSpan {
    if (!this.isActive()) {
      return UNTRACED_ROOT_SPAN;
    }
    return cls.get().getContext();
  }

  getCurrentContextId(): string|null {
    // In v3, this will be deprecated for getCurrentRootSpan.
    const traceContext = this.getCurrentRootSpan().getTraceContext();
    const parsedTraceContext = util.parseContextFromHeader(traceContext);
    return parsedTraceContext ? parsedTraceContext.traceId : null;
  }

  getProjectId(): Promise<string> {
    if (traceWriter.exists() && traceWriter.get().isActive) {
      return traceWriter.get().getProjectId();
    } else {
      return Promise.reject(
          new Error('The Project ID could not be retrieved.'));
    }
  }

  getWriterProjectId(): string|null {
    // In v3, this will be deprecated for getProjectId.
    if (traceWriter.exists() && traceWriter.get().isActive) {
      return traceWriter.get().projectId;
    } else {
      return null;
    }
  }

  createChildSpan(options?: SpanOptions): Span {
    if (!this.isActive()) {
      return UNTRACED_CHILD_SPAN;
    }

    options = options || {name: ''};
    const rootSpan = cls.get().getContext();
    if (rootSpan.type === SpanType.ROOT) {
      if (!!rootSpan.span.endTime) {
        // A closed root span suggests that we either have context confusion or
        // some work is being done after the root request has been completed.
        // The first case could lead to a memory leak, if somehow all spans end
        // up getting misattributed to the same root span – we get a root span
        // with continuously growing number of child spans. The second case
        // seems to have some value, but isn't representable. The user probably
        // needs a custom outer span that encompasses the entirety of work.
        this.logger!.warn(`TraceApi#createChildSpan: [${
            this.pluginName}] Creating phantom child span [${
            options.name}] because root span [${
            rootSpan.span.name}] was already closed.`);
        return UNCORRELATED_CHILD_SPAN;
      }
      if (rootSpan.trace.spans.length >= this.config!.spansPerTraceHardLimit) {
        // As in the previous case, a root span with a large number of child
        // spans suggests a memory leak stemming from context confusion. This
        // is likely due to userspace task queues or Promise implementations.
        this.logger!.error(`TraceApi#createChildSpan: [${
            this.pluginName}] Creating phantom child span [${
            options.name}] because the trace with root span [${
            rootSpan.span.name}] has reached a limit of ${
            this.config!
                .spansPerTraceHardLimit} spans. This is likely a memory leak.`);
        this.logger!.error([
          'TraceApi#createChildSpan: Please see',
          'https://github.com/googleapis/cloud-trace-nodejs/wiki',
          'for details and suggested actions.'
        ].join(' '));
        return UNCORRELATED_CHILD_SPAN;
      }
      if (rootSpan.trace.spans.length === this.config!.spansPerTraceSoftLimit) {
        // As in the previous case, a root span with a large number of child
        // spans suggests a memory leak stemming from context confusion. This
        // is likely due to userspace task queues or Promise implementations.

        // Note that since child spans can be created by users directly on a
        // RootSpanData instance, this block might be skipped because it only
        // checks equality -- this is OK because no automatic tracing plugin
        // uses the RootSpanData API directly.
        this.logger!.error(`TraceApi#createChildSpan: [${
            this.pluginName}] Adding child span [${
            options.name}] will cause the trace with root span [${
            rootSpan.span.name}] to contain more than ${
            this.config!
                .spansPerTraceSoftLimit} spans. This is likely a memory leak.`);
        this.logger!.error([
          'TraceApi#createChildSpan: Please see',
          'https://github.com/googleapis/cloud-trace-nodejs/wiki',
          'for details and suggested actions.'
        ].join(' '));
      }
      // Create a new child span and return it.
      const childContext = rootSpan.createChildSpan({
        name: options.name,
        skipFrames: options.skipFrames ? options.skipFrames + 1 : 1
      });
      this.logger!.info(`TraceApi#createChildSpan: [${
          this.pluginName}] Created child span [${options.name}]`);
      return childContext;
    } else if (rootSpan.type === SpanType.UNTRACED) {
      // Context wasn't lost, but there's no root span, indicating that this
      // request should not be traced.
      return UNTRACED_CHILD_SPAN;
    } else {
      // Context was lost.
      this.logger!.warn(`TraceApi#createChildSpan: [${
          this.pluginName}] Creating phantom child span [${
          options.name}] because there is no root span.`);
      return UNCORRELATED_CHILD_SPAN;
    }
  }

  isRealSpan(span: Span): boolean {
    return span.type === SpanType.ROOT || span.type === SpanType.CHILD;
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

    return cls.get().bindWithCurrentContext(fn);
  }

  wrapEmitter(emitter: EventEmitter): void {
    if (!this.isActive()) {
      return;
    }

    cls.get().patchEmitterToPropagateContext(emitter);
  }
}
