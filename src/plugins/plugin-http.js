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
        return patchHTTPRequest(options, callback);
      }
      return request.apply(this, arguments);
    }
  }

  function parseRequestOptions (requestOptions) {
    return isString(requestOptions) ? url.parse(requestOptions) :
      // Don't mutate user given objects
      merge({}, requestOptions);
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

  function patchHTTPRequest (requestOptions, callback) {
    var parsedOptions = parseRequestOptions(requestOptions);
    var uri = extractUrl(parsedOptions);
    var labels = {};
    api.runInRootSpan(options, function (transaction) {
      if (!transaction) {
        return request.apply(this, arguments);
      }
      merge(labels, {
        [api.labels.HTTP_METHOD_LABEL_KEY]: parsedOptions.method,
        [api.labels.HTTP_URL_LABEL_KEY]: uri
      });
      api.runInChildSpan()
    });
  }
}
