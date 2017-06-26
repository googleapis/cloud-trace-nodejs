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

var common = require('@google-cloud/common');
var util = require('util');
var traceLabels = require('./trace-labels.js');
var pjson = require('../package.json');
var constants = require('./constants.js');

var onUncaughtExceptionValues = ['ignore', 'flush', 'flushAndExit'];

var headers = {};		
headers[constants.TRACE_AGENT_REQUEST_HEADER] = 1;

/* @const {Array<string>} list of scopes needed to operate with the trace API */
var SCOPES = ['https://www.googleapis.com/auth/trace.append'];

/**
 * Creates a basic trace writer.
 * @param {!Logger} logger The Trace Agent's logger object.
 * @param {Object} config A config object containing information about
 *   authorization credentials.
 * @constructor
 */
function TraceWriter(logger, config) {
  config = config || {};

  var serviceOptions = {
    packageJson: pjson,
    projectIdRequired: false,
    baseUrl: 'https://cloudtrace.googleapis.com/v1',
    scopes: SCOPES
  };
  common.Service.call(this, serviceOptions, config);

  /** @private */
  this.logger_ = logger;

  /** @private */
  this.config_ = {
    forceNewAgent_: config.forceNewAgent_,
    serviceContext: config.serviceContext,
    credentials: config.credentials,
    keyFilename: config.keyFilename,
    projectId: config.projectId,
    flushDelaySeconds: config.flushDelaySeconds,
    bufferSize: config.bufferSize,
    onUncaughtException: config.onUncaughtException,
    stackTraceLimit: config.stackTraceLimit,
    maximumLabelValueSize: config.maximumLabelValueSize
  };

  /** @private {Array<string>} stringified traces to be published */
  this.buffer_ = [];

  /** @private {Object} default labels to be attached to written spans */
  this.defaultLabels_ = {};

  /** @private {Boolean} whether the trace writer is active */
  this.isActive = true;

  if (onUncaughtExceptionValues.indexOf(config.onUncaughtException) === -1) {
    logger.error('The value of onUncaughtException should be one of ',
      onUncaughtExceptionValues);
    throw new Error('Invalid value for onUncaughtException configuration.');
  }
  var onUncaughtException = config.onUncaughtException;
  if (onUncaughtException !== 'ignore') {
    var that = this;
    this.unhandledException_ = function() {
      that.flushBuffer_(that.projectId);
      if (onUncaughtException === 'flushAndExit') {
        setTimeout(function() {
          process.exit(1);
        }, 2000);
      }
    };
    process.on('uncaughtException', this.unhandledException_);
  }
}
util.inherits(TraceWriter, common.Service);

TraceWriter.prototype.stop = function() {
  this.isActive = false;
};

TraceWriter.prototype.setMetadata = function(metadata) {
  var projectId = metadata.projectId;
  var hostname = metadata.hostname;
  var instanceId = metadata.instanceId;

  // Set labels
  var labels = {};
  labels[traceLabels.AGENT_DATA] = 'node ' + pjson.name + ' v' + pjson.version;
  labels[traceLabels.GCE_HOSTNAME] = hostname;
  if (instanceId) {
    labels[traceLabels.GCE_INSTANCE_ID] = instanceId;
  }
  var moduleName = this.config_.serviceContext.service || hostname;
  labels[traceLabels.GAE_MODULE_NAME] = moduleName;

  var moduleVersion = this.config_.serviceContext.version;
  if (moduleVersion) {
    labels[traceLabels.GAE_MODULE_VERSION] = moduleVersion;
    var minorVersion = this.config_.serviceContext.minorVersion;
    if (minorVersion) {
      var versionLabel = '';
      if (moduleName !== 'default') {
        versionLabel = moduleName + ':';
      }
      versionLabel += moduleVersion + '.' + minorVersion;
      labels[traceLabels.GAE_VERSION] = versionLabel;
    }
  }
  Object.freeze(labels);
  this.defaultLabels_ = labels;

  // Set project ID, and start scheduling buffer flushes
  this.projectId = projectId;
  for (var i = 0; i < this.buffer_; i++) {
    var trace = JSON.parse(this.buffer_[i]);
    trace.projectId = projectId;
    this.buffer_[i] = JSON.stringify(trace);
  }
  if (this.buffer_.length >= this.config_.bufferSize) {
    this.logger_.info('Flushing: trace buffer full');
    var that = this;
    setImmediate(function() { that.flushBuffer_(); });
  }
  this.scheduleFlush_();
};

