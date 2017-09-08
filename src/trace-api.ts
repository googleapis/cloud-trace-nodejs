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

import { Constants } from './constants';
import { Trace } from './trace';
import { TraceLabels } from './trace-labels';

var cls = require('./cls'/*.js*/);
var is = require('is');
var util = require('./util'/*.js*/);
var SpanData = require('./span-data'/*.js*/);
var uuid = require('uuid');
var TracingPolicy = require('./tracing-policy'/*.js*/);
var semver = require('semver');

var ROOT_SPAN_STACK_OFFSET = semver.satisfies(process.version, '>=8') ? 0 : 2;

/**
 * Phantom implementation of the trace api. When disabled, a TraceAgent instance
 * will have its public method implementations replaced with corresponding
 * no-op implementations in this object.
 */
var phantomApiImpl = {
  enhancedDatabaseReportingEnabled: function() { return false; },
  runInRootSpan: function(opts, fn) { return fn(null); },
  getCurrentContextId: function() { return null; },
  createChildSpan: function(opts) { return null; },
  getResponseTraceContext: function(context, traced) { return ''; },
  getWriterProjectId : function() { return null; },
  wrap: function(fn) { return fn; },
  wrapEmitter: function(ee) {},
};

// A sentinal stored in CLS to indicate that the current request was not sampled.
var nullSpan = {};

/**
 * TraceAgent exposes a number of methods to create trace spans and propagate
 * trace context across asynchronous boundaries.
 * @constructor
 * @param {String} name A string identifying this TraceAgent instance in logs.
 */
function TraceAgent(name) {
  this.pluginName_ = name;
  this.disable(); // disable immediately
}

/**
 * Enables this instance. This function is only for internal use and
 * unit tests. A separate TraceWriter instance should be initialized beforehand.
 * @param {common.logger} logger A logger object.
 * @param {Configuration} config An object specifying how this instance should
 * be configured.
 * @private
 */
TraceAgent.prototype.enable = function(logger, config) {
  this.logger_ = logger;
  this.config_ = config;
  this.policy_ = TracingPolicy.createTracePolicy(config);
  this.namespace_ = cls.getNamespace();
  for (var memberName in TraceAgent.prototype) {
    this[memberName] = TraceAgent.prototype[memberName];
  }
};

/**
 * Disable this instance. This function is only for internal use and
 * unit tests.
 * @private
 */
TraceAgent.prototype.disable = function() {
  // Even though plugins should be unpatched, setting a new policy that
  // never generates traces allows persisting wrapped methods (either because
  // they are already instantiated or the plugin doesn't unpatch them) to
  // short-circuit out of trace generation logic.
  this.policy_ = new TracingPolicy.TraceNonePolicy();
  this.namespace_ = null;
  for (var memberName in phantomApiImpl) {
    this[memberName] = phantomApiImpl[memberName];
  }
};

/**
 * Returns whether the TraceAgent instance is active. This function is only for
 * internal use and unit tests; under normal circumstances it will always return
 * true.
 * @private
 */
TraceAgent.prototype.isActive = function() {
  return !!this.namespace_;
};

/**
 * Gets the value of enhancedDatabaseReporting in the trace agent's
 * configuration object.
 * @returns A boolean value indicating whether the trace agent was configured
 * to have an enhanced level of reporting enabled.
 */
TraceAgent.prototype.enhancedDatabaseReportingEnabled = function() {
  return this.config_.enhancedDatabaseReporting;
};

/**
 * Runs the given function in a root span corresponding to an incoming request,
 * possibly passing it an object that exposes an interface for adding labels
 * and closing the span.
 * @param {object} options An object that specifies options for how the root
 * span is created and propogated.
 * @param {string} options.name The name to apply to the root span.
 * @param {?string} options.url A URL associated with the root span, if
 * applicable.
 * @param {?string} options.traceContext The serialized form of an object that
 * contains information about an existing trace context.
 * @param {?number} options.skipFrames The number of stack frames to skip when
 * collecting call stack information for the root span, starting from the top;
 * this should be set to avoid including frames in the plugin. Defaults to 0.
 * @param {function(?RootSpan)} fn A function that will be called exactly
 * once. If the incoming request should be traced, a root span will be created,
 * and this function will be called with a RootSpan object exposing functions
 * operating on the root span; otherwise, it will be called with null as an
 * argument.
 * @returns The return value of calling fn.
 */
