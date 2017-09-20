/**
 * Copyright 2017 Google Inc. All Rights Reserved.
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

// TODO(kjin)
// Module augmentation is implemented in this PR:
// https://github.com/DefinitelyTyped/DefinitelyTyped/pull/19612
// Do this correctly when it's landed and released.
import _Module = require('module');
const Module: {
  _resolveFilename(request: string, parent?: NodeModule): string;
  _load(request: string, parent?: NodeModule, isMain?: boolean): any;
} = _Module as any;

import { Logger } from '@google-cloud/common';
import * as path from 'path';
import * as semver from 'semver';
import * as shimmer from 'shimmer';
import * as util from './util';
import { TraceAgent, TraceAgentConfig } from './trace-api';

/**
 * An interface representing config options read by the plugin loader, which includes
 * TraceAgent configuration as well.
 */
export interface PluginLoaderConfig extends TraceAgentConfig {
  plugins: {
    [pluginName: string]: string;
  };
}
interface InternalPatch<T> {
  file: string;
  module?: T;
  patch: (module: T, agent: TraceAgent) => void;
  unpatch?: (module: T) => void;
}

interface InternalIntercept<T> {
  file: string;
  module?: T;
  intercept: (module: T, agent: TraceAgent) => T;
}

interface InternalPlugin {
  file: string;
  patches: {
    [patchName: string]: {
      [file: string]: InternalPatch<any> | InternalIntercept<any>;
    }
  };
  agent: TraceAgent;
}

interface PluginStore {
  [pluginName: string]: InternalPlugin;
}

export interface Patch {
  file?: string;
  versions?: string;
  patch: (module: any, agent: TraceAgent) => void;
  unpatch?: (module: any) => void;
}

export interface Intercept {
  file?: string;
  versions?: string;
  intercept: <T>(module: T, agent: TraceAgent) => T;
}

export type Plugin = (Patch | Intercept)[];

// type guards

function isPatch(obj: Patch | Intercept): obj is Patch {
  return !!(obj as Patch).patch;
}

function isIntercept(obj: Patch | Intercept): obj is Intercept {
  return !!(obj as Intercept).intercept;
}

function isInternalPatch<T>(
    obj: InternalPatch<T> | InternalIntercept<T>): obj is InternalPatch<T> {
  return !!(obj as InternalPatch<T>).patch;
}

function isInternalIntercept<T>(
    obj: InternalPatch<T> | InternalIntercept<T>): obj is InternalIntercept<T> {
  return !!(obj as InternalIntercept<T>).intercept;
}

let plugins: PluginStore = Object.create(null);
let intercepts = Object.create(null);
let activated = false;

let logger_: Logger;

function checkLoadedModules(): void {
  for (const moduleName in plugins) {
    // \\ is benign on unix and escapes \\ on windows
    const regex = new RegExp('node_modules\\' + path.sep + moduleName +
      '\\' + path.sep);
    for (const file in require.cache) {
      if (file.match(regex)) {
        logger_.error(moduleName + ' tracing might not work as ' + file +
            ' was loaded before the trace agent was initialized.');
        break;
      }
    }
  }
  if (process._preload_modules && process._preload_modules.length > 0) {
    const first = process._preload_modules[0];
    if (first !== '@google-cloud/trace-agent') {
      logger_.error('Tracing might not work as ' + first +
            ' was loaded with --require before the trace agent was initialized.');
    }
  }
}

function checkPatch(patch: any) {
  if (!patch.patch && !patch.intercept) {
    throw new Error('Plugin for ' + patch.file + ' doesn\'t patch ' +
      'anything.');
  } else if (patch.patch && patch.intercept) {
    throw new Error('Plugin for ' + patch.file + ' has ' +
      'both intercept and patch functions.');
  } else if (patch.unpatch && patch.intercept) {
    logger_.warn('Plugin for ' + patch.file + ': unpatch is not compatible ' +
      'with intercept.');
  } else if (patch.patch && !patch.unpatch) {
    logger_.warn('Plugin for ' + patch.file + ': patch method given without ' +
      'accompanying unpatch.');
  }
}

