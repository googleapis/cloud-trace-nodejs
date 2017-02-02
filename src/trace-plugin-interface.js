'use strict';
var cls = require('./cls.js');
var constants = require('./constants.js');

/**
 * This file describes an interface for third-party plugins to enable tracing
 * for arbitrary modules.
 */

/**
 * An object that is associated with a single child span. It exposes
 * functions for adding labels to or closing the associated span.
 */
function ChildSpan(agent, context) {
  this.agent = agent;
  this.context = context;
}

/**
 * Adds a label to the underlying span.
 * @param {string} key The name of the label to add.
 * @param {*} value The value of the label to add.
 */
ChildSpan.prototype.addLabel = function(key, value) {
  this.context.addLabel(key, value);
};

/**
 * Ends the underlying span. This function should only be called once.
 */
ChildSpan.prototype.endSpan = function() {
  this.context.close();
};

/**
 * An object that is associated with a single root span. It exposes
 * functions for adding labels to or closing the associated span.
 */
function Transaction(agent, context) {
  this.agent = agent;
  this.context = context;
  this.closed = false;
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
 * collecting call stack information for the root span, starting from the top;
 * this should be set to avoid including frames in the plugin. Defaults to 0.
 * @param {function(ChildSpan)} fn A function that will be called exactly
 * once, with a ChildSpan object exposing an interface operating on the child
 * span.
 * @returns The return value of calling fn.
 */
Transaction.prototype.runInChildSpan = function(options, fn) {
  var that = this;
  options = options || {};
  var childContext = that.agent.startSpan(options.name, {},
    options.skipFrames ? options.skipFrames + 1 : 1);
  // If the options object passed in has the setHeader field set,
  // use it to set trace metadata in an outgoing request.
  if (typeof(options.setHeader) === 'function') {
    var outgoingTraceContext = that.agent.generateTraceContext(childContext, true);
    options.setHeader('x-cloud-trace-context', outgoingTraceContext);
  }
  return fn(new ChildSpan(that.agent, childContext));
};

/**
 * Plugin constructor. Don't call directly - a Plugin object will be passed to
 * plugins themselves
 * TODO(kjin): Should be called something else
 */
function Plugin(agent) {
  this.agent = agent;
  this.logger = agent.logger;
  this.config = {
    enhancedDatabaseReporting: agent.config_.enhancedDatabaseReporting,
    databaseResultReportingSize: agent.config_.databaseResultReportingSize
  };
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
Plugin.prototype.createTransaction = function(options) {
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
  if (options.url && !that.agent.shouldTrace(options.url, incomingTraceContext.options)) {
    return null;
  }
  var rootContext = that.agent.createRootSpanData(options.name,
    incomingTraceContext.traceId,
    incomingTraceContext.spanId,
    options.skipFrames ? options.skipFrames + 1 : 1);
  // If the options object passed in has the setHeader field set,
  // use it to set trace metadata in an outgoing request.
  if (typeof(options.setHeader) === 'function') {
    var outgoingTraceContext = rootContext.traceId + '/' +
      rootContext.spanId;
    var outgoingHeaderOptions = (incomingTraceContext.options !== null &&
      incomingTraceContext.options !== undefined) ?
      incomingTraceContext.options : constants.TRACE_OPTIONS_TRACE_ENABLED;
    outgoingTraceContext += (';o=' + outgoingHeaderOptions);
    options.setHeader('x-cloud-trace-context', outgoingTraceContext);
  }
  return new Transaction(that.agent, rootContext);
};

Plugin.prototype.getTransaction = function() {
  if (cls.getRootContext()) {
    return new Transaction(this.agent, cls.getRootContext());
  } else {
    return null;
  }
};

/**
 * Runs the given function in a root span corresponding to an incoming request,
 * possibly passing it an object that exposes an interface for adding labels
 * and closing the span.
 * @param {object} options An object that specifies options for how the root
 * span is created and propogated. @see Plugin.prototype.createTransaction
 * @param {function(?Transaction)} fn A function that will be called exactly
 * once. If the incoming request should be traced, a root span will be created,
 * and this function will be called with a Transaction object exposing functions
 * operating on the root span; otherwise, it will be called without any
 * arguments.
 * @returns The return value of calling fn.
 */
Plugin.prototype.runInRootSpan = function(options, fn) {
  var that = this;
  return this.agent.namespace.runAndReturn(function() {
    var oldSkipFrames = options.skipFrames;
    options.skipFrames = options.skipFrames ? options.skipFrames + 2 : 2;
    var transaction = that.createTransaction(options);
    options.skipFrames = oldSkipFrames;
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
Plugin.prototype.runInChildSpan = function(options, fn) {
  var transaction = this.getTransaction();
  if (transaction) {
    var oldSkipFrames = options.skipFrames;
    options.skipFrames = options.skipFrames ? options.skipFrames + 1 : 1;
    var result = transaction.runInChildSpan(options, fn);
    options.skipFrames = oldSkipFrames;
    return result;
  } else {
    this.logger.warn(options.name + ': Attempted to run in child span without root');
    return fn();
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
