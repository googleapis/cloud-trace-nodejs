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
var semver = require('semver');
var constants = require('../../constants.js');
var agent;

var SUPPORTED_VERSIONS = '<=4.x';

// restify.createServer
function createServerWrap(createServer) {
  return function createServerTrace() {
    var server = createServer.apply(this, arguments);
    server.use(middleware);
    return server;
  };
}

function middleware(req, res, next) {
  var namespace = cls.getNamespace();
  if (!namespace) {
    agent.logger.info('Restify: no namespace found, ignoring request');
    return next();
  }
  var traceHeader = agent.parseContextFromHeader(
    req.header(constants.TRACE_CONTEXT_HEADER_NAME, null)) || {};
  if (!agent.shouldTrace(req.url, traceHeader.options)) {
    return next();
  }

  namespace.bindEmitter(req);
  namespace.bindEmitter(res);

  var originalEnd = res.end;

  namespace.run(function() {
    var rootContext = startRootSpanForRequest(req, traceHeader);
    var context = agent.generateTraceContext(rootContext, true);
    if (context) {
      res.header(constants.TRACE_CONTEXT_HEADER_NAME, context);
    } else {
      agent.logger.warn('restify: Attempted to generate trace context for nullSpan');
    }

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
 * @param {Object} traceHeader The incoming trace header.
 * @returns {!SpanData} The new initialized trace span data instance.
 */
function startRootSpanForRequest(req, traceHeader) {
  var traceId = traceHeader.traceId;
  var parentSpanId = traceHeader.spanId;
  var url = req.header('X-Forwarded-Proto', 'http') + '://' +
    req.header('host') + req.url;

  // we use the path part of the url as the span name and add the full
  // url as a label
  var rootContext = agent.createRootSpanData(req.path(), traceId, parentSpanId, 3);
  rootContext.addLabel(TraceLabels.HTTP_METHOD_LABEL_KEY, req.method);
  rootContext.addLabel(TraceLabels.HTTP_URL_LABEL_KEY, url);
  rootContext.addLabel(TraceLabels.HTTP_SOURCE_IP, req.connection.remoteAddress);
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
    rootContext.addLabel(
      'restify/request.route.path', req.route.path);
  }
  rootContext.addLabel(
      TraceLabels.HTTP_RESPONSE_CODE_LABEL_KEY, res.statusCode);
  rootContext.close();
}

module.exports = function(version_, agent_) {
  if (!semver.satisfies(version_, SUPPORTED_VERSIONS)) {
    agent_.logger.info('Restify: unsupported version ' + version_ + ' loaded');
    return {};
  }
  return {
    // An empty relative path here matches the root module being loaded.
    '': {
      patch: function(restify) {
        agent = agent_;
        shimmer.wrap(restify, 'createServer', createServerWrap);
      },
      unpatch: function(restify) {
        shimmer.unwrap(restify, 'createServer');
        agent_.logger.info('Restify: unpatched');
      }
    }
  };
};
