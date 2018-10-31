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
import {Tracing, NormalizedConfig} from './tracing';
import {FORCE_NEW, Forceable} from './util';
import {Constants} from './constants';
import {StackdriverTracer} from './trace-api';

export {Config, PluginTypes};

let traceAgent: StackdriverTracer;

/**
 * Normalizes the user-provided configuration object by adding default values
 * and overriding with env variables when they are provided.
 * @param projectConfig The user-provided configuration object. It will not
 * be modified.
 * @return A normalized configuration object.
 */
function initConfig(projectConfig: Forceable<Config>):
    Forceable<NormalizedConfig> {
  // `|| undefined` prevents environmental variables that are empty strings
  // from overriding values provided in the config object passed to start().
  const envConfig = {
    logLevel: Number(process.env.GCLOUD_TRACE_LOGLEVEL) || undefined,
    projectId: process.env.GCLOUD_PROJECT || undefined,
    serviceContext: {
      service:
          process.env.GAE_SERVICE || process.env.GAE_MODULE_NAME || undefined,
      version: process.env.GAE_VERSION || process.env.GAE_MODULE_VERSION ||
          undefined,
      minorVersion: process.env.GAE_MINOR_VERSION || undefined
    }
  };

  let envSetConfig: Config = {};
  if (!!process.env.GCLOUD_TRACE_CONFIG) {
    envSetConfig =
        require(path.resolve(process.env.GCLOUD_TRACE_CONFIG!)) as Config;
  }

  // Internally, ignoreContextHeader is no longer being used, so convert the
  // user's value into a value for contextHeaderBehavior. But let this value
  // be overridden by the user's explicitly set value for contextHeaderBehavior.
  const contextHeaderBehaviorUnderride = {
    contextHeaderBehavior: projectConfig.ignoreContextHeader ? 'ignore' :
                                                               'default'
  };

  // Configuration order of precedence:
  // 1. Environment Variables
  // 2. Project Config
  // 3. Environment Variable Set Configuration File (from GCLOUD_TRACE_CONFIG)
  // 4. Default Config (as specified in './config')
  const config = extend(
      true, {[FORCE_NEW]: projectConfig[FORCE_NEW]}, defaultConfig,
      envSetConfig, contextHeaderBehaviorUnderride, projectConfig, envConfig,
      {plugins: {}});
  // The empty plugins object guarantees that plugins is a plain object,
  // even if it's explicitly specified in the config to be a non-object.

  // Enforce the upper limit for the label value size.
  if (config.maximumLabelValueSize >
      Constants.TRACE_SERVICE_LABEL_VALUE_LIMIT) {
    config.maximumLabelValueSize = Constants.TRACE_SERVICE_LABEL_VALUE_LIMIT;
  }
  // Make rootSpanNameOverride a function if not already.
  if (typeof config.rootSpanNameOverride === 'string') {
    const spanName = config.rootSpanNameOverride;
    config.rootSpanNameOverride = () => spanName;
  } else if (typeof config.rootSpanNameOverride !== 'function') {
    config.rootSpanNameOverride = (name: string) => name;
  }

  // If the CLS mechanism is set to auto-determined, decide now what it should
  // be.
  const ahAvailable = semver.satisfies(process.version, '>=8');
  if (config.clsMechanism === 'auto') {
    config.clsMechanism = ahAvailable ? 'async-hooks' : 'async-listener';
  }

  return config;
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
      normalizedConfig.clsMechanism === 'async-listener') {
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
