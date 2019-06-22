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
import * as uuid from 'uuid';

import {cls, RootContext} from './cls';
import {OpenCensusPropagation, TracePolicy} from './config';
import {Constants, SpanType} from './constants';
import {Logger} from './logger';
import {
  Func,
  Propagation,
  RootSpan,
  RootSpanOptions,
  Span,
  SpanOptions,
  Tracer,
} from './plugin-types';
import {
  RootSpanData,
  UNCORRELATED_CHILD_SPAN,
  UNCORRELATED_ROOT_SPAN,
  DISABLED_CHILD_SPAN,
  DISABLED_ROOT_SPAN,
  UntracedRootSpanData,
} from './span-data';
import {TraceLabels} from './trace-labels';
import {traceWriter} from './trace-writer';
import {neverTrace} from './tracing-policy';
import * as util from './util';

/**
 * An interface describing configuration fields read by the StackdriverTracer
 * object. This includes fields read by the trace policy.
 */
export interface StackdriverTracerConfig {
  enhancedDatabaseReporting: boolean;
  rootSpanNameOverride: (path: string) => string;
  spansPerTraceSoftLimit: number;
  spansPerTraceHardLimit: number;
}

/**
 * A collection of externally-instantiated objects used by StackdriverTracer.
 */
export interface StackdriverTracerComponents {
  logger: Logger;
  tracePolicy: TracePolicy;
  propagation: OpenCensusPropagation;
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
    encodeAsByteArray: util.serializeTraceContext,
    decodeFromByteArray: util.deserializeTraceContext,
  };
  readonly propagation: Propagation = {
    extract: getHeader => {
      // If enabled, this.propagationMechanism is non-null.
      if (!this.enabled) {
        return null;
      }
      // OpenCensus propagation libraries expect span IDs to be size-16 hex
      // strings. In the future it might be worthwhile to change how span IDs
      // are stored in this library to avoid excessive base 10<->16 conversions.
      const result = this.headerPropagation!.extract({
        getHeader: (...args) => {
          const result = getHeader(...args);
          if (result === null) {
            return; // undefined
          }
          return result;
        },
      });
      if (result) {
        result.spanId = util.hexToDec(result.spanId);
      }
      return result;
    },
    inject: (setHeader, value) => {
      // If enabled, this.propagationMechanism is non-null.
      // Also, don't inject a falsey value.
      if (!this.enabled || !value) {
        return;
      }
      // Convert back to base-10 span IDs. See the wrapper for `extract`
      // for more details.
      value = Object.assign({}, value, {
        spanId: `0000000000000000${util.decToHex(value.spanId).slice(2)}`.slice(
          -16
        ),
      });
      this.headerPropagation!.inject({setHeader}, value);
    },
  };

  private enabled = false;
  private pluginName: string;
  private pluginNameToLog: string;
  private logger: Logger | null = null;
  private config: StackdriverTracerConfig | null = null;
  private policy: TracePolicy | null = null;
  // The underlying propagation mechanism used by this.propagation.
  private headerPropagation: OpenCensusPropagation | null = null;

  /**
   * Constructs a new StackdriverTracer instance.
   * @param name A string identifying this StackdriverTracer instance in logs.
   */
  constructor(name: string) {
    this.pluginName = name;
    this.pluginNameToLog = this.pluginName ? this.pluginName : 'no-plugin-name';
    this.disable(); // disable immediately
  }

  /**
   * Enables this instance. This function is only for internal use and
   * unit tests. A separate TraceWriter instance should be initialized
   * beforehand.
   * @param config An object specifying how this instance should
   * be configured.
   * @param components An collection of externally-instantiated objects used
   * by this instance.
   * @private
   */
  enable(
    config: StackdriverTracerConfig,
    components: StackdriverTracerComponents
  ) {
    this.config = config;
    this.logger = components.logger;
    this.policy = components.tracePolicy;
    this.headerPropagation = components.propagation;
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
    this.policy = neverTrace();
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
      return fn(DISABLED_ROOT_SPAN);
    }

    options = options || {name: ''};

    // Don't create a root span if we are already in a root span
    const rootSpan = cls.get().getContext();
    if (rootSpan.type === SpanType.ROOT && !rootSpan.span.endTime) {
      this.logger!.warn(
        `TraceApi#runInRootSpan: [${this.pluginNameToLog}] Cannot create nested root spans.`
      );
      return fn(UNCORRELATED_ROOT_SPAN);
    }

    // Ensure that the trace context, if it exists, has an options field.
    const canonicalizeTraceContext = (
      traceContext?: util.TraceContext | null
    ) => {
      if (!traceContext) {
        return null;
      }
      if (traceContext.options !== undefined) {
        return traceContext as Required<util.TraceContext>;
      }
      return {
        traceId: traceContext.traceId,
        spanId: traceContext.spanId,
        options: 1,
      };
    };
    const traceContext = canonicalizeTraceContext(options.traceContext);

    // Consult the trace policy.
    const shouldTrace = this.policy!.shouldTrace({
      timestamp: Date.now(),
      url: options.url || '',
      method: options.method || '',
      traceContext,
      options,
    });

    const traceId = traceContext
      ? traceContext.traceId
      : uuid
          .v4()
          .split('-')
          .join('');
    let rootContext: RootSpan & RootContext;

    // Create an "untraced" root span (one that won't be published) if the
    // trace policy disallows it.
    if (!shouldTrace) {
      rootContext = new UntracedRootSpanData(traceId);
    } else {
      // Create a new root span, and invoke fn with it.
      rootContext = new RootSpanData(
        // Trace object
        {
          projectId: '',
          traceId,
          spans: [],
        },
        // Span name
        this.config!.rootSpanNameOverride(options.name),
        // Parent span ID
        traceContext ? traceContext.spanId : '0',
        // Number of stack frames to skip
        options.skipFrames || 0
      );
    }

    return cls.get().runWithContext(() => {
      return fn(rootContext);
    }, rootContext);
  }

  getCurrentRootSpan(): RootSpan {
    if (!this.isActive()) {
      return DISABLED_ROOT_SPAN;
    }
    return cls.get().getContext();
  }

  getCurrentContextId(): string | null {
    // In v3, this will be deprecated for getCurrentRootSpan.
    const traceContext = this.getCurrentRootSpan().getTraceContext();
    return traceContext ? traceContext.traceId : null;
  }

  getProjectId(): Promise<string> {
    if (traceWriter.exists() && traceWriter.get().isActive) {
      return traceWriter.get().getProjectId();
    } else {
      return Promise.reject(
        new Error('The Project ID could not be retrieved.')
      );
    }
  }

  getWriterProjectId(): string | null {
    // In v3, this will be deprecated for getProjectId.
    if (traceWriter.exists() && traceWriter.get().isActive) {
      return traceWriter.get().projectId;
    } else {
      return null;
    }
  }

  createChildSpan(options?: SpanOptions): Span {
    if (!this.isActive()) {
      return DISABLED_CHILD_SPAN;
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
        this.logger!.warn(
          `TraceApi#createChildSpan: [${this.pluginNameToLog}] Creating phantom child span [${options.name}] because root span [${rootSpan.span.name}] was already closed.`
        );
        return UNCORRELATED_CHILD_SPAN;
      }
      if (rootSpan.trace.spans.length >= this.config!.spansPerTraceHardLimit) {
        // As in the previous case, a root span with a large number of child
        // spans suggests a memory leak stemming from context confusion. This
        // is likely due to userspace task queues or Promise implementations.
        this.logger!.error(
          `TraceApi#createChildSpan: [${
            this.pluginNameToLog
          }] Creating phantom child span [${
            options.name
          }] because the trace with root span [${
            rootSpan.span.name
          }] has reached a limit of ${
            this.config!.spansPerTraceHardLimit
          } spans. This is likely a memory leak.`
        );
        this.logger!.error(
          [
            'TraceApi#createChildSpan: Please see',
            'https://github.com/googleapis/cloud-trace-nodejs/wiki',
            'for details and suggested actions.',
          ].join(' ')
        );
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
        this.logger!.error(
          `TraceApi#createChildSpan: [${
            this.pluginNameToLog
          }] Adding child span [${
            options.name
          }] will cause the trace with root span [${
            rootSpan.span.name
          }] to contain more than ${
            this.config!.spansPerTraceSoftLimit
          } spans. This is likely a memory leak.`
        );
        this.logger!.error(
          [
            'TraceApi#createChildSpan: Please see',
            'https://github.com/googleapis/cloud-trace-nodejs/wiki',
            'for details and suggested actions.',
          ].join(' ')
        );
      }
      // Create a new child span and return it.
      const childContext = rootSpan.createChildSpan({
        name: options.name,
        skipFrames: options.skipFrames ? options.skipFrames + 1 : 1,
      });
      this.logger!.info(
        `TraceApi#createChildSpan: [${this.pluginNameToLog}] Created child span [${options.name}]`
      );
      return childContext;
    } else if (rootSpan.type === SpanType.UNSAMPLED) {
      // "Untraced" child spans don't incur a memory penalty.
      return rootSpan.createChildSpan();
    } else if (rootSpan.type === SpanType.DISABLED) {
      return DISABLED_CHILD_SPAN;
    } else {
      // Context was lost.
      this.logger!.warn(
        `TraceApi#createChildSpan: [${this.pluginNameToLog}] Creating phantom child span [${options.name}] because there is no root span.`
      );
      return UNCORRELATED_CHILD_SPAN;
    }
  }

  isRealSpan(span: Span): boolean {
    return span.type === SpanType.ROOT || span.type === SpanType.CHILD;
  }

  getResponseTraceContext(
    incomingTraceContext: util.TraceContext | null,
    isTraced: boolean
  ) {
    if (!this.isActive() || !incomingTraceContext) {
      return null;
    }
    return {
      traceId: incomingTraceContext.traceId,
      spanId: incomingTraceContext.spanId,
      options: (incomingTraceContext.options || 0) & (isTraced ? 1 : 0),
    };
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
