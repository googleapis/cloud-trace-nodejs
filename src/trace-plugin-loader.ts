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
var util = require('./util'/*.js*/);
var TraceAgent = require('./trace-api'/*.js*/);

var plugins = Object.create(null);
var intercepts = Object.create(null);
var activated = false;

var logger_;

function checkLoadedModules() {
  for (var moduleName in plugins) {
    // \\ is benign on unix and escapes \\ on windows
    var regex = new RegExp('node_modules\\' + path.sep + moduleName +
      '\\' + path.sep);
    for (var file in require.cache) {
      if (file.match(regex)) {
        logger_.error(moduleName + ' tracing might not work as ' + file +
            ' was loaded before the trace agent was initialized.');
        break;
      }
    }
  }
  if (process._preload_modules && process._preload_modules.length > 0) {
    var first = process._preload_modules[0];
    if (first !== '@google-cloud/trace-agent') {
      logger_.error('Tracing might not work as ' + first +
            ' was loaded with --require before the trace agent was initialized.');
    }
  }
}

function checkPatch(patch) {
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

function activate(logger, config) {
  if (activated) {
    logger_.error('Plugins activated more than once.');
    return;
  }
  activated = true;

  logger_ = logger;

  var pluginConfig = config.plugins;
  for (var moduleName in pluginConfig) {
    if (!pluginConfig[moduleName]) {
      continue;
    }
    var agent = new TraceAgent(moduleName);
    agent.enable(logger_, config);
    plugins[moduleName] = {
      file: pluginConfig[moduleName],
      patches: {},
      agent: agent
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
        if (semver.valid(version)) {
          plugin.forEach(function(patch) {
            if (!patch.versions || semver.satisfies(version, patch.versions)) {
              var file = patch.file || '';
              patchSet[file] = {
                file: file,
                patch: patch.patch,
                unpatch: patch.unpatch,
                intercept: patch.intercept
              };
              checkPatch(patchSet[file]);
            }
          });
        }
        if (Object.keys(patchSet).length === 0) {
          logger_.warn(moduleRoot + ': version ' + version + ' not supported ' +
            'by plugin.');
        }
        instrumentation.patches[moduleRoot] = patchSet;
      }

      for (var file in patchSet) {
        var patch = patchSet[file];
        var loadPath = moduleRoot ? path.join(moduleRoot, patch.file) : patch.file;
        if (!patch.module) {
          patch.module = originalModuleLoad(loadPath, module, false);
        }
        if (patch.patch) {
          patch.patch(patch.module, instrumentation.agent);
        }
        if (patch.intercept) {
          patch.module = patch.intercept(patch.module, instrumentation.agent);
          intercepts[loadPath] = {
            interceptedValue: patch.module
          };
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
        logger_.info('Patching ' + request + ' at version ' + moduleVersion);
        var patchedRoot = loadAndPatch(instrumentation, moduleRoot,
          moduleVersion);
        if (patchedRoot !== null) {
          return patchedRoot;
        }
      } else {
        var modulePath = Module._resolveFilename(request, parent).replace('/', path.sep);
        if (intercepts[modulePath]) {
          return intercepts[modulePath].interceptedValue;
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
      instrumentation.agent.disable();
      for (var moduleRoot in instrumentation.patches) {
        var patchSet = instrumentation.patches[moduleRoot];
        for (var file in patchSet) {
          var patch = patchSet[file];
          if (patch.unpatch !== undefined) {
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

module.exports = {
  activate: activate,
  deactivate: deactivate
};

export default {};
