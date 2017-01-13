'use strict';
var cls = require('./cls.js');
var constants = require('./constants.js');

/**
 * This file describes an interface for third-party plugins to enable tracing
 * for arbitrary modules.
 */

function Transaction(agent, traceContext) {
  this.propogatedContext = traceContext;
  this.currentTraceContext = null;
  this.agent = agent;
  this.namespace = agent.namespace;
}

/**
 * Binds the given function to the current context.
 */
Transaction.prototype.wrap = function(fn) {
  this.namespace.bind(fn);
};

/**
 * Binds the given event emitter to the current context.
 */
Transaction.prototype.wrapEmitter = function(ee) {
  this.namespace.bindEmitter(ee);
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
Transaction.prototype.runRoot = function(name, fn, setHeader) {
  var that = this;
  that.namespace.run(function() {
    that.currentTraceContext = that.agent.createRootSpanData(name,
      that.propogatedContext.traceId, that.propogatedContext.spanId, 3);
    if (setHeader) {
      var header = that.currentTraceContext.traceId + '/' +
        that.currentTraceContext.spanId;
      var options = that.propogatedContext.options |
        constants.TRACE_OPTIONS_TRACE_ENABLED;
      header += (';o=' + options);
      setHeader('x-cloud-trace-context', header);
    }
    var addLabel = function(key, value) {
      that.currentTraceContext.addLabel(key, value);
    };
    var endRootSpan = function() { that.currentTraceContext.close(); };
    fn(addLabel, endRootSpan);
  });
};

/**
 * Constructs a new child span using the information associated with this transaction as
 * the root. It invokes the provided function providing as arguments a pair of functions.
 * One function one function will add labels to the current root span, the other will
 * terminate the root span.
 */
Transaction.prototype.runChild = function(fn) {
  // TODO(kjin): implement me
};

function Plugin(agent) {
  this.agent = agent;
}

/**
 * Creates and returns a new Transaction object for an incoming request, or
 * null if the incoming request should not be traced.
 * If a new transaction object is created, it can be retrieved by subsequent
 * calls to getTransaction().
 * @param {function(string): ?string} getTraceContext A function that accepts
 *   a request header field name and returns that field's value, or null if
 *   that header field doesn't have a value.
 * @param {?string} url The URL of the incoming request.
 * @returns If the incoming request should be traced, a Transaction object which
 *   exposes methods for tracing the request; otherwise, null.
 */
Plugin.prototype.createTransaction = function(getHeader, url) {
  var header = getHeader('x-cloud-trace-context');
  var context;
  if (header) {
    context = this.agent.parseContextFromHeader(header);
  }
  context = context || {};
  if (!this.agent.shouldTrace(url, context.options)) {
    return null;
  }
  var transaction = new Transaction(this.agent, context);
  cls.getNamespace().run(function() {
    cls.setTransaction(transaction);
  });
  return transaction;
};

/**
 * Returns a Transaction object created by an earlier call to createTransaction
 * in this continuation, or null if there isn't one.
 * @returns If a transaction was previously created, a Transaction object which
 *   exposes methods for tracing an outgoing request; otherwise, null.
 */
Plugin.prototype.getTransaction = function() {
  return cls.getNamespace().runAndReturn(function() {
    return cls.getTransaction();
  });
};

module.exports = Plugin;
