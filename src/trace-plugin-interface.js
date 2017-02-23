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
var traceUtil = require('./util.js');

/**
 * This file describes an interface for third-party plugins to enable tracing
 * for arbitrary modules.
 */

/**
 * An object that represents a single child span. It exposes functions for
 * adding labels to or closing the span.
 * @param {TraceAgent} agent The underlying trace agent object.
 * @param {SpanData} span The internal data structure backing the child span.
 */
function ChildSpan(agent, span) {
  this.agent_ = agent;
  this.span_ = span;
  this.serializedTraceContext_ = agent.generateTraceContext(span, true);
}

/**
 * Adds a label to the child span.
 * @param {string} key The name of the label to add.
 * @param {*} value The value of the label to add.
 */
ChildSpan.prototype.addLabel = function(key, value) {
  this.span_.addLabel(key, value);
};

/**
 * Ends the child span. This function should only be called once.
 */
ChildSpan.prototype.endSpan = function() {
  this.span_.close();
};

/**
 * Gets the trace context serialized as a string. This string can be set as the
 * 'x-cloud-trace-context' field in an HTTP request header to support
 * distributed tracing.
 */
ChildSpan.prototype.getTraceContext = function() {
  return this.serializedTraceContext_;
};

/**
 * An object that represents a single root span. It exposes functions for adding
 * labels to or closing the span.
 * @param {TraceAgent} agent The underlying trace agent object.
 * @param {SpanData} span The internal data structure backing the root span.
 */
function RootSpan(agent, span) {
  this.agent_ = agent;
  this.span_ = span;
  this.serializedTraceContext_ = agent.generateTraceContext(span, true);
}

/**
 * Adds a label to the span.
 * @param {string} key The name of the label to add.
 * @param {*} value The value of the label to add.
 */
RootSpan.prototype.addLabel = function(key, value) {
  this.span_.addLabel(key, value);
};

/**
 * Ends the span. This function should only be called once.
 */
RootSpan.prototype.endSpan = function() {
  this.span_.close();
};

/**
 * Gets the trace context serialized as a string. This string can be set as the
 * 'x-cloud-trace-context' field in an HTTP request header to support
 * distributed tracing.
 */
RootSpan.prototype.getTraceContext = function() {
  return this.serializedTraceContext_;
};

var nullSpan = {
  addLabel: function(k, v) {},
  endSpan: function() {},
  getTraceContext: function() { return ''; }
};

/**
 * PluginAPI constructor. Don't call directly - a plugin object will be passed to
 * plugin themselves
 */
function PluginAPI(agent, pluginName) {
  this.agent_ = agent;
  this.logger_ = agent.logger;
  this.pluginName_ = pluginName;
}

/**
 * Gets the value of enhancedDatabaseReporting in the trace agent's
 * configuration object.
 * @returns A boolean value indicating whether the trace agent was configured
 * to have an enhanced level of reporting enabled.
 */
PluginAPI.prototype.enhancedDatabaseReportingEnabled = function() {
  return this.agent_.config_.enhancedDatabaseReporting;
};

/**
 * Summarizes database results correctly applying the databaseResultReportingSize
 * configuration option.
 * @returns a summarization of `res`.
 */
PluginAPI.prototype.summarizeDatabaseResults = function(res) {
  return traceUtil.stringifyPrefix(res,
         this.agent_.config_.databaseResultReportingSize);
};

/**
 * Runs the given function in a root span corresponding to an incoming request,
 * possibly passing it an object that exposes an interface for adding labels
 * and closing the span.
 * @param {object} options An object that specifies options for how the root
 * span is created and propogated. @see PluginAPI.prototype.createRootSpan
 * @param {function(?RootSpan)} fn A function that will be called exactly
 * once. If the incoming request should be traced, a root span will be created,
 * and this function will be called with a RootSpan object exposing functions
 * operating on the root span; otherwise, it will be called with null as an
 * argument.
 * @returns The return value of calling fn.
 */
PluginAPI.prototype.runInRootSpan = function(options, fn) {
  var that = this;
  if (!this.agent_.namespace) {
    this.logger_.warn(this.pluginName_ + ': CLS namespace not present; not ' +
      'running in root span.');
    return fn(null);
  }
  if (cls.getRootContext()) {
    this.logger_.warn(this.pluginName_ + ': Cannot create nested root spans.');
    return fn(null);
  }
  return this.agent_.namespace.runAndReturn(function() {
    var skipFrames = options.skipFrames ? options.skipFrames + 3 : 3;
    var rootSpan = createRootSpan_(that, options, skipFrames);
    return fn(rootSpan);
  });
};

/**
 * Creates and returns a new ChildSpan object nested within the root span. If
 * there is no current RootSpan object, this function returns null.
 * @param {object} options An object that specifies options for how the child
 * span is created and propogated.
 * @returns A new ChildSpan object, or null if there is no active root span.
 */
PluginAPI.prototype.createChildSpan = function(options) {
  var rootSpan = getRootSpan_(this);
  if (rootSpan) {
    options = options || {};
    var childContext = this.agent_.startSpan(options.name, {},
      options.skipFrames ? options.skipFrames + 2 : 2);
    return new ChildSpan(this.agent_, childContext);
  } else {
    this.logger_.warn(this.pluginName_ + ': Attempted to create child span ' +
      'without root');
    return null;
  }
};

