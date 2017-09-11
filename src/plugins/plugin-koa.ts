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
'use strict';

const shimmer = require('shimmer');
var urlParse = require('url').parse;

function startSpanForRequest(api, req, res, next) {
  var originalEnd = res.end;
  var options = {
    name: urlParse(req.url).pathname,
    url: req.url,
    traceContext: req.headers[api.constants.TRACE_CONTEXT_HEADER_NAME],
    skipFrames: 4
  };
  api.runInRootSpan(options, function(root) {
    // Set response trace context.
    var responseTraceContext =
      api.getResponseTraceContext(options.traceContext, !!root);
    if (responseTraceContext) {
      res.setHeader(api.constants.TRACE_CONTEXT_HEADER_NAME, responseTraceContext);
    }
    
    if (!root) {
      return;
    }

    api.wrapEmitter(req);
    api.wrapEmitter(res);

    const url = (req.headers['X-Forwarded-Proto'] || 'http') +
      '://' + req.headers.host + req.url;

    // we use the path part of the url as the span name and add the full
    // url as a label
    // req.path would be more desirable but is not set at the time our middlewear runs.
    root.addLabel(api.labels.HTTP_METHOD_LABEL_KEY, req.method);
    root.addLabel(api.labels.HTTP_URL_LABEL_KEY, url);
    root.addLabel(api.labels.HTTP_SOURCE_IP, req.connection.remoteAddress);

    // wrap end
    res.end = function() {
      res.end = originalEnd;
      const returned = res.end.apply(this, arguments);

      if (req.route && req.route.path) {
        root.addLabel(
          'koa/request.route.path', req.route.path);
      }
      root.addLabel(
          api.labels.HTTP_RESPONSE_CODE_LABEL_KEY, res.statusCode);
      root.endSpan();

      return returned;
    };

    // if the event is aborted, end the span (as res.end will not be called)
    req.once('aborted', function() {
      root.addLabel(api.labels.ERROR_DETAILS_NAME, 'aborted');
      root.addLabel(api.labels.ERROR_DETAILS_MESSAGE, 'client aborted the request');
      root.endSpan();
    });

    api.wrap(next);
  });
}

function createMiddleware(api) {
  return function* middleware(next) {
    /* jshint validthis:true */
    const req = this.req;
    const res = this.res;

    startSpanForRequest(api, req, res, next);

    yield next;
  };
}

function createMiddleware2x(api) {
  return function middleware(ctx, next) {
    const req = ctx.req;
    const res = ctx.res;

    startSpanForRequest(api, req, res, next);

    return next();
  };
}

function patchUse(koa, api, createMiddlewareFunction) {
  shimmer.wrap(koa.prototype, 'use', function useWrap(use) {
    return function useTrace() {
      if (!this._google_trace_patched) {
        this._google_trace_patched = true;
        this.use(createMiddlewareFunction(api));
      }
      return use.apply(this, arguments);
    };
  });
}

module.exports = [
  {
    file: '',
    versions: '1.x',
    patch: function(koa, api) {
      patchUse(koa, api, createMiddleware);
    },
    unpatch: function(koa) {
      shimmer.unwrap(koa.prototype, 'use');
    }
  },
  {
    file: '',
    versions: '2.x',
    patch: function(koa, api) {
      patchUse(koa, api, createMiddleware2x);
    },
    unpatch: function(koa) {
      shimmer.unwrap(koa.prototype, 'use');
    }
  }
];

export default {};
