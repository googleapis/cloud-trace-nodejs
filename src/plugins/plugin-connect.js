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

var constants = require('../constants.js');
var TraceLabels = require('../trace-labels.js');

var SUPPORTED_VERSIONS = '3.x';

function middleware(api, req, res, next) {
  var originalEnd = res.end;
  var options = {
    name: urlParse(req.originalUrl).pathname,
    traceContext: req.headers[constants.TRACE_CONTEXT_HEADER_NAME.toLowerCase()],
    skipFrames: 3
  };
  api.runInRootSpan(options, function(transaction) {
    if (!transaction) {
      // TODO: Determine if this message is needed
      // agent.logger.info('Connect: no namespace found, ignoring request');
      return next();
    }

    api.wrapEmitter(req);
    api.wrapEmitter(res);

    var url = (req.headers['X-Forwarded-Proto'] || 'http') +
      '://' + req.headers.host + req.originalUrl;

    // we use the path part of the url as the span name and add the full
    // url as a label
    transaction.addLabel(TraceLabels.HTTP_METHOD_LABEL_KEY, req.method);
    transaction.addLabel(TraceLabels.HTTP_URL_LABEL_KEY, url);
    transaction.addLabel(TraceLabels.HTTP_SOURCE_IP, req.connection.remoteAddress);

    var context = transaction.getTraceContext();
    if (context) {
      res.setHeader(constants.TRACE_CONTEXT_HEADER_NAME, context);
    } else {
      // TODO: Determine if this message is still needed
      // agent.logger.warn('Connect: Attempted to generate trace context for nullSpan');
    }

    // wrap end
    res.end = function(data, encoding, callback) {
      res.end = originalEnd;
      var returned = res.end(data, encoding, callback);

      if (req.route && req.route.path) {
        transaction.addLabel(
          'connect/request.route.path', req.route.path);
      }

      transaction.addLabel(
        TraceLabels.HTTP_RESPONSE_CODE_LABEL_KEY, res.statusCode);
      transaction.endSpan();

      return returned;
    };

    next();
  });
}

module.exports = [
  {
    file: '',
    versions: SUPPORTED_VERSIONS,
    intercept: function(connect, api) {
      return function() {
        var app = connect();
        app.use(middleware.bind(null, api));
        return app;
      };
    }
  }
];

