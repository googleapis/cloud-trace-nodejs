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
var semver = require('semver');
var util = require('./util.js');
var PluginAPI = require('./trace-plugin-interface.js');

var plugins = Object.create(null);
var activated = false;

var logger;

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
      var patchSet = instrumentation.patches[moduleRoot];
      if (!patchSet) {
        // Load the plugin object
        var plugin = originalModuleLoad(instrumentation.file, module, false);
        patchSet = {};
        plugin.forEach(function(patch) {
          if (!patch.versions || semver.satisfies(version, patch.versions)) {
            var file = patch.file || '';
            patchSet[file] = {
              file: file,
              patch: patch.patch,
              unpatch: patch.unpatch,
              intercept: patch.intercept
            };
          }
        });
        if (Object.keys(patchSet).length === 0) {
          logger.warn(moduleRoot + ': version ' + version + ' not supported ' +
            'by plugin.');
        }
        instrumentation.patches[moduleRoot] = patchSet;
      }

      // Create a new object exposing functions to create trace spans and
      // propagate context. This relies on functions currently exposed by the
      // agent.
      var api = new PluginAPI(agent, moduleRoot);
      for (var file in patchSet) {
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
      }
      var rootPatch = patchSet[''];
      if (rootPatch && rootPatch.intercept) {
        return rootPatch.module;
      } else {
        return null;
      }
    }

    function moduleAlreadyPatched(instrumentation, moduleRoot, version) {
      return instrumentation.patches[moduleRoot];
    }

    // Future requires get patched as they get loaded.
    return function Module_load(request, parent, isMain) {
      var instrumentation = plugins[request];
      if (instrumentation) {
        var moduleRoot = util.findModulePath(request, parent);
        var moduleVersion = util.findModuleVersion(moduleRoot, originalModuleLoad);
        if (moduleAlreadyPatched(instrumentation, moduleRoot, moduleVersion)) {
          return originalModuleLoad.apply(this, arguments);
        }
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
  if (activated) {
    activated = false;
    for (var moduleName in plugins) {
      var instrumentation = plugins[moduleName];
      for (var moduleRoot in instrumentation.patches) {
        var patchSet = instrumentation.patches[moduleRoot];
        for (var file in patchSet) {
          var patch = patchSet[file];
          if (patch.unpatch !== undefined) {
            logger.info('Unpatching' + moduleName);
            patch.unpatch(patch.module);
          }
        }
      }
    }
    plugins = Object.create(null);

    // unhook module.load
    shimmer.unwrap(Module, '_load');
  }
}

module.exports = {
  activate: activate,
  deactivate: deactivate
};
