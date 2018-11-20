/**
 * Copyright 2017 Google Inc. All Rights Reserved.
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

import * as httpMethods from 'methods';
import * as shimmer from 'shimmer';

import {PluginTypes} from '..';

import {express_4} from './types';

// application is an undocumented member of the express object.
type Express4Module = typeof express_4&{application: express_4.Application};

const methods: Array<keyof express_4.Application> =
    (httpMethods as Array<keyof express_4.Application>)
        .concat('use', 'route', 'param', 'all');

const SUPPORTED_VERSIONS = '4.x';

function patchModuleRoot(express: Express4Module, api: PluginTypes.Tracer) {
  const labels = api.labels;
  function middleware(
      req: express_4.Request, res: express_4.Response,
      next: express_4.NextFunction) {
    const options: PluginTypes.RootSpanOptions = {
      name: req.path,
      traceContext: req.get(api.constants.TRACE_CONTEXT_HEADER_NAME),
      url: req.originalUrl,
      method: req.method,
      skipFrames: 1
    };
    api.runInRootSpan(options, (rootSpan) => {
      // Set response trace context.
      const responseTraceContext = api.getResponseTraceContext(
          options.traceContext || null, api.isRealSpan(rootSpan));
      if (responseTraceContext) {
        res.set(api.constants.TRACE_CONTEXT_HEADER_NAME, responseTraceContext);
      }

      if (!api.isRealSpan(rootSpan)) {
        next();
        return;
      }

      api.wrapEmitter(req);
      api.wrapEmitter(res);

      const url = `${req.protocol}://${req.headers.host}${req.originalUrl}`;
      rootSpan.addLabel(labels.HTTP_METHOD_LABEL_KEY, req.method);
      rootSpan.addLabel(labels.HTTP_URL_LABEL_KEY, url);
      rootSpan.addLabel(labels.HTTP_SOURCE_IP, req.connection.remoteAddress);

      // wrap end
      const originalEnd = res.end;
      res.end = function(this: express_4.Response) {
        res.end = originalEnd;
        const returned = res.end.apply(this, arguments);

        if (req.route && req.route.path) {
          rootSpan.addLabel('express/request.route.path', req.route.path);
        }
        rootSpan.addLabel(labels.HTTP_RESPONSE_CODE_LABEL_KEY, res.statusCode);
        rootSpan.endSpan();
        return returned;
      };

      next();
    });
  }

  function applicationActionWrap<T extends Function>(method: T): () => T {
    return function expressActionTrace(this: express_4.Application&
                                       PluginTypes.TraceAgentExtension) {
      if (!this._google_trace_patched && !this._router) {
        this._google_trace_patched = true;
        this.use(middleware);
      }
      return method.apply(this, arguments);
    };
  }

  methods.forEach((method) => {
    shimmer.wrap(express.application, method, applicationActionWrap);
  });
}

function unpatchModuleRoot(express: Express4Module) {
  methods.forEach((method) => {
    shimmer.unwrap(express.application, method);
  });
}

const plugin: PluginTypes.Plugin = [{
  versions: SUPPORTED_VERSIONS,
  patch: patchModuleRoot,
  unpatch: unpatchModuleRoot
} as PluginTypes.Monkeypatch<Express4Module>];

export = plugin;
