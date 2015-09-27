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
var hapi;

var SUPPORTED_VERSIONS = '8.8.x';

function connectionWrap(connection) {
  return function connectionTrace() {
    var server = connection.apply(this, arguments);
    server.ext('onRequest', middleware);
    return server;
  };
}

function middleware(request, reply) {
  var namespace = cls.getNamespace();
  if (!namespace) {
    return reply.continue();
  }
  var req = request.raw.req;
  var res = request.raw.res;

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

    return reply.continue();
  });
}

/**
 * Creates and sets up a new root span for the given request.
 * @param {Object} req The request being processed.
 * @returns {!SpanData} The new initialized trace span data instance.
 */
function startRootSpanForRequest(req) {
  var result = agent.parseContextFromHeader(
    req.headers[constants.TRACE_CONTEXT_HEADER_NAME]) || {};

  var traceId = result.traceId;
  var parentSpanId = result.spanId;
  var url = (req.headers['X-Forwarded-Proto'] || 'http') +
    '://' + req.headers.host + req.url;

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
      'hapi/request.route.path', req.route.path);
  }
  rootContext.span.setLabel(
      TraceLabels.HTTP_RESPONSE_CODE_LABEL_KEY, res.statusCode);
  rootContext.close();
}

module.exports = {
  patch: function(hapi_, agent_, version_) {
    if (!semver.satisfies(version_, SUPPORTED_VERSIONS)) {
      return;
    }
    if (!hapi) {
      agent = agent_;
      hapi = hapi_;
      shimmer.wrap(hapi.Server.prototype, 'connection', connectionWrap);
    }
  },
  unpatch: function() {
    if (hapi) {
      shimmer.unwrap(hapi.Server.prototype, 'connection');
      hapi = null;
      agent = null;
    }
  }
};
