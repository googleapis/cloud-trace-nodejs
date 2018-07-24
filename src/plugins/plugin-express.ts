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

/**
 * A class that decribes how to patch Express for automatic instrumentation
 * purposes.
 */
export class ExpressInstrumentation {
  /** A function to inject as the first middleware in an application. */
  private middleware =
      (req: express_4.Request, res: express_4.Response,
       next: express_4.NextFunction) => {
        const options: PluginTypes.RootSpanOptions = {
          name: this.generateSpanName(req),
          traceContext:
              req.get(this.tracer.constants.TRACE_CONTEXT_HEADER_NAME),
          url: req.originalUrl,
          skipFrames: 1
        };
        const labels = this.tracer.labels;
        this.tracer.runInRootSpan(options, (rootSpan) => {
          // Set response trace context.
          const responseTraceContext = this.tracer.getResponseTraceContext(
              options.traceContext || null, this.tracer.isRealSpan(rootSpan));
          if (responseTraceContext) {
            res.set(
                this.tracer.constants.TRACE_CONTEXT_HEADER_NAME,
                responseTraceContext);
          }

          if (!this.tracer.isRealSpan(rootSpan)) {
            next();
            return;
          }

          this.tracer.wrapEmitter(req);
          this.tracer.wrapEmitter(res);

          const url = `${req.protocol}://${req.headers.host}${req.originalUrl}`;
          rootSpan.addLabel(labels.HTTP_METHOD_LABEL_KEY, req.method);
          rootSpan.addLabel(labels.HTTP_URL_LABEL_KEY, url);
          rootSpan.addLabel(
              labels.HTTP_SOURCE_IP, req.connection.remoteAddress);

          // wrap end
          const originalEnd = res.end;
          res.end = function(this: express_4.Response) {
            res.end = originalEnd;
            const returned = res.end.apply(this, arguments);

            if (req.route && req.route.path) {
              rootSpan.addLabel('express/request.route.path', req.route.path);
            }
            rootSpan.addLabel(
                labels.HTTP_RESPONSE_CODE_LABEL_KEY, res.statusCode);
            rootSpan.endSpan();
            return returned;
          };

          next();
        });
      }

  /**
   * A utility function that auto-prepends this.middleware as the first
   * middleware in an Express application when the given method is used.
   */
  private applicationActionWrap = <T extends Function>(method: T) => {
    const that = this;
    return function expressActionTrace(this: express_4.Application&
                                       PluginTypes.TraceAgentExtension) {
      if (!this._google_trace_patched && !this._router) {
        this._google_trace_patched = true;
        this.use(that.middleware);
      }
      return method.apply(this, arguments);
    };
  };

  /**
   * Constructs a new ExpressInstrumentation instance.
   * @param tracer The Tracer with which spans should be created.
   */
  constructor(private readonly tracer: PluginTypes.Tracer) {}

  /**
   * Creates a span name based on the given request object; returns the path
   * by default. This method may be overridden.
   * @param req The Express Request object.
   */
  protected generateSpanName(req: express_4.Request): string {
    return req.path;
  }

  /**
   * Monkeypatches the given Express module for automatic instrumentation.
   * @param express Express module exports.
   */
  patch(express: Express4Module) {
    methods.forEach((method) => {
      shimmer.wrap(express.application, method, this.applicationActionWrap);
    });
  }
}

/**
 * Creates a Plugin object based on ExpressInstrumentation, or a class that
 * extends it.
 * @param pluginClass A class that either is or extends ExpressInstrumentation.
 */
export function createPlugin<T extends ExpressInstrumentation>(
    pluginClass: {new (tracer: PluginTypes.Tracer): T}): PluginTypes.Plugin {
  return [{
    versions: SUPPORTED_VERSIONS,
    patch: (express: Express4Module, tracer: PluginTypes.Tracer) => {
      new pluginClass(tracer).patch(express);
    },
    unpatch: (express: Express4Module) => {
      methods.forEach((method) => {
        shimmer.unwrap(express.application, method);
      });
    }
  } as PluginTypes.Monkeypatch<Express4Module>];
}

// Create a plugin based on ExpressInstrumentation and export it
export const plugin = createPlugin(ExpressInstrumentation);
