/**
 * Copyright 2014, 2015 Google Inc. All Rights Reserved.
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
var slice = Array.prototype.slice;

/**
 * @param {number=} level
 * @param {?string=} prefix to use in log messages
 * @constructor
 */
function Logger(level, prefix) {
  this.level_ = level || 0;
  this.prefix_ = prefix || '';
}

/** @const {number} */ Logger.ERROR = 1;
/** @const {number} */ Logger.WARN = 2;
/** @const {number} */ Logger.INFO = 3;
/** @const {number} */ Logger.DEBUG = 4;

/** @const {Array.<?string>} */ var LEVEL_NAMES = [null, 'ERROR', 'WARN ', 'INFO ', 'DEBUG'];

Logger.prototype.error = function() {
  this.log_(Logger.ERROR, slice.call(arguments));
};
Logger.prototype.warn = function() {
  this.log_(Logger.WARN, slice.call(arguments));
};
Logger.prototype.info = function() {
  this.log_(Logger.INFO, slice.call(arguments));
};
Logger.prototype.debug = function() {
  this.log_(Logger.DEBUG, slice.call(arguments));
};

/**
 * Logs any passed in arguments.
 */
Logger.prototype.log_ = function(level, args) {
  if (this.level_ < level) {
    return;
  }
  args.unshift(LEVEL_NAMES[level] + ':' + this.prefix_ + ':');
  console.log.apply(console, args);
};

/**
 * Logs a breakpoint.
 * @param {number} level log level
 * @param {string} msg
 * @param {debuglet.Breakpoint} breakpoint
 */
Logger.prototype.breakpoint = function(level, msg, breakpoint) {
  if (!this.level_) {
    return;
  }
  this.log_(level, [this.formatBreakpointForLog_(msg, breakpoint)]);
};

/**
 * Logs an associative array (map) of breakpoints
 *
 * @param {number} level log level
 * @param {string} msg
 * @param {Object.<string, Breakpoint>} map
 */
Logger.prototype.breakpoints = function(level, msg, map) {
  if (!this.level_ || this.level_ < level) {
    return;
  }
  var that = this;
  this.log_(level, [msg]);
  Object.keys(map).forEach(function(key) {
    that.breakpoint(level, '', this[key]);
  }, map);
};

/**
 * @param {debuglet.Breakpoint} breakpoint
 * @return {string}
 * @private
 */
Logger.prototype.formatBreakpointForLog_ = function(msg, breakpoint) {
  var moment = require('moment');
  var text = msg + util.format('breakpoint id: %s,\n\tlocation: %s',
    breakpoint.id, util.inspect(breakpoint.location));
  if (breakpoint.createdTime) {
    text += '\n\tcreatedTime: ' +
      moment.unix(parseInt(breakpoint.createdTime.seconds, 10)).calendar();
  }
  if (breakpoint.condition) {
    text += '\n\tcondition: ' + util.inspect(breakpoint.condition);
  }
  if (breakpoint.expressions) {
    text += '\n\texpressions: ' + util.inspect(breakpoint.expressions);
  }
  return text;
};

/**
 * Logs the provided message and interval in millis.
 *
 * @param {number} level log level
 * @param {string} msg
 * @param {Array<number>} interval A time interval of the format [seconds, nanoseconds]
 */
Logger.prototype.interval = function(level, msg, interval) {
  if (!this.level_ || this.level_ < level) {
    return;
  }
  this.log_(level, [msg + ' ' + (interval[0]*1000 + interval[1]/1000000) +  'ms']);
};

module.exports = Logger;
