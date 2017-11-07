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

/**
 * An object that determines whether a request should be traced.
 */
export interface TracePolicy {
  shouldTrace(dateMillis: number, url: string): boolean;
}

export class RateLimiterPolicy implements TracePolicy {
  private traceWindow: number;
  private nextTraceStart: number;

  constructor(samplesPerSecond: number) {
    if (samplesPerSecond > 1000) {
      samplesPerSecond = 1000;
    }
    this.traceWindow = 1000 / samplesPerSecond;
    this.nextTraceStart = Date.now();
  }

  shouldTrace(dateMillis: number): boolean {
    if (dateMillis < this.nextTraceStart) {
      return false;
    }
    this.nextTraceStart = dateMillis + this.traceWindow;
    return true;
  }
}

export class FilterPolicy implements TracePolicy {
  constructor(
      private basePolicy: TracePolicy,
      private filterUrls: Array<string|RegExp>) {}

  private matches(url: string) {
    return this.filterUrls.some((candidate) => {
      return (typeof candidate === 'string' && candidate === url) ||
          !!url.match(candidate);
    });
  }

  shouldTrace(dateMillis: number, url: string) {
    return !this.matches(url) && this.basePolicy.shouldTrace(dateMillis, url);
  }
}

export class TraceAllPolicy implements TracePolicy {
  shouldTrace() {
    return true;
  }
}

export class TraceNonePolicy implements TracePolicy {
  shouldTrace() {
    return false;
  }
}

export interface TracePolicyConfig {
  samplingRate: number;
  ignoreUrls?: Array<string|RegExp>;
}

// TODO(kjin): This could be a class as well.
export function createTracePolicy(config: TracePolicyConfig): TracePolicy {
  let basePolicy;
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
