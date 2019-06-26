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
import * as path from 'path';
import * as sourceMapSupport from 'source-map-support';

const {
  hexToDec,
  decToHex,
}: {[key: string]: (input: string) => string} = require('hex2dec');

export {hexToDec, decToHex};

// This symbol must be exported (for now).
// See: https://github.com/Microsoft/TypeScript/issues/20080
export const kSingleton = Symbol();

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

export interface Constructor<T, ConfigType, LoggerType> {
  new (config: ConfigType, logger: LoggerType): T;
  prototype: T;
  name: string;
}

export const FORCE_NEW = Symbol('force-new');

export type Forceable<T> = T & {[FORCE_NEW]?: boolean};

export interface Component {
  enable(): void;
  disable(): void;
}

/**
 * A class that provides access to a singleton.
 * We assume that any such singleton is always constructed with two arguments:
 * An arbitrary configuration object and a logger.
 * Instances of this type should only be constructed in module scope.
 */
export class Singleton<T, ConfigType, LoggerType> {
  // Note: private[symbol] is enforced by clang-format.
  private [kSingleton]: T | null = null;

  constructor(private implementation: Constructor<T, ConfigType, LoggerType>) {}

  create(config: Forceable<ConfigType>, logger: LoggerType): T {
    if (!this[kSingleton] || config[FORCE_NEW]) {
      const s = this[kSingleton] as Partial<Component>;
      if (s && s.disable) {
        s.disable();
      }
      this[kSingleton] = new this.implementation(config, logger);
      return this[kSingleton]!;
    } else {
      throw new Error(`${this.implementation.name} has already been created.`);
    }
  }

  get(): T {
    if (!this[kSingleton]) {
      throw new Error(`${this.implementation.name} has not yet been created.`);
    }
    return this[kSingleton]!;
  }

  exists(): boolean {
    return !!this[kSingleton];
  }
}

/**
 * Returns the last parameter that is not null, undefined, or NaN.
 * @param defaultValue The first parameter. This must not be null/undefined/NaN.
 * @param otherValues Other parameters, which may be null/undefined/NaN.
 */
export function lastOf<T>(
  defaultValue: T,
  ...otherValues: Array<T | null | undefined>
): T {
  for (let i = otherValues.length - 1; i >= 0; i--) {
    // tslint:disable:no-any
    if (
      otherValues[i] !== null &&
      otherValues[i] !== undefined &&
      (typeof otherValues[i] !== 'number' || !isNaN(otherValues[i] as any))
    ) {
      return otherValues[i] as T;
    }
    // tslint:enable:no-any
  }
  return defaultValue;
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
const moduleRegex = new RegExp(
  [
    '.*?node_modules(?!.*node_modules)\\',
    '(@[^\\',
    ']*\\',
    '[^\\',
    ']*|[^\\',
    ']*).*',
  ].join(path.sep)
);

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
export function parseContextFromHeader(str: string): TraceContext | null {
  if (!str) {
    return null;
  }
  const matches = str.match(/^([0-9a-fA-F]+)(?:\/([0-9]+))(?:;o=(.*))?/);
  if (
    !matches ||
    matches.length !== 4 ||
    matches[0] !== str ||
    (matches[2] && isNaN(Number(matches[2])))
  ) {
    return null;
  }
  return {
    traceId: matches[1],
    spanId: matches[2],
    options: isNaN(Number(matches[3])) ? undefined : Number(matches[3]),
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
 * Creates a StackFrame object containing a structured stack trace.
 * @param numFrames The number of frames to retain.
 * @param skipFrames The number of top-most frames to remove.
 * @param constructorOpt A function passed to Error.captureStackTrace, which
 *   causes it to ignore the frames above the top-most call to this function.
 */
export function createStackTrace(
  numFrames: number,
  skipFrames: number,
  constructorOpt?: Function
): StackFrame[] {
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
  Error.prepareStackTrace = (
    error: Error,
    structured: NodeJS.CallSite[]
  ): NodeJS.CallSite[] => {
    return structured.map(sourceMapSupport.wrapCallSite);
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
      const name =
        methodName && functionName
          ? functionName + ' [as ' + methodName + ']'
          : functionName || methodName || '<anonymous function>';
      const stackFrame: StackFrame = {
        method_name: name,
        file_name: callSite.getFileName() || undefined,
        line_number: callSite.getLineNumber() || undefined,
        column_number: callSite.getColumnNumber() || undefined,
      };
      stackFrames.push(stackFrame);
    });
  }
  Error.stackTraceLimit = origLimit;
  Error.prepareStackTrace = origPrepare;
  return stackFrames;
}

/**
 * Serialize the given trace context into a Buffer.
 * @param traceContext The trace context to serialize.
 */
export function serializeTraceContext(traceContext: TraceContext): Buffer {
  //  0           1           2
  //  0 1 2345678901234567 8 90123456 7 8
  // -------------------------------------
  // | | |                | |        | | |
  // -------------------------------------
  //  ^ ^      ^           ^    ^     ^ ^
  //  | |      |           |    |     | `-- options value (traceContext.options)
  //  | |      |           |    |     `---- options field ID (2)
  //  | |      |           |    `---------- spanID value (traceConext.spanID)
  //  | |      |           `--------------- spanID field ID (1)
  //  | |      `--------------------------- traceID value (traceContext.traceID)
  //  | `---------------------------------- traceID field ID (0)
  //  `------------------------------------ version (0)
  const result = Buffer.alloc(29, 0);
  result.write(traceContext.traceId, 2, 16, 'hex');
  result.writeUInt8(1, 18);
  // Convert Span ID from decimal to base 16 representation, then left pad into
  // a length-16 hex string. (decToHex prepends its output with '0x', so we
  // also slice that off.)
  const base16SpanId = `0000000000000000${decToHex(traceContext.spanId).slice(
    2
  )}`.slice(-16);
  result.write(base16SpanId, 19, 8, 'hex');
  result.writeUInt8(2, 27);
  result.writeUInt8(traceContext.options || 0, 28);
  return result;
}

/**
 * Deseralize the given trace context from binary encoding. If the input is a
 * Buffer of incorrect size or unexpected fields, then this function will return
 * null.
 * @param buffer The trace context to deserialize.
 */
export function deserializeTraceContext(buffer: Buffer): TraceContext | null {
  const result: TraceContext = {traceId: '', spanId: ''};
  // Length must be 29.
  if (buffer.length !== 29) {
    return null;
  }
  // Check version and field numbers.
  if (
    buffer.readUInt8(0) !== 0 ||
    buffer.readUInt8(1) !== 0 ||
    buffer.readUInt8(18) !== 1 ||
    buffer.readUInt8(27) !== 2
  ) {
    return null;
  }
  // See serializeTraceContext for byte offsets.
  result.traceId = buffer.slice(2, 18).toString('hex');
  result.spanId = hexToDec(buffer.slice(19, 27).toString('hex'));
  result.options = buffer.readUInt8(28);
  return result;
}
