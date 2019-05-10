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

const filesLoadedBeforeTrace = Object.keys(require.cache);

// This file's top-level imports must not transitively depend on modules that
// do I/O, or continuation-local-storage will not work.
import * as semver from 'semver';
import {Config, defaultConfig} from './config';
import * as extend from 'extend';
import * as path from 'path';
import * as PluginTypes from './plugin-types';
import {Tracing, TopLevelConfig} from './tracing';
import {FORCE_NEW, Forceable, lastOf} from './util';
import {Constants} from './constants';
import {StackdriverTracer, TraceContextHeaderBehavior} from './trace-api';
import {TraceCLSMechanism} from './cls';

export {Config, PluginTypes};

let traceAgent: StackdriverTracer;

/**
 * Normalizes the user-provided configuration object by adding default values
 * and overriding with env variables when they are provided.
 * @param userConfig The user-provided configuration object. It will not
 * be modified.
 * @return A normalized configuration object.
 */
function initConfig(userConfig: Forceable<Config>): Forceable<TopLevelConfig> {
  let envSetConfig = {};
  if (!!process.env.GCLOUD_TRACE_CONFIG) {
    envSetConfig =
        require(path.resolve(process.env.GCLOUD_TRACE_CONFIG!)) as Config;
  }
  // Configuration order of precedence:
  // 1. Environment Variables
  // 2. Project Config
  // 3. Environment Variable Set Configuration File (from GCLOUD_TRACE_CONFIG)
  // 4. Default Config (as specified in './config')
  const mergedConfig: (typeof defaultConfig)&Forceable<Config> =
      extend(true, {}, defaultConfig, envSetConfig, userConfig);
  const forceNew = userConfig[FORCE_NEW];

  const getInternalClsMechanism = (clsMechanism: string): TraceCLSMechanism => {
    // If the CLS mechanism is set to auto-determined, decide now
    // what it should be.
    const ahAvailable = semver.satisfies(process.version, '>=8');
    if (clsMechanism === 'auto') {
      return ahAvailable ? TraceCLSMechanism.ASYNC_HOOKS :
                           TraceCLSMechanism.ASYNC_LISTENER;
    }
    return clsMechanism as TraceCLSMechanism;
  };
  const getInternalMaximumLabelValueSize = (maximumLabelValueSize: number) =>
      Math.min(
          maximumLabelValueSize, Constants.TRACE_SERVICE_LABEL_VALUE_LIMIT);
  const getInternalRootSpanNameOverride =
      (rootSpanNameOverride: string|((name: string) => string)) => {
        // Make rootSpanNameOverride a function if not already.
        switch (typeof rootSpanNameOverride) {
          case 'string':
            return () => rootSpanNameOverride;
          case 'function':
            return (name: string) => name;
          default:
            return rootSpanNameOverride;
        }
      };

  return {
    [FORCE_NEW]: forceNew,
    enabled: mergedConfig.enabled,
    logLevel: lastOf(
        mergedConfig.logLevel, Number(process.env.GCLOUD_TRACE_LOGLEVEL)),
    clsConfig: {
      [FORCE_NEW]: forceNew,
      mechanism: getInternalClsMechanism(mergedConfig.clsMechanism)
    },
    writerConfig: {
      [FORCE_NEW]: forceNew,
      projectId: lastOf<string|undefined>(
          mergedConfig.projectId, process.env.GCLOUD_PROJECT),
      onUncaughtException: mergedConfig.onUncaughtException,
      bufferSize: mergedConfig.bufferSize,
      flushDelaySeconds: mergedConfig.flushDelaySeconds,
      stackTraceLimit: mergedConfig.stackTraceLimit,
      maximumLabelValueSize:
          getInternalMaximumLabelValueSize(mergedConfig.maximumLabelValueSize),
      serviceContext: {
        service: lastOf<string|undefined>(
            mergedConfig.serviceContext.service, process.env.GAE_MODULE_NAME,
            process.env.GAE_SERVICE),
        version: lastOf<string|undefined>(
            mergedConfig.serviceContext.version, process.env.GAE_MODULE_VERSION,
            process.env.GAE_VERSION),
        minorVersion: lastOf<string|undefined>(
            mergedConfig.serviceContext.minorVersion,
            process.env.GAE_MINOR_VERSION)
      }
    },
    pluginLoaderConfig: {
      [FORCE_NEW]: forceNew,
      plugins: {...mergedConfig.plugins},
      tracerConfig: {
        enhancedDatabaseReporting: mergedConfig.enhancedDatabaseReporting,
        contextHeaderBehavior: lastOf<TraceContextHeaderBehavior>(
            defaultConfig.contextHeaderBehavior as TraceContextHeaderBehavior,
            // Internally, ignoreContextHeader is no longer being used, so
            // convert the user's value into a value for contextHeaderBehavior.
            // But let this value be overridden by the user's explicitly set
            // value for contextHeaderBehavior.
            mergedConfig.ignoreContextHeader ?
                TraceContextHeaderBehavior.IGNORE :
                TraceContextHeaderBehavior.DEFAULT,
            userConfig.contextHeaderBehavior as TraceContextHeaderBehavior),
        rootSpanNameOverride:
            getInternalRootSpanNameOverride(mergedConfig.rootSpanNameOverride),
        spansPerTraceHardLimit: mergedConfig.spansPerTraceHardLimit,
        spansPerTraceSoftLimit: mergedConfig.spansPerTraceSoftLimit,
        tracePolicyConfig: {
          samplingRate: mergedConfig.samplingRate,
          ignoreMethods: mergedConfig.ignoreMethods,
          ignoreUrls: mergedConfig.ignoreUrls
        }
      }
    }
  };
}

/**
 * Start the Stackdriver Trace Agent with the given configuration (if provided).
 * This function should only be called once, and before any other modules are
 * loaded.
 * @param config A configuration object.
 * @returns An object exposing functions for creating custom spans.
 *
 * @resource [Introductory video]{@link
 * https://www.youtube.com/watch?v=NCFDqeo7AeY}
 *
 * @example
 * trace.start();
 */
export function start(config?: Config): PluginTypes.Tracer {
  const normalizedConfig = initConfig(config || {});
  // Determine the preferred context propagation mechanism, as
  // continuation-local-storage should be loaded before any modules that do I/O.
  if (normalizedConfig.enabled &&
      normalizedConfig.clsConfig.mechanism ===
          TraceCLSMechanism.ASYNC_LISTENER) {
    // This is the earliest we can load continuation-local-storage.
    require('continuation-local-storage');
  }

  if (!traceAgent) {
    traceAgent = new (require('./trace-api').StackdriverTracer)();
  }

  try {
    let tracing: Tracing;
    try {
      tracing =
          require('./tracing').tracing.create(normalizedConfig, traceAgent);
    } catch (e) {
      // An error could be thrown if create() is called multiple times.
      // It's not a helpful error message for the end user, so make it more
      // useful here.
      throw new Error('Cannot call start on an already created agent.');
    }
    tracing.enable();
    tracing.logModulesLoadedBeforeTrace(filesLoadedBeforeTrace);
    return traceAgent;
  } finally {
    // Stop storing these entries in memory
    filesLoadedBeforeTrace.length = 0;
  }
}

/**
 * Get the previously created StackdriverTracer object.
 * @returns An object exposing functions for creating custom spans.
 */
export function get(): PluginTypes.Tracer {
  if (!traceAgent) {
    traceAgent = new (require('./trace-api').StackdriverTracer)();
  }
  return traceAgent;
}

// If the module was --require'd from the command line, start the agent.
if (module.parent && module.parent.id === 'internal/preload') {
  start();
}
