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

var constants = require('../constants.js');
var TraceLabels = require('../trace-labels.js');

var SUPPORTED_VERSIONS = '8 - 16';

function connectionWrap(api, connection) {
  return function connectionTrace() {
    var server = connection.apply(this, arguments);
    server.ext('onRequest', middleware.bind(null, api));
    return server;
  };
}

function middleware(api, request, reply) {
  var req = request.raw.req;
  var res = request.raw.res;
  var originalEnd = res.end;
  var options = {
    name: urlParse(req.url).pathname,
    traceContext: req.headers[constants.TRACE_CONTEXT_HEADER_NAME],
    skipFrames: 3
  };
  api.runInRootSpan(options, function(transaction) {
    if (!transaction) {
      // TODO: Determine if this message is still needed
      //console.info('Hapi: no namespace found, ignoring request');
      return reply.continue();
    }

    api.wrapEmitter(req);
    api.wrapEmitter(res);

    var url = (req.headers['X-Forwarded-Proto'] || 'http') +
    '://' + req.headers.host + req.url;
  
    // we use the path part of the url as the span name and add the full
    // url as a label
    // req.path would be more desirable but is not set at the time our middlewear runs.
    transaction.addLabel(TraceLabels.HTTP_METHOD_LABEL_KEY, req.method);
    transaction.addLabel(TraceLabels.HTTP_URL_LABEL_KEY, url);
    transaction.addLabel(TraceLabels.HTTP_SOURCE_IP, req.connection.remoteAddress);

    var context = transaction.getTraceContext();
    res.setHeader(constants.TRACE_CONTEXT_HEADER_NAME, context);

    // wrap end
    res.end = function(chunk, encoding) {
      res.end = originalEnd;
      var returned = res.end(chunk, encoding);

      if (req.route && req.route.path) {
        transaction.addLabel(
          'hapi/request.route.path', req.route.path);
      }
      transaction.addLabel(
          TraceLabels.HTTP_RESPONSE_CODE_LABEL_KEY, res.statusCode);
      transaction.endSpan();

      return returned;
    };

    return reply.continue();
  });
}

module.exports = [
  {
    file: '',
    versions: SUPPORTED_VERSIONS,
    patch: function(hapi, api) {
      shimmer.wrap(hapi.Server.prototype,
                   'connection',
                   connectionWrap.bind(null, api));
    }
  }
];
