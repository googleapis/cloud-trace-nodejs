// Copyright 2018 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {restify_5} from '../../src/plugins/types';

import {WebFramework, WebFrameworkAddHandlerOptions} from './base';

export class Restify implements WebFramework {
  server: restify_5.Server;

  constructor(path: string) {
    const restify = require(path) as typeof restify_5;
    this.server = restify.createServer();
  }

  addHandler(options: WebFrameworkAddHandlerOptions): void {
    if (!options.hasResponse && !options.blocking) {
      throw new Error(
        `${this.constructor.name} wrapper for testing doesn't support non-blocking handlers.`
      );
    }
    if (options.hasResponse) {
      this.server.get(options.path, (req, res, next) => {
        Promise.resolve()
          .then(() => options.fn(req.headers))
          .then(response => {
            res.statusCode = response.statusCode;
            res.end(response.message);
          })
          .then(() => next(), next);
      });
    } else {
      this.server.use((req, res, next) => {
        if (req.getPath() !== options.path) {
          next();
          return;
        }
        Promise.resolve()
          .then(() => options.fn(req.headers))
          .then(() => next(), next);
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

export const Restify3 = makeRestifyClass(3, '<7');
export const Restify4 = makeRestifyClass(4, '<18');
export const Restify5 = makeRestifyClass(5, '<18');
export const Restify6 = makeRestifyClass(6, '<18');
export const Restify7 = makeRestifyClass(7, '<18');
export const Restify8 = makeRestifyClass(8, '<18');
export const Restify9 = makeRestifyClass(9, '<18 && >12');
export const Restify10 = makeRestifyClass(10, '<18 && >12');
export const Restify11 = makeRestifyClass(11, '<18 && >12');
