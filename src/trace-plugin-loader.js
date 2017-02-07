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

var Module = require('module');
var shimmer = require('shimmer');
var path = require('path');
var fs = require('fs');
var semver = require('semver');
var PluginAPI = require('./trace-plugin-interface.js');

var plugins = Object.create(null);
var activated = false;

var logger;

/**
 * Determines the path at which the requested module will be loaded given
 * the provided parent module.
 *
 * @param {string} request The name of the module to be loaded.
 * @param {object} parent The module into which the requested module will be loaded.
 */
function findModulePath(request, parent) {
  var mainScriptDir = path.dirname(Module._resolveFilename(request, parent));
  var resolvedModule = Module._resolveLookupPaths(request, parent);
  var paths = resolvedModule[1];
  for (var i = 0, PL = paths.length; i < PL; i++) {
    if (mainScriptDir.indexOf(paths[i]) === 0) {
      return path.join(paths[i], request.replace('/', path.sep));
    }
  }
  return null;
}

/**
 * Determines the version of the module located at `modulePath`.
 *
 * @param {?string} modulePath The absolute path to the root directory of the
 *    module being loaded. This may be null if we are loading an internal module
 *    such as http.
 */
function findModuleVersion(modulePath, load) {
  if (modulePath) {
    var pjson = path.join(modulePath, 'package.json');
    if (fs.existsSync(pjson)) {
      return load(pjson).version;
    }
  }
  return process.version;
}

function checkLoadedModules() {
  for (var moduleName in plugins) {
    // \\ is benign on unix and escapes \\ on windows
    var regex = new RegExp('node_modules\\' + path.sep + moduleName +
      '\\' + path.sep);
    for (var file in require.cache) {
      if (file.match(regex)) {
        logger.error(moduleName + ' tracing might not work as ' + file +
            ' was loaded before the trace agent was initialized.');
        break;
      }
    }
  }
  if (process._preload_modules && process._preload_modules.length > 0) {
    var first = process._preload_modules[0];
    if (first !== '@google/cloud-trace') {
      logger.error('Tracing might not work as ' + first +
            ' was loaded with --require before the trace agent was initialized.');
    }
  }
}

function activate(agent) {
  if (activated) {
    logger.error('Plugins activated more than once.');
    return;
  }
  activated = true;
  logger = agent.logger;

  // Create a new object exposing functions to create trace spans and propagate
  // context. This relies on functions currently exposed by the agent.
  var api = new PluginAPI(agent);
  var pluginConfig = agent.config().plugins;
  for (var moduleName in pluginConfig) {
    plugins[moduleName] = {
      file: pluginConfig[moduleName],
      patches: {}
    };
  }

  checkLoadedModules();

  // hook into Module._load so that we can hook into userspace frameworks
  shimmer.wrap(Module, '_load', function(originalModuleLoad) {
    function loadAndPatch(instrumentation, moduleRoot, version) {
      if (!instrumentation.patches[moduleRoot]) {
        instrumentation.patches[moduleRoot] = {};
      }
      var patchSet = instrumentation.patches[moduleRoot][version];
      if (!patchSet) {
        // Load the plugin object
        var plugin = originalModuleLoad(instrumentation.file, module, false);
        patchSet = {};
        plugin.forEach(function(patch) {
          if (!patch.versions || semver.satisfies(version, patch.versions)) {
            patchSet[patch.file] = {
              file: patch.file || '',
              patch: patch.patch,
              intercept: patch.intercept
            };
          }
        });
        if (Object.keys(patchSet).length === 0) {
          logger.warn(moduleRoot + ': version ' + version + ' not supported ' + 
            'by plugin.');
        }
        instrumentation.patches[moduleRoot][version] = patchSet;
      }
      Object.keys(patchSet).forEach(function(file) {
        var patch = patchSet[file];
        if (!patch.module) {
          var loadPath = moduleRoot ? path.join(moduleRoot, patch.file) : patch.file;
          patch.module = originalModuleLoad(loadPath, module, false);
        }
        if (patch.patch) {
          patch.patch(patch.module, api);
        }
        if (patch.intercept) {
          patch.module = patch.intercept(patch.module, api);
        }
        patch.active = true;
      });
      var rootPatch = patchSet[''];
      if (rootPatch && rootPatch.intercept) {
        return rootPatch.module;
      } else {
        return null;
      }
    }

    function moduleAlreadyPatched(instrumentation, moduleRoot) {
      if (!instrumentation.patches[moduleRoot]) {
        return false;
      }
      var modulePatch = instrumentation.patches[moduleRoot];
      return !!modulePatch && Object.keys(modulePatch).every(function(curr) {
        return modulePatch[curr].active;
      }, true);
    }

    // If this is a reactivation, we may have a cached list of modules from last
    // time that we need to go and patch pro-actively.
    for (var moduleName in plugins) {
      var instrumentation = plugins[moduleName];
      for (var moduleRoot in instrumentation.patches) {
        var modulePatch = instrumentation.patches[moduleRoot];
        if (modulePatch) {
          loadAndPatch(instrumentation, moduleRoot, null);
        }
      }
    }

    // Future requires get patched as they get loaded.
    return function Module_load(request, parent, isMain) {
      var instrumentation = plugins[request];

      if (instrumentation &&
          agent.config().excludedHooks.indexOf(request) === -1) {
        var moduleRoot = findModulePath(request, parent);
        if (moduleAlreadyPatched(instrumentation, moduleRoot)) {
          return originalModuleLoad.apply(this, arguments);
        }
        var moduleVersion = findModuleVersion(moduleRoot, originalModuleLoad);
        logger.info('Patching ' + request + ' at version ' + moduleVersion);
        var patchedRoot = loadAndPatch(instrumentation, moduleRoot,
          moduleVersion);
        if (patchedRoot !== null) {
          return patchedRoot;
        }
      }

      return originalModuleLoad.apply(this, arguments);
    };
  });
}

function deactivate() {
  for (var moduleName in plugins) {
    var instrumentation = plugins[moduleName];
    for (var moduleRoot in instrumentation.patches) {
      var modulePatch = instrumentation.patches[moduleRoot];
      for (var patchedFile in modulePatch) {
        var hook = modulePatch[patchedFile];
        logger.info('Attempting to unpatch ' + moduleName);
        if (hook.unpatch !== undefined) {
          hook.unpatch(hook.module);
        }
      }
    }
  }
  activated = false;

  // unhook module.load
  shimmer.unwrap(Module, '_load');
}

module.exports = {
  activate: activate,
  deactivate: deactivate,
  findModulePath: findModulePath,
  findModuleVersion: findModuleVersion
};
