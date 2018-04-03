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

import {hapi_17} from '../../src/plugins/types';

import {WebFramework, WebFrameworkAddHandlerOptions, WebFrameworkResponse} from './base';

export class Hapi17 implements WebFramework {
  static commonName = `hapi@17`;
  static expectedTopStackFrame = '_executeWrap';
  static versionRange = '>=7.5';

  private server: hapi_17.Server;
  // We can't add two routes on the same path.
  // So instead of registering a new Hapi plugin per path,
  // register only the first time -- passing a function that will iterate
  // through a list of routes keyed under the path.
  private routes =
      new Map<string, Array<() => Promise<WebFrameworkResponse|void>>>();
  private registering = Promise.resolve();

  constructor() {
    const hapi = require('../plugins/fixtures/hapi17') as typeof hapi_17;
    this.server = new hapi.Server();
  }

  addHandler(options: WebFrameworkAddHandlerOptions): void {
    let shouldRegister = false;
    if (!this.routes.has(options.path)) {
      this.routes.set(options.path, [options.fn]);
      shouldRegister = true;
    } else {
      this.routes.get(options.path)!.push(options.fn);
    }

    // Only register a new plugin for the first occurrence of this path.
    if (shouldRegister) {
      this.registering = this.registering.then(() => this.server.register({
        plugin: {
          name: options.path,
          register: async (server, registerOpts) => {
            server.route({
              method: 'GET',
              path: options.path,
              handler: async (request, h) => {
                let result;
                for (const handler of this.routes.get(options.path)!) {
                  result = await handler();
                  if (result) {
                    return result;
                  }
                }
                return h.continue;
              }
            });
          }
        }
      }));
    }
  }

  async listen(port: number): Promise<number> {
    await this.registering;
    this.server.settings.port = port;
    await this.server.start();
    return Number(this.server.info!.port);
  }

  shutdown(): void {
    this.server.stop();
  }
}
