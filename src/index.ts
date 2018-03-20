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

// Load continuation-local-storage first to ensure the core async APIs get
// patched before any user-land modules get loaded.
if (require('semver').satisfies(process.version, '<8') ||
    !process.env.GCLOUD_TRACE_NEW_CONTEXT) {
  require('continuation-local-storage');
}

import * as cls from './cls';
import * as common from '@google-cloud/common';
import {Constants} from './constants';
import {Config, defaultConfig} from './config';
import * as extend from 'extend';
import * as path from 'path';
import * as PluginTypes from './plugin-types';
import {PluginLoaderConfig} from './trace-plugin-loader';
import {pluginLoader} from './trace-plugin-loader';
import {TraceAgent} from './trace-api';
import {traceWriter, TraceWriterConfig} from './trace-writer';
import * as traceUtil from './util';

export {Config, PluginTypes};

const modulesLoadedBeforeTrace: string[] = [];

const traceAgent = new TraceAgent('Custom Span API');

const traceModuleName = path.join('@google-cloud', 'trace-agent');
for (let i = 0; i < filesLoadedBeforeTrace.length; i++) {
  const moduleName = traceUtil.packageNameFromPath(filesLoadedBeforeTrace[i]);
  if (moduleName && moduleName !== traceModuleName &&
      modulesLoadedBeforeTrace.indexOf(moduleName) === -1) {
    modulesLoadedBeforeTrace.push(moduleName);
  }
}

interface TopLevelConfig {
  enabled: boolean;
  logLevel: number;
  forceNewAgent_: boolean;
}

// PluginLoaderConfig extends TraceAgentConfig
type NormalizedConfig = TraceWriterConfig&PluginLoaderConfig&TopLevelConfig&
    {forceNewAgent_: boolean};

/**
 * Normalizes the user-provided configuration object by adding default values
 * and overriding with env variables when they are provided.
 * @param projectConfig The user-provided configuration object. It will not
 * be modified.
 * @return A normalized configuration object.
 */
function initConfig(projectConfig: Config): NormalizedConfig {
  const envConfig = {
    logLevel: Number(process.env.GCLOUD_TRACE_LOGLEVEL) || undefined,
    projectId: process.env.GCLOUD_PROJECT,
    serviceContext: {
      service: process.env.GAE_SERVICE || process.env.GAE_MODULE_NAME,
      version: process.env.GAE_VERSION || process.env.GAE_MODULE_VERSION,
      minorVersion: process.env.GAE_MINOR_VERSION
    }
  };

  let envSetConfig: Config = {};
  if (process.env.hasOwnProperty('GCLOUD_TRACE_CONFIG')) {
    envSetConfig =
        require(path.resolve(process.env.GCLOUD_TRACE_CONFIG!)) as Config;
  }
  // Configuration order of precedence:
  // 1. Environment Variables
  // 2. Project Config
  // 3. Environment Variable Set Configuration File (from GCLOUD_TRACE_CONFIG)
  // 4. Default Config (as specified in './config')
  const config = extend(
      true, {forceNewAgent_: false}, defaultConfig, envSetConfig, projectConfig,
      envConfig);

  // Enforce the upper limit for the label value size.
  if (config.maximumLabelValueSize >
      Constants.TRACE_SERVICE_LABEL_VALUE_LIMIT) {
    config.maximumLabelValueSize = Constants.TRACE_SERVICE_LABEL_VALUE_LIMIT;
  }
  // Clamp the logger level.
  if (config.logLevel < 0) {
    config.logLevel = 0;
  } else if (config.logLevel >= common.logger.LEVELS.length) {
    config.logLevel = common.logger.LEVELS.length - 1;
  }
  return config;
}

/**
 * Stops the Trace Agent. This disables the publicly exposed agent instance,
 * as well as any instances passed to plugins. This also prevents the Trace
 * Writer from publishing additional traces.
 */
function stop() {
  if (traceAgent && traceAgent.isActive()) {
    traceWriter.get().stop();
    traceAgent.disable();
    try {
      const loader = pluginLoader.get();
      loader.deactivate();
    } catch (e) {
      // Plugin loader wasn't even created. No need to de-activate
    }
    cls.destroyNamespace();
  }
}

/**
 * Start the Trace agent that will make your application available for
 * tracing with Stackdriver Trace.
 *
 * @param config - Trace configuration
 *
 * @resource [Introductory video]{@link
 * https://www.youtube.com/watch?v=NCFDqeo7AeY}
 *
 * @example
 * trace.start();
 */
export function start(projectConfig?: Config): PluginTypes.TraceAgent {
  const config: NormalizedConfig = initConfig(projectConfig || {});

  if (traceAgent.isActive() && !config.forceNewAgent_) {  // already started.
    throw new Error('Cannot call start on an already started agent.');
  } else if (traceAgent.isActive()) {
    // For unit tests only.
    // Undoes initialization that occurred last time start() was called.
    stop();
  }

  if (!config.enabled) {
    return traceAgent;
  }

  const logger = common.logger({
    level: common.logger.LEVELS[config.logLevel],
    tag: '@google-cloud/trace-agent'
  });

  if (modulesLoadedBeforeTrace.length > 0) {
    logger.error(
        'Tracing might not work as the following modules ' +
        'were loaded before the trace agent was initialized: ' +
        JSON.stringify(modulesLoadedBeforeTrace));
  }
  // CLS namespace for context propagation
  cls.createNamespace();
  traceWriter.create(logger, config).initialize((err) => {
    if (err) {
      stop();
    }
  });

  traceAgent.enable(logger, config);
  pluginLoader.create(logger, config).activate();

  if (typeof config.projectId !== 'string' &&
      typeof config.projectId !== 'undefined') {
    logger.error(
        'config.projectId, if provided, must be a string. ' +
        'Disabling trace agent.');
    stop();
    return traceAgent;
  }

  // Make trace agent available globally without requiring package
  global._google_trace_agent = traceAgent;

  logger.info('trace agent activated');
  return traceAgent;
}

export function get(): PluginTypes.TraceAgent {
  return traceAgent;
}

// If the module was --require'd from the command line, start the agent.
if (module.parent && module.parent.id === 'internal/preload') {
  start();
}
