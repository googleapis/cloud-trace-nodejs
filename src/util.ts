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

import * as fs from 'fs';
import Module = require('module');
import * as path from 'path';
import {Logger} from '@google-cloud/common';  // for types only.

/**
 * Trace API expects stack frames to be a JSON string with the following
 * structure:
 * STACK_TRACE := { "stack_frame" : [ FRAMES ] }
 * FRAMES := { "class_name" : CLASS_NAME, "file_name" : FILE_NAME,
 *             "line_number" : LINE_NUMBER, "method_name" : METHOD_NAME }*
 *
 * While the API doesn't expect a column_number at this point, it does accept,
 * and ignore it.
 */
export interface StackFrame {
  class_name?: string;
  method_name?: string;
  file_name?: string;
  line_number?: number;
  column_number?: number;
}

interface PackageJson {
  name: string;
  version: string;
}

export interface Constructor<T, Config> {
  new(logger: Logger, config: Config): T;
  prototype: T;
  name: string;
}

/**
 * A class that provides access to a singleton.
 * We assume that any such singleton is always constructed with two arguments:
 * A logger and an arbitrary configuration object.
 * Instances of this type should only be constructed in module scope.
 */
export class Singleton<T, Config> {
  private singleton: T|null = null;

  constructor(private implementation: Constructor<T, Config>) {}

  create(logger: Logger, config: Config&{forceNewAgent_?: boolean}): T {
    if (!this.singleton || config.forceNewAgent_) {
      this.singleton = new this.implementation(logger, config);
      return this.singleton;
    } else {
      throw new Error(`${this.implementation.name} has already been created.`);
    }
  }

  get(): T {
    if (!this.singleton) {
      throw new Error(`${this.implementation.name} has not yet been created.`);
    }
    return this.singleton;
  }
}

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
  '.*?node_modules(?!.*node_modules)\\', '(@[^\\', ']*\\', '[^\\', ']*|[^\\',
  ']*).*'
].join(path.sep));

export interface TraceContext {
  traceId: string;
  spanId: string;
  options?: number;
}

/**
 * Parse a cookie-style header string to extract traceId, spandId and options
 * ex: '123456/667;o=3'
 * -> {traceId: '123456', spanId: '667', options: '3'}
 * note that we ignore trailing garbage if there is more than one '='
 * Returns null if traceId or spanId could not be found.
 *
 * @param str string representation of the trace headers
 * @return object with keys. null if there is a problem.
 */
export function parseContextFromHeader(str: string): TraceContext|null {
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
 * @param traceContext An object with information sufficient for creating a
 *        serialized trace context.
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
 * @param path The full import path.
 */
export function packageNameFromPath(importPath: string) {
  const matches = moduleRegex.exec(importPath);
  return matches && matches.length > 1 ? matches[1] : null;
}

/**
 * Determines the path at which the requested module will be loaded given
 * the provided parent module.
 *
 * @param request The name of the module to be loaded.
 * @param parent The module into which the requested module will be loaded.
 */
export function findModulePath(request: string, parent?: NodeModule): string {
  const mainScriptDir = path.dirname(Module._resolveFilename(request, parent));
  const resolvedModule = Module._resolveLookupPaths(request, parent);
  const paths = resolvedModule[1];
  for (let i = 0, PL = paths.length; i < PL; i++) {
    if (mainScriptDir.indexOf(paths[i]) === 0) {
      return path.join(paths[i], request.replace('/', path.sep));
    }
  }
  return '';
}

/**
 * Determines the version of the module located at `modulePath`.
 *
 * @param modulePath The absolute path to the root directory of the
 *    module being loaded. This may be an empty string if we are loading an
 *    internal module such as http.
 */
export function findModuleVersion(
    modulePath: string, load: (path: string) => {}): string {
  if (!load) {
    load = Module._load;
  }
  if (modulePath !== '') {
    const pjson = path.join(modulePath, 'package.json');
    if (fs.existsSync(pjson)) {
      return (load(pjson) as PackageJson).version;
    }
  }
  return process.version;
}

/**
 * Creates a StackFrame object containing a structured stack trace.
 * @param numFrames The number of frames to retain.
 * @param skipFrames The number of top-most frames to remove.
 * @param constructorOpt A function passed to Error.captureStackTrace, which
 *   causes it to ignore the frames above the top-most call to this function.
 */
export function createStackTrace(
    numFrames: number, skipFrames: number,
    constructorOpt?: Function): StackFrame[] {
  // This is a mechanism to get the structured stack trace out of V8.
  // prepareStackTrace is called the first time the Error#stack property is
  // accessed. The original behavior is to format the stack as an exception
  // throw, which is not what we like. We customize it.
  //
  // See: https://code.google.com/p/v8-wiki/wiki/JavaScriptStackTraceApi
  //
  if (numFrames === 0) {
    return [];
  }

  const origLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = numFrames + skipFrames;

  const origPrepare = Error.prepareStackTrace;
  Error.prepareStackTrace =
      (error: Error, structured: NodeJS.CallSite[]): NodeJS.CallSite[] => {
        return structured;
      };
  const e: {stack?: NodeJS.CallSite[]} = {};
  Error.captureStackTrace(e, constructorOpt);

  const stackFrames: StackFrame[] = [];
  if (e.stack) {
    e.stack.forEach((callSite, i) => {
      if (i < skipFrames) {
        return;
      }
      // TODO(kjin): Check if callSite getters actually return null or
      // undefined. Docs say undefined but we guard it here just in case.
      const functionName = callSite.getFunctionName();
      const methodName = callSite.getMethodName();
      const name = (methodName && functionName) ?
          functionName + ' [as ' + methodName + ']' :
          functionName || methodName || '<anonymous function>';
      const stackFrame: StackFrame = {
        method_name: name,
        file_name: callSite.getFileName() || undefined,
        line_number: callSite.getLineNumber() || undefined,
        column_number: callSite.getColumnNumber() || undefined
      };
      stackFrames.push(stackFrame);
    });
  }
  Error.stackTraceLimit = origLimit;
  Error.prepareStackTrace = origPrepare;
  return stackFrames;
}
