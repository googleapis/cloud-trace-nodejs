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

var urlParse = require('url').parse;

var SUPPORTED_VERSIONS = '3.x';

function createMiddleware(api) {
  return function middleware(req, res, next) {
    var options = {
      name: urlParse(req.originalUrl).pathname,
      url: req.originalUrl,
      traceContext: req.headers[api.constants.TRACE_CONTEXT_HEADER_NAME.toLowerCase()],
      skipFrames: 3
    };
    api.runInRootSpan(options, function(root) {
      // Set response trace context.
      var outgoingTraceContext =
        api.getOutgoingTraceContext(!!root, options.traceContext);
      if (outgoingTraceContext) {
        res.setHeader(api.constants.TRACE_CONTEXT_HEADER_NAME, outgoingTraceContext);
      }

      if (!root) {
        return next();
      }

      api.wrapEmitter(req);
      api.wrapEmitter(res);

      var url = (req.headers['X-Forwarded-Proto'] || 'http') +
        '://' + req.headers.host + req.originalUrl;

      // we use the path part of the url as the span name and add the full
      // url as a label
      root.addLabel(api.labels.HTTP_METHOD_LABEL_KEY, req.method);
      root.addLabel(api.labels.HTTP_URL_LABEL_KEY, url);
      root.addLabel(api.labels.HTTP_SOURCE_IP, req.connection.remoteAddress);

      // wrap end
      var originalEnd = res.end;
      res.end = function(data, encoding, callback) {
        res.end = originalEnd;
        var returned = res.end(data, encoding, callback);

        if (req.route && req.route.path) {
          root.addLabel(
            'connect/request.route.path', req.route.path);
        }

        root.addLabel(
          api.labels.HTTP_RESPONSE_CODE_LABEL_KEY, res.statusCode);
        root.endSpan();

        return returned;
      };

      next();
    });
  };
}

module.exports = [
  {
    file: '',
    versions: SUPPORTED_VERSIONS,
    intercept: function(connect, api) {
      return function() {
        var app = connect();
        app.use(createMiddleware(api));
        return app;
      };
    }
  }
];

