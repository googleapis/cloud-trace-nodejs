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

import {hapi_16} from './types';

type Hapi16Module = typeof hapi_16;

const SUPPORTED_VERSIONS = '8 - 16';

function getFirstHeader(req: IncomingMessage, key: string): string|null {
  let headerValue = req.headers[key] || null;
  if (headerValue && typeof headerValue !== 'string') {
    headerValue = headerValue[0];
  }
  return headerValue;
}

function createMiddleware(api: PluginTypes.TraceAgent):
    hapi_16.ServerExtRequestHandler {
  return function middleware(request, reply) {
    const req = request.raw.req;
    const res = request.raw.res;
    const originalEnd = res.end;
    const options: PluginTypes.RootSpanOptions = {
      name: req.url ? (urlParse(req.url).pathname || '') : '',
      url: req.url,
      traceContext:
          getFirstHeader(req, api.constants.TRACE_CONTEXT_HEADER_NAME),
      skipFrames: 3
    };
    api.runInRootSpan(options, (root) => {
      // Set response trace context.
      const responseTraceContext =
          api.getResponseTraceContext(options.traceContext || null, !!root);
      if (responseTraceContext) {
        res.setHeader(
            api.constants.TRACE_CONTEXT_HEADER_NAME, responseTraceContext);
      }

      if (!root) {
        return reply.continue();
      }

      api.wrapEmitter(req);
      api.wrapEmitter(res);

      const url = `${req.headers['X-Forwarded-Proto'] || 'http'}://${
          req.headers.host}${req.url}`;

      // we use the path part of the url as the span name and add the full
      // url as a label
      // req.path would be more desirable but is not set at the time our
      // middleware runs.
      root.addLabel(api.labels.HTTP_METHOD_LABEL_KEY, req.method);
      root.addLabel(api.labels.HTTP_URL_LABEL_KEY, url);
      root.addLabel(api.labels.HTTP_SOURCE_IP, req.connection.remoteAddress);

      // wrap end
      res.end = function(this: ServerResponse) {
        res.end = originalEnd;
        const returned = res.end.apply(this, arguments);

        if (request.route && request.route.path) {
          root.addLabel('hapi/request.route.path', request.route.path);
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

      return reply.continue();
    });
  };
}

const plugin: PluginTypes.Plugin = [{
  file: '',
  versions: SUPPORTED_VERSIONS,
  patch: (hapi, api) => {
    shimmer.wrap<typeof hapi.Server.prototype.connection>(
        hapi.Server.prototype, 'connection', (connection) => {
          return function connectionTrace(this: {}) {
            const server: hapi_16.Server = connection.apply(this, arguments);
            server.ext('onRequest', createMiddleware(api));
            return server;
          };
        });
  },
  unpatch: (hapi) => {
    shimmer.unwrap(hapi.Server.prototype, 'connection');
  }
} as PluginTypes.Patch<Hapi16Module>];
export = plugin;
