'use strict';
var TraceLabels = require('../../src/trace-labels.js');
var shimmer = require('shimmer');
var methods = require('methods').concat('use', 'route', 'param', 'all');

module.exports = function() {
  return {
    '': {
      patch: function(express, api) {
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
          var transaction = api.createTransaction(function getTraceContext(headerName) {
            return req.get(headerName);
          }, req.originalUrl);
          if (!transaction) {
            return next();
          }

          transaction.wrapEmitter(req);
          transaction.wrapEmitter(res);

          transaction.runRoot(req.path, function(addLabel, endRootSpan) {
            var originalEnd = res.end;
            var url = req.protocol + '://' + req.hostname + req.originalUrl;
            addLabel(TraceLabels.HTTP_METHOD_LABEL_KEY, req.method);
            addLabel(TraceLabels.HTTP_URL_LABEL_KEY, url);
            addLabel(TraceLabels.HTTP_SOURCE_IP, req.connection.remoteAddress);

            // wrap end
            res.end = function(chunk, encoding) {
              res.end = originalEnd;
              var returned = res.end(chunk, encoding);

              if (req.route && req.route.path) {
                addLabel('express/request.route.path', req.route.path);
              }
              addLabel(TraceLabels.HTTP_RESPONSE_CODE_LABEL_KEY, res.statusCode);
              endRootSpan();
              return returned;
            };

            next();
          }, function setTraceContext(headerName, header) {
            res.set(headerName, header);
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