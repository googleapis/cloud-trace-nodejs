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

import {Logger} from '@google-cloud/common';
import Module = require('module');
import * as hook from 'require-in-the-middle';
import * as path from 'path';
import * as semver from 'semver';
import * as shimmer from 'shimmer';
import * as util from './util';
import * as builtinModules from 'builtin-modules';
import {TraceAgent, TraceAgentConfig} from './trace-api';
import {Patch, Intercept, Plugin, Instrumentation} from './plugin-types';
import {Singleton} from './util';

/**
 * Plugins are user-provided objects containing functions that should be run
 * when a module is loaded, with the intent of monkeypatching a module to be
 * loaded. Each plugin is specific to a module.
 *
 * Plugin objects are a list of load hooks, each of which consists
 * of a file path of a module-internal file to patch, a patch/intercept/hook
 * function, as well as the version range of the module for which that file
 * should be patched. (See ./plugin-types for the exact interface.)
 */

export interface PluginLoaderConfig extends TraceAgentConfig {
  // An object which contains paths to files that should be loaded as plugins
  // upon loading a module with a given name.
  plugins: {[pluginName: string]: string};
}

/**
 * An interface representing configuration passed to the plugin loader, which
 * includes TraceAgent configuration as well.
 */
export interface PluginLoaderSingletonConfig extends PluginLoaderConfig {
  forceNewAgent_: boolean;
}

export interface ModulePluginWrapperOptions {
  name: string;
  path: string;
}

export interface CorePluginWrapperOptions {
  children: ModulePluginWrapperOptions[];
}

/**
 * An interface that represents a wrapper around user-provided plugin objects.
 */
export interface PluginWrapper {
  /**
   * Returns whether the given version of the module is supported by this
   * plugin. This may load the plugin into memory.
   * @param version A semver version string.
   */
  isSupported(version: string): boolean;

  /**
   * Call unpatch methods when they were provided.
   */
  unapplyAll(): void;

  /**
   * Applies this object's underlying plugin patches to a file, returning the
   * patched or intercepted value.
   * @param moduleExports The module exports of the file.
   * @param file The file path, relative to the module root.
   * @param version The module version.
   */
  applyPlugin<T>(moduleExports: T, file: string, version: string): T;
}

/**
 * A class that represents wrapper logic around a user-provided plugin object
 * to be applied to a single module.
 */
export class ModulePluginWrapper implements PluginWrapper {
  // Sentinel value to indicate that a plugin has not been loaded into memory
  // yet.
  private static readonly NOT_LOADED: Plugin = [];
  private readonly unpatchFns: Array<() => void> = [];
  // A logger.
  private readonly logger: Logger;
  // Configuration for a TraceAgent instance.
  private readonly traceConfig: TraceAgentConfig;
  // Display-friendly name of the module being patched by this plugin.
  private readonly name: string;
  // The path to the plugin.
  private readonly path: string;
  // The exported value of the plugin, or NOT_LOADED if it hasn't been
  // loaded yet.
  private pluginExportedValue: Plugin = ModulePluginWrapper.NOT_LOADED;
  private readonly traceApiInstances: TraceAgent[] = [];

  /**
   * Constructs a new PluginWrapper instance.
   * @param logger The logger to use.
   * @param options Initialization fields for this object.
   * @param traceConfig Configuration for a TraceAgent instance.
   */
  constructor(
      logger: Logger, options: ModulePluginWrapperOptions,
      traceConfig: TraceAgentConfig) {
    this.logger = logger;
    this.name = options.name;
    this.path = options.path;
    this.traceConfig = traceConfig;
  }

  isSupported(version: string): boolean {
    // The plugin is lazily loaded here.
    const plugin = this.getPluginExportedValue();
    // Count the number of Patch/Intercept objects with compatible version
    // ranges
    let numFiles = 0;
    plugin.forEach(patch => {
      const versionRange = patch.versions;
      if (!versionRange || semver.satisfies(version, versionRange)) {
        numFiles++;
      }
    });
    // We consider a module to be unsupported if there are no Patch/Intercept
    // objects with compatible version ranges at all.
    return numFiles > 0;
  }

  unapplyAll() {
    // Unpatch in reverse order of when patches were applied, because each
    // unpatch function expects the state of the module to be as its associated
    // patch function left it.
    this.unpatchFns.reverse().forEach(fn => fn());
    this.unpatchFns.length = 0;
    this.traceApiInstances.forEach(traceApi => traceApi.disable());
    this.traceApiInstances.length = 0;
  }

  applyPlugin<T>(moduleExports: T, file: string, version: string): T {
    // Pre-compute a string used in logs for code clarity.
    const logString = `${this.name}@${version}${file ? `:${file}` : ''}`;
    // Get the exported value of the plugin value (loading it if it doesn't
    // exist)
    const plugin = this.getPluginExportedValue();
    // Get a list of supported patches. This is the subset of objects in the
    // plugin exported value with matching file/version fields.
    const supportedPatches: Array<Partial<Patch<T>&Intercept<T>>> =
        plugin.filter(
            patch => semver.satisfies(version, patch.versions || '*') &&
                (file === patch.file || (!file && !patch.file)));
    if (supportedPatches.length > 1) {
      this.logger.warn(`PluginWrapper#applyPlugin: [${
          logString}] Plugin has more than one patch/intercept object for this file. Applying all.`);
    }

    // Apply each patch object.
    return supportedPatches.reduce<T>((exportedValue, patch) => {
      // TODO(kjin): The only benefit of creating a new TraceAgent object per
      // patched file is to give us granularity in log messages. See if we can
      // refactor the TraceAgent class to avoid this.

      this.logger.info(
          `PluginWrapper#applyPlugin: [${logString}] Applying plugin.`);
      if (patch.patch) {
        patch.patch(exportedValue, this.createTraceAgentInstance(logString));
        // Queue a function to run if the plugin gets disabled.
        if (patch.unpatch) {
          const unpatch = patch.unpatch;
          this.unpatchFns.push(() => {
            this.logger.info(
                `PluginWrapper#unapplyAll: [${logString}] Unpatching file.`);
            unpatch(exportedValue);
          });
        }
        // The patch object should only have either patch() or intercept().
        if (patch.intercept) {
          this.logger.warn(`PluginWrapper#applyPlugin: [${
              logString}] Patch object has both patch() and intercept() for this file. Only applying patch().`);
        }
      } else if (patch.intercept) {
        exportedValue =
            patch.intercept(exportedValue, this.createTraceAgentInstance(file));
      }
      return exportedValue;
    }, moduleExports as T);
  }

  // Helper function to get the cached plugin value if it wasn't loaded yet.
  getPluginExportedValue(): Plugin {
    if (this.pluginExportedValue === ModulePluginWrapper.NOT_LOADED) {
      this.pluginExportedValue = require(this.path);
    }
    return this.pluginExportedValue;
  }

  private createTraceAgentInstance(file: string) {
    const traceApi = new TraceAgent(file);
    traceApi.enable(this.logger, this.traceConfig);
    this.traceApiInstances.push(traceApi);
    return traceApi;
  }
}

/**
 * A class that represents wrapper logic on top of plugins that patch core
 * (built-in) modules. Core modules are different because (1) they can be
 * required by the plugins that patch them, and (2) the core module being
 * patched doesn't necessarily correspond to the name of the plugin.
 */
export class CorePluginWrapper implements PluginWrapper {
  private readonly logger: Logger;
  private readonly children: ModulePluginWrapper[];

  constructor(
      logger: Logger, config: CorePluginWrapperOptions,
      traceConfig: TraceAgentConfig) {
    this.logger = logger;
    this.children = config.children.map(
        config => new ModulePluginWrapper(logger, config, traceConfig));
    // Eagerly load core plugins into memory.
    // This prevents issues related to circular dependencies.
    this.children.forEach(child => child.getPluginExportedValue());
  }

  /**
   * Returns whether the given version of the module is supported by this
   * plugin. This may load the plugin into memory.
   * @param version A semver version string.
   */
  isSupported(version: string): boolean {
    return this.children.some(child => child.isSupported(version));
  }
  /**
   * Call unpatch methods when they were provided.
   */
  unapplyAll(): void {
    this.children.forEach(child => child.unapplyAll());
  }
  /**
   * Applies this object's underlying plugin patches to a file, returning the
   * patched or intercepted value.
   * @param moduleExports The module exports of the file.
   * @param file The file path, relative to the module root.
   * @param version The module version.
   */
  applyPlugin<T>(moduleExports: T, file: string, version: string): T {
    return this.children.reduce(
        (exportedValue, child) =>
            child.applyPlugin(exportedValue, file, version),
        moduleExports);
  }
}

