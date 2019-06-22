import {IncomingHttpHeaders} from 'http';

/**
 * Copyright 2018 Google LLC
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

/**
 * An interface representation information that might be returned by a handler
 * function.
 */
export interface WebFrameworkResponse {
  statusCode: number;
  message: string;
}

/**
 * The underlying type of objects passed to WebFramework#addHandler.
 */
export type WebFrameworkAddHandlerOptions = {
  // The path which will invoke the handler.
  path: string;
} & (
  | {
      // This handler doesn't provide the response.
      hasResponse: false;
      // Whether or not this handler should block the next handler.
      blocking: boolean;
      // The handler function.
      fn: (incomingHeaders: IncomingHttpHeaders) => Promise<void>;
    }
  | {
      // This handler provides a response.
      hasResponse: true;
      // The handler function.
      fn: (
        incomingHeaders: IncomingHttpHeaders
      ) => Promise<WebFrameworkResponse>;
    });

/**
 * A type that describes a ramework-agnostic request handler function.
 */
export type WebFrameworkHandlerFunction = (
  incomingHeaders: IncomingHttpHeaders
) => Promise<void | WebFrameworkResponse>;

/**
 * Abstraction over a web framework.
 */
export interface WebFramework {
  /**
   * Adds a handler (or middleware) to the instantiated framework to handle
   * requests with the given options.path, performing (potentially asynchronous)
   * work defined by options.fn.
   */
  addHandler(options: WebFrameworkAddHandlerOptions): void;
  /**
   * Start serving on the given port, returning the port number.
   * If port is set to 0, an ephemeral port number will be chosen (and
   * returned).
   */
  listen(port: number): number | Promise<number>;
  /**
   * Shut down the server.
   */
  shutdown(): void;
}

/**
 * Defines the static members that should exist on a class that implements
 * WebFramework.
 */
export interface WebFrameworkConstructor {
  new (): WebFramework;
  versionRange: string;
  commonName: string;
  expectedTopStackFrame: string;
}
