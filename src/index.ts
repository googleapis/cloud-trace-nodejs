// Copyright 2015 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

const filesLoadedBeforeTrace = Object.keys(require.cache);

// This file's top-level imports must not transitively depend on modules that
// do I/O, or continuation-local-storage will not work.
import * as semver from 'semver';
import {Config, defaultConfig, TracePolicy} from './config';
import * as extend from 'extend';
import * as path from 'path';
import * as PluginTypes from './plugin-types';
import {Tracing, TopLevelConfig} from './tracing';
import {FORCE_NEW, Forceable, lastOf} from './util';
import {Constants} from './constants';
import {TraceCLSMechanism} from './cls';
import {StackdriverTracer} from './trace-api';
import {TraceContextHeaderBehavior} from './tracing-policy';

export {Config, PluginTypes};

let traceAgent: StackdriverTracer;

/**
 * Normalizes the user-provided configuration object by adding default values
 * and overriding with env variables when they are provided.
 * @param userConfig The user-provided configuration object. It will not
 * be modified.
 * @return A normalized configuration object.
 */
function initConfig(userConfig: Forceable<Config>): TopLevelConfig {
  let envSetConfig = {};
  if (!!process.env.GCLOUD_TRACE_CONFIG) {
    envSetConfig = require(path.resolve(
      process.env.GCLOUD_TRACE_CONFIG!
    )) as Config;
  }
  // Configuration order of precedence:
  // 1. Environment Variables
  // 2. Project Config
  // 3. Environment Variable Set Configuration File (from GCLOUD_TRACE_CONFIG)
  // 4. Default Config (as specified in './config')
  const mergedConfig: typeof defaultConfig & Forceable<Config> = extend(
    true,
    {},
    defaultConfig,
    envSetConfig,
    userConfig
  );
  const forceNew = userConfig[FORCE_NEW];

  // Throw for improper configurations.
  const userSetKeys = new Set([
    ...Object.keys(envSetConfig),
    ...Object.keys(userConfig),
  ]);
  if (userSetKeys.has('tracePolicy')) {
    // If the user specified tracePolicy, they should not have also set these
    // other fields.
    const forbiddenKeys = [
      'ignoreUrls',
      'ignoreMethods',
      'samplingRate',
      'contextHeaderBehavior',
    ]
      .filter(key => userSetKeys.has(key))
      .map(key => `config.${key}`);
    if (forbiddenKeys.length > 0) {
      throw new Error(
        `config.tracePolicy and any of [${forbiddenKeys.join(
          ', '
        )}] can't be specified at the same time.`
      );
    }
  }

  const getInternalClsMechanism = (clsMechanism: string): TraceCLSMechanism => {
    // If the CLS mechanism is set to auto-determined, decide now
    // what it should be.
    const ahAvailable = semver.satisfies(process.version, '>=8');
    if (clsMechanism === 'auto') {
      return ahAvailable
        ? TraceCLSMechanism.ASYNC_HOOKS
        : TraceCLSMechanism.ASYNC_LISTENER;
    }
    return clsMechanism as TraceCLSMechanism;
  };
  const getInternalRootSpanNameOverride = (
    rootSpanNameOverride: string | ((name: string) => string)
  ) => {
    // Make rootSpanNameOverride a function if not already.
    switch (typeof rootSpanNameOverride) {
      case 'string':
        return () => rootSpanNameOverride;
      case 'function':
        return rootSpanNameOverride;
      default:
        return (name: string) => name;
    }
  };

  return {
    [FORCE_NEW]: forceNew,
    disableUntracedModulesWarning: mergedConfig.disableUntracedModulesWarning,
    enabled: mergedConfig.enabled,
    logLevel: lastOf(
      mergedConfig.logLevel,
      Number(process.env.GCLOUD_TRACE_LOGLEVEL)
    ),
    clsConfig: {
      [FORCE_NEW]: forceNew,
      mechanism: getInternalClsMechanism(mergedConfig.clsMechanism),
    },
    writerConfig: {
      [FORCE_NEW]: forceNew,
      onUncaughtException: mergedConfig.onUncaughtException,
      bufferSize: mergedConfig.bufferSize,
      flushDelaySeconds: mergedConfig.flushDelaySeconds,
      stackTraceLimit: mergedConfig.stackTraceLimit,
      maximumLabelValueSize: Math.min(
        mergedConfig.maximumLabelValueSize,
        Constants.TRACE_SERVICE_LABEL_VALUE_LIMIT
      ),
      serviceContext: {
        service: lastOf<string | undefined>(
          mergedConfig.serviceContext.service,
          process.env.GAE_MODULE_NAME,
          process.env.GAE_SERVICE
        ),
        version: lastOf<string | undefined>(
          mergedConfig.serviceContext.version,
          process.env.GAE_MODULE_VERSION,
          process.env.GAE_VERSION
        ),
        minorVersion: lastOf<string | undefined>(
          mergedConfig.serviceContext.minorVersion,
          process.env.GAE_MINOR_VERSION
        ),
      },
      /**
       * Our TypeScript interface suggests that only credentials, keyFilename,
       * and projectId are accepted, but by passing the entire object to the
       * Trace Writer, we can allow users to supply other fields that are
       * publicly supported by the Google Auth Library.
       */
      authOptions: Object.assign({}, mergedConfig, {
        projectId: lastOf<string | undefined>(
          mergedConfig.projectId,
          process.env.GCLOUD_PROJECT
        ),
      }),
    },
    pluginLoaderConfig: {
      [FORCE_NEW]: forceNew,
      plugins: {...mergedConfig.plugins},
      tracerConfig: {
        enhancedDatabaseReporting: mergedConfig.enhancedDatabaseReporting,
        rootSpanNameOverride: getInternalRootSpanNameOverride(
          mergedConfig.rootSpanNameOverride
        ),
        spansPerTraceHardLimit: mergedConfig.spansPerTraceHardLimit,
        spansPerTraceSoftLimit: mergedConfig.spansPerTraceSoftLimit,
      },
    },
    tracePolicyConfig: {
      samplingRate: mergedConfig.samplingRate,
      ignoreMethods: mergedConfig.ignoreMethods,
      ignoreUrls: mergedConfig.ignoreUrls,
      contextHeaderBehavior: mergedConfig.contextHeaderBehavior as TraceContextHeaderBehavior,
    },
    overrides: {
      tracePolicy: mergedConfig.tracePolicy,
      propagation: mergedConfig.propagation,
    },
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
  if (
    normalizedConfig.enabled &&
    normalizedConfig.clsConfig.mechanism === TraceCLSMechanism.ASYNC_LISTENER
  ) {
    // This is the earliest we can load continuation-local-storage.
    require('continuation-local-storage');
  }

  if (!traceAgent) {
    traceAgent = new (require('./trace-api').StackdriverTracer)();
  }

  try {
    let tracing: Tracing;
    try {
      tracing = require('./tracing').tracing.create(
        normalizedConfig,
        traceAgent
      );
    } catch (e) {
      // An error could be thrown if create() is called multiple times.
      // It's not a helpful error message for the end user, so make it more
      // useful here.
      throw new Error('Cannot call start on an already created agent.');
    }
    tracing.enable();
    if (
      normalizedConfig.enabled &&
      !normalizedConfig.disableUntracedModulesWarning
    ) {
      tracing.logModulesLoadedBeforeTrace(filesLoadedBeforeTrace);
    }
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
