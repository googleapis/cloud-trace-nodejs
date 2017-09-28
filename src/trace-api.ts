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

'use strict';

import { Logger } from '@google-cloud/common';
import * as cls from './cls';
import { Constants } from './constants';
import * as is from 'is';
import * as semver from 'semver';
import { SpanData } from './span-data';
import { Trace } from './trace';
import { TraceLabels } from './trace-labels';
import * as TracingPolicy from './tracing-policy';
import * as util from './util';
import * as uuid from 'uuid';

/**
 * An interface describing configuration fields read by the TraceAgent object.
 * This includes fields read by the trace policy.
 */
export interface TraceAgentConfig extends TracingPolicy.TracePolicyConfig {
  enhancedDatabaseReporting: boolean;
  ignoreContextHeader: boolean;
  projectId?: string;
}

/**
 * An interface that describes the available options for creating a span in
 * general.
 */
export interface SpanOptions {
  /* The name to apply to the span. */
  name: string;
  /**
   * The number of stack frames to skip when collecting call stack information
   * for the span, starting from the top; this should be set to avoid including
   * frames in the plugin. Defaults to 0.
   */
  skipFrames?: number;
}

/**
 * An interface that describes the available options for creating root spans.
 */
export interface RootSpanOptions extends SpanOptions {
  /* A URL associated with the root span, if applicable. */
  url?: string;
  /**
   * The serialized form of an object that contains information about an existing
   * trace context.
   */
  traceContext?: string;
}

interface IncomingTraceContext {
  traceId?: string,
  spanId?: string,
  options?: number
};

/**
 * Type guard that returns whether an object is a string or not.
 */
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

// A sentinal stored in CLS to indicate that the current request was not sampled.
const nullSpan = Object.freeze({});

const ROOT_SPAN_STACK_OFFSET = semver.satisfies(process.version, '>=8') ? 0 : 2;

/**
 * TraceAgent exposes a number of methods to create trace spans and propagate
 * trace context across asynchronous boundaries.
 */
export class TraceAgent {
  public readonly constants = Constants;
  public readonly labels = TraceLabels;

  private pluginName_: string;
  private logger_: Logger;
  private config_: TraceAgentConfig;
  // TODO(kjin): Make this private.
  public policy_: TracingPolicy.TracePolicy;
  private namespace_: cls.Namespace | null;

  /**
   * Constructs a new TraceAgent instance.
   * @param name A string identifying this TraceAgent instance in logs.
   */
  constructor(name: string) {
    this.pluginName_ = name;
    this.disable(); // disable immediately
  }

