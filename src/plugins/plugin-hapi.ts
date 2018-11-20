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

import {hapi_16, hapi_17} from './types';

// Used when patching Hapi 17.
const ORIGINAL = Symbol();

type Hapi16Module = typeof hapi_16;
interface Hapi17RequestExecutePrivate {
  (this: hapi_17.Request): Promise<void>;
  [ORIGINAL]?: Hapi17RequestExecutePrivate;
}
type Hapi17Request = hapi_17.Request&{
  _execute: Hapi17RequestExecutePrivate;
};

function getFirstHeader(req: IncomingMessage, key: string): string|null {
  let headerValue = req.headers[key] || null;
  if (headerValue && typeof headerValue !== 'string') {
    headerValue = headerValue[0];
  }
  return headerValue;
}

function instrument<T>(
    api: PluginTypes.Tracer, request: hapi_16.Request|hapi_17.Request,
    continueCb: () => T): T {
  const req = request.raw.req;
  const res = request.raw.res;
  const originalEnd = res.end;
  const options: PluginTypes.RootSpanOptions = {
    name: req.url ? (urlParse(req.url).pathname || '') : '',
    url: req.url,
    method: req.method,
    traceContext: getFirstHeader(req, api.constants.TRACE_CONTEXT_HEADER_NAME),
    skipFrames: 2
  };
  return api.runInRootSpan(options, (root) => {
    // Set response trace context.
    const responseTraceContext = api.getResponseTraceContext(
        options.traceContext || null, api.isRealSpan(root));
    if (responseTraceContext) {
      res.setHeader(
          api.constants.TRACE_CONTEXT_HEADER_NAME, responseTraceContext);
    }

    if (!api.isRealSpan(root)) {
      return continueCb();
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

    return continueCb();
  });
}

const plugin: PluginTypes.Plugin = [
  {
    versions: '8 - 16',
    patch: (hapi, api) => {
      shimmer.wrap(hapi.Server.prototype, 'connection', (connection) => {
        return function connectionTrace(this: hapi_16.Server) {
          const server = connection.apply(this, arguments);
          server.ext('onRequest', function handler(request, reply) {
            return instrument(api, request, () => reply.continue());
          } as hapi_16.ServerExtRequestHandler);
          return server;
        };
      });
    },
    unpatch: (hapi) => {
      shimmer.unwrap(hapi.Server.prototype, 'connection');
    }
  } as PluginTypes.Monkeypatch<Hapi16Module>,
  /**
   * In Hapi 17, the work that is done on behalf of a request stems from
   * Request#_execute. We patch that function to ensure that context is
   * available in every handler.
   */
  {
    versions: '17',
    file: 'lib/request.js',
    // Request is a class name.
    // tslint:disable-next-line:variable-name
    patch: (Request, api) => {
      // TODO(kjin): shimmer cannot wrap AsyncFunction objects.
      // Once shimmer introduces this functionality, change this code to use it.
      const origExecute = Request.prototype._execute;
      Request.prototype._execute =
          Object.assign(function _executeWrap(this: hapi_17.Request) {
            return instrument(api, this, () => {
              return origExecute.apply(this, arguments);
            });
          }, {[ORIGINAL]: origExecute});
    },
    // Request is a class name.
    // tslint:disable-next-line:variable-name
    unpatch: (Request) => {
      if (Request.prototype._execute[ORIGINAL]) {
        Request.prototype._execute = Request.prototype._execute[ORIGINAL]!;
      }
    }
  } as PluginTypes.Monkeypatch<{prototype: Hapi17Request}>
];
export = plugin;
