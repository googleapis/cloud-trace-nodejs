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
var url = require('url');
var isString = require('is').string;
var merge = require('lodash.merge');
var httpAgent = require('_http_agent');
var TRACE_AGENT_REQUEST_HEADER = require('../constants.js').TRACE_AGENT_REQUEST_HEADER;

function isTraceAgentRequest (options) {
  return options && options.headers &&
    !!options.headers[TRACE_AGENT_REQUEST_HEADER];
}

function getSpanName(requestOptions) {
  if (isString(requestOptions)) {
    requestOptions = url.parse(requestOptions);
  }
  // c.f. _http_client.js ClientRequest constructor
  return requestOptions.hostname || requestOptions.host || 'localhost';
}

function setTraceHeader(parsedOptions, context, api) {
  if (context) {
    return merge(parsedOptions, {
      headers: {
        [api.labels.TRACE_CONTEXT_HEADER_NAME]: context
      }
    });
  }
  return parsedOptions;
}

function extractUrl(parsedOptions) {
  var uri = parsedOptions;
  var agent = parsedOptions._defaultAgent || httpAgent.globalAgent;
  return isString(uri) ? uri :
    (parsedOptions.protocol || agent.protocol) + '//' +
    (parsedOptions.hostname || parsedOptions.host || 'localhost') +
    ((isString(parsedOptions.port) ? (':' + parsedOptions.port) : '')) +
    (parsedOptions.path || parsedOptions.pathName || '/');
}

function parseRequestOptions(requestOptions) {
  return isString(requestOptions) ?
    merge({headers: {}}, url.parse(requestOptions)) :
    merge({headers: {}}, requestOptions);
}

function patchedHTTPRequest(requestOptions, callback, request, api) {
  if (!requestOptions) {
    return request.call(request, requestOptions, callback);
  } else if (isTraceAgentRequest(requestOptions)) {
    return request.call(request, requestOptions, callback);
  } else if (!api.getRootSpan()) {
    if (isString(requestOptions)) {
      requestOptions = url.parse(requestOptions);
    }
    // What's the new logger target?
    // console.log('Untraced http uri:', extractUrl(requestOptions));
    return request.call(request, requestOptions, callback);
  }
  var parsedOptions = parseRequestOptions(requestOptions);
  var uri = extractUrl(parsedOptions);
  var requestLifecycleSpan = api.createChildSpan({name: getSpanName(parsedOptions)});
  if (!requestLifecycleSpan) {
    // Bail out since we couldn't get a span
    return request.call(request, requestOptions, callback);
  }
  requestLifecycleSpan.addLabel(api.labels.HTTP_METHOD_LABEL_KEY,
    parsedOptions.method || 'GET');
  requestLifecycleSpan.addLabel(api.labels.HTTP_URL_LABEL_KEY, uri);
  parsedOptions = setTraceHeader(parsedOptions, requestLifecycleSpan.getTraceContext(), api);
  var req = request.call(request, parsedOptions, function (res) {
    api.wrapEmitter(res);
    var numBytes = 0;
    res.on('data', function (chunk) {
      numBytes += chunk.length;
    });
    res.on('end', function () {
      if (requestLifecycleSpan) {
        requestLifecycleSpan
          .addLabel(api.labels.HTTP_RESPONSE_SIZE_LABEL_KEY, numBytes);
        requestLifecycleSpan
          .addLabel(api.labels.HTTP_RESPONSE_CODE_LABEL_KEY, res.statusCode);
        requestLifecycleSpan.endSpan();
      }
    });
    if (callback) {
      return callback(res);
    }
  });
  api.wrapEmitter(req);
  req.on('error', function (e) {
    if (e && requestLifecycleSpan) {
      requestLifecycleSpan.addLabel(api.labels.ERROR_DETAILS_NAME, e.name);
      requestLifecycleSpan
        .addLabel(api.labels.ERROR_DETAILS_MESSAGE, e.message);
      requestLifecycleSpan.endSpan();
    } else if (!e) {
      // What's the new logger target?
      // console.error('HTTP request error was null or undefined', e);
    }
  });
  return req;
}

module.exports = [
  {
    file: 'http',
    patch: function (http, api) {
      ['request'].forEach(function (methodName) {
        shimmer.wrap(http, methodName, function (originalMethod) {
          return function (options, callback) {
            return patchedHTTPRequest(options, callback, originalMethod, api);
          };
        });
      });
    }
  }
];
