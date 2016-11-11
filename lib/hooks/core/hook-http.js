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

// HTTP Client
var httpAgent = require('_http_agent');
var cls = require('../../cls.js');
var TraceLabels = require('../../trace-labels.js');
var SpanData = require('../../span-data.js');
var constants = require('../../constants.js');
var util = require('util');
var url = require('url');
var shimmer = require('shimmer');
var agent;

// http.request
function requestWrap(request) {
  return function request_trace(options, callback) {
    if (!options) {
      return request.apply(this, arguments);
    }

    // Don't trace ourselves lest we get into infinite loops
    // Note: this would not be a problem if we guarantee buffering
    // of trace api calls. If there is no buffering then each trace is
    // an http call which will get a trace which will be an http call
    if (agent.isTraceAgentRequest(options)) {
      return request.apply(this, arguments);
    }

    var root = cls.getRootContext();

    if (!root) {
      if (typeof options === 'string') {
        options = url.parse(options);
      }
      agent.logger.debug('Untraced http uri:', uriFromOptions(options));
      return request.apply(this, arguments);
    } else if (root === SpanData.nullSpan) {
      return request.apply(this, arguments);
    }

    options = (typeof options === 'string') ?
      url.parse(options) : clone(options);
    options.headers = options.headers || {};

    var namespace = cls.getNamespace();
    var uri = uriFromOptions(options);
    var labels = {};
    labels[TraceLabels.HTTP_METHOD_LABEL_KEY] = options.method;
    labels[TraceLabels.HTTP_URL_LABEL_KEY] = uri;
    var span = agent.startSpan(getSpanName(options), labels);
    // Adding context to the headers lets us trace the request
    // as it makes it through other layers of the Google infrastructure
    var context = agent.generateTraceContext(span, true);
    if (context) {
      options.headers[constants.TRACE_CONTEXT_HEADER_NAME] = context;
    } else {
      agent.logger.warn('http: Attempted to generate trace context for nullSpan');
    }

    var returned = request.call(this, options, function(res) {
      namespace.bindEmitter(res);
      var numBytes = 0;
      res.on('data', function(chunk) {
        // We need this listener to hear end events
        numBytes += chunk.length;
      });
      res.on('end', function() {
        var labels = {};
        labels[TraceLabels.HTTP_RESPONSE_SIZE_LABEL_KEY] = numBytes;
        labels[TraceLabels.HTTP_RESPONSE_CODE_LABEL_KEY] = res.statusCode;
        agent.endSpan(span, labels);
      });

      if (callback) {
        return callback(res);
      }
    });
    namespace.bindEmitter(returned);
    returned.on('error', function(e) {
      var labels = {};
      if (e) {
        labels[TraceLabels.ERROR_DETAILS_NAME] = e.name;
        labels[TraceLabels.ERROR_DETAILS_MESSAGE] = e.message;
      } else {
        agent.logger.error('HTTP Request error was null or undefined');
      }
      agent.endSpan(span, labels);
    });
    return returned;
  };
}

function clone(o) {
  var r = {};
  util._extend(r, o);
  return r;
}

function getSpanName(options) {
  if (typeof options === 'string') {
    options = url.parse(options);
  }
  // c.f. _http_client.js ClientRequest constructor
  return options.hostname || options.host || 'localhost';
}

function uriFromOptions(options) {
  var uri;
  if (typeof options === 'string') {
    uri = options;
  } else {
    // In theory we should use url.format here. However, that is
    // broken. See: https://github.com/joyent/node/issues/9117 and
    // https://github.com/nodejs/io.js/pull/893
    // Let's do things the same way _http_client does it.
    //
    var defaultAgent = options._defaultAgent || httpAgent.globalAgent;
    var protocol = options.protocol || defaultAgent.protocol;
    var host = options.hostname || options.host || 'localhost';
    var port = options.port ? (':' + options.port) : '';
    var path = options.path || options.pathname || '/';
    uri = protocol + '//' + host + port + path;
  }
  return uri;
}

module.exports = function(version_, agent_) {
  return {
    'http': {
      patch: function(http) {
        agent = agent_;
        shimmer.wrap(http, 'request', requestWrap);
      },
      unpatch: function(http) {
        shimmer.unwrap(http, 'request');
        agent_.logger.info('http: unpatched');
      }
    }
  };
};
