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

/**
 * @constructor
 */
function OpaqueSpan(data) {
  /** @private */
  this.spanData_ = data;
}

/**
 * Add a label to this span.
 * @param {string} key The label's key.
 * @param {string} value The value to be associated with the key.
 */
OpaqueSpan.prototype.addLabel = function(key, value) {
  this.spanData_.span.setLabel(key, value);
};

/**
 * Close this span.
 */
OpaqueSpan.prototype.end = function() {
  this.spanData_.span.close();
};

/**
 * An OpaqueSpan with no functionality to be used when the
 * agent is disabled.
 *
 * @type {OpaqueSpan}
 */
OpaqueSpan.nullSpan = {
  addLabel: function() {},
  end: function() {}
};

module.exports = OpaqueSpan;