/**
 * Binds the trace context to the given function.
 * This is necessary in order to create child spans correctly in functions
 * that are called asynchronously (for example, in a network response handler).
 * @param {function} fn A function to which to bind the trace context.
 */
PluginAPI.prototype.wrap = function(fn) {
  if (!this.agent_.namespace) {
    this.logger_.warn(this.pluginName_ + ': No CLS namespace to bind ' +
      'function to');
    return fn;
  }
  return this.agent_.namespace.bind(fn);
};

/**
 * Binds the trace context to the given event emitter.
 * This is necessary in order to create child spans correctly in event handlers.
 * @param {EventEmitter} emitter An event emitter whose handlers should have
 * the trace context binded to them.
 */
PluginAPI.prototype.wrapEmitter = function(emitter) {
  if (!this.agent_.namespace) {
    this.logger_.warn(this.pluginName_ + ': No CLS namespace to bind ' +
      'emitter to');
  }
  this.agent_.namespace.bindEmitter(emitter);
};

PluginAPI.prototype.constants = constants;

PluginAPI.prototype.labels = TraceLabels;

PluginAPI.prototype.isActive = function() {
  return true;
};

/**
 * Phantom implementation of the trace api. This allows API users to decouple
 * the enable/disable logic from the calls to the tracing API. The phantom API
 * has a lower overhead than isEnabled checks inside the API functions.
 * @private
 */
var phantomApi = {
  enhancedDatabaseReportingEnabled: function() { return false; },
  summarizeDatabaseResults: function(results) { return results; },
  runInRootSpan: function(opts, fn) { return fn(nullSpan); },
  createChildSpan: function(opts) { return nullSpan; },
  wrap: function(fn) { return fn; },
  wrapEmitter: function(ee) { return ee; },
  constants: constants,
  labels: TraceLabels,
  isActive: function () { return false; }
};

module.exports = {
  /**
   * Creates an object that provides an interface to the trace agent
   * implementation.
   * Upon creation, the object is in an "uninitialized" state, corresponding
   * to its intended (no-op) behavior before the trace agent is started.
   * When the trace agent is started, the interface object becomes
   * "initialized", and its underlying implementation is switched to that of
   * the actual agent implementation.
   * Finally, when the trace agent is stopped, this object enters the "disabled"
   * state, and its underlying implementation is switched back to no-op.
   * Currently, this only happens when the application's GCP project ID could
   * not be determined from the GCP metadata service.
   * This object's state changes strictly from uninitialized to initialized,
   * and from initialized to disabled.
   */
  create: function(pluginName) {
    var api = phantomApi;
    var logger;
    // uninitialized: api === phantomApi && !logger
    // initialized: api !== phantomApi && logger
    // disabled: api === phantomApi && logger
    return {
      enhancedDatabaseReportingEnabled: function() {
        return api.enhancedDatabaseReportingEnabled();
      },
      summarizeDatabaseResults: function(results) {
        return api.summarizeDatabaseResults(results);
      },
      runInRootSpan: function(opts, fn) {
        return api.runInRootSpan(opts, fn);
      },
      createChildSpan: function(opts) {
        return api.createChildSpan(opts);
      },
      wrap: function(fn) {
        return api.wrap(fn);
      },
      wrapEmitter: function(ee) {
        return api.wrapEmitter(ee);
      },
      constants: api.constants,
      labels: api.labels,
      isActive: function() {
        return api.isActive();
      },
      initialize_: function(agent) {
        if (logger) {
          logger.error('Trace interface for ' + pluginName +
            ' has already been initialized.');
          return;
        }
        api = new PluginAPI(agent, pluginName);
        logger = agent.logger_;
      },
      disable_: function() {
        if (api === phantomApi && logger) {
          logger.error('Trace interface for ' + pluginName +
            ' has already been disabled.');
          return;
        }
        api = phantomApi;
      },
      private_: function() { return api.agent_; }
    };
  }
};

// Module-private functions

function createRootSpan_(api, options, skipFrames) {
  options = options || {};
  // If the options object passed in has the getTraceContext field set,
  // try to retrieve the header field containing incoming trace metadata.
  var incomingTraceContext;
  if (is.string(options.traceContext)) {
    incomingTraceContext = api.agent_.parseContextFromHeader(options.traceContext);
  }
  incomingTraceContext = incomingTraceContext || {};
  if (!api.agent_.shouldTrace(options.url || '',
        incomingTraceContext.options)) {
    return null;
  }
  var rootContext = api.agent_.createRootSpanData(options.name,
    incomingTraceContext.traceId,
    incomingTraceContext.spanId,
    skipFrames + 1);
  return new RootSpan(api.agent_, rootContext);
}

function getRootSpan_(api) {
  if (cls.getRootContext()) {
    return new RootSpan(api.agent_, cls.getRootContext());
  } else {
    api.logger_.warn('Attempted to get root span when it doesn\'t' +
      ' exist');
    return null;
  }
}
