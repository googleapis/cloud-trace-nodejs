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

const cls = require('../../cls.js');
const TraceLabels = require('../../trace-labels.js');
const shimmer = require('shimmer');
const semver = require('semver');
const constants = require('../../constants.js');
var urlParse = require('url').parse;
var agent;

const SUPPORTED_VERSIONS = '1.x';

function useWrap(use) {
  return function useTrace() {
    if (!this._google_trace_patched) {
      this._google_trace_patched = true;
      this.use(middleware);
    }
    return use.apply(this, arguments);
  };
}

function* middleware(next) {
  /* jshint validthis:true */
  const namespace = cls.getNamespace();
  if (!namespace) {
    agent.logger.info('Koa: no namespace found, ignoring request');
    return;
  }
  const traceHeader = agent.parseContextFromHeader(
    this.req.headers[constants.TRACE_CONTEXT_HEADER_NAME]) || {};
  if (!agent.shouldTrace(this.req.url, traceHeader.options)) {
    return;
  }
  const req = this.req;
  const res = this.res;

  namespace.bindEmitter(req);
  namespace.bindEmitter(res);

  const originalEnd = res.end;

  namespace.run(function() {
    const rootContext = startRootSpanForRequest(req, traceHeader);
    const context = agent.generateTraceContext(rootContext, true);
    if (context) {
      res.setHeader(constants.TRACE_CONTEXT_HEADER_NAME, context);
    } else {
      agent.logger.warn('koa: Attempted to generate trace context for nullSpan');
    }

    // wrap end
    res.end = function(chunk, encoding) {
      res.end = originalEnd;
      const returned = res.end(chunk, encoding);

      endRootSpanForRequest(rootContext, req, res);
      return returned;
    };
    namespace.bind(next);
  });
  yield next;
}

/**
 * Creates and sets up a new root span for the given request.
 * @param {Object} req The request being processed.
 * @param {Object} traceHeader The incoming trace header.
 * @returns {!SpanData} The new initialized trace span data instance.
 */
function startRootSpanForRequest(req, traceHeader) {
  const traceId = traceHeader.traceId;
  const parentSpanId = traceHeader.spanId;
  const url = (req.headers['X-Forwarded-Proto'] || 'http') +
    '://' + req.headers.host + req.url;

  // we use the path part of the url as the span name and add the full
  // url as a label
  // req.path would be more desirable but is not set at the time our middlewear runs.
  const rootContext = agent.createRootSpanData(urlParse(req.url).pathname, traceId,
    parentSpanId, 3);
  rootContext.addLabel(TraceLabels.HTTP_METHOD_LABEL_KEY, req.method);
  rootContext.addLabel(TraceLabels.HTTP_URL_LABEL_KEY, url);
  rootContext.addLabel(TraceLabels.HTTP_SOURCE_IP, req.connection.remoteAddress);
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
    rootContext.addLabel(
      'koa/request.route.path', req.route.path);
  }
  rootContext.addLabel(
      TraceLabels.HTTP_RESPONSE_CODE_LABEL_KEY, res.statusCode);
  rootContext.close();
}

module.exports = function(version_, agent_) {
  if (!semver.satisfies(version_, SUPPORTED_VERSIONS)) {
    agent_.logger.info('Koa: unsupported version ' + version_ + ' loaded');
    return {};
  }
  return {
    // An empty relative path here matches the root module being loaded.
    '': {
      patch: function(koa) {
        agent = agent_;
        shimmer.wrap(koa.prototype, 'use', useWrap);
      },
      unpatch: function(koa) {
        shimmer.unwrap(koa.prototype, 'use');
        agent_.logger.info('Koa: unpatched');
      }
    }
  };
};
