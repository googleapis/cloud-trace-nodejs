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
var TraceLabels = require('./trace-labels.js');
var cls = require('./cls.js');
var constants = require('./constants.js');
var is = require('is');

/**
 * This file describes an interface for third-party plugins to enable tracing
 * for arbitrary modules.
 */

/**
 * An object that is associated with a single child span. It exposes
 * functions for adding labels to or closing the associated span.
 * @param {TraceAgent} agent The underlying trace agent object.
 * @param {SpanData} span An object containing information about the child span.
 */
function ChildSpan(agent, span) {
  this.agent_ = agent;
  this.span_ = span;
}

/**
 * Adds a label to the underlying span.
 * @param {string} key The name of the label to add.
 * @param {*} value The value of the label to add.
 */
ChildSpan.prototype.addLabel = function(key, value) {
  this.span_.addLabel(key, value);
};

/**
 * Ends the underlying span. This function should only be called once.
 */
ChildSpan.prototype.endSpan = function() {
  this.span_.close();
};

/**
 * An object that is associated with a single root span. It exposes
 * functions for adding labels to or closing the associated span.
 * @param {TraceAgent} agent The underlying trace agent object.
 * @param {SpanData} context An object containing information about the
 * root span.
 */
function Transaction(agent, context) {
  this.agent_ = agent;
  this.context_ = context;
}

/**
 * Adds a label to the underlying span.
 * @param {string} key The name of the label to add.
 * @param {*} value The value of the label to add.
 */
Transaction.prototype.addLabel = function(key, value) {
  this.context_.addLabel(key, value);
};

/**
 * Ends the underlying span. This function should only be called once.
 */
Transaction.prototype.endSpan = function() {
  this.context_.close();
};

/**
 * Runs the given function in a child span, passing it an object that
 * exposes an interface for adding labels and closing the span.
 * @param {object} options An object that specifies options for how the child
 * span is created and propogated.
 * @param {string} options.name The name to apply to the child span.
 * @param {?function(string, string)} options.setHeader A function describing
 * how to set a header field with the given field name to a given value,
 * respectively. If supplied, it will be called to set the header field in an
 * outgoing request associated with this child span to the field name
 * 'x-cloud-trace-context'.
 * @param {?number} options.skipFrames The number of stack frames to skip when
 * collecting call stack information for the child span, starting from the top;
 * this should be set to avoid including frames in the plugin. Defaults to 0.
 * @param {function(ChildSpan)} fn A function that will be called exactly
 * once, with a ChildSpan object exposing an interface operating on the child
 * span.
 * @returns The return value of calling fn.
 */
Transaction.prototype.runInChildSpan = function(options, fn) {
  var skipFrames = options.skipFrames ? options.skipFrames + 1 : 1;
  return runInChildSpan_(this, options, skipFrames, fn);
};

/**
 * PluginAPI constructor. Don't call directly - a plugin object will be passed to
 * plugin themselves
 * TODO(kjin): Should be called something else
 */
function PluginAPI(agent) {
  this.agent = agent;
  this.logger = agent.logger;
}

/**
 * Gets the value of enhancedDatabaseReporting in the trace agent's
 * configuration object.
 * @returns A boolean value indicating whether the trace agent was configured
 * to have an enhanced level of reporting enabled.
 */
PluginAPI.prototype.enhancedReportingEnabled = function() {
  return this.agent.config_.enhancedDatabaseReporting;
}

/**
 * Creates a new Transaction object corresponding to an incoming request, which
 * exposes methods operating on the root span.
 * @param {object} options An object that specifies options for how the root
 * span is created and propogated.
 * @param {string} options.name The name to apply to the root span.
 * @param {?string} options.url A URL associated with the root span, if
 * applicable.
 * @param {?function(string)} options.getHeader A function describing how to
 * obtain a header field with the given field name from the incoming request
 * assoicated with this root span. If supplied, it will be called to obtain the
 * header field 'x-cloud-trace-context'.
 * @param {?function(string, string)} options.setHeader A function describing
 * how to set a header field with the given field name to a given value,
 * respectively. If supplied, it will be called to set the header field in an
 * outgoing request associated with this root span to the field name
 * 'x-cloud-trace-context'.
 * @param {?number} options.skipFrames The number of stack frames to skip when
 * collecting call stack information for the root span, starting from the top;
 * this should be set to avoid including frames in the plugin. Defaults to 0.
 * @returns A new Transaction object, or null if the trace agent's policy has
 * disabled tracing for the given set of options.
 */
PluginAPI.prototype.createTransaction = function(options) {
  var skipFrames = options.skipFrames ? options.skipFrames + 1 : 1;
  return createTransaction_(this, options, skipFrames);
};

/**
 * Returns a Transaction object that corresponds to a root span started earlier
 * in the same context, or null if one doesn't exist.
 * @returns A new Transaction object, or null if a root span doesn't exist in
 * the current context.
 */
