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

import {EventEmitter} from 'events';

import {hapi_16} from '../../src/plugins/types';

import {
  WebFramework,
  WebFrameworkAddHandlerOptions,
  WebFrameworkResponse,
} from './base';

export class Hapi extends EventEmitter implements WebFramework {
  server: hapi_16.Server;
  // In Hapi, handlers are added after a connection is specified.
  // Since a port number is required to initialize a connection,
  // addHandler() pushes callbacks to this array, whose contents will be
  // invoked lazily upon calling listen().
  queuedHandlers: Array<() => void> = [];

  constructor(path: string) {
    super();
    const hapi = require(path) as typeof hapi_16;
    this.server = new hapi.Server();
    this.server.on('tail', () => this.emit('tail'));
  }

  addHandler(options: WebFrameworkAddHandlerOptions): void {
    this.queuedHandlers.push(() => {
      if (options.hasResponse) {
        this.server.route({
          method: 'get',
          path: options.path,
          handler: async (request, reply) => {
            let response: WebFrameworkResponse;
            try {
              response = await options.fn(request.raw.req.headers);
            } catch (e) {
              reply(e);
              return;
            }
            reply(response.message).statusCode = response.statusCode;
          },
        });
      } else {
        if (options.blocking) {
          this.server.ext('onPreHandler', async (request, reply) => {
            try {
              await options.fn(request.raw.req.headers);
            } catch (e) {
              reply(e);
              return;
            }
            reply.continue();
          });
        } else {
          // Use Hapi's request.tail to keep track of tail work.
          this.server.ext('onPreHandler', (request, reply) => {
            const tail = request.tail();
            options.fn(request.raw.req.headers).then(tail, tail);
            reply.continue();
          });
        }
      }
    });
  }

  async listen(port: number): Promise<number> {
    this.server.connection({host: 'localhost', port});
    this.queuedHandlers.forEach(fn => fn());
    this.queuedHandlers = [];
    await new Promise((resolve, reject) =>
      this.server.start(err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      })
    );
    return Number(this.server.info!.port);
  }

  shutdown(): void {
    this.server.stop();
  }
}

const makeHapiClass = (version: number) =>
  class extends Hapi {
    static commonName = `hapi@${version}`;
    static expectedTopStackFrame = 'handler';
    static versionRange = '*';

    constructor() {
      super(`../plugins/fixtures/hapi${version}`);
    }
  };

// tslint:disable:variable-name (Hapi* are class names)
export const Hapi8 = makeHapiClass(8);
export const Hapi12 = makeHapiClass(12);
export const Hapi15 = makeHapiClass(15);
export const Hapi16 = makeHapiClass(16);
// tslint:enable:variable-name
