'use strict';
var cls = require('./cls.js');
var constants = require('./constants.js');

/**
 * This file describes an interface for third-party plugins to enable tracing
 * for arbitrary modules.
 */

function RootTransaction(agent, context) {
  this.agent = agent;
  this.context = context;
  this.config = {
    enhancedDatabaseReporting: agent.config_.enhancedDatabaseReporting,
    databaseResultReportingSize: agent.config_.databaseResultReportingSize
  };
}

/**
 * Binds the given function to the current context.
 */
RootTransaction.prototype.wrap = function(fn) {
  this.agent.namespace.bind(fn);
};

/**
 * Binds the given event emitter to the current context.
 */
RootTransaction.prototype.wrapEmitter = function(ee) {
  this.agent.namespace.bindEmitter(ee);
};

RootTransaction.prototype.addLabel = function(key, value) {
  this.context.addLabel(key, value);
};

RootTransaction.prototype.endSpan = function() {
  this.context.close();
};

/**
 * Child transaction.
 */

function ChildTransaction(agent, span) {
  this.agent = agent;
  this.span = span;
}

ChildTransaction.prototype.enhancedReporting = function() {
  return this.agent.config_.enhancedDatabaseReporting;
};

ChildTransaction.prototype.wrap = function(fn) {
  this.agent.namespace.bind(fn);
};

ChildTransaction.prototype.wrapEmitter = function(ee) {
  this.agent.namespace.bindEmitter(ee);
};

ChildTransaction.prototype.addLabel = function(key, value) {
  this.span.addLabel(key, value);
};

ChildTransaction.prototype.endSpan = function() {
  this.span.close();
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

function Plugin(agent) {
  this.agent = agent;
}

/**
 * Creates and returns a new RootTransaction object for an incoming request, or
 * null if the incoming request should not be traced.
 * If a new transaction object is created, it can be retrieved by subsequent
 * calls to getTransaction().
 * @param {function(string): ?string} getTraceContext A function that accepts
 *   a request header field name and returns that field's value, or null if
 *   that header field doesn't have a value.
 * @param {?string} url The URL of the incoming request.
 * @returns If the incoming request should be traced, a RootTransaction object which
 *   exposes methods for tracing the request; otherwise, null.
 */
Plugin.prototype.runInRootSpan = function(name, fn, extras) {
  // options could be:
  // url: URL (if applicable)
  // getHeader: function describing how to retrieve a header
  // setHeader: function describing how to set a header
  extras = extras || {};
  var that = this;
  // Try to retrieve the header
  var context;
  if (extras.getHeader) {
    var header = extras.getHeader('x-cloud-trace-context');
    if (header) {
      context = that.agent.parseContextFromHeader(header);
    }
  }
  context = context || {};
  if (!that.agent.shouldTrace(extras.url, context.options)) {
    return fn(null);
  }
  that.agent.namespace.run(function() {
    var rootContext = that.agent.createRootSpanData(name,
      context.traceId, context.spanId, extras.stackFrames || 0);
    if (extras.setHeader) {
      var header = rootContext.traceId + '/' +
        rootContext.spanId;
      var options = context.options |
        constants.TRACE_OPTIONS_TRACE_ENABLED;
      header += (';o=' + options);
      extras.setHeader('x-cloud-trace-context', header);
    }
    return fn(new RootTransaction(that.agent, rootContext));
  });
};

/**
 * Returns a RootTransaction object created by an earlier call to createTransaction
 * in this continuation, or null if there isn't one.
 * @returns If a transaction was previously created, a RootTransaction object which
 *   exposes methods for tracing an outgoing request; otherwise, null.
 */
Plugin.prototype.runInSpan = function(name, fn, extras) {
  var that = this;
  var root = cls.getRootContext();
  if (!root) {
    return fn(null);
  }
  extras = extras || {};
  var context = that.agent.startSpan(name, {}, extras.stackFrames || 0);
  if (extras.setHeader) {
    var header = that.currentTraceContext.traceId + '/' +
      that.currentTraceContext.spanId;
    var options = that.propogatedContext.options |
      constants.TRACE_OPTIONS_TRACE_ENABLED;
    header += (';o=' + options);
    extras.setHeader('x-cloud-trace-context', header);
  }
  return fn(new ChildTransaction(that.agent, context));
};

Plugin.prototype.wrap = function(fn) {
  this.agent.namespace.bind(fn);
};

Plugin.prototype.wrapEmitter = function(emitter) {
  this.agent.namespace.bindEmitter(emitter);
};

module.exports = Plugin;