/**
 * Ensures that all sub spans of the provided spanData are
 * closed and then queues the span data to be published.
 *
 * @param {SpanData} spanData The trace to be queued.
 */
TraceWriter.prototype.writeSpan = function(spanData) {
  for (var i = 0; i < spanData.trace.spans.length; i++) {
    if (spanData.trace.spans[i].endTime === '') {
      spanData.trace.spans[i].close();
    }
  }

  // Copy properties from the default labels.
  for (var k in this.defaultLabels_) {
    if (this.defaultLabels_.hasOwnProperty(k)) {
      spanData.addLabel(k, this.defaultLabels_[k]);
    }
  }
  this.queueTrace_(spanData.trace);
};

/**
 * Buffers the provided trace to be published.
 *
 * @private
 * @param {Trace} trace The trace to be queued.
 */
TraceWriter.prototype.queueTrace_ = function(trace) {
  trace.projectId = this.projectId;
  this.buffer_.push(JSON.stringify(trace));
  this.logger_.debug('queued trace. new size:', this.buffer_.length);

  // Publish soon if the buffer is getting big
  if (this.projectId && this.buffer_.length >= this.config_.bufferSize) {
    this.logger_.info('Flushing: trace buffer full');
    var that = this;
    setImmediate(function() { that.flushBuffer_(); });
  }
  // If projectId is not available, this trace will be published when it's set
  // in setProjectId
};

/**
 * Flushes the buffer of traces at a regular interval
 * controlled by the flushDelay property of this
 * TraceWriter's config.
 */
TraceWriter.prototype.scheduleFlush_ = function() {
  this.logger_.info('Flushing: performing periodic flush');
  this.flushBuffer_();

  // Do it again after delay
  if (this.isActive) {
    setTimeout(this.scheduleFlush_.bind(this),
      this.config_.flushDelaySeconds * 1000).unref();
  }
};

/**
 * Serializes the buffered traces to be published asynchronously.
 *
 * @param {number} projectId The id of the project that traces should publish on.
 */
TraceWriter.prototype.flushBuffer_ = function() {
  if (this.buffer_.length === 0) {
    return;
  }

  // Privatize and clear the buffer.
  var buffer = this.buffer_;
  this.buffer_ = [];
  this.logger_.debug('Flushing traces', buffer);
  this.publish_('{"traces":[' + buffer.join() + ']}');
};

/**
 * Publishes flushed traces to the network.
 *
 * @param {number} projectId The id of the project that traces should publish on.
 * @param {string} json The stringified json representation of the queued traces.
 */
TraceWriter.prototype.publish_ = function(json) {
  // TODO(ofrobots): assert.ok(this.config_.project), and stop accepting
  // projectId as an argument.
  var that = this;
  var uri = 'https://cloudtrace.googleapis.com/v1/projects/' +
    this.projectId + '/traces';

  var options = {
    method: 'PATCH',
    uri: uri,
    body: json,
    headers: headers
  };
  that.request(options, function(err, body, response) {
    if (err) {
      that.logger_.error('TraceWriter: error: ',
        ((response && response.statusCode) || '') + '\n' + err.stack);
    } else {
      that.logger_.info('TraceWriter: published. statusCode: ' + response.statusCode);
    }
  });
};

// Singleton
var traceWriter;

module.exports = {
  create: function(logger, config) {
    if (!traceWriter || config.forceNewAgent_) {
      traceWriter = new TraceWriter(logger, config);
    }
    return traceWriter;
  },
  get: function() {
    if (!traceWriter) {
      throw new Error('TraceWriter singleton was not initialized.');
    }
    return traceWriter;
  }
};
