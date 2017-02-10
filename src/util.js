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

/**
 * Produces an object summarization of limited size. This summarization
 * does not adhere to the JSON spec so it cannot be reparsed even if
 * the entire object fits inside the desired size.
 *
 * @param {Object} o The object to be summarized.
 * @param {number} n Max length of the summary.
 */
function stringifyPrefix(o, n) {
  var buf = new Buffer(n);
  var pos = 0;
  var worklist = [];
  function pushObject(o) {
    var keys = Object.keys(o);
    for (var i = Math.min(keys.length - 1, Math.floor(n/4)); i >= 0; i--) {
      worklist.push((i === keys.length - 1) ? '}' : ',');
      worklist.push(o[keys[i]]);
      worklist.push(':');
      worklist.push(keys[i]);
    }
    worklist.push('{');
  }
  worklist.push(o);
  while (worklist.length > 0) {
    var elem = worklist.pop();
    if (elem && typeof elem === 'object') {
      pushObject(elem);
    } else {
      var val;
      if (typeof elem === 'function') {
        val = '[Function]';
      } else if (typeof elem === 'string') {
        val = elem;
      } else {
        // Undefined, Null, Boolean, Number, Symbol
        val = String(elem);
      }
      pos += buf.write(val, pos);
      if (buf.length === pos) {
        buf.write('...', pos - 3);
        break;
      }
    }
  }
  return buf.toString('utf8', 0, pos);
}

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
  stringifyPrefix: stringifyPrefix,
  packageNameFromPath: packageNameFromPath,
  findModulePath: findModulePath,
  findModuleVersion: findModuleVersion
};
