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
var url = require('url');
var isString = require('is').string;
var merge = require('lodash.merge');
var httpAgent = require('_http_agent');

function getSpanName(options) {
  if (isString(options)) {
    options = url.parse(options);
  }
  // c.f. _http_client.js ClientRequest constructor
  return options.hostname || options.host || 'localhost';
}

function extractUrl(options) {
  var uri = options;
  var agent = options._defaultAgent || httpAgent.globalAgent;
  // In theory we should use url.format here. However, that is
  // broken. See: https://github.com/joyent/node/issues/9117 and
  // https://github.com/nodejs/io.js/pull/893
  // Let's do things the same way _http_client does it.
  return isString(uri) ? uri :
    (options.protocol || agent.protocol) + '//' +
    (options.hostname || options.host || 'localhost') +
    ((isString(options.port) ? (':' + options.port) : '')) +
    (options.path || options.pathName || '/');
}

function patchRequest (http, api) {
  return shimmer.wrap(http, 'request', function requestWrap(request) {
    return function request_trace(options, callback) {
      if (!options) {
        return request.apply(this, arguments);
      }

      // Don't trace ourselves lest we get into infinite loops
      // Note: this would not be a problem if we guarantee buffering
      // of trace api calls. If there is no buffering then each trace is
      // an http call which will get a trace which will be an http call
      if (isTraceAgentRequest(options)) {
        return request.apply(this, arguments);
      }

      options = isString(options) ? url.parse(options) : merge({}, options);
      options.headers = options.headers || {};

      var uri = extractUrl(options);
      var requestLifecycleSpan =
          api.createChildSpan({name: getSpanName(options)});
      if (!requestLifecycleSpan) {
        return request.apply(this, arguments);
      }

      requestLifecycleSpan.addLabel(api.labels.HTTP_METHOD_LABEL_KEY,
                                    options.method);
      requestLifecycleSpan.addLabel(api.labels.HTTP_URL_LABEL_KEY, uri);
      options.headers[api.constants.TRACE_CONTEXT_HEADER_NAME] =
          requestLifecycleSpan.getTraceContext();
      var req = request.call(this, options, function(res) {
        api.wrapEmitter(res);
        var numBytes = 0;
        var listenerAttached = false;
        // Responses returned by http#request are yielded in paused mode. Attaching
        // a 'data' listener to the request will switch the stream to flowing mode
        // which could cause the request to drain before the calling framework has
        // a chance to attach their own listeners. To avoid this, we attach our listener
        // lazily.
        // This approach to tracking data size will not observe data read by
        // explicitly calling `read` on the request. We expect this to be very
        // uncommon as it is not mentioned in any of the official documentation.
        shimmer.wrap(res, 'on', function onWrap(on) {
          return function on_trace(eventName, cb) {
            if (eventName === 'data' && !listenerAttached) {
              on.call(this, 'data', function(chunk) {
                numBytes += chunk.length;
              });
            }
            on.apply(this, arguments);
          };
        });
        res.on('end', function () {
          requestLifecycleSpan
            .addLabel(api.labels.HTTP_RESPONSE_SIZE_LABEL_KEY, numBytes);
          requestLifecycleSpan
            .addLabel(api.labels.HTTP_RESPONSE_CODE_LABEL_KEY, res.statusCode);
          requestLifecycleSpan.endSpan();
        });
        if (callback) {
          return callback(res);
        }
      });
      api.wrapEmitter(req);
      req.on('error', function (e) {
        if (e) {
          requestLifecycleSpan.addLabel(api.labels.ERROR_DETAILS_NAME, e.name);
          requestLifecycleSpan
            .addLabel(api.labels.ERROR_DETAILS_MESSAGE, e.message);
        } else {
          // What's the new logger target?
          // console.error('HTTP request error was null or undefined', e);
        }
        requestLifecycleSpan.endSpan();
      });
      return req;
    };
  });

  function isTraceAgentRequest (options) {
    return options && options.headers &&
      !!options.headers[api.constants.TRACE_AGENT_REQUEST_HEADER];
  }

}

module.exports = [
  {
    file: 'http',
    patch: patchRequest,
    unpatch: function (http) {
      shimmer.unwrap(http, 'request');
    }
  }
];
