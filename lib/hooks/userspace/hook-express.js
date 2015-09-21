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

var cls = require('../../cls.js');
var TraceLabels = require('../../trace-labels.js');
var shimmer = require('shimmer');
var patchedMethods = require('methods');
patchedMethods.push('use', 'route', 'param', 'all');
var constants = require('../../constants.js');
var agent;
var express;

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
  var namespace = cls.getNamespace();
  if (!namespace) {
    return next();
  }
  namespace.bindEmitter(req);
  namespace.bindEmitter(res);

  var originalEnd = res.end;

  namespace.run(function() {
    var rootContext = startRootSpanForRequest(req);

    // wrap end
    res.end = function(chunk, encoding) {
      res.end = originalEnd;
      var returned = res.end(chunk, encoding);

      endRootSpanForRequest(rootContext, req, res);
      return returned;
    };

    next();
  });
}

/**
 * Creates and sets up a new root span for the given request.
 * @param {Object} req The request being processed.
 * @returns {!SpanData} The new initialized trace span data instance.
 */
function startRootSpanForRequest(req) {
  var result = agent.parseContextFromHeader(
    req.get(constants.TRACE_CONTEXT_HEADER_NAME)) || {};

  var traceId = result.traceId;
  var parentSpanId = result.spanId;
  var url = req.protocol + '://' + req.hostname + req.originalUrl;

  // we use the path part of the url as the span name and add the full
  // url as a label
  var rootContext = agent.createRootSpanData(req.originalUrl, traceId,
    parentSpanId);
  rootContext.span.setLabel(TraceLabels.HTTP_METHOD_LABEL_KEY, req.method);
  rootContext.span.setLabel(TraceLabels.HTTP_URL_LABEL_KEY, url);
  return rootContext;
}


/**
 * Ends the root span for the given request.
 * @param {!SpanData} rootContext The span to close out.
 * @param {Object} req The request being processed.
 * @param {Object} res The response being processed.
 */
function endRootSpanForRequest(rootContext, req, res) {
  if (req.route && req.route.path) {
    rootContext.span.setLabel(
      'express/request.route.path', req.route.path);
  }
  rootContext.span.setLabel(
      TraceLabels.HTTP_RESPONSE_CODE_LABEL_KEY, res.statusCode);
  rootContext.close();
}

module.exports = {
  patch: function(express_, agent_) {
    // We only support express v4. In the past express exported a version property
    // that would have been great for this purpose, but v3.x removed it. Instead
    // we rely on 'createServer' export that was removed in v4.
    // See: https://github.com/strongloop/express/wiki/Migrating-from-3.x-to-4.x
    if (typeof module.createServer !== 'undefined') {
      return;
    }
    if (!express) {
      agent = agent_;
      express = express_;
      patchedMethods.forEach(function(method) {
        shimmer.wrap(express.application, method, applicationActionWrap);
      });
    }
  },
  unpatch: function() {
    if (express) {
      patchedMethods.forEach(function(method) {
        shimmer.unwrap(express.application, method);
      });
      express = null;
      agent = null;
    }
  }
};
