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
      hook: null
    }
  },
  'hapi': {
    enumerable: true,
    value: {
      file: './userspace/hook-hapi.js',
      hook: null
    }
  },
  'http': {
    enumerable: true,
    value: {
      file: './core/hook-http.js',
      hook: null
    }
  },
  'mongodb-core': {
    enumerable: true,
    value: {
      file: './userspace/hook-mongodb-core.js',
      hook: null
    }
  },
  'redis': {
    enumerable: true,
    value: {
      file: './userspace/hook-redis.js',
      hook: null
    }
  },
  'restify': {
    enumerable: true,
    value: {
      file: './userspace/hook-restify.js',
      hook: null
    }
  }
});

function activate(agent) {

  // hook into Module._load so that we can hook into userspace frameworks
  shimmer.wrap(Module, '_load', function(originalModuleLoad) {
    return function Module_load() {
      var request = arguments[0];

      var loaded = originalModuleLoad.apply(this, arguments);

      if (typeof request === 'string') {
        var instrumentation = toInstrument[request];
        if (instrumentation && agent.config().excludedHooks &&
            agent.config().excludedHooks.indexOf(request) === -1) {
          // Call Module._load on the hook file. This file become the parent.
          // Pass it the loaded module as an argument.
          var moduleHook = originalModuleLoad(instrumentation.file, module, false);
          instrumentation.hook = moduleHook;
          moduleHook.patch(loaded, agent);
        }
      }

      // no hooks installed. return the original module as-is.
      return loaded;
    };
  });
}

function deactivate() {
  for (var hookName in toInstrument) {
    var instrumentation = toInstrument[hookName];
    if (instrumentation.hook) {
      instrumentation.hook.unpatch();
      instrumentation.hook = null;
    }
  }

  // unhook module.load
  shimmer.unwrap(Module, '_load');
}

module.exports = {
  activate: activate,
  deactivate: deactivate
};



