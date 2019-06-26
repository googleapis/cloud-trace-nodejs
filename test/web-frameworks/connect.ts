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

import * as http from 'http';
import {AddressInfo} from 'net';

import {connect_3} from '../../src/plugins/types';

import {
  WebFramework,
  WebFrameworkAddHandlerOptions,
  WebFrameworkResponse,
} from './base';

export class Connect3 implements WebFramework {
  static commonName = 'connect@3';
  static expectedTopStackFrame = 'middleware';
  static versionRange = '*';
  app: connect_3.Server;
  server: http.Server | null = null;

  constructor() {
    const connect = require('../plugins/fixtures/connect3') as typeof connect_3;
    this.app = connect();
  }

  addHandler(options: WebFrameworkAddHandlerOptions): void {
    if (!options.hasResponse && !options.blocking) {
      throw new Error(
        `${this.constructor.name} wrapper for testing doesn't support non-blocking handlers.`
      );
    }
    this.app.use(
      options.path,
      async (
        req: http.IncomingMessage,
        res: http.ServerResponse,
        next: Function
      ) => {
        let response: WebFrameworkResponse | void;
        try {
          response = await options.fn(req.headers);
        } catch (e) {
          // Unlike in Express, there doesn't seem to be an easily documented
          // way to silence errors
          next(e);
          return;
        }
        if (response) {
          res.statusCode = response.statusCode;
          res.end(response.message);
        } else {
          next();
        }
      }
    );
  }

  listen(port: number): number {
    if (this.server) {
      throw new Error('Server already running.');
    }
    this.server = this.app.listen(port);
    return (this.server!.address() as AddressInfo).port;
  }

  shutdown(): void {
    if (!this.server) {
      throw new Error('No server running');
    }
    this.server.close();
    this.server = null;
  }
}
