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

import {restify_5} from '../../src/plugins/types';

import {WebFramework, WebFrameworkAddHandlerOptions, WebFrameworkResponse} from './base';

export class Restify implements WebFramework {
  server: restify_5.Server;

  constructor(path: string) {
    const restify = require(path) as typeof restify_5;
    this.server = restify.createServer();
  }

  addHandler(options: WebFrameworkAddHandlerOptions): void {
    if (options.hasResponse) {
      this.server.get(options.path, async (req, res, next) => {
        let response: WebFrameworkResponse;
        try {
          response = await options.fn(req.headers);
        } catch (e) {
          next(e);
          return;
        }
        res.statusCode = response.statusCode;
        res.end(response.message);
        next();
      });
    } else {
      this.server.use(async (req, res, next) => {
        if (req.getPath() !== options.path) {
          next();
          return;
        }
        try {
          await options.fn(req.headers);
        } catch (e) {
          next(e);
          return;
        }
        next();
      });
    }
  }

  async listen(port: number): Promise<number> {
    this.server.listen(port);
    return this.server.address().port;
  }

  shutdown(): void {
    this.server.close();
  }
}

const makeRestifyClass = (version: number, nodeVersion?: string) =>
    class extends Restify {
  static commonName = `restify@${version}`;
  static expectedTopStackFrame = 'middleware';
  static versionRange = nodeVersion || '*';

  constructor() {
    super(`../plugins/fixtures/restify${version}`);
  }
};

// tslint:disable:variable-name (Restify* are class names)
export const Restify3 = makeRestifyClass(3, '<7');
export const Restify4 = makeRestifyClass(4);
export const Restify5 = makeRestifyClass(5);
export const Restify6 = makeRestifyClass(6);
export const Restify7 = makeRestifyClass(7);
// tslint:enable:variable-name
