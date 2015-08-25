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
var agent;
var restify;

// restify.createServer
function createServerWrap(createServer) {
  return function createServerTrace() {
    var server = createServer.apply(this, arguments);
    server.use(middleware);
    return server;
  };
}

function middleware(req, res, next) {
  var originalEnd = res.end;

  var namespace = cls.getNamespace();
  namespace.bindEmitter(req);
  namespace.bindEmitter(res);

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
    req.header(agent.TRACE_CONTEXT_HEADER_NAME, null)) || {};

  var traceId = result.traceId;
  var parentSpanId = result.spanId;
  var url = req.header('X-Forwarded-Proto', 'http') + '://' +
    req.header('host') + req.url;

  // we use the path part of the url as the span name and add the full
  // url as a label
  var rootContext = agent.createRootSpanData(req.url, traceId, parentSpanId);
  rootContext.span.setLabel(TraceLabels.HTTP_METHOD_LABEL_KEY, req.method);
  rootContext.span.setLabel(TraceLabels.HTTP_URL_LABEL_KEY, url);
  return rootContext;
}


/**
 * Ends the root span for the given request.
 * @param {!SpanData} rootContext The trace context to close out.
 * @param {Object} req The request being processed.
 * @param {Object} res The response being processed.
 */
function endRootSpanForRequest(rootContext, req, res) {
  if (req.route && req.route.path) {
    rootContext.span.setLabel(
      'restify/request.route.path', req.route.path);
  }
  rootContext.span.setLabel(
      TraceLabels.HTTP_RESPONSE_CODE_LABEL_KEY, res.statusCode);
  rootContext.close();
}

module.exports = {
  patch: function(restify_, agent_) {
    // TODO(mattloring): version check
    if (!restify) {
      agent = agent_;
      restify = restify_;
      shimmer.wrap(restify, 'createServer', createServerWrap);
    }
  },
  unpatch: function() {
    if (restify) {
      shimmer.unwrap(restify, 'createServer');
      restify = null;
      agent = null;
    }
  }
};
