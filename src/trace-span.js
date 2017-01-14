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

var util = require('util');
var constants = require('./constants.js');

/**
 * Truncates the provided `string` to be at most `length` bytes
 * after utf8 encoding and the appending of '...'.
 * We produce the result by iterating over input characters to
 * avoid truncating the string potentially producing partial unicode
 * characters at the end.
 */
function truncate(string, length) {
  string = string.substr(0, length - 3);
  while (Buffer.byteLength(string, 'utf8') > length - 3) {
    string = string.substr(0, string.length - 1);
  }
  return string + '...';
}

/**
 * Creates a trace span object.
 * @constructor
 */
function TraceSpan(name, spanId, parentSpanId) {
  if (Buffer.byteLength(name, 'utf8') > constants.TRACE_SERVICE_SPAN_NAME_LIMIT) {
    this.name = truncate(name, constants.TRACE_SERVICE_SPAN_NAME_LIMIT);
  } else {
    this.name = name;
  }
  this.parentSpanId = parentSpanId;
  this.spanId = spanId;
  this.kind = 'RPC_CLIENT';
  this.labels = {};
  this.startTime = (new Date()).toISOString();
  this.endTime = '';
}


/**
 * Sets or updates a label value.
 * @param {string} key The label key to set.
 * @param {string} value The new value of the label.
 */
TraceSpan.prototype.setLabel = function(key, value) {
  if (Buffer.byteLength(key, 'utf8') > constants.TRACE_SERVICE_LABEL_KEY_LIMIT) {
    key = truncate(key, constants.TRACE_SERVICE_LABEL_KEY_LIMIT);
  }
  var val = typeof value === 'object' ? util.inspect(value) : '' + value;
  if (Buffer.byteLength(val, 'utf8') > constants.TRACE_SERVICE_LABEL_VALUE_LIMIT) {
    val = truncate(val, constants.TRACE_SERVICE_LABEL_VALUE_LIMIT);
  }
  this.labels[key] = val;
};


/**
 * Closes the span, which just means assigning an end time.
 */
TraceSpan.prototype.close = function() {
  this.endTime = (new Date()).toISOString();
};


/**
 * Checks whether or not this span has been closed.
 * @returns {boolean} True if the span is closed, false otherwise.
 */
TraceSpan.prototype.isClosed = function() {
  return !!this.endTime;
};


/**
 * Export TraceSpan.
 */
module.exports = TraceSpan;