// States for the Plugin Loader
export enum PluginLoaderState {
  NO_HOOK,
  ACTIVATED,
  DEACTIVATED
}

/**
 * A class providing functionality to hook into module loading and apply
 * plugins to enable tracing.
 */
export class PluginLoader {
  // Key on which core modules are stored.
  static readonly CORE_MODULE = '[core]';
  // The function to call to register a require hook.
  private enableRequireHook: (onRequire: hook.OnRequireFn) => void;
  // A map mapping module names to their respective plugins.
  private readonly pluginMap: Map<string, PluginWrapper> = new Map();
  // A map caching version strings for a module based on their base path.
  private readonly moduleVersionCache: Map<string, string|null> = new Map();
  // The current state of the plugin loader.
  private internalState: PluginLoaderState = PluginLoaderState.NO_HOOK;

  /**
   * Constructs a new PluginLoader instance.
   * @param logger The logger to use.
   * @param config The configuration for this instance.
   */
  constructor(private readonly logger: Logger, config: PluginLoaderConfig) {
    const nonCoreModules: string[] = [];
    // Initialize ALL of the PluginWrapper objects here.
    // See CorePluginWrapper docs for why core modules are processed
    // differently.
    const coreWrapperConfig: CorePluginWrapperOptions = {children: []};
    Object.keys(config.plugins).forEach(key => {
      const value = config.plugins[key];
      // Core module plugins share a common key.
      const coreModule = key === PluginLoader.CORE_MODULE ||
          builtinModules.indexOf(key) !== -1;

      if (value) {
        // Convert the given string value to a PluginConfigEntry
        // (unless it's falsey).
        if (coreModule) {
          coreWrapperConfig.children.push({name: key, path: value});
        } else {
          this.pluginMap.set(
              key,
              new ModulePluginWrapper(
                  logger, {name: key, path: value}, config));
        }
        nonCoreModules.push(key);
      }
    });
    if (coreWrapperConfig.children.length > 0) {
      this.pluginMap.set(
          PluginLoader.CORE_MODULE,
          new CorePluginWrapper(logger, coreWrapperConfig, config));
    }

    // Define the function that will attach a require hook upon activate.
    // This must register the hook in the following way:
    // * The hook is only called the first time a file is loaded.
    // * This hook is called at least for each file that is loaded for
    //   modules with associated plugins.
    // TODO(kjin): This should be encapsulated in a class.
    this.enableRequireHook = (onRequire) => {
      const builtins =
          this.pluginMap.has(PluginLoader.CORE_MODULE) ? builtinModules : [];
      hook(builtins.concat(nonCoreModules), {internals: true}, onRequire);
    };
  }

  get state(): PluginLoaderState {
    return this.internalState;
  }

