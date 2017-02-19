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
var fs = require('fs');
var path = require('path');

// Includes support for npm '@org/name' packages
// Regex: .*?node_modules(?!.*node_modules)\/(@[^\/]*\/[^\/]*|[^\/]*).*
// Tests: https://regex101.com/r/lW2bE3/6
var moduleRegex = new RegExp(
  '.*?node_modules(?!.*node_modules)\\' + path.sep +
  '(@[^\\' + path.sep +
  ']*\\' + path.sep +
  '[^\\' + path.sep +
  ']*|[^\\' + path.sep +
  ']*).*'
);

/**
 * Retrieves a package name from the full import path.
 * For example:
 *   './node_modules/bar/index/foo.js' => 'bar'
 *
 * @param {string} path The full import path.
 */
function packageNameFromPath(path) {
  var matches = moduleRegex.exec(path);
  return matches && matches.length > 1 ? matches[1] : null;
}

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

module.exports = {
  packageNameFromPath: packageNameFromPath,
  findModulePath: findModulePath,
  findModuleVersion: findModuleVersion
};
