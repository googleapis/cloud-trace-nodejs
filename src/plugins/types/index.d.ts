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

//---module type imports---//

/**
 * NOTE: The lines in this section are parsed by scripts/get-plugin-types.ts
 * and therefore must have a specific format
 * 
 * import * as X_Y from './X_Y'; // X@Y
 * 
 * where X is the module name and Y is the module version string.
 * Ideally, Y is just the module's major version, since variable names cannot
 * contain dots.
 */

import * as bluebird_3 from './bluebird_3'; // bluebird@3
import * as connect_3 from './connect_3'; // connect@3
import * as express_4 from './express_4'; // express@4
import * as hapi_16 from './hapi_16'; // hapi@16
import * as hapi_17 from './hapi_17'; // hapi@17
import * as koa_2 from './koa_2'; // koa@2
import * as pg_7 from './pg_7'; // pg@7
import * as restify_5 from './restify_5'; // restify@5

//---other imports---//

import { EventEmitter } from 'events';
import { Server } from 'http';
import { Readable } from 'stream';

//---koa@1---//

declare class koa_1 extends EventEmitter {
  use(middleware: koa_1.Middleware): this;
  listen(port?: number): Server;
}

declare namespace koa_1 {
  interface Middleware {
    (this: Context, next: IterableIterator<any>): any;
  }

  // Koa 1 and 2 differ primarily in the middleware passed to Koa#use.
  // For our purposes we can borrow type definitions from Koa 2.
  //
  // References:
  // https://github.com/koajs/koa/issues/533
  // https://github.com/koajs/koa/blob/master/History.md#200-alpha1--2015-10-22
  interface Context extends koa_2.Context {}
}

//---pg@6---//

declare namespace pg_6 {
  // PG 6's method signature for Client#query differs from that of PG 7 in that
  // the return value is either a Submittable if one was passed in, or a
  // pg.Query object instead. (In PG 6, pg.Query is PromiseLike and contains
  // values passed in as the query configuration.)
  //
  // References:
  // https://node-postgres.com/guides/upgrading#client-query-on
  // https://github.com/brianc/node-postgres/blob/v6.4.2/lib/client.js#L355
  type QueryReturnValue = (
    pg_7.QueryConfig &
    { callback?: (err: Error|null, res?: pg_7.QueryResult) => void }
  ) & (({ submit: Function } & Readable) | (pg_7.Query & PromiseLike<any>));

  class Client {
    query(...args: any[]): QueryReturnValue;
  }
}

//---exports---//

export {
  bluebird_3,
  connect_3,
  express_4,
  hapi_16,
  hapi_17,
  koa_1,
  koa_2,
  pg_6,
  pg_7,
  restify_5
};
