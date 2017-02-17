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

const SUPPORTED_VERSIONS = '1.x';

function createUseWrap(api) {
  return function useWrap(use) {
    return function useTrace() {
      if (!this._google_trace_patched) {
        this._google_trace_patched = true;
        this.use(createMiddleware(api));
      }
      return use.apply(this, arguments);
    };
  };
}

function createMiddleware(api) {
  return function* middleware(next) {
    /* jshint validthis:true */
    const req = this.req;
    const res = this.res;
    const originalEnd = res.end;
    var options = {
      name: urlParse(req.url).pathname,
      traceContext: this.req.headers[api.constants.TRACE_CONTEXT_HEADER_NAME],
      skipFrames: 3
    };
    api.runInRootSpan(options, function(root) {
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

      var context = root.getTraceContext();
      if (context) {
        res.setHeader(api.constants.TRACE_CONTEXT_HEADER_NAME, context);
      }

      // wrap end
      res.end = function(chunk, encoding) {
        res.end = originalEnd;
        const returned = res.end(chunk, encoding);

        if (req.route && req.route.path) {
          root.addLabel(
            'koa/request.route.path', req.route.path);
        }
        root.addLabel(
            api.labels.HTTP_RESPONSE_CODE_LABEL_KEY, res.statusCode);
        root.endSpan();

        return returned;
      };
      api.wrap(next);
    });

    yield next;
  };
}

module.exports = [
  {
    file: '',
    versions: SUPPORTED_VERSIONS,
    patch: function(koa, api) {
      shimmer.wrap(koa.prototype, 'use', createUseWrap(api));
    },
    unpatch: function(koa) {
      shimmer.unwrap(koa.prototype, 'use');
    }
  }
];
