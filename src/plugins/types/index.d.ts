import * as connect_3 from 'connect'; // connect@3
import * as express_4 from 'express'; // express@4
import * as hapi_16 from 'hapi'; // hapi@16
import * as koa_2 from 'koa'; // koa@2
import * as restify_5 from 'restify'; // restify@5

//---koa@1---//

declare class koa_1 {
  use(middleware: koa_1.Middleware): this;
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

//---exports---//

export {
  connect_3,
  express_4,
  hapi_16,
  koa_1,
  koa_2,
  restify_5
};
