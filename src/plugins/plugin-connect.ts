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
import {parse as urlParse} from 'url';

import {PluginTypes} from '..';

import {connect_3} from './types';

type Connect3 = typeof connect_3;
// Connect docs note that routed requests have an originalUrl property.
// https://github.com/senchalabs/connect/tree/3.6.5#appuseroute-fn
type Request = IncomingMessage&{originalUrl?: string};

const SUPPORTED_VERSIONS = '3.x';

function getFirstHeader(req: IncomingMessage, key: string): string|null {
  let headerValue = req.headers[key] || null;
  if (headerValue && typeof headerValue !== 'string') {
    headerValue = headerValue[0];
  }
  return headerValue;
}

function createMiddleware(api: PluginTypes.Tracer):
    connect_3.NextHandleFunction {
  return function middleware(req: Request, res, next) {
    const options = {
      name: req.originalUrl ? (urlParse(req.originalUrl).pathname || '') : '',
      url: req.originalUrl,
      method: req.method,
      traceContext:
          getFirstHeader(req, api.constants.TRACE_CONTEXT_HEADER_NAME),
      skipFrames: 1
    };
    api.runInRootSpan(options, (root) => {
      // Set response trace context.
      const responseTraceContext = api.getResponseTraceContext(
          options.traceContext || null, api.isRealSpan(root));
      if (responseTraceContext) {
        res.setHeader(
            api.constants.TRACE_CONTEXT_HEADER_NAME, responseTraceContext);
      }

      if (!api.isRealSpan(root)) {
        return next();
      }

      api.wrapEmitter(req);
      api.wrapEmitter(res);

      const url = `${req.headers['X-Forwarded-Proto'] || 'http'}://${
          req.headers.host}${req.originalUrl}`;

      // we use the path part of the url as the span name and add the full
      // url as a label
      root.addLabel(api.labels.HTTP_METHOD_LABEL_KEY, req.method);
      root.addLabel(api.labels.HTTP_URL_LABEL_KEY, url);
      root.addLabel(api.labels.HTTP_SOURCE_IP, req.connection.remoteAddress);

      // wrap end
      const originalEnd = res.end;
      res.end = function(this: ServerResponse) {
        res.end = originalEnd;
        const returned = res.end.apply(this, arguments);

        root.addLabel('connect/request.route.path', req.originalUrl);
        root.addLabel(api.labels.HTTP_RESPONSE_CODE_LABEL_KEY, res.statusCode);
        root.endSpan();

        return returned;
      };

      next();
    });
  };
}

const plugin: PluginTypes.Plugin = [{
  file: '',
  versions: SUPPORTED_VERSIONS,
  intercept: (connect, api) => {
    return function(this: {}) {
      const app = connect();
      app.use(createMiddleware(api));
      return app;
    };
  }
} as PluginTypes.Intercept<Connect3>];

export = plugin;
