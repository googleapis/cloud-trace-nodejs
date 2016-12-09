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

function RateLimiterPolicy(samplesPerSecond) {
  if (samplesPerSecond > 1000) {
    samplesPerSecond = 1000;
  }
  this.traceWindow = 1000 / samplesPerSecond;
  this.nextTraceStart = Date.now();
}

RateLimiterPolicy.prototype.shouldTrace = function(dateMillis) {
  if (dateMillis < this.nextTraceStart) {
    return false;
  }
  this.nextTraceStart = dateMillis + this.traceWindow;
  return true;
};

function FilterPolicy(basePolicy, filterUrls) {
  this.basePolicy = basePolicy;
  this.filterUrls = filterUrls;
}

FilterPolicy.prototype.matches = function(url) {
  return this.filterUrls.some(function(candidate) {
    return (typeof candidate === 'string' && candidate === url) ||
      url.match(candidate);
  });
};

FilterPolicy.prototype.shouldTrace = function(dataMillis, url) {
  return !this.matches(url) && this.basePolicy.shouldTrace(dataMillis, url);
};

function TraceAllPolicy() {}

TraceAllPolicy.prototype.shouldTrace = function() { return true; };

module.exports = {
  createTracePolicy: function(config) {
    var basePolicy;
    if (config.samplingRate < 1) {
      basePolicy = new TraceAllPolicy();
    } else {
      basePolicy = new RateLimiterPolicy(config.samplingRate);
    }
    if (config.ignoreUrls && config.ignoreUrls.length > 0) {
      return new FilterPolicy(basePolicy, config.ignoreUrls);
    } else {
      return basePolicy;
    }
  }
};
