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

'use strict';
var shimmer = require('shimmer');
var methods = require('methods').concat('use', 'route', 'param', 'all');

var SUPPORTED_VERSIONS = '4.x';

function patchModuleRoot(express, api) {
  var labels = api.labels;
  function applicationActionWrap(method) {
    return function expressActionTrace() {
      if (!this._google_trace_patched && !this._router) {
        this._google_trace_patched = true;
        this.use(middleware);
      }
      return method.apply(this, arguments);
    };
  }

  function middleware(req, res, next) {
    var options = {
      name: req.path,
      traceContext: req.get(api.constants.TRACE_CONTEXT_HEADER_NAME),
      url: req.originalUrl,
      skipFrames: 3
    };
    api.runInRootSpan(options, function(transaction) {
      if (!transaction) {
        next();
        return;
      }

      // Set outgoing trace context.
      res.set(api.constants.TRACE_CONTEXT_HEADER_NAME,
        transaction.getTraceContext());

      api.wrapEmitter(req);
      api.wrapEmitter(res);

      var url = req.protocol + '://' + req.hostname + req.originalUrl;
      transaction.addLabel(labels.HTTP_METHOD_LABEL_KEY, req.method);
      transaction.addLabel(labels.HTTP_URL_LABEL_KEY, url);
      transaction.addLabel(labels.HTTP_SOURCE_IP, req.connection.remoteAddress);

      // wrap end
      var originalEnd = res.end;
      res.end = function(chunk, encoding) {
        res.end = originalEnd;
        var returned = res.end(chunk, encoding);

        if (req.route && req.route.path) {
          transaction.addLabel('express/request.route.path', req.route.path);
        }
        transaction.addLabel(labels.HTTP_RESPONSE_CODE_LABEL_KEY, res.statusCode);
        transaction.endSpan();
        return returned;
      };

      next();
    });
  }

  methods.forEach(function(method) {
    shimmer.wrap(express.application, method, applicationActionWrap);
  });
  express._plugin_patched = true;
}

module.exports = [
  { versions: SUPPORTED_VERSIONS, patch: patchModuleRoot }
];