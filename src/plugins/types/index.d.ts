import * as connect_3 from 'connect'; // connect@3
import * as express_4 from 'express'; // express@4
import * as hapi_16 from 'hapi'; // hapi@16
import * as koa_2 from 'koa'; // koa@2
import * as pg_7 from 'pg'; // pg@7
import * as restify_5 from 'restify'; // restify@5

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
  connect_3,
  express_4,
  hapi_16,
  koa_1,
  koa_2,
  pg_6,
  pg_7,
  restify_5
};
