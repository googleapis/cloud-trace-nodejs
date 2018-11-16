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

import {ServerResponse} from 'http';
import * as shimmer from 'shimmer';
import {parse as urlParse} from 'url';

import {PluginTypes} from '..';

import {restify_5} from './types';

type Restify5 = typeof restify_5;
type Request = restify_5.Request&{route?: {path: string | RegExp}};
type Response = restify_5.Response;
type Next = restify_5.Next;
type CreateServerFn = (options?: restify_5.ServerOptions) => restify_5.Server;

const SUPPORTED_VERSIONS = '<=7.x';

function unpatchRestify(restify: Restify5) {
  shimmer.unwrap(restify, 'createServer');
}

function patchRestify(restify: Restify5, api: PluginTypes.Tracer) {
  shimmer.wrap(restify, 'createServer', createServerWrap);

  function createServerWrap(createServer: CreateServerFn): CreateServerFn {
    return function createServerTrace(this: {}) {
      const server = createServer.apply(this, arguments) as restify_5.Server;
      server.use(middleware);
      return server;
    };
  }

  function middleware(req: Request, res: Response, next: Next): void {
    const options = {
      // we use the path part of the url as the span name and add the full url
      // as a label later.
      name: req.path(),
      url: req.url,
      method: req.method,
      traceContext: req.header(api.constants.TRACE_CONTEXT_HEADER_NAME),
      skipFrames: 1
    };

    api.runInRootSpan(options, rootSpan => {
      // Set response trace context.
      const responseTraceContext = api.getResponseTraceContext(
          options.traceContext, api.isRealSpan(rootSpan));
      if (responseTraceContext) {
        res.header(
            api.constants.TRACE_CONTEXT_HEADER_NAME, responseTraceContext);
      }

      if (!api.isRealSpan(rootSpan)) {
        return next();
      }

      api.wrapEmitter(req);
      api.wrapEmitter(res);


      const fullUrl = `${req.header('X-Forwarded-Proto', 'http')}://${
          req.header('host')}${req.url}`;
      rootSpan.addLabel(api.labels.HTTP_METHOD_LABEL_KEY, req.method);
      rootSpan.addLabel(api.labels.HTTP_URL_LABEL_KEY, fullUrl);
      rootSpan.addLabel(
          api.labels.HTTP_SOURCE_IP, req.connection.remoteAddress);

      const originalEnd = res.end;
      res.end = function(this: ServerResponse) {
        res.end = originalEnd;
        const returned = res.end.apply(this, arguments);

        if (req.route && req.route.path) {
          rootSpan.addLabel('restify/request.route.path', req.route.path);
        }
        rootSpan.addLabel(
            api.labels.HTTP_RESPONSE_CODE_LABEL_KEY, res.statusCode);
        rootSpan.endSpan();
        return returned;
      };

      next();
    });
  }
}

const plugin: PluginTypes.Plugin = [{
  versions: SUPPORTED_VERSIONS,
  patch: patchRestify,
  unpatch: unpatchRestify
} as PluginTypes.Monkeypatch<Restify5>];

export = plugin;
