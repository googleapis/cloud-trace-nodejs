'use strict';
var cls = require('./cls.js');
var constants = require('./constants.js');

/**
 * This file describes an interface for third-party plugins to enable tracing
 * for arbitrary modules.
 */

/**
 * An object that is associated with a single root or child span. It exposes
 * functions for adding labels to or closing the associated span.
 */
function Transaction(agent, context) {
  this.agent = agent;
  this.context = context;
  this.config = {
    enhancedDatabaseReporting: agent.config_.enhancedDatabaseReporting,
    databaseResultReportingSize: agent.config_.databaseResultReportingSize
  };
}

/**
 * Adds a label to the underlying span.
 * @param {string} key The name of the label to add.
 * @param {*} value The value of the label to add.
 */
Transaction.prototype.addLabel = function(key, value) {
  this.context.addLabel(key, value);
};

/**
 * Ends the underlying span. This function should only be called once.
 */
Transaction.prototype.endSpan = function() {
  this.context.close();
};

/**
 * Constructs a new root span using the information associated with this
 * transaction. It will synchronously invoke the provided function, fn,
 * providing as arguments functions to add labels and end the span,
 * respectively.
 * @type {function(string, string)} addLabel A function that accepts a string
 *   key-value pair and adds it as a label to the root span.
 * @type {function()} endRootSpan A function that ends the root span.
 * @param {string} name The name to assign to this root span.
 * @param {function(addLabel, endRootSpan)} fn A function that
 *   should be called after the root span is created.
 * @param {?function(string, string)} setHeader A function that, if applicable,
 *   should be provided to modify an outgoing request header. If provided, it
 *   will be invoked with a header field name and value as arguments,
 *   respectively.
 */
// TODO(kjin): Move this comment to the right place

/**
 * Plugin constructor. Don't call directly - a Plugin object will be passed to
 * plugins themselves
 * TODO(kjin): Should be called something else
 */
function Plugin(agent) {
  this.agent = agent;
}

/**
 * Runs the given function in a root span corresponding to an incoming request,
 * possibly passing it an object that exposes an interface for adding labels
 * and closing the span.
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
 * @param {function(?Transaction)} fn A function that will be called exactly
 * once. If the incoming request should be traced, a root span will be created,
 * and this function will be called with a Transaction object exposing functions
 * operating on the root span; otherwise, it will be called without any
 * arguments.
 * @returns The return value of calling fn.
 */
Plugin.prototype.runInRootSpan = function(options, fn) {
  options = options || {};
  var that = this;
  // If the options object passed in has the getHeader field set,
  // try to retrieve the header field containing incoming trace metadata.
  var incomingTraceContext;
  if (typeof(options.getHeader) === 'function') {
    var header = options.getHeader('x-cloud-trace-context');
    if (header) {
      incomingTraceContext = that.agent.parseContextFromHeader(header);
    }
  }
  incomingTraceContext = incomingTraceContext || {};
  if (!that.agent.shouldTrace(options.url, incomingTraceContext.options)) {
    return fn();
  }
  return that.agent.namespace.runAndReturn(function() {
    var rootContext = that.agent.createRootSpanData(options.name,
      incomingTraceContext.traceId,
      incomingTraceContext.spanId,
      options.stackFrames || 0);
    // If the options object passed in has the setHeader field set,
    // use it to set trace metadata in an outgoing request.
    if (typeof(options.setHeader) === 'function') {
      var outgoingTraceContext = rootContext.traceId + '/' +
        rootContext.spanId;
      var outgoingHeaderOptions = incomingTraceContext.options != null ?
        incomingTraceContext.options : constants.TRACE_OPTIONS_TRACE_ENABLED;
      outgoingTraceContext += (';o=' + outgoingHeaderOptions);
      extras.setHeader('x-cloud-trace-context', outgoingTraceContext);
    }
    return fn(new Transaction(that.agent, rootContext));
  });
};

/**
 * Runs the given function in a child span, possibly passing it an object that
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
 * collecting call stack information for the root span, starting from the top;
 * this should be set to avoid including frames in the plugin. Defaults to 0.
 * @param {function(?Transaction)} fn A function that will be called exactly
 * once. If a root span has been started, a child span will be created, and this
 * function will be called with a Transaction object exposing an interface
 * operating on the child span; otherwise, it will be called without any
 * arguments.
 * @returns The return value of calling fn.
 */
Plugin.prototype.runInSpan = function(extras, fn) {
  var that = this;
  if (!cls.getRootContext()) {
    return fn();
  }
  options = options || {};
  return that.agent.namespace.runAndReturn(function() {
    var childContext = that.agent.startSpan(options.name, {},
      options.stackFrames || 0);
    // If the options object passed in has the setHeader field set,
    // use it to set trace metadata in an outgoing request.
    if (typeof(options.setHeader) === 'function') {
      var outgoingTraceContext = agent.generateTraceContext(childContext, true);
      options.setHeader('x-cloud-trace-context', outgoingTraceContext);
    }
    return fn(new Transaction(that.agent, childContext));
  }
};

/**
 * Binds the trace context to the given function.
 * This is necessary in order to create child spans correctly in functions
 * that are called asynchronously (for example, in a network response handler).
 * @param {function} fn A function to which to bind the trace context.
 */
Plugin.prototype.wrap = function(fn) {
  return this.agent.namespace.bind(fn);
};

/**
 * Binds the trace context to the given event emitter.
 * This is necessary in order to create child spans correctly in event handlers.
 * @param {EventEmitter} emitter An event emitter whose handlers should have
 * the trace context binded to them.
 */
Plugin.prototype.wrapEmitter = function(emitter) {
  this.agent.namespace.bindEmitter(emitter);
};

module.exports = Plugin;