TraceAgent.prototype.runInRootSpan = function(options, fn) {
  var that = this;
  // TODO validate options
  // Don't create a root span if the required namespace doesn't exist, or we
  // are already in a root span
  if (!this.namespace_) {
    this.logger_.warn(this.pluginName_ + ': CLS namespace not present; not ' +
      'running in root span.');
    return fn(null);
  }
  if (cls.getRootContext()) {
    this.logger_.warn(this.pluginName_ + ': Cannot create nested root spans.');
    return fn(null);
  }

  return this.namespace_.runAndReturn(function() {
    // Attempt to read incoming trace context.
    var incomingTraceContext;
    if (is.string(options.traceContext) && !that.config_.ignoreContextHeader) {
      incomingTraceContext = util.parseContextFromHeader(options.traceContext);
    }
    incomingTraceContext = incomingTraceContext || {};

    // Consult the trace policy, and don't create a root span if the trace
    // policy disallows it.
    var locallyAllowed = that.policy_.shouldTrace(Date.now(), options.url || '');
    var remotelyAllowed = isNaN(incomingTraceContext.options) ||
      (incomingTraceContext.options & Constants.TRACE_OPTIONS_TRACE_ENABLED);
    if (!locallyAllowed || !remotelyAllowed) {
      cls.setRootContext(nullSpan);
      return fn(null);
    }

    // Create a new root span, and invoke fn with it.
    var traceId = incomingTraceContext.traceId || (uuid.v4().split('-').join(''));
    var parentId = incomingTraceContext.spanId || '0';
    var rootContext = new SpanData(new Trace('', traceId), /* Trace object */
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
 * @returns {string} an id for the current context, or null if there is none
 */
TraceAgent.prototype.getCurrentContextId = function() {
  const rootSpan = cls.getRootContext();
  if (!rootSpan || rootSpan === nullSpan) {
    return null;
  }
  return rootSpan.trace.traceId;
};

/**
 * Returns the projectId that was either configured or auto-discovered by the
 * TraceWriter. Note that the auto-discovery is done asynchronously, so this
 * may return falsey until the projectId auto-discovery completes.
 */
TraceAgent.prototype.getWriterProjectId = function() {
  return this.config_.projectId;
};

/**
 * Creates and returns a new ChildSpan object nested within the root span. If
 * there is no current RootSpan object, this function returns null.
 * @param {object} options An object that specifies options for how the child
 * span is created and propagated.
 * @param {string} options.name The name to apply to the child span.
 * @param {?number} options.skipFrames The number of stack frames to skip when
 * collecting call stack information for the root span, starting from the top;
 * this should be set to avoid including frames in the plugin. Defaults to 0.
 * @returns A new ChildSpan object, or null if there is no active root span.
 */
TraceAgent.prototype.createChildSpan = function(options) {
  var rootSpan = cls.getRootContext();
  if (!rootSpan) {
    // Context was lost.
    this.logger_.warn(this.pluginName_ + ': Attempted to create child span ' +
      'without root');
    return null;
  } else if (rootSpan === nullSpan) {
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
    var skipFrames = options.skipFrames ? options.skipFrames + 1 : 1;
    var childContext = new SpanData(rootSpan.trace, /* Trace object */
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
 * @param {string} incomingTraceContext The trace context that was attached to
 * the incoming web request, or null if the incoming request didn't have one.
 * @param {boolean} isTraced Whether the incoming was traced. This is determined
 * by the local tracing policy.
 * @returns {string} If the response should contain the trace context within its
 * header, the string to be set as this header's value. Otherwise, an empty
 * string.
 */
TraceAgent.prototype.getResponseTraceContext = function(
    incomingTraceContext, isTraced) {
  var traceContext = util.parseContextFromHeader(incomingTraceContext);
  if (!traceContext) {
    return '';
  }
  traceContext.options = traceContext.options & isTraced;
  return util.generateTraceContext(traceContext);
};

/**
 * Binds the trace context to the given function.
 * This is necessary in order to create child spans correctly in functions
 * that are called asynchronously (for example, in a network response handler).
 * @param {function} fn A function to which to bind the trace context.
 */
TraceAgent.prototype.wrap = function(fn) {
  if (!this.namespace_) {
    this.logger_.warn(this.pluginName_ + ': No CLS namespace to bind ' +
      'function');
    return fn;
  }
  return this.namespace_.bind(fn);
};

/**
 * Binds the trace context to the given event emitter.
 * This is necessary in order to create child spans correctly in event handlers.
 * @param {EventEmitter} emitter An event emitter whose handlers should have
 * the trace context binded to them.
 */
TraceAgent.prototype.wrapEmitter = function(emitter) {
  if (!this.namespace_) {
    this.logger_.warn(this.pluginName_ + ': No CLS namespace to bind ' +
      'emitter to');
  }
  this.namespace_.bindEmitter(emitter);
};

TraceAgent.prototype.constants = Constants;

TraceAgent.prototype.labels = TraceLabels;

module.exports = TraceAgent;

export default {};