  /**
   * Activates plugin loading/patching by hooking into the require method.
   */
  activate(): PluginLoader {
    if (this.internalState === PluginLoaderState.NO_HOOK) {
      this.logger.info(`PluginLoader#activate: Adding require hook.`);
      // Enable the require hook.
      this.enableRequireHook((exportedValue, moduleStr, baseDir) => {
        if (this.internalState === PluginLoaderState.ACTIVATED) {
          // Skip processing for package.json
          if (!baseDir || path.basename(moduleStr) !== 'package.json') {
            // Get module name and internal file path (if exists).
            const parsedModuleStr = PluginLoader.parseModuleString(moduleStr);
            let name = parsedModuleStr.name;
            let file = parsedModuleStr.file;

            // For core modules, use [core] as the name, and the core module as
            // the "file".
            const isCoreModule = builtinModules.indexOf(name) !== -1;
            if (isCoreModule) {
              file = name;
              name = PluginLoader.CORE_MODULE;
            }

            // Check if the module has an associated plugin.
            if (this.pluginMap.has(name)) {
              // Determine whether this is the main module. Only used to prevent
              // logspam for modules that aren't supported and have a lot of
              // internal files.
              const isMainModule = file.length === 0 && !isCoreModule;

              // Get the module version.
              let version = this.getVersion(baseDir);
              if (version) {
                // Warn for pre-releases.
                if (!!semver.prerelease(version)) {
                  if (isMainModule) {
                    this.logger.warn(`PluginLoader#onRequire: [${name}@${
                        version}] This module is in pre-release. Applying plugin anyways.`);
                  }
                  version = version.split('-')[0];
                }

                // Apply each supported plugin.
                const plugin = this.pluginMap.get(name);
                if (plugin) {
                  if (plugin.isSupported(version)) {
                    exportedValue =
                        plugin.applyPlugin(exportedValue, file, version!);
                  } else {
                    this.logger.warn(`PluginLoader#onRequire: [${name}@${
                        version}] This module is not supported by the configured set of plugins.`);
                  }
                }
              } else if (isMainModule) {
                this.logger.error(`PluginLoader#activate: [${
                    name}] This module's version could not be determined. Not applying plugins.`);
              }
            }
          }
        }
        return exportedValue;
      });
      this.internalState = PluginLoaderState.ACTIVATED;
      this.logger.info(`PluginLoader#activate: Activated.`);
    } else if (this.internalState === PluginLoaderState.DEACTIVATED) {
      throw new Error('Currently cannot re-activate plugin loader.');
    } else {
      throw new Error('Plugin loader already activated.');
    }
    return this;
  }

  /**
   * Deactivates the plugin loader, preventing additional plugins from getting
   * loaded or applied, as well as unpatching any modules for which plugins
   * specified an unpatching method.
   */
  deactivate(): PluginLoader {
    if (this.internalState === PluginLoaderState.ACTIVATED) {
      // Unpatch the unpatchable functions.
      for (const pluginWrapper of this.pluginMap.values()) {
        pluginWrapper.unapplyAll();
      }
      this.internalState = PluginLoaderState.DEACTIVATED;
      this.logger.info(`PluginLoader#deactivate: Deactivated.`);
    } else {
      throw new Error('Plugin loader is not activated.');
    }
    return this;
  }

  /**
   * Adds a search path for plugin modules. Intended for testing purposes only.
   * @param searchPath The path to add.
   */
  static setPluginSearchPathForTestingOnly(searchPath: string) {
    module.paths = [searchPath];
  }

  /**
   * Separates the internal file path from the name of a module in a module
   * string, returning both (or just the name if it's the main module).
   * @param moduleStr The module string; in the form of either `${module}` or
   *   `${module}/${relPath}`
   */
  static parseModuleString(moduleStr: string): {name: string, file: string} {
    // Canonicalize the name by using only '/'.
    const parts = moduleStr.replace(/\\/g, '/').split('/');
    // The separation index between name/file depends on whether the module
    // is namespaced.
    const indexOfFile = parts[0].startsWith('@') ? 2 : 1;
    return {
      name: parts.slice(0, indexOfFile).join('/'),
      file: parts.slice(indexOfFile).join('/')
    };
  }

  // Get the version for a module at a given directory from its package.json
  // file, or null if it can't be read or parsed.
  // A falsey baseDir suggests a core module, for which the running Node
  // version is returned instead.
  private getVersion(baseDir?: string): string|null {
    if (baseDir) {
      if (this.moduleVersionCache.has(baseDir)) {
        return this.moduleVersionCache.get(baseDir)!;
      } else {
        const pjsonPath = path.join(baseDir, 'package.json');
        let version: string|null;
        try {
          version = require(pjsonPath).version;
          // Treat the version as if it's not there if it can't be parsed,
          // since for our purposes it's all the same.
          if (!semver.parse(version!)) {
            this.logger.error(`PluginLoader#getVersion: [${pjsonPath}|${
                version}] Version string could not be parsed.`);
            version = null;
          }
        } catch (e) {
          this.logger.error(`PluginLoader#getVersion: [${
              pjsonPath}] An error occurred while retrieving version string. ${
              e.message}`);
          version = null;
        }
        // Cache this value for future lookups.
        // This happens if a plugin has multiple internal files patched.
        this.moduleVersionCache.set(baseDir, version);
        return version;
      }
    } else {                            // core module
      return process.version.slice(1);  // starts with v
    }
  }
}

export const pluginLoader = new Singleton(PluginLoader);
