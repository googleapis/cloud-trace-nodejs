/**
 * Copyright 2015 Google Inc. All Rights Reserved.
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

var cls = require('./cls');
var Trace = require('./trace.js');
var SpanData = require('./span-data.js');
var TraceWriter = require('./trace-writer.js');
var uuid = require('uuid');
var constants = require('./constants.js');
var tracingPolicy = require('./tracing-policy.js');
var isEqual = require('lodash.isequal');
var util = require('./util.js');

/** @type {TraceAgent} */
var traceAgent;

/**
 * @constructor
 */
function TraceAgent(config, logger) {
  this.config_ = config;
  this.logger = logger;

  this.namespace = cls.createNamespace();
  this.traceWriter = new TraceWriter(logger, config);

  this.policy = tracingPolicy.createTracePolicy(config);

  if (config.onUncaughtException !== 'ignore') {
    this.unhandledException = function() {
      traceAgent.traceWriter.flushBuffer_(traceAgent.config_.projectId);
      if (config.onUncaughtException === 'flushAndExit') {
        setTimeout(function() {
          process.exit(1);
        }, 2000);
      }
    };
    process.on('uncaughtException', this.unhandledException);
  }

  logger.info('trace agent activated');
}

/**
 * Halts this agent and unpatches any patched modules.
 */
TraceAgent.prototype.stop = function() {
  // Even though plugins should be unpatched, setting a new policy that
  // never generates traces allows persisting wrapped methods (either because
  // they are already instantiated or the plugin doesn't unpatch them) to
  // short-circuit out of trace generation logic.
  this.policy = new tracingPolicy.TraceNonePolicy();
  // Stop the trace writer from publishing any new traces.
  this.traceWriter.stop();
  cls.destroyNamespace();
  this.namespace = null;
  traceAgent = null;
  if (this.config_.onUncaughtException !== 'ignore') {
    process.removeListener('uncaughtException', this.unhandledException);
  }
  this.logger.info('trace agent deactivated');
};

/**
 * Returns the agent configuration
 * @return {object} configuration
 */
TraceAgent.prototype.config = function() {
  return this.config_;
};

/**
 * Begin a new custom span.
 * @param {string} name The name of the span.
 * @param {Object<string, string}>=} labels Labels to be attached
 *   to the newly created span. Non-object data types are silently ignored.
 * @param {number=} skipFrames The number of caller frames to eliminate from
 *                            stack traces.
 * @return {SpanData} The newly created span.
 */
TraceAgent.prototype.startSpan = function(name, labels, skipFrames) {
  var rootSpan = cls.getRootContext();
  skipFrames = skipFrames || 0;
  if (rootSpan) {
    var newSpan = rootSpan.createChildSpanData(name, skipFrames + 1);
    newSpan.addLabels(labels);
    return newSpan;
  } else {
    this.logger.error
      ('Spans can only be created inside a supported web framework');
    return SpanData.nullSpan;
  }
};

/**
 * Close the provided span.
 * @param {SpanData} spanData The span to be ended.
 * @param {Object<string, string}>=} labels Labels to be attached
 *   to the terminated span. Non-object data types are silently ignored.
 */
TraceAgent.prototype.endSpan = function(spanData, labels) {
  spanData.addLabels(labels);
  spanData.close();
};

/**
 * Determines whether a trace of the given name should be recorded based
 * on the current tracing policy.
 *
 * @param {string} name the url to trace
 * @param {!number} options the trace header options
 */
TraceAgent.prototype.shouldTrace = function(name, options) {
  var locallyAllowed = this.policy.shouldTrace(Date.now(), name);
  // Note: remotelyDisallowed is false if no trace options are present.
  var remotelyDisallowed = !(isNaN(options) ||
    (options & constants.TRACE_OPTIONS_TRACE_ENABLED));
  return locallyAllowed && !remotelyDisallowed;
};

/**
 * Call this from inside a namespace.run().
 * @param {string} name The name of the root span.
 * @param {string} traceId The id of the trace owning this span.
 * @param {string} parentId The id of the parent span.
 * @param {number=} skipFrames The number of caller frames to eliminate from
 *                            stack traces.
 * @param {string} spanKind The kind of root span; one of 'RPC_SERVER',
 *                          'RPC_CLIENT', or 'SPAN_KIND_UNSPECIFIED'.
 */
TraceAgent.prototype.createRootSpanData = function(name, traceId, parentId,
    skipFrames, spanKind) {
  traceId = traceId || (uuid.v4().split('-').join(''));
  parentId = parentId || '0';
  skipFrames = skipFrames || 0;
  spanKind = spanKind || 'RPC_SERVER';
  var trace = new Trace(0, traceId); // project number added later
  var spanData = new SpanData(this, trace, name, parentId, true, skipFrames + 1);
  spanData.span.kind = spanKind;
  cls.setRootContext(spanData);
  return spanData;
};

/**
 * Checks if a given request if one being made by ourselves
 */
TraceAgent.prototype.isTraceAgentRequest = function(options) {
  return options && options.headers &&
    !!options.headers[constants.TRACE_AGENT_REQUEST_HEADER];
};

/**
 * Parse a cookie-style header string to extract traceId, spandId and options,
 * or returns null if the agent has been configured to ignore it.
 * @see util.parseContextFromHeader
 *
 * @param {string} str string representation of the trace headers
 * @return {?{traceId: string, spanId: string, options: number}}
 *         object with keys. null if there is a problem.
 */
TraceAgent.prototype.parseContextFromHeader = function(str) {
  if (this.config_.ignoreContextHeader) {
    return null;
  }
  return util.parseContextFromHeader(str);
};

/**
 * Generates a trace context header value that can be used
 * to follow the associated request through other Google services.
 *
 * @param {SpanData} spanData The span to be added to headers. Must not
 *                            be the nullSpan.
 * @param {boolean} traced Whether this request was traced by the agent.
 */
TraceAgent.prototype.generateTraceContext = function(spanData, traced) {
  if (spanData === SpanData.nullSpan) {
    return '';
  }
  var header = spanData.trace.traceId + '/' + spanData.span.spanId;
  var options = traced ?
    spanData.options | constants.TRACE_OPTIONS_TRACE_ENABLED :
    spanData.options;
  header += (';o=' + options);
  return header;
};

module.exports = {
  get: function(config, logger) {
    if (traceAgent && !config.forceNewAgent_) {
      if (!isEqual(config, traceAgent.config_)) {
        traceAgent.logger.warn('New configuration does not match configuration' +
          'of existing agent. The old configuration will be used.\nNew: ' +
          JSON.stringify(config) + '\nExisting: ' +
          JSON.stringify(traceAgent.config_));
      }
      return traceAgent;
    }
    traceAgent = new TraceAgent(config, logger);
    return traceAgent;
  }
};
