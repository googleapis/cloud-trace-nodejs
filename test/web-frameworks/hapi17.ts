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

import {hapi_17} from '../../src/plugins/types';

import {
  WebFramework,
  WebFrameworkAddHandlerOptions,
  WebFrameworkHandlerFunction,
  WebFrameworkResponse,
} from './base';

const TAIL_WORK = Symbol('tail work for hapi');

interface AppState {
  [TAIL_WORK]?: Array<Promise<void>>;
}

export class Hapi17 extends EventEmitter implements WebFramework {
  static commonName = `hapi@17`;
  static expectedTopStackFrame = '_executeWrap';
  static versionRange = '>=7.5';

  private server: hapi_17.Server;
  // We can't add two routes on the same path.
  // So instead of registering a new Hapi plugin per path,
  // register only the first time -- passing a function that will iterate
  // through a list of routes keyed under the path.
  private routes = new Map<string, WebFrameworkAddHandlerOptions[]>();
  private registering = Promise.resolve();

  constructor() {
    super();
    const hapi = require('../plugins/fixtures/hapi17') as typeof hapi_17;
    this.server = new hapi.Server();
    this.server.events.on('response', (request: hapi_17.Request) => {
      Promise.all((request.app as AppState)[TAIL_WORK] || []).then(
        () => this.emit('tail'),
        (err: Error) => this.emit('tail', err)
      );
    });
  }

  addHandler(options: WebFrameworkAddHandlerOptions): void {
    let shouldRegister = false;
    if (!this.routes.has(options.path)) {
      this.routes.set(options.path, [options]);
      shouldRegister = true;
    } else {
      this.routes.get(options.path)!.push(options);
    }

    // Only register a new plugin for the first occurrence of this path.
    if (shouldRegister) {
      this.registering = this.registering.then(() =>
        this.server.register({
          plugin: {
            name: options.path,
            register: async (server, registerOpts) => {
              server.route({
                method: 'GET',
                path: options.path,
                handler: async (request, h) => {
                  let result;
                  for (const localOptions of this.routes.get(options.path)!) {
                    if (localOptions.hasResponse || localOptions.blocking) {
                      result = await localOptions.fn(request.raw.req.headers);
                      if (result) {
                        return result;
                      }
                    } else {
                      // Use Hapi 17's application state to keep track of
                      // tail work.
                      const appState: AppState = request.app;
                      if (!appState[TAIL_WORK]) {
                        appState[TAIL_WORK] = [];
                      }
                      appState[TAIL_WORK]!.push(
                        localOptions.fn(request.raw.req.headers)
                      );
                    }
                  }
                  return h.continue;
                },
              });
            },
          },
        })
      );
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