PluginAPI.prototype.getTransaction = function() {
  if (cls.getRootContext()) {
    return new Transaction(this.agent, cls.getRootContext());
  } else {
    this.logger.warn('Attempted to get transaction handle when it doesn\'t' + 
      ' exist');
    return null;
  }
};

/**
 * Runs the given function in a root span corresponding to an incoming request,
 * possibly passing it an object that exposes an interface for adding labels
 * and closing the span.
 * @param {object} options An object that specifies options for how the root
 * span is created and propogated. @see PluginAPI.prototype.createTransaction
 * @param {function(?Transaction)} fn A function that will be called exactly
 * once. If the incoming request should be traced, a root span will be created,
 * and this function will be called with a Transaction object exposing functions
 * operating on the root span; otherwise, it will be called without any
 * arguments.
 * @returns The return value of calling fn.
 */
PluginAPI.prototype.runInRootSpan = function(options, fn) {
  var that = this;
  return this.agent.namespace.runAndReturn(function() {
    var skipFrames = options.skipFrames ? options.skipFrames + 2 : 2;
    var transaction = createTransaction_(that, options, skipFrames);
    return fn(transaction);
  });
};

/**
 * Convenience method which obtains a Transaction object with getTransaction()
 * and calls its runInChildSpan function on the given arguments. If there is
 * no current Transaction object, the provided function will be called without
 * arguments.
 * @param {object} options An object that specifies options for how the root
 * span is created and propogated. @see Transaction.prototype.runInChildSpan
 * @param {function(?Transaction)} fn A function that will be called exactly
 * once. @see Transaction.prototype.runInChildSpan
 * @returns The return value of calling fn.
 */
PluginAPI.prototype.runInChildSpan = function(options, fn) {
  var transaction = this.getTransaction();
  if (transaction) {
    var skipFrames = options.skipFrames ? options.skipFrames + 1 : 1;
    return runInChildSpan_(transaction, options, skipFrames, fn);
  } else {
    this.logger.warn(options.name + ': Attempted to run in child span without' +
      ' root');
    return fn();
  }
};

/**
 * Binds the trace context to the given function.
 * This is necessary in order to create child spans correctly in functions
 * that are called asynchronously (for example, in a network response handler).
 * @param {function} fn A function to which to bind the trace context.
 */
PluginAPI.prototype.wrap = function(fn) {
  return this.agent.namespace.bind(fn);
};

/**
 * Binds the trace context to the given event emitter.
 * This is necessary in order to create child spans correctly in event handlers.
 * @param {EventEmitter} emitter An event emitter whose handlers should have
 * the trace context binded to them.
 */
PluginAPI.prototype.wrapEmitter = function(emitter) {
  this.agent.namespace.bindEmitter(emitter);
};

PluginAPI.prototype.labels = TraceLabels;

module.exports = PluginAPI;

// Module-private functions

function createTransaction_(api, options, skipFrames) {
  options = options || {};
  // If the options object passed in has the getHeader field set,
  // try to retrieve the header field containing incoming trace metadata.
  var incomingTraceContext;
  if (is.fn(options.getHeader)) {
    var header = options.getHeader('x-cloud-trace-context');
    if (header) {
      incomingTraceContext = api.agent.parseContextFromHeader(header);
    }
  }
  incomingTraceContext = incomingTraceContext || {};
  if (options.url && !api.agent.shouldTrace(options.url, incomingTraceContext.options)) {
    return null;
  }
  var rootContext = api.agent.createRootSpanData(options.name,
    incomingTraceContext.traceId,
    incomingTraceContext.spanId,
    skipFrames + 1);
  // If the options object passed in has the setHeader field set,
  // use it to set trace metadata in an outgoing request.
  if (is.fn(options.setHeader)) {
    var outgoingTraceContext = rootContext.traceId + '/' +
      rootContext.spanId;
    var outgoingHeaderOptions = (incomingTraceContext.options !== null &&
      incomingTraceContext.options !== undefined) ?
      incomingTraceContext.options : constants.TRACE_OPTIONS_TRACE_ENABLED;
    outgoingTraceContext += (';o=' + outgoingHeaderOptions);
    options.setHeader('x-cloud-trace-context', outgoingTraceContext);
  }
  return new Transaction(api.agent, rootContext);
}

function runInChildSpan_(transaction, options, skipFrames, fn) {
  options = options || {};
  var childContext = transaction.agent_.startSpan(options.name, {},
    skipFrames + 1);
  // If the options object passed in has the setHeader field set,
  // use it to set trace metadata in an outgoing request.
  if (is.fn(options.setHeader)) {
    options.setHeader('x-cloud-trace-context',
      transaction.agent_.generateTraceContext(childContext, true));
  }
  return fn(new ChildSpan(transaction.agent_, childContext));
}
