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

var shimmer = require('shimmer');
var urlParse = require('url').parse;

var SUPPORTED_VERSIONS = '8 - 16';

function createConnectionWrap(api) {
  return function connectionWrap(connection) {
    return function connectionTrace() {
      var server = connection.apply(this, arguments);
      server.ext('onRequest', createMiddleware(api));
      return server;
    };
  };
}

function createMiddleware(api) {
  return function middleware(request, reply) {
    var req = request.raw.req;
    var res = request.raw.res;
    var originalEnd = res.end;
    var options = {
      name: urlParse(req.url).pathname,
      url: req.url,
      traceContext: req.headers[api.constants.TRACE_CONTEXT_HEADER_NAME],
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
        return reply.continue();
      }

      api.wrapEmitter(req);
      api.wrapEmitter(res);

      var url = (req.headers['X-Forwarded-Proto'] || 'http') +
      '://' + req.headers.host + req.url;
    
      // we use the path part of the url as the span name and add the full
      // url as a label
      // req.path would be more desirable but is not set at the time our middleware runs.
      root.addLabel(api.labels.HTTP_METHOD_LABEL_KEY, req.method);
      root.addLabel(api.labels.HTTP_URL_LABEL_KEY, url);
      root.addLabel(api.labels.HTTP_SOURCE_IP, req.connection.remoteAddress);

      // wrap end
      res.end = function(chunk, encoding) {
        res.end = originalEnd;
        var returned = res.end(chunk, encoding);

        if (req.route && req.route.path) {
          root.addLabel(
            'hapi/request.route.path', req.route.path);
        }
        root.addLabel(
            api.labels.HTTP_RESPONSE_CODE_LABEL_KEY, res.statusCode);
        root.endSpan();

        return returned;
      };

      return reply.continue();
    });
  };
}

module.exports = [
  {
    file: '',
    versions: SUPPORTED_VERSIONS,
    patch: function(hapi, api) {
      shimmer.wrap(hapi.Server.prototype,
                   'connection',
                   createConnectionWrap(api));
    },
    unpatch: function(hapi) {
      shimmer.unwrap(hapi.Server.prototype, 'connection');
    }
  }
];
