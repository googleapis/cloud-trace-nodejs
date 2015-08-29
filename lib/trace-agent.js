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
var hooks = require('./hooks/index.js');
var Trace = require('./trace.js');
var OpaqueSpan = require('./opaque-span.js');
var SpanData = require('./span-data.js');
var TraceWriter = require('./trace-writer.js');
var uuid = require('uuid');
var constants = require('./constants.js');

/** @type {TraceAgent} */
var traceAgent;

/**
 * @constructor
 */
function TraceAgent(config, logger) {
  this.config_ = config;

  hooks.activate(this);

  this.namespace = cls.createNamespace();
  this.traceWriter = new TraceWriter(logger, config);

  this.logger_ = logger;
  logger.info('trace agent activated');
}

/**
 * Halts this agent and unpatches any patched modules.
 */
TraceAgent.prototype.stop = function() {
  hooks.deactivate();
  cls.destroyNamespace();
  this.namespace = null;
  traceAgent = null;
  this.logger_.info('trace agent deactivated');
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
 * @param {Array<{key: string, value: string}>=} labels Labels to be attached
 *   to the newly created span.
 * @return {OpaqueSpan} The newly created span.
 */
TraceAgent.prototype.startSpan = function(name, labels) {
  var rootSpan = cls.getRootContext();
  if (rootSpan) {
    var newSpan = rootSpan.createChildSpanData(name);
    if (labels) {
      labels.forEach(function(label) {
        newSpan.span.setLabel(label.key, label.value);
      });
    }
    return new OpaqueSpan(newSpan);
  } else {
    this.logger_.error
      ('Spans can only be created inside a supported web framework');
    return OpaqueSpan.nullSpan;
  }
};

/**
 * Close the provided span.
 * @param {OpaqueSpan} opaque The span to be ended.
 * @param {Array<{key: string, value: string}>=} labels Labels to be attached
 *   to the terminated span.
 */
TraceAgent.prototype.endSpan = function(opaque, labels) {
  if (labels) {
    labels.forEach(function(label) {
      opaque.addLabel(label.key, label.value);
    });
  }
  opaque.end();
};

/**
 * Set the name of the root transaction.
 * @param {string} name The new name for the current root transaction.
 */
TraceAgent.prototype.setTransactionName = function(name) {
  var rootSpan = cls.getRootContext();
  if (rootSpan) {
    rootSpan.span.name = name;
  } else {
    this.logger_.error('Cannot set transaction name without an active transaction');
  }
};

/**
 * Add a new key value label to the root transaction.
 * @param {string} key The key for the new label.
 * @param {string} value The value for the new label.
 */
TraceAgent.prototype.addTransactionLabel = function(key, value) {
  var rootSpan = cls.getRootContext();
  if (rootSpan) {
    rootSpan.span.setLabel(key, value);
  } else {
    this.logger_.error('Cannot add label without an active transaction');
  }
};

/**
 * Call this from inside a namespace.run().
 */
TraceAgent.prototype.createRootSpanData = function(name, traceId, parentId) {
  traceId = traceId || (uuid.v4().split('-').join(''));
  parentId = parentId || 0;
  var trace = new Trace(0, traceId); // project number added later
  var spanData = new SpanData(this, trace, name, parentId);
  cls.setRootContext(spanData);
  return spanData;
};

/**
 * Checks if a given request if one being made by ourselves
 */
TraceAgent.prototype.isTraceAPIRequest = function(options) {
  return options && options.headers &&
    !!options.headers[constants.TRACE_API_HEADER_NAME];
};

/**
 * Parse a cookie-style header string to extract traceId, spandId and options
 * ex: '123456/667;o=something'
 * -> {traceId: '123456', spanId: '667', options: 'something'}
 * note that we ignore trailing garbage if there is more than one '='
 * Returns null if traceId or spanId are could not be found.
 *
 * @param {string} str string representation of the trace headers
 * @return {?Object} object with keys. null if there is a problem.
 */
TraceAgent.prototype.parseContextFromHeader = function(str) {
  if (!str) {
    return null;
  }
  var matches = str.match(/^([0-9a-fA-F]+)(?:\/([0-9a-fA-F]+))?(?:;o=(.*))?/);
  if (!matches || matches.length !== 4 || matches[0] !== str) {
    return null;
  }
  return {
    traceId: matches[1],
    spanId: matches[2],
    options: matches[3]
  };
};

module.exports = {
  get: function(config, logger) {
    if (traceAgent) {
      // TODO: log error if config object is different from traceAgent.config
      return traceAgent;
    }
    traceAgent = new TraceAgent(config, logger);
    return traceAgent;
  }
};
