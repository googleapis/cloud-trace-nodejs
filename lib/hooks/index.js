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
var assert = require('assert');
var path = require('path');

//
// All these operations need to be reversible
//
// Patch core modules: _http_client, ...
// Patch Module._load
// Patch user modules express, hapi, ...
//   These are done on-demand via our Module._load wrapper
// Install a tracer in the global scope.


var toInstrument = Object.create(null, {
  'express': {
    enumerable: true,
    value: {
      file: './userspace/hook-express.js',
      module: null,
      hook: null,
      version: null
    }
  },
  'hapi': {
    enumerable: true,
    value: {
      file: './userspace/hook-hapi.js',
      module: null,
      hook: null,
      version: null
    }
  },
  'http': {
    enumerable: true,
    value: {
      file: './core/hook-http.js',
      module: null,
      hook: null,
      version: null
    }
  },
  'mongodb-core': {
    enumerable: true,
    value: {
      file: './userspace/hook-mongodb-core.js',
      module: null,
      hook: null,
      version: null
    }
  },
  'redis': {
    enumerable: true,
    value: {
      file: './userspace/hook-redis.js',
      module: null,
      hook: null,
      version: null
    }
  },
  'restify': {
    enumerable: true,
    value: {
      file: './userspace/hook-restify.js',
      module: null,
      hook: null,
      version: null
    }
  }
});

var logger;

function findModuleVersion(request, parent, load) {
  var mainScriptDir = path.dirname(Module._resolveFilename(request, parent));
  var resolvedModule = Module._resolveLookupPaths(request, parent);
  var paths = resolvedModule[1];
  for (var i = 0, PL = paths.length; i < PL; i++) {
    if (mainScriptDir.indexOf(paths[i]) === 0) {
      // This is unsafe on windows if request contains a namespace
      // TODO: convert path separators in request
      var pjson = load(path.join(paths[i], request, 'package.json'));
      return pjson.version;
    }
  }
  return null;
}

function activate(agent) {

  logger = agent.logger;

  function loadHookAndPatch(loadFn, instrumentation) {
    assert(instrumentation.module);
    assert(!instrumentation.hook);

    // Load the hook. This file, i.e. index.js, becomes the parent module.
    var moduleHook = loadFn(instrumentation.file, module, false);
    instrumentation.hook = moduleHook;
    moduleHook.patch(instrumentation.module, agent, instrumentation.version);
  }

  for (var moduleName in toInstrument) {
    var regex = new RegExp('node_modules' + path.sep + moduleName + path.sep);
    for (var file in require.cache) {
      if (file.match(regex)) {
        logger.warn(moduleName + ' tracing might not work as ' + file +
            ' was loaded before the trace agent was initialized.');
        break;
      }
    }
  }

  // hook into Module._load so that we can hook into userspace frameworks
  shimmer.wrap(Module, '_load', function(originalModuleLoad) {

    // If this is a reactivation, we may have a cached list of modules from last
    // time that we need to go and patch pro-actively.
    for (var moduleName in toInstrument) {
      var instrumentation = toInstrument[moduleName];
      if (instrumentation.module) {
        loadHookAndPatch(originalModuleLoad, instrumentation);
      }
    }

    // Future requires get patched as they get loaded.
    return function Module_load() {
      var request = arguments[0];
      var loaded = originalModuleLoad.apply(this, arguments);

      if (typeof request === 'string') {
        var instrumentation = toInstrument[request];

        if (instrumentation && agent.config().excludedHooks &&
            agent.config().excludedHooks.indexOf(request) === -1 &&
            !instrumentation.hook) { // not already patched.
          instrumentation.version = findModuleVersion(request, arguments[1],
              originalModuleLoad);
          logger.info('Patching ' + request + ' at version ' +
              instrumentation.version);
          instrumentation.module = loaded;
          loadHookAndPatch(originalModuleLoad, instrumentation);
        }
      }

      // no hooks installed. return the original module as-is.
      return loaded;
    };
  });
}

function deactivate() {
  for (var moduleName in toInstrument) {
    var instrumentation = toInstrument[moduleName];
    if (instrumentation.hook) {
      logger.info('Attempting to unpatch ' + moduleName);
      instrumentation.hook.unpatch();
      instrumentation.hook = null;
    }
  }

  // unhook module.load
  shimmer.unwrap(Module, '_load');
}

module.exports = {
  activate: activate,
  deactivate: deactivate,
  findModuleVersion: findModuleVersion
};



