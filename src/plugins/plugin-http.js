'use strict';
var shimmer = require('shimmer');
var url = require('url');
var isString = require('is').string;
var merge = require('lodash.merge');
var httpAgent = require('_http_agent');

function patchModuleRoot (request, api) {
  var labels = api.labels;
  function wrapInvocation (options, callback) {
    return function httpActionTrace () {
      if (!this._google_trace_patched && options) {
        // Don't keep wrapping our same request
        this._google_trace_patched = true;
        return patchHTTPRequest(options, callback, request);
      }
      return request.apply(this, arguments);
    }
  }

  function setTraceHeader (parsedOptions, context) {
    if (context) {
      return merge(parsedOptions, {
        headers: {
          [TraceLabels.TRACE_CONTEXT_HEADER_NAME]: context
        }
      });
    }
    return parsedOptions;
  }

  function parseRequestOptions (requestOptions) {
    return isString(requestOptions) ?
      merge(url.parse(requestOptions), {headers: {}}) :
      merge({headers: {}}, requestOptions);
  }

  function extractUrl (parsedOptions) {
    var uri = parsedOptions;
    var agent = parsedOptions._defaultAgent || httpAgent.globalAgent;
    return isString(uri) ? uri :
      (parsedOptions.protocol || agent.protocol) + '//' +
      (parsedOptions.hostname || parsedOptions.host || 'localhost') +
      ((isString(parsedOptions.port) ? (':' + parsedOptions.port) : '')) +
      (parsedOptions.path || parseRequestOptions.pathName || '/');
  }

  function getSpanName (requestOptions) {
    if (isString(options)) {
      options = url.parse(requestOptions);
    }
    // c.f. _http_client.js ClientRequest constructor
    return options.hostname || options.host || 'localhost';
  }

  function patchHTTPRequest (requestOptions, callback, request) {
    var parsedOptions = parseRequestOptions(requestOptions);
    var uri = extractUrl(parsedOptions);
    var transaction = api.createTransaction({
      name: 'http',
      url: uri
    });
    var downloadSpan;
    var connectSpan = api.createChildSpan({name: 'http', url: uri})
      .addLabel(TraceLabels.HTTP_METHOD_LABEL_KEY, parsedOptions.method)
      .addLabel(TraceLabels.HTTP_URL_LABEL_KEY, uri);
    parsedOptions = setTraceHeader(parsedOptions, transaction.getTraceContext());
    var req = api.wrapEmitter(
      request.call(request, requestOptions, function (res) {
        api.wrapEmitter(res);
        var numBytes = 0;
        res.on('data', function (chunk) {
          numBytes += chunk.length;
        });
        res.on('end', function () {
          downloadSpan
            .addLabel(TraceLabels.HTTP_RESPONSE_SIZE_LABEL_KEY, numBytes);
          downloadSpan
            .addLabel(TraceLabels.HTTP_RESPONSE_CODE_LABEL_KEY, res.statusCode);
          downloadSpan.endSpan();
          transaction.endSpan();
        });
        if (callback) {
          return callback(res);
        }
      })
    );
    req.on('connect', function () {
      connectSpan.endSpan();
      downloadSpan = api.createChildSpan({
        name: 'http',
        url: uri
      });
    });
    req.on('error', function (e) {
      var labels = {};
      if (e) {
        connectSpan.addLabel(TraceLabels.ERROR_DETAILS_NAME, e.name);
        connectSpan
          .addLabel(TraceLabels.ERROR_DETAILS_MESSAGE, e.message);
      } else {
        console.error('HTTP request error was null or undefined');
      }
      connectSpan.endSpan();
      transaction.endSpan();
    });
    return req;
  }
}

module.exports = [
  {
    file: 'http',
    patch: function (http, api) {
      shimmer.wrap(http, 'request', patchModuleRoot)
    }
  }
];
