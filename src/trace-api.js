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
var cls = require('./cls.js');
var constants = require('./constants.js');
var is = require('is');
var TraceLabels = require('./trace-labels.js');
var util = require('./util.js');
var Trace = require('./trace.js');
var SpanData = require('./span-data.js');
var uuid = require('uuid');
var tracingPolicy = require('./tracing-policy.js');

/**
 * Phantom implementation of the trace api. This allows API users to decouple
 * the enable/disable logic from the calls to the tracing API. The phantom API
 * has a lower overhead than isEnabled checks inside the API functions.
 * @private
 */
var phantomApiImpl = {
  enhancedDatabaseReportingEnabled: function() { return false; },
  runInRootSpan: function(opts, fn) { return fn(null); },
  createChildSpan: function(opts) { return null; },
  getResponseTraceContext: function(context, traced) { return ''; },
  wrap: function(fn) { return fn; },
  wrapEmitter: function(ee) {},
};

/**
 * This file describes an interface for third-party plugins to enable tracing
 * for arbitrary modules.
 */

// A sentinal stored in CLS to indicate that the current request was not sampled.
var nullSpan = {};

/**
 * The functional implementation of the Trace API
 * TODO doc options includes pluginName, logger, policy
 */
function TraceAgent(name, logger, options) {
  options = options || {};
  this.pluginName_ = name;
  this.logger_ = logger;
  this.namespace_ = cls.getNamespace();
  this.policy_ = options.policy || new tracingPolicy.TraceAllPolicy();
  this.config_ = {
    enhancedDatabaseReporting: options.enhancedDatabaseReporting,
    ignoreContextHeader: options.ignoreContextHeader
  };
}

TraceAgent.prototype.disable = function() {
  // Even though plugins should be unpatched, setting a new policy that
  // never generates traces allows persisting wrapped methods (either because
  // they are already instantiated or the plugin doesn't unpatch them) to
  // short-circuit out of trace generation logic.
  this.policy_ = new tracingPolicy.TraceNonePolicy();
  this.namespace_ = null;
  for (var memberName in phantomApiImpl) {
    this[memberName] = phantomApiImpl[memberName];
  }
};

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
    var skipFrames = options.skipFrames ? options.skipFrames + 2 : 2;
    // Attempt to read incoming trace context.
    var incomingTraceContext;
    if (is.string(options.traceContext) && !that.config_.ignoreContextHeader) {
      incomingTraceContext = util.parseContextFromHeader(options.traceContext);
    }
    incomingTraceContext = incomingTraceContext || {};

    var locallyAllowed = that.policy_.shouldTrace(Date.now(), options.url || '');
    var remotelyAllowed = isNaN(incomingTraceContext.options) ||
      (incomingTraceContext.options & constants.TRACE_OPTIONS_TRACE_ENABLED);
    if (!locallyAllowed || !remotelyAllowed) {
      cls.setRootContext(nullSpan);
      return fn(null);
    }

    var traceId = incomingTraceContext.traceId || (uuid.v4().split('-').join(''));
    var parentId = incomingTraceContext.spanId || '0';
    var rootContext = new SpanData(new Trace(0, traceId), /* Trace object */
      options.name, /* Span name */
      parentId, /* Parent's span ID */
      true, /* Is root span */
      skipFrames); /* # of frames to skip in stack trace */
    rootContext.span.kind = 'RPC_SERVER';
    cls.setRootContext(rootContext);
    return fn(rootContext);
  });
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
    // Lost context
    this.logger_.warn(this.pluginName_ + ': Attempted to create child span ' +
      'without root');
    return null;
  } else if (rootSpan === nullSpan) {
    // Chose not to sample
    return null;
  } else if (rootSpan.span.isClosed()) {
    this.logger_.warn('creating child for an already closed span',
        options.name, rootSpan.span.name);
  } else {
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

TraceAgent.prototype.constants = constants;

TraceAgent.prototype.labels = TraceLabels;

module.exports = TraceAgent;
