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

export interface TopLevelConfig {
  enabled: boolean;
  logLevel: number;
  clsMechanism: CLSMechanism;
}

// PluginLoaderConfig extends TraceAgentConfig
export type NormalizedConfig =
    (TraceWriterConfig&PluginLoaderConfig&TopLevelConfig)|{enabled: false};

/**
 * A class that represents automatic tracing.
 */
export class Tracing implements Component {
  /** A logger. */
  private readonly logger: common.Logger;
  /** The configuration object for this instance. */
  private readonly config: Forceable<NormalizedConfig>;

  /**
   * Constructs a new Tracing instance.
   * @param config The configuration for this instance.
   * @param traceAgent An object representing the custom tracing API.
   */
  constructor(
      config: NormalizedConfig, private readonly traceAgent: TraceAgent) {
    this.config = config;
    this.traceAgent = traceAgent;
    let logLevel = config.enabled ? config.logLevel : 0;
    // Clamp the logger level.
    if (logLevel < 0) {
      logLevel = 0;
    } else if (logLevel >= common.logger.LEVELS.length) {
      logLevel = common.logger.LEVELS.length - 1;
    }
    this.logger = common.logger({
      level: common.logger.LEVELS[logLevel],
      tag: '@google-cloud/trace-agent'
    });
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
    if (!this.config.enabled) {
      return;
    }

    try {
      // Initialize context propagation mechanism.
      const clsConfig: Forceable<TraceCLSConfig> = {
        mechanism: this.config.clsMechanism as TraceCLSMechanism,
        [FORCE_NEW]: this.config[FORCE_NEW]
      };
      cls.create(clsConfig, this.logger).enable();

      traceWriter.create(this.config, this.logger).initialize((err) => {
        if (err) {
          this.disable();
        }
      });
    } catch (e) {
      this.logger.error(
          'TraceAgent#start: Disabling the Trace Agent for the',
          `following reason: ${e.message}`);
      this.disable();
      return;
    }

    this.traceAgent.enable(this.config, this.logger);
    pluginLoader.create(this.config, this.logger).activate();

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
