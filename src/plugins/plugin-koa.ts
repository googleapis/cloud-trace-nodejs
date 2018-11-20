/**
 * Copyright 2015 Google Inc. All Rights Reserved.
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

import {IncomingMessage, ServerResponse} from 'http';
import * as shimmer from 'shimmer';
import {parse as urlParse} from 'url';

import {PluginTypes} from '..';

import {koa_1, koa_2} from './types';

type Koa1Module = typeof koa_1;
type Koa2Module = typeof koa_2;
// routePath is populated if the user uses the koa-route module.
type KoaContext = (koa_1.Context|koa_2.Context)&{routePath?: string | RegExp};

interface KoaModule<T> {
  // TypeScript isn't expressive enough, but KoaModule#use should return `this`.
  // tslint:disable-next-line:no-any
  readonly prototype: {use: (m: T) => any};
}

// Function signature for createMiddleware[2x]
type CreateMiddlewareFn<T> = (api: PluginTypes.Tracer) => T;
// Function signature for a function that returns the value of the "next"
// middleware function parameter, wrapped to propagate context based on the
// propagateContext flag. The type of "next" differs between Koa 1 and 2.
type GetNextFn<T> = (propagateContext: boolean) => T;

function getFirstHeader(req: IncomingMessage, key: string): string|null {
  let headerValue = req.headers[key] || null;
  if (headerValue && typeof headerValue !== 'string') {
    headerValue = headerValue[0];
  }
  return headerValue;
}

function startSpanForRequest<T>(
    api: PluginTypes.Tracer, ctx: KoaContext, getNext: GetNextFn<T>): T {
  const req = ctx.req;
  const res = ctx.res;
  const originalEnd = res.end;
  const options = {
    name: req.url ? (urlParse(req.url).pathname || '') : '',
    url: req.url,
    method: req.method,
    traceContext: getFirstHeader(req, api.constants.TRACE_CONTEXT_HEADER_NAME),
    skipFrames: 2
  };
  return api.runInRootSpan(options, root => {
    // Set response trace context.
    const responseTraceContext = api.getResponseTraceContext(
        options.traceContext || null, api.isRealSpan(root));
    if (responseTraceContext) {
      res.setHeader(
          api.constants.TRACE_CONTEXT_HEADER_NAME, responseTraceContext);
    }

    if (!api.isRealSpan(root)) {
      return getNext(false);
    }

    api.wrapEmitter(req);
    api.wrapEmitter(res);


    const url = `${req.headers['X-Forwarded-Proto'] || 'http'}://${
        req.headers.host}${req.url}`;

    // we use the path part of the url as the span name and add the full
    // url as a label
    // req.path would be more desirable but is not set at the time our
    // middlewear runs.
    root.addLabel(api.labels.HTTP_METHOD_LABEL_KEY, req.method);
    root.addLabel(api.labels.HTTP_URL_LABEL_KEY, url);
    root.addLabel(api.labels.HTTP_SOURCE_IP, req.connection.remoteAddress);

    // wrap end
    res.end = function(this: ServerResponse) {
      res.end = originalEnd;
      const returned = res.end.apply(this, arguments);

      if (ctx.routePath) {
        root.addLabel('koa/request.route.path', ctx.routePath);
      }
      root.addLabel(api.labels.HTTP_RESPONSE_CODE_LABEL_KEY, res.statusCode);
      root.endSpan();

      return returned;
    };

    // if the event is aborted, end the span (as res.end will not be called)
    req.once('aborted', () => {
      root.addLabel(api.labels.ERROR_DETAILS_NAME, 'aborted');
      root.addLabel(
          api.labels.ERROR_DETAILS_MESSAGE, 'client aborted the request');
      root.endSpan();
    });

    return getNext(true);
  });
}

function createMiddleware(api: PluginTypes.Tracer): koa_1.Middleware {
  return function* middleware(this: koa_1.Context, next: IterableIterator<{}>) {
    next = startSpanForRequest(api, this, (propagateContext: boolean) => {
      if (propagateContext) {
        next.next = api.wrap(next.next);
      }
      return next;
    });
    yield next;
  };
}

function createMiddleware2x(api: PluginTypes.Tracer): koa_2.Middleware {
  return function middleware(ctx, next) {
    next = startSpanForRequest(
        api, ctx,
        (propagateContext: boolean) =>
            propagateContext ? api.wrap(next) : next);
    return next();
  };
}

function patchUse<T>(
    koa: KoaModule<T>, api: PluginTypes.Tracer,
    createMiddlewareFunction: CreateMiddlewareFn<T>) {
  shimmer.wrap(koa.prototype, 'use', (use) => {
    return function useTrace(this: typeof koa.prototype&
                             PluginTypes.TraceAgentExtension):
        typeof koa.prototype {
          if (!this._google_trace_patched) {
            this._google_trace_patched = true;
            this.use(createMiddlewareFunction(api));
          }
          return use.apply(this, arguments);
        };
  });
}

const plugin: PluginTypes.Plugin = [
  {
    file: '',
    versions: '1.x',
    patch: (koa, api) => {
      patchUse(koa, api, createMiddleware);
    },
    unpatch: (koa) => {
      shimmer.unwrap(koa.prototype, 'use');
    }
  } as PluginTypes.Monkeypatch<Koa1Module>,
  {
    file: '',
    versions: '2.x',
    patch: (koa, api) => {
      patchUse(koa, api, createMiddleware2x);
    },
    unpatch: (koa) => {
      shimmer.unwrap(koa.prototype, 'use');
    }
  } as PluginTypes.Monkeypatch<Koa2Module>
];

export = plugin;
