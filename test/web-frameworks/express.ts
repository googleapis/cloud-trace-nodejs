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

import {express_4} from '../../src/plugins/types';

import {
  WebFramework,
  WebFrameworkAddHandlerOptions,
  WebFrameworkResponse,
} from './base';

export class Express4 implements WebFramework {
  static commonName = 'express@4';
  static expectedTopStackFrame = 'middleware';
  static versionRange = '*';
  app: express_4.Application;
  server: http.Server | null = null;

  constructor() {
    const express = require('../plugins/fixtures/express4') as typeof express_4;
    this.app = express();
  }

  addHandler(options: WebFrameworkAddHandlerOptions): void {
    if (!options.hasResponse && !options.blocking) {
      throw new Error(
        `${this.constructor.name} wrapper for testing doesn't support non-blocking handlers.`
      );
    }
    this.app.get(options.path, async (req, res, next) => {
      let response: WebFrameworkResponse | void;
      try {
        response = await options.fn(req.headers);
      } catch (e) {
        next(e);
        return;
      }
      if (response) {
        res.status(response.statusCode);
        res.send(response.message);
      } else {
        next();
      }
    });
  }

  listen(port: number): number {
    this.app.use((err: Error, req: {}, res: express_4.Response, next: {}) => {
      // silence error
      if (err) {
        res.sendStatus(500);
      }
    });
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
