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
 * Truncates the provided `string` to be at most `length` bytes
 * after utf8 encoding and the appending of '...'.
 * We produce the result by iterating over input characters to
 * avoid truncating the string potentially producing partial unicode
 * characters at the end.
 */
function truncate(string, length) {
  if (Buffer.byteLength(string, 'utf8') <= length) {
    return string;
  }
  string = string.substr(0, length - 3);
  while (Buffer.byteLength(string, 'utf8') > length - 3) {
    string = string.substr(0, string.length - 1);
  }
  return string + '...';
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
 * Parse a cookie-style header string to extract traceId, spandId and options
 * ex: '123456/667;o=3'
 * -> {traceId: '123456', spanId: '667', options: '3'}
 * note that we ignore trailing garbage if there is more than one '='
 * Returns null if traceId or spanId could not be found.
 *
 * @param {string} str string representation of the trace headers
 * @return {?{traceId: string, spanId: string, options: number}}
 *         object with keys. null if there is a problem.
 */
function parseContextFromHeader(str) {
  if (!str) {
    return null;
  }
  var matches = str.match(/^([0-9a-fA-F]+)(?:\/([0-9a-fA-F]+))?(?:;o=(.*))?/);
  if (!matches || matches.length !== 4 || matches[0] !== str ||
      (matches[2] && isNaN(matches[2]))) {
    return null;
  }
  return {
    traceId: matches[1],
    spanId: matches[2],
    options: Number(matches[3])
  };
}

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
  truncate: truncate,
  parseContextFromHeader: parseContextFromHeader,
  packageNameFromPath: packageNameFromPath,
  findModulePath: findModulePath,
  findModuleVersion: findModuleVersion
};
