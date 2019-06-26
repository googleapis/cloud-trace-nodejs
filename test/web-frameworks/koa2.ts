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

import {koa_2 as Koa} from '../../src/plugins/types';

import {WebFramework, WebFrameworkAddHandlerOptions} from './base';

export class Koa2 implements WebFramework {
  static commonName = 'koa@2';
  static expectedTopStackFrame = 'middleware';
  static versionRange = '>=7.5';
  app: Koa;
  server: http.Server | null = null;

  constructor() {
    // tslint:disable-next-line:variable-name (Koa is a constructor)
    const Koa = require('../plugins/fixtures/koa2');
    this.app = new Koa();
  }

  addHandler(options: WebFrameworkAddHandlerOptions): void {
    if (!options.hasResponse && !options.blocking) {
      throw new Error(
        `${this.constructor.name} wrapper for testing doesn't support non-blocking handlers.`
      );
    }
    this.app.use(async (ctx, next) => {
      if (ctx.request.path === options.path) {
        const response = await options.fn(ctx.req.headers);
        if (response) {
          ctx.response.status = response.statusCode;
          ctx.response.body = response.message;
        } else {
          await next();
        }
      } else {
        await next();
      }
    });
  }

  listen(port: number): number {
    this.app.on('error', () => {
      /* silence error */
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
