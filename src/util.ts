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

import * as fs from 'fs';
import * as path from 'path';

// TODO(kjin)
// Module augmentation is implemented in this PR:
// https://github.com/DefinitelyTyped/DefinitelyTyped/pull/19612
// Do this correctly when it's landed and released.
import _Module = require('module');
const Module: {
  _resolveFilename(request: string, parent?: NodeModule): string;
  _resolveLookupPaths(request: string, parent?: NodeModule): string;
  _load(request: string, parent?: NodeModule, isMain?: boolean): any;
} = _Module as any;

/**
 * Truncates the provided `string` to be at most `length` bytes
 * after utf8 encoding and the appending of '...'.
 * We produce the result by iterating over input characters to
 * avoid truncating the string potentially producing partial unicode
 * characters at the end.
 */
export function truncate(str: string, length: number) {
  if (Buffer.byteLength(str, 'utf8') <= length) {
    return str;
  }
  str = str.substr(0, length - 3);
  while (Buffer.byteLength(str, 'utf8') > length - 3) {
    str = str.substr(0, str.length - 1);
  }
  return str + '...';
}

// Includes support for npm '@org/name' packages
// Regex: .*?node_modules(?!.*node_modules)\/(@[^\/]*\/[^\/]*|[^\/]*).*
// Tests: https://regex101.com/r/lW2bE3/6
const moduleRegex = new RegExp([
  '.*?node_modules(?!.*node_modules)\\',
  '(@[^\\',
  ']*\\',
  '[^\\',
  ']*|[^\\',
  ']*).*'
].join(path.sep));

export interface TraceContext {
  traceId: string;
  spanId: string;
  options?: number;
};

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
export function parseContextFromHeader(str: string): TraceContext | null {
  if (!str) {
    return null;
  }
  const matches = str.match(/^([0-9a-fA-F]+)(?:\/([0-9]+))(?:;o=(.*))?/);
  if (!matches || matches.length !== 4 || matches[0] !== str ||
      (matches[2] && isNaN(Number(matches[2])))) {
    return null;
  }
  return {
    traceId: matches[1],
    spanId: matches[2],
    options: isNaN(Number(matches[3])) ? undefined : Number(matches[3])
  };
}

/**
 * Generates a trace context header value that can be used
 * to follow the associated request through other Google services.
 *
 * @param {?{traceId: string, spanId: string, options: number}} traceContext
 *        An object with information sufficient for creating a serialized trace
 *        context.
 */
export function generateTraceContext(traceContext: TraceContext): string {
  if (!traceContext) {
    return '';
  }
  let header = `${traceContext.traceId}/${traceContext.spanId}`;
  if (typeof traceContext.options !== 'undefined') {
    header += `;o=${traceContext.options}`;
  }
  return header;
}

/**
 * Retrieves a package name from the full import path.
 * For example:
 *   './node_modules/bar/index/foo.js' => 'bar'
 *
 * @param {string} path The full import path.
 */
export function packageNameFromPath(path: string) {
  const matches = moduleRegex.exec(path);
  return matches && matches.length > 1 ? matches[1] : null;
}

/**
 * Determines the path at which the requested module will be loaded given
 * the provided parent module.
 *
 * @param {string} request The name of the module to be loaded.
 * @param {object} parent The module into which the requested module will be loaded.
 */
export function findModulePath(request: string, parent: NodeModule): string | null {
  const mainScriptDir = path.dirname(Module._resolveFilename(request, parent));
  const resolvedModule = Module._resolveLookupPaths(request, parent);
  const paths = resolvedModule[1];
  for (let i = 0, PL = paths.length; i < PL; i++) {
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
export function findModuleVersion(modulePath: string | null, load: (path: string) => any): string {
  if (!load) {
    load = Module._load;
  }
  if (modulePath) {
    const pjson = path.join(modulePath, 'package.json');
    if (fs.existsSync(pjson)) {
      return load(pjson).version;
    }
  }
  return process.version;
}
