/**
 * Copyright 2018 Google LLC
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

import * as common from '@google-cloud/common';
import * as extend from 'extend';
import * as path from 'path';
import * as semver from 'semver';

import {cls, TraceCLSConfig, TraceCLSMechanism} from './cls';
import {CLSMechanism, Config, defaultConfig} from './config';
import {Constants} from './constants';
import * as PluginTypes from './plugin-types';
import {TraceAgent} from './trace-api';
import {pluginLoader, PluginLoaderConfig} from './trace-plugin-loader';
import {traceWriter, TraceWriterConfig} from './trace-writer';
import {Component, FORCE_NEW, Forceable, packageNameFromPath, Singleton} from './util';

interface TopLevelConfig {
  enabled: boolean;
  logLevel: number;
  clsMechanism: CLSMechanism;
}

// PluginLoaderConfig extends TraceAgentConfig
type NormalizedConfig = TraceWriterConfig&PluginLoaderConfig&TopLevelConfig;

/**
 * A class that represents automatic tracing.
 */
export class Tracing implements Component {
  /** An object representing the custom span API. */
  readonly traceAgent: TraceAgent = new TraceAgent('Custom Trace API');
  private logger: common.Logger;
  private config: Forceable<NormalizedConfig>;

  /**
   * Constructs a new Tracing instance.
   * @param config The configuration for this instance.
   */
  constructor(config: Config) {
    this.config = Tracing.initConfig(config);
    this.logger = common.logger({
      level: common.logger.LEVELS[this.config.logLevel],
      tag: '@google-cloud/trace-agent'
    });
  }

  /**
   * Normalizes the user-provided configuration object by adding default values
   * and overriding with env variables when they are provided.
   * @param projectConfig The user-provided configuration object. It will not
   * be modified.
   * @return A normalized configuration object.
   */
  private static initConfig(projectConfig: Forceable<Config>):
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
    // Configuration order of precedence:
    // 1. Environment Variables
    // 2. Project Config
    // 3. Environment Variable Set Configuration File (from GCLOUD_TRACE_CONFIG)
    // 4. Default Config (as specified in './config')
    const config = extend(
        true, {[FORCE_NEW]: projectConfig[FORCE_NEW]}, defaultConfig,
        envSetConfig, projectConfig, envConfig, {plugins: {}});
    // The empty plugins object guarantees that plugins is a plain object,
    // even if it's explicitly specified in the config to be a non-object.

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
   * Logs an error message detailing the list of modules that were loaded before
   * the Trace Agent. Loading these modules before the Trace Agent may prevent
   * us from monkeypatching those modules for automatic tracing.
   * @param filesLoadedBeforeTrace The list of files that were loaded using
   * require() before the Stackdriver Trace Agent was required.
   */
  logModulesLoadedBeforeTrace(filesLoadedBeforeTrace: string[]) {
    const modulesLoadedBeforeTrace: string[] = [];
    const traceModuleName = path.join('@google-cloud', 'trace-agent');
    for (let i = 0; i < filesLoadedBeforeTrace.length; i++) {
      const moduleName = packageNameFromPath(filesLoadedBeforeTrace[i]);
      if (moduleName && moduleName !== traceModuleName &&
          modulesLoadedBeforeTrace.indexOf(moduleName) === -1) {
        modulesLoadedBeforeTrace.push(moduleName);
      }
    }
    if (modulesLoadedBeforeTrace.length > 0) {
      this.logger.error(
          'TraceAgent#start: Tracing might not work as the following modules',
          'were loaded before the trace agent was initialized:',
          `[${modulesLoadedBeforeTrace.sort().join(', ')}]`);
    }
  }

  /**
   * Enables automatic tracing support and the custom span API.
   */
  enable(): void {
    if (this.traceAgent.isActive()) {
      // For unit tests only.
      // Undoes initialization that occurred last time this function was called.
      this.disable();
    }

    if (!this.config.enabled) {
      return;
    }

    try {
      // Initialize context propagation mechanism.
      const m = this.config.clsMechanism;
      const ahAvailable = semver.satisfies(process.version, '>=8') &&
          process.env.GCLOUD_TRACE_NEW_CONTEXT;
      const clsConfig: Forceable<TraceCLSConfig> = {
        mechanism: m === 'auto' ?
            (ahAvailable ? TraceCLSMechanism.ASYNC_HOOKS :
                           TraceCLSMechanism.ASYNC_LISTENER) :
            m as TraceCLSMechanism,
        [FORCE_NEW]: this.config[FORCE_NEW]
      };
      cls.create(clsConfig, this.logger).enable();

      traceWriter.create(this.config, this.logger).initialize((err) => {
        if (err) {
          this.disable();
        }
      });

      this.traceAgent.enable(this.config, this.logger);

      pluginLoader.create(this.config, this.logger).activate();
    } catch (e) {
      this.logger.error(
          'TraceAgent#start: Disabling the Trace Agent for the',
          `following reason: ${e.message}`);
      this.disable();
      return;
    }

    if (typeof this.config.projectId !== 'string' &&
        typeof this.config.projectId !== 'undefined') {
      this.logger.error(
          'TraceAgent#start: config.projectId, if provided, must be a string.',
          'Disabling trace agent.');
      this.disable();
      return;
    }

    // Make trace agent available globally without requiring package
    global._google_trace_agent = this.traceAgent;

    this.logger.info('TraceAgent#start: Trace Agent activated.');
  }

  /**
   * Disables automatic tracing support. This disables the publicly exposed
   * custom span API, as well as any instances passed to plugins. This also
   * prevents the Trace Writer from publishing additional traces.
   */
  disable() {
    if (pluginLoader.exists()) {
      pluginLoader.get().deactivate();
    }
    if (this.traceAgent.isActive()) {
      this.traceAgent.disable();
    }
    if (cls.exists()) {
      cls.get().disable();
    }
    if (traceWriter.exists()) {
      traceWriter.get().stop();
    }
  }
}

export const tracing = new Singleton(Tracing);
