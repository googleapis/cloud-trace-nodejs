import {RequestDetails, TracePolicy} from './config';
import {Constants} from './constants';
import {TraceContext} from './util';

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
 * An enumeration of the different possible types of behavior when dealing with
 * incoming trace context. Requests are still subject to local tracing policy.
 */
export enum TraceContextHeaderBehavior {
  /**
   * Respect the trace context header if it exists; otherwise, trace the
   * request as a new trace.
   */
  DEFAULT = 'default',
  /**
   * Respect the trace context header if it exists; otherwise, treat the
   * request as unsampled and don't trace it.
   */
  REQUIRE = 'require',
  /**
   * Trace every request as a new trace, even if trace context exists.
   */
  IGNORE = 'ignore',
}

interface TracePolicyPredicate<T> {
  shouldTrace: (value: T) => boolean;
}

class Sampler implements TracePolicyPredicate<number> {
  private readonly traceWindow: number;
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

class URLFilter implements TracePolicyPredicate<string> {
  constructor(private readonly filterUrls: Array<string | RegExp>) {}

  shouldTrace(url: string) {
    return !this.filterUrls.some(candidate => {
      return (
        (typeof candidate === 'string' && candidate === url) ||
        !!url.match(candidate)
      );
    });
  }
}

class MethodsFilter implements TracePolicyPredicate<string> {
  constructor(private readonly filterMethods: string[]) {}

  shouldTrace(method: string) {
    return !this.filterMethods.some(candidate => {
      return candidate.toLowerCase() === method.toLowerCase();
    });
  }
}

class ContextHeaderFilter
  implements TracePolicyPredicate<Required<TraceContext> | null> {
  constructor(
    private readonly contextHeaderBehavior: TraceContextHeaderBehavior
  ) {}

  shouldTrace(header: Required<TraceContext> | null) {
    switch (this.contextHeaderBehavior) {
      case TraceContextHeaderBehavior.IGNORE: {
        return true;
      }
      case TraceContextHeaderBehavior.REQUIRE: {
        // There must be an incoming header, and its LSB must be 1.
        return !!(
          header && header.options & Constants.TRACE_OPTIONS_TRACE_ENABLED
        );
      }
      default: {
        // TraceContextHeaderBehavior.DEFAULT
        // If there is a header, its LSB must be 1. Otherwise, we assume that
        // it would be 1.
        return !!(
          !header || header.options & Constants.TRACE_OPTIONS_TRACE_ENABLED
        );
      }
    }
  }
}

/**
 * Options for constructing a TracePolicy instance.
 */
export interface TracePolicyConfig {
  /**
   * A field that controls time-based sampling.
   */
  samplingRate: number;
  /**
   * A field that controls a url-based filter.
   */
  ignoreUrls: Array<string | RegExp>;
  /**
   * A field that controls a method filter.
   */
  ignoreMethods: string[];
  /**
   * A field that controls filtering based on incoming trace context.
   */
  contextHeaderBehavior: TraceContextHeaderBehavior;
}

/**
 * A class that makes decisions about whether a trace should be created.
 */
export class BuiltinTracePolicy implements TracePolicy {
  private readonly sampler: TracePolicyPredicate<number>;
  private readonly urlFilter: TracePolicyPredicate<string>;
  private readonly methodsFilter: TracePolicyPredicate<string>;
  private readonly contextHeaderFilter: TracePolicyPredicate<Required<
    TraceContext
  > | null>;

  /**
   * Constructs a new TracePolicy instance.
   * @param config Configuration for the TracePolicy instance.
   */
  constructor(config: TracePolicyConfig) {
    if (config.samplingRate === 0) {
      this.sampler = {shouldTrace: () => true};
    } else if (config.samplingRate < 0) {
      this.sampler = {shouldTrace: () => false};
    } else {
      this.sampler = new Sampler(config.samplingRate);
    }
    if (config.ignoreUrls.length === 0) {
      this.urlFilter = {shouldTrace: () => true};
    } else {
      this.urlFilter = new URLFilter(config.ignoreUrls);
    }
    if (config.ignoreMethods.length === 0) {
      this.methodsFilter = {shouldTrace: () => true};
    } else {
      this.methodsFilter = new MethodsFilter(config.ignoreMethods);
    }
    if (config.contextHeaderBehavior === TraceContextHeaderBehavior.IGNORE) {
      this.contextHeaderFilter = {shouldTrace: () => true};
    } else {
      this.contextHeaderFilter = new ContextHeaderFilter(
        config.contextHeaderBehavior
      );
    }
  }

  /**
   * Given a timestamp and URL, decides if a trace should be created.
   * @param options Fields that help determine whether a trace should be
   *                created.
   */
  shouldTrace(options: RequestDetails): boolean {
    return (
      this.urlFilter.shouldTrace(options.url) &&
      this.methodsFilter.shouldTrace(options.method) &&
      this.contextHeaderFilter.shouldTrace(options.traceContext) &&
      this.sampler.shouldTrace(options.timestamp)
    );
  }
}

export function alwaysTrace(): BuiltinTracePolicy {
  return new BuiltinTracePolicy({
    samplingRate: 0,
    ignoreUrls: [],
    ignoreMethods: [],
    contextHeaderBehavior: TraceContextHeaderBehavior.DEFAULT,
  });
}

export function neverTrace(): BuiltinTracePolicy {
  return new BuiltinTracePolicy({
    samplingRate: -1,
    ignoreUrls: [],
    ignoreMethods: [],
    contextHeaderBehavior: TraceContextHeaderBehavior.DEFAULT,
  });
}
