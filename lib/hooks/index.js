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
'use strict';

var Module = require('module');
var shimmer = require('shimmer');
var path = require('path');
var fs = require('fs');

//
// All these operations need to be reversible
//
// Patch core modules: _http_client, ...
// Patch Module._load
// Patch user modules express, hapi, ...
//   These are done on-demand via our Module._load wrapper
// Install a tracer in the global scope.

// Patches is a map from module load path to { filename1: { patchFunction: ...,
// unpatchFunction: ..., module: ..., active: ... }, filename2: ... }
// Each filename key represents a relative path which will be appended to the
// absolute path to the root of the module. Leaving this relative path blank
// will result in the module itself being patched.
// Note: the order in which filenames are defined in the hooks determines the
// order in which they are loaded.
var toInstrument = Object.create(null, {
  'express': { enumerable: true, value: { file: './userspace/hook-express.js',
      patches: {} } },
  'grpc': { enumerable: true, value: { file: './userspace/hook-grpc.js',
      patches: {} } },
  'hapi': { enumerable: true, value: { file: './userspace/hook-hapi.js',
      patches: {} } },
  'http': { enumerable: true, value: { file: './core/hook-http.js',
      patches: {} } },
  'koa': { enumerable: true, value: { file: './userspace/hook-koa.js',
      patches: {} } },
  'mongodb-core': { enumerable: true, value: { file: './userspace/hook-mongodb-core.js',
      patches: {} } },
  'mysql': { enumerable: true, value: { file: './userspace/hook-mysql.js',
      patches: {} } },
  'redis': { enumerable: true, value: { file: './userspace/hook-redis.js',
      patches: {} } },
  'restify': { enumerable: true, value: { file: './userspace/hook-restify.js',
      patches: {} } },
  'connect': { enumerable: true, value: { file: './userspace/hook-connect.js',
      patches: {} } }
});

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

function checkLoadedModules(logger) {
  for (var moduleName in toInstrument) {
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

  logger = agent.logger;

  checkLoadedModules(logger);

  // hook into Module._load so that we can hook into userspace frameworks
  shimmer.wrap(Module, '_load', function(originalModuleLoad) {

    function loadAndPatch(instrumentation, moduleRoot, version) {
      var modulePatch = instrumentation.patches[moduleRoot];
      if (!modulePatch) {
        // Load the hook. This file, i.e. index.js, becomes the parent module.
        var moduleHook = originalModuleLoad(instrumentation.file, module, false);
        modulePatch = moduleHook(version, agent);
      }
      Object.keys(modulePatch).forEach(function(file) {
        if (!modulePatch[file].module) {
          var loadPath = moduleRoot ? path.join(moduleRoot, file) : file;
          modulePatch[file].module = originalModuleLoad(loadPath, module, false);
        }
        if (modulePatch[file].patch !== undefined) {
          modulePatch[file].patch(modulePatch[file].module);
        }
        if (modulePatch[file].intercept !== undefined) {
          modulePatch[file].module = modulePatch[file].intercept(modulePatch[file].module);
        }
        modulePatch[file].active = true;
      });
      instrumentation.patches[moduleRoot] = modulePatch;
      if (modulePatch[''] !== undefined && modulePatch[''].intercept !== undefined) {
        return modulePatch[''].module;
      } else {
        return null;
      }
    }

    function moduleAlreadyPatched(instrumentation, moduleRoot) {
      var modulePatch = instrumentation.patches[moduleRoot];
      return modulePatch && Object.keys(modulePatch).every(function(curr) {
        return modulePatch[curr].active;
      }, true);
    }

    // If this is a reactivation, we may have a cached list of modules from last
    // time that we need to go and patch pro-actively.
    for (var moduleName in toInstrument) {
      var instrumentation = toInstrument[moduleName];
      for (var moduleRoot in instrumentation.patches) {
        var modulePatch = instrumentation.patches[moduleRoot];
        if (modulePatch) {
          loadAndPatch(instrumentation, moduleRoot, null);
        }
      }
    }

    // Future requires get patched as they get loaded.
    return function Module_load(request, parent, isMain) {
      var instrumentation = toInstrument[request];

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
  for (var moduleName in toInstrument) {
    var instrumentation = toInstrument[moduleName];
    for (var moduleRoot in instrumentation.patches) {
      var modulePatch = instrumentation.patches[moduleRoot];
      for (var patchedFile in modulePatch) {
        var hook = modulePatch[patchedFile];
        logger.info('Attempting to unpatch ' + moduleName);
        if (hook.unpatch !== undefined) {
          hook.unpatch(hook.module);
        }
        hook.active = false;
      }
    }
  }

  // unhook module.load
  shimmer.unwrap(Module, '_load');
}

module.exports = {
  activate: activate,
  deactivate: deactivate,
  findModulePath: findModulePath,
  findModuleVersion: findModuleVersion
};
