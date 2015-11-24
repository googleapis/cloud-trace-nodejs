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

// TODO(ofrobots): replace this file with the protobuf

/**
 * Converts the provided time in millis into a seconds/nanos
 * style timestamp.
 */
var getTimestamp = function(time) {
  return {
    seconds: Math.floor(time / 1000),
    nanos: Math.floor((time % 1000) * 1000000)
  };
};

/**
 * Creates a trace span object.
 * @constructor
 */
function TraceSpan(name, spanId, parentSpanId, time) {
  this.name = name;
  this.parent_span_id = parentSpanId;
  this.span_id = spanId;
  this.kind = 2; // The enum representation of RPC_CLIENT, see trace.proto
  this.labels = {};
  this.start_time = getTimestamp(time || Date.now());
  this.end_time = null;
}


/**
 * Sets or updates a label value.
 * @param {string} key The label key to set.
 * @param {string} value The new value of the label.
 */
TraceSpan.prototype.setLabel = function(key, value) {
  this.labels[key] = '' + value;
};


/**
 * Closes the span, which just means assigning an end time.
 */
TraceSpan.prototype.close = function() {
  this.end_time = getTimestamp(Date.now());
};


/**
 * Checks whether or not this span has been closed.
 * @returns {boolean} True if the span is closed, false otherwise.
 */
TraceSpan.prototype.isClosed = function() {
  return !!this.end_time;
};

TraceSpan.getTimestamp = getTimestamp;


/**
 * Export TraceSpan.
 */
module.exports = TraceSpan;