  /**
   * Enables this instance. This function is only for internal use and
   * unit tests. A separate TraceWriter instance should be initialized beforehand.
   * @param logger A logger object.
   * @param config An object specifying how this instance should
   * be configured.
   * @private
   */
  enable(logger: Logger, config: TraceAgentConfig) {
    this.logger_ = logger;
    this.config_ = config;
    this.policy_ = TracingPolicy.createTracePolicy(config);
    this.namespace_ = cls.getNamespace();
  };

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
    this.policy_ = new TracingPolicy.TraceNonePolicy();
    this.namespace_ = null;
  };

  /**
   * Returns whether the TraceAgent instance is active. This function is only for
   * internal use and unit tests; under normal circumstances it will always return
   * true.
   * @private
   */
  isActive(): boolean {
    return !!this.namespace_;
  };

  /**
   * Gets the value of enhancedDatabaseReporting in the trace agent's
   * configuration object.
   * @returns A boolean value indicating whether the trace agent was configured
   * to have an enhanced level of reporting enabled.
   */
  enhancedDatabaseReportingEnabled(): boolean {
    return !!this.config_ && this.config_.enhancedDatabaseReporting;
  };

  /**
   * Runs the given function in a root span corresponding to an incoming request,
   * possibly passing it an object that exposes an interface for adding labels
   * and closing the span.
   * @param options An object that specifies options for how the root
   * span is created and propogated.
   * @param fn A function that will be called exactly
   * once. If the incoming request should be traced, a root span will be created,
   * and this function will be called with a RootSpan object exposing functions
   * operating on the root span; otherwise, it will be called with null as an
   * argument.
   * @returns The return value of calling fn.
   */
  runInRootSpan<T>(options: RootSpanOptions, fn: (span: SpanData | null) => T): T {
    if (!this.isActive()) {
      return fn(null);
    }

    // This is safe because isActive checks the value of this.namespace_.
    const namespace = this.namespace_ as cls.Namespace;
    // TODO validate options
    // Don't create a root span if we are already in a root span
    if (cls.getRootContext()) {
      this.logger_.warn(this.pluginName_ + ': Cannot create nested root spans.');
      return fn(null);
    }

    return namespace.runAndReturn(() => {
      // Attempt to read incoming trace context.
      let incomingTraceContext: IncomingTraceContext = {};
      if (isString(options.traceContext) && !this.config_.ignoreContextHeader) {
        const parsedContext = util.parseContextFromHeader(options.traceContext);
        if (parsedContext) {
          incomingTraceContext = parsedContext;
        }
      }

      // Consult the trace policy, and don't create a root span if the trace
      // policy disallows it.
      const locallyAllowed = this.policy_.shouldTrace(Date.now(), options.url || '');
      const remotelyAllowed = incomingTraceContext.options === undefined ||
        !!(incomingTraceContext.options & Constants.TRACE_OPTIONS_TRACE_ENABLED);
      if (!locallyAllowed || !remotelyAllowed) {
        cls.setRootContext(nullSpan);
        return fn(null);
      }

      // Create a new root span, and invoke fn with it.
      const traceId = incomingTraceContext.traceId || (uuid.v4().split('-').join(''));
      const parentId = incomingTraceContext.spanId || '0';
      const rootContext = new SpanData(new Trace('', traceId), /* Trace object */
        options.name, /* Span name */
        parentId, /* Parent's span ID */
        true, /* Is root span */
        ROOT_SPAN_STACK_OFFSET + (options.skipFrames || 0));
      rootContext.span.kind = 'RPC_SERVER';
      cls.setRootContext(rootContext);
      return fn(rootContext);
    });
  };

  /**
   * Returns a unique identifier for the currently active context. This can be
   * used to uniquely identify the current root span. If there is no current,
   * context, or if we have lost context, this will return null. The structure and
   * the length of the returned string should be treated opaquely - the only
   * guarantee is that the value would unique for every root span.
   * @returns an id for the current context, or null if there is none
   */
  getCurrentContextId(): string | null {
    if (!this.isActive()) {
      return null;
    }

    const rootSpan = cls.getRootContext();
    if (!isSpanData(rootSpan)) {
      return null;
    }
    return rootSpan.trace.traceId;
  };

  /**
   * Returns the projectId that was either configured or auto-discovered by the
   * TraceWriter. Note that the auto-discovery is done asynchronously, so this
   * may return falsey until the projectId auto-discovery completes.
   */
  getWriterProjectId(): string | null {
    if (this.config_) {
      return this.config_.projectId || null;
    } else {
      return null;
    }
  };

  /**
   * Creates and returns a new ChildSpan object nested within the root span. If
   * there is no current RootSpan object, this function returns null.
   * @param options An object that specifies options for how the child
   * span is created and propagated.
   * @returns A new SpanData object, or null if there is no active root span.
   */
  createChildSpan(options: SpanOptions) {
    if (!this.isActive()) {
      return null;
    }
    
    const rootSpan = cls.getRootContext();
    if (!rootSpan) {
      // Context was lost.
      this.logger_.warn(this.pluginName_ + ': Attempted to create child span ' +
        'without root');
      return null;
    } else if (!isSpanData(rootSpan)) {
      // Context wasn't lost, but there's no root span, indicating that this
      // request should not be traced.
      return null;
    } else {
      if (rootSpan.span.isClosed()) {
        this.logger_.warn(this.pluginName_ + ': creating child for an already closed span',
          options.name, rootSpan.span.name);
      }
      // Create a new child span and return it.
      options = options || {};
      const skipFrames = options.skipFrames ? options.skipFrames + 1 : 1;
      const childContext = new SpanData(rootSpan.trace, /* Trace object */
        options.name, /* Span name */
        rootSpan.span.spanId, /* Parent's span ID */
        false, /* Is root span */
        skipFrames); /* # of frames to skip in stack trace */
      return childContext;
    }
  };

  /**
   * Generates a stringified trace context that should be set as the trace context
   * header in a response to an incoming web request. This value is based on
   * the trace context header value in the corresponding incoming request, as well
   * as the result from the local trace policy on whether this request will be
   * traced or not.
   * @param incomingTraceContext The trace context that was attached to
   * the incoming web request, or null if the incoming request didn't have one.
   * @param isTraced Whether the incoming was traced. This is determined
   * by the local tracing policy.
   * @returns If the response should contain the trace context within its
   * header, the string to be set as this header's value. Otherwise, an empty
   * string.
   */
  getResponseTraceContext(incomingTraceContext: string, isTraced: boolean): string {
    if (!this.isActive()) {
      return '';
    }

    const traceContext = util.parseContextFromHeader(incomingTraceContext);
    if (!traceContext) {
      return '';
    }
    traceContext.options = (traceContext.options || 0) & (isTraced ? 1 : 0);
    return util.generateTraceContext(traceContext);
  };

  /**
   * Binds the trace context to the given function.
   * This is necessary in order to create child spans correctly in functions
   * that are called asynchronously (for example, in a network response handler).
   * @param fn A function to which to bind the trace context.
   */
  wrap<T>(fn: cls.Func<T>): cls.Func<T> {
    if (!this.isActive()) {
      return fn;
    }

    // This is safe because isActive checks the value of this.namespace_.
    const namespace = this.namespace_ as cls.Namespace;
    return namespace.bind<T>(fn);
  };

  /**
   * Binds the trace context to the given event emitter.
   * This is necessary in order to create child spans correctly in event handlers.
   * @param emitter An event emitter whose handlers should have
   * the trace context binded to them.
   */
  wrapEmitter(emitter: NodeJS.EventEmitter): void {
    if (!this.isActive()) {
      return;
    }

    // This is safe because isActive checks the value of this.namespace_.
    const namespace = this.namespace_ as cls.Namespace;
    namespace.bindEmitter(emitter);
  };
}
