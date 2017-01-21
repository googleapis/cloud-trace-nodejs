'use strict';
var TraceLabels = require('../../src/trace-labels.js');
var shimmer = require('shimmer');
var semver = require('semver');
var methods = require('methods').concat('use', 'route', 'param', 'all');

var SUPPORTED_VERSIONS = '4.x';

module.exports = function(version, api) {
  if (!semver.satisfies(version, SUPPORTED_VERSIONS)) {
    return {};
  }
  return {
    '': {
      patch: function(express) {
        function applicationActionWrap(method) {
          return function expressActionTrace() {
            if (!this._google_trace_patched && !this._router) {
              this._google_trace_patched = true;
              this.use(middleware);
            }
            return method.apply(this, arguments);
          };
        }

        function middleware(req, res, next) {
          var options = {
            name: req.path,
            getHeader: function (headerName) { return req.get(headerName); },
            setHeader: function (headerName, header) { res.set(headerName, header); },
            url: req.originalUrl,
            skipFrames: 3
          };
          api.runInRootSpan(options, function(transaction) {
            if (!transaction) {
              next();
              return;
            }

            api.wrapEmitter(req);
            api.wrapEmitter(res);

            var url = req.protocol + '://' + req.hostname + req.originalUrl;
            transaction.addLabel(TraceLabels.HTTP_METHOD_LABEL_KEY, req.method);
            transaction.addLabel(TraceLabels.HTTP_URL_LABEL_KEY, url);
            transaction.addLabel(TraceLabels.HTTP_SOURCE_IP, req.connection.remoteAddress);

            // wrap end
            var originalEnd = res.end;
            res.end = function(chunk, encoding) {
              res.end = originalEnd;
              var returned = res.end(chunk, encoding);

              if (req.route && req.route.path) {
                transaction.addLabel('express/request.route.path', req.route.path);
              }
              transaction.addLabel(TraceLabels.HTTP_RESPONSE_CODE_LABEL_KEY, res.statusCode);
              transaction.endSpan();
              return returned;
            };

            next();
          });
        }

        methods.forEach(function(method) {
          shimmer.wrap(express.application, method, applicationActionWrap);
        });
        express._plugin_patched = true;
      },
      unpatch: function(express) {
        // TODO(kjin): not implemented
      }
    }
  };
};