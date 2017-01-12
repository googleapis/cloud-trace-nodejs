var cls = require('continuation-local-storage');
var SpanData = require('./span-data.js');
var constants = require('./constants.js');

function Transaction(agent, traceContext) {
  this.propogatedContext = traceContext;
  this.currentTraceContext = null;
  this.agent = agent;
  this.namespace = agent.namespace;
}

function startChildSpan() {
  console.log('Started root span: ' + Array.prototype.slice.call(arguments));
}

function endChildSpan() {
  console.log('Ended root span: ' + Array.prototype.slice.call(arguments));
}

/*
 * Binds the given function to the current context. Proxy to cls bind but using zone.js
 * naming conventions.
 */
Transaction.prototype.wrap = function(fn) {
  console.log('Binded function: ' + Array.prototype.slice.call(arguments));
  this.namespace.bind(fn);
};

/*
 * Binds the given event emitter to the current context. Proxy to cls bindEmitter but using 
 * zone.js naming conventions.
 */
Transaction.prototype.wrapEmitter = function(ee) {
  console.log('Binded emitter: ' + Array.prototype.slice.call(arguments));
  this.namespace.bindEmitter(ee);
};

/*
  * Constructs a new root span using the information associated with this transaction. It
  * invokes the provided function providing as arguments a pair of functions. One function
  * will add labels to the current root span, the other will terminate the root span.
  */
Transaction.prototype.runRoot = function(name, fn, setTraceContext) {
  var that = this;
  that.namespace.run(function() {
    that.currentTraceContext = that.agent.createRootSpanData(name, that.propogatedContext.traceId, that.propogatedContext.spanId, 3);
    if (setTraceContext) {
      var header = that.currentTraceContext.traceId + '/' + that.currentTraceContext.spanId;
      var options = that.propogatedContext.options | constants.TRACE_OPTIONS_TRACE_ENABLED;
      header += (';o=' + options);
      setTraceContext('x-cloud-trace-context', header);
    }
    var addLabel = function (key, value) {
      console.log('Added label: ' + Array.prototype.slice.call(arguments));
      that.currentTraceContext.addLabel(key, value);
    };
    var endRootSpan = function() { that.currentTraceContext.close(); };
    fn(addLabel, endRootSpan);
  });
}

/*
 * Constructs a new child span using the information associated with this transaction as
 * the root. It invokes the provided function providing as arguments a pair of functions.
 * One function one function will add labels to the current root span, the other will
 * terminate the root span.
 */
Transaction.prototype.runChild = function(fn) {
  // TODO(kjin): implement me
  startChildSpan();
  namespace.run(fn.bind(null, addLabel, endChildSpan));
}

function Plugin(agent) {
  this.activeTransaction = null;
  this.agent = agent;
}

Plugin.prototype.createTransaction = function(getTraceContext, url) {
  var header = getTraceContext('x-cloud-trace-context');
  var context;
  if (header) {
    context = this.agent.parseContextFromHeader(header);
  }
  context = context || {};
  if (!this.agent.shouldTrace(url, context.options)) {
    return null;
  }
  this.activeTransaction = new Transaction(this.agent, context);
  return this.activeTransaction;
};

Plugin.prototype.getTransaction = function() {
  return this.activeTransaction;
}

module.exports = Plugin;
