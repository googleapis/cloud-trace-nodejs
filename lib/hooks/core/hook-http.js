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
var url = require('url');
var shimmer = require('shimmer');
/** @type {TraceAgent} */
var agent;
var http;

// http.request
function requestWrap(request) {
  return function request_trace(options, callback) {
    if (!options) {
      return request.apply(this, arguments);
    }

    var localOptions = (typeof options === 'string') ?
      url.parse(options) : options;

    // Don't trace ourselves lest we get into infinite loops
    // Note: this would not be a problem if we guarantee buffering
    // of trace api calls. If there is no buffering then each trace is
    // an http call which will get a trace which will be an http call
    if (agent.isTraceAPIRequest(localOptions)) {
      return request.apply(this, arguments);
    }

    if (!cls.getRootContext()) {
      agent.logger_.warn('Cannot create http span outside of a supported framework.');
      return request.apply(this, arguments);
    }

    var namespace = cls.getNamespace();
    var uri = uriFromOptions(options);
    var methodLabel = {
      key: TraceLabels.HTTP_METHOD_LABEL_KEY,
      value: options.method
    };
    var urlLabel = {
      key: TraceLabels.HTTP_URL_LABEL_KEY,
      value: uri
    };
    var span = agent.startSpan(uri, [methodLabel, urlLabel]);
    if (options.headers) {
      // Adding context to the headers lets us trace the request
      // as it makes it through other layers of the Google infrastructure
      agent.addContextToHeaders(span, options.headers);
    }

    var returned = request.call(this, options, function(res) {
      namespace.bindEmitter(res);
      var numBytes = 0;
      res.on('data', function(chunk) {
        // We need this listener to hear end events
        numBytes += chunk.length;
      });
      res.on('end', function() {
        var sizeLabel = {
          key: TraceLabels.HTTP_RESPONSE_SIZE_LABEL_KEY,
          value: numBytes
        };
        var codeLabel = {
          key: TraceLabels.HTTP_RESPONSE_CODE_LABEL_KEY,
          value: res.statusCode
        };
        agent.endSpan(span, [sizeLabel, codeLabel]);
      });

      if (callback) {
        return callback(res);
      }
    });
    namespace.bindEmitter(returned);
    returned.on('error', function() {
      span.end();
    });
    return returned;
  };
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
    var path = options.path || options.pathname || '/';
    uri = protocol + '//' + host + path;
  }
  return uri;
}

module.exports = {
  /**
   * @param {object} http_ Node.js core http module
   * @param {TraceAgent} agent_
   */
  patch: function(http_, agent_) {
    if (!http) {
      agent = agent_;
      http = http_;
      shimmer.wrap(http, 'request', requestWrap);
    }
  },
  unpatch: function() {
    if (http) {
      shimmer.unwrap(http, 'request');
      http = null;
      agent = null;
    }
  }
};