export function activate(logger: Logger, config: PluginLoaderConfig): void {
  if (activated) {
    logger_.error('Plugins activated more than once.');
    return;
  }
  activated = true;

  logger_ = logger;

  const pluginConfig = config.plugins;
  for (const moduleName in pluginConfig) {
    if (!pluginConfig[moduleName]) {
      continue;
    }
    const agent: TraceAgent = new TraceAgent(moduleName);
    agent.enable(logger_, config);
    plugins[moduleName] = {
      file: pluginConfig[moduleName],
      patches: {},
      agent: agent
    };
  }

  checkLoadedModules();

  // hook into Module._load so that we can hook into userspace frameworks
  shimmer.wrap(Module, '_load', (originalModuleLoad: typeof Module._load): typeof Module._load => {
    function loadAndPatch(instrumentation: InternalPlugin, moduleRoot: string, version: string): any {
      let patchSet = instrumentation.patches[moduleRoot];
      if (!patchSet) {
        // Load the plugin object
        const plugin: Plugin = originalModuleLoad(instrumentation.file, module, false);
        patchSet = {};
        if (semver.valid(version)) {
          plugin.forEach((patch) => {
            if (!patch.versions || semver.satisfies(version, patch.versions)) {
              const file = patch.file || '';
              if (isPatch(patch)) {
                patchSet[file] = {
                  file: file,
                  patch: patch.patch,
                  unpatch: patch.unpatch
                };
              }
              if (isIntercept(patch)) {
                patchSet[file] = {
                  file: file,
                  intercept: patch.intercept
                };
              }
              // The conditionals exhaustively cover types for the patch object,
              // but throw an error in JavaScript anyway
              checkPatch(patch);
            }
          });
        }
        if (Object.keys(patchSet).length === 0) {
          logger_.warn(moduleRoot + ': version ' + version + ' not supported ' +
            'by plugin.');
        }
        instrumentation.patches[moduleRoot] = patchSet;
      }

      for (const file in patchSet) {
        const patch = patchSet[file];
        const loadPath = moduleRoot ? path.join(moduleRoot, patch.file) : patch.file;
        if (!patch.module) {
          patch.module = originalModuleLoad(loadPath, module, false);
        }
        if (isInternalPatch(patch)) {
          patch.patch(patch.module, instrumentation.agent);
        }
        if (isInternalIntercept(patch)) {
          patch.module = patch.intercept(patch.module, instrumentation.agent);
          intercepts[loadPath] = {
            interceptedValue: patch.module
          };
        }
      }
      const rootPatch = patchSet[''];
      if (rootPatch && isInternalIntercept(rootPatch)) {
        return rootPatch.module;
      } else {
        return null;
      }
    }

    function moduleAlreadyPatched(instrumentation: InternalPlugin, moduleRoot: string) {
      return instrumentation.patches[moduleRoot];
    }

    // Future requires get patched as they get loaded.
    return function Module_load(request: string, parent?: NodeModule, isMain?: boolean): any {
      const instrumentation = plugins[request];
      if (instrumentation) {
        const moduleRoot = util.findModulePath(request, parent);
        const moduleVersion = util.findModuleVersion(moduleRoot, originalModuleLoad);
        if (moduleAlreadyPatched(instrumentation, moduleRoot)) {
          return originalModuleLoad.apply(this, arguments);
        }
        logger_.info('Patching ' + request + ' at version ' + moduleVersion);
        const patchedRoot = loadAndPatch(instrumentation, moduleRoot,
          moduleVersion);
        if (patchedRoot !== null) {
          return patchedRoot;
        }
      } else {
        const modulePath = Module._resolveFilename(request, parent).replace('/', path.sep);
        if (intercepts[modulePath]) {
          return intercepts[modulePath].interceptedValue;
        }
      }
      return originalModuleLoad.apply(this, arguments);
    };
  });
}

export function deactivate(): void {
  if (activated) {
    activated = false;
    for (const moduleName in plugins) {
      const instrumentation = plugins[moduleName];
      instrumentation.agent.disable();
      for (const moduleRoot in instrumentation.patches) {
        const patchSet = instrumentation.patches[moduleRoot];
        for (const file in patchSet) {
          const patch = patchSet[file];
          if (isInternalPatch(patch) && patch.unpatch !== undefined) {
            logger_.info('Unpatching ' + moduleName);
            patch.unpatch(patch.module);
          }
        }
      }
    }
    plugins = Object.create(null);
    intercepts = Object.create(null);

    // unhook module.load
    shimmer.unwrap(Module, '_load');
  }
}
