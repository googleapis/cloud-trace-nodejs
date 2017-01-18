'use strict';
var TraceLabels = require('../../src/trace-labels.js');
var shimmer = require('shimmer');
var semver = require('semver');
var findIndex = require('lodash.findindex');

var api;

var SUPPORTED_VERSIONS = '0.13 - 1';

// # Client

function makeClientMethod(method) {
  return function clientMethodTrace() {
    var that = this;
    var args = Array.prototype.slice.call(arguments);
    // The span name will be of form "grpc:/[Service]/[MethodName]".
    api.runInChildSpan({
      name: 'grpc:' + method.path
    }, function(span) {
      if (!span) {
        return method.apply(this, args);
      }
      // Check if the response is through a stream or a callback.
      if (!method.responseStream) {
        // We need to wrap the callback with the context, to propagate it.
        // The callback is always required. It should be the only function in the
        // arguments, since we cannot send a function as an argument through gRPC.
        var cbIndex = findIndex(args, function(arg) {
          return typeof arg === 'function';
        });
        if (cbIndex !== -1) {
          args[cbIndex] = wrapCallback(span, args[cbIndex]);
        }
      }
      var call = method.apply(that, args);
      // Add extra data only when call successfully goes through. At this point
      // we know that the arguments are correct.
      if (api.config.enhancedDatabaseReporting) {
        // This finds an instance of Metadata among the arguments.
        // A possible issue that could occur is if the 'options' parameter from
        // the user contains an '_internal_repr' as well as a 'getMap' function,
        // but this is an extremely rare case.
        var metaIndex = findIndex(args, function(arg) {
          return arg && typeof arg === 'object' && arg._internal_repr &&
              typeof arg.getMap === 'function';
        });
        if (metaIndex !== -1) {
          var metadata = args[metaIndex];
          span.addLabel('metadata', JSON.stringify(metadata.getMap()));
        }
        if (!method.requestStream) {
          span.addLabel('argument', JSON.stringify(args[0]));
        }
      }
      // The user might need the current context in listeners to this stream.
      api.wrapEmitter(call);
      if (method.responseStream) {
        var spanEnded = false;
        call.on('error', function(err) {
          if (api.config.enhancedDatabaseReporting) {
            span.addLabel('error', err);
          }
          if (!spanEnded) {
            span.endSpan();
            spanEnded = true;
          }
        });
        call.on('status', function(status) {
          if (api.config.enhancedDatabaseReporting) {
            span.addLabel('status', JSON.stringify(status));
          }
          if (!spanEnded) {
            span.endSpan();
            spanEnded = true;
          }
        });
      }
      return call;
    });
  };
}

/**
 * Wraps a callback so that the current span for this trace is also ended when
 * the callback is invoked.
 * @param {SpanData} span - The span that should end after this callback.
 * @param {function(?Error, value=)} done - The callback to be wrapped.
 */
function wrapCallback(span, done) {
  var fn = function(err, res) {
    if (api.config.enhancedDatabaseReporting) {
      if (err) {
        span.addLabel('error', err);
      }
      if (res) {
        span.addLabel('result', JSON.stringify(res));
      }
    }
    span.endSpan();
    done(err, res);
  };
  return fn;
}

function makeClientConstructorWrap(makeClientConstructor) {
  return function makeClientConstructorTrace(methods) {
    var Client = makeClientConstructor.apply(this, arguments);
    shimmer.massWrap(Client.prototype, Object.keys(methods), makeClientMethod);
    return Client;
  };
}

// # Server

/**
 * A helper function to record metadata in a trace span. The return value of this
 * function can be used as the 'wrapper' argument to wrap sendMetadata.
 * sendMetadata is a member of each of ServerUnaryCall, ServerWriteableStream,
 * ServerReadableStream, and ServerDuplexStream.
 * @param rootContext The span object to which the metadata should be added.
 * @returns {Function} A function that returns a wrapped form of sendMetadata.
 */
function sendMetadataWrapper(transaction) {
  return function (sendMetadata) {
    return function sendMetadataTrace(responseMetadata) {
      transaction.addLabel('metadata', JSON.stringify(responseMetadata.getMap()));
      return sendMetadata.apply(this, arguments);
    };
  };
}

/**
 * Wraps a unary function in order to record trace spans.
 * @param {Object} handlerSet An object containing references to the function handle,
 * as well as serialize and deserialize handles.
 * @param {string} requestName The human-friendly name of the request.
 */
function wrapUnary(handlerSet, requestName) {
  // Start right before deserialization
  // End right after serialization
  shimmer.wrap(handlerSet, 'deserialize', api.wrap(function (deserialize) {
    return api.wrap(function deserializeTrace() {
      api.createTransaction({ name: requestName });
      return deserialize.apply(this, arguments);
    });
  }));
  // Even though our root span doesn't start or end here,
  // we need to wrap 'func' so that:
  // (1) child spans have the correct context, and
  // (2) we can get additional labels as needed
  shimmer.wrap(handlerSet, 'func', api.wrap(function (func) {
    return api.wrap(function funcTrace(call, callback) {
      var transaction = api.getTransaction();
      if (!transaction) {
        return func.apply(this, arguments);
      }
      transaction.addLabel(TraceLabels.HTTP_METHOD_LABEL_KEY, 'POST');
      if (api.config.enhancedDatabaseReporting) {
        shimmer.wrap(call, 'sendMetadata', sendMetadataWrapper(transaction));
      }
      if (api.config.enhancedDatabaseReporting) {
        transaction.addLabel('argument', JSON.stringify(call.request));
      }
      // arguments[1] is the callback
      arguments[1] = function (err, result, trailer, flags) {
        if (api.config.enhancedDatabaseReporting) {
          if (err) {
            transaction.addLabel('error', err);
          } else {
            transaction.addLabel('result', JSON.stringify(result));
          }
          if (trailer) {
            transaction.addLabel('trailing_metadata', JSON.stringify(trailer.getMap()));
          }
        }
        if (err) {
          // If there is an error, then no result will be serialized to
          // be sent back to the client. So end the root span here.
          transaction.endSpan();
        }
        return callback(err, result, trailer, flags);
      };
      return func.apply(this, arguments);
    });
  }));
  shimmer.wrap(handlerSet, 'serialize', function (serialize) {
    return function serializeTrace() {
      var serializeResult = serialize.apply(this, arguments);
      var transaction = api.getTransaction();
      if (transaction) {
        transaction.endSpan();
      }
      return serializeResult;
    };
  });
}

/**
 * Wraps a server streaming function in order to record trace spans.
 * @param {Object} handlerSet An object containing references to the function handle,
 * as well as serialize and deserialize handles.
 * @param {string} requestName The human-friendly name of the request.
 */
function wrapServerStream(handlerSet, requestName) {
  // Start right before deserialization (which precedes call to function)
  // End right after output stream 'finish' event
  shimmer.wrap(handlerSet, 'deserialize', function (deserialize) {
    return function deserializeTrace() {
      api.createTransaction({ name: requestName });
      return deserialize.apply(this, arguments);
    };
  });
  shimmer.wrap(handlerSet, 'func', function (func) {
    return function funcTrace(call) {
      var transaction = api.getTransaction();
      if (!transaction) {
        return func.apply(this, arguments);
      }
      transaction.addLabel(TraceLabels.HTTP_METHOD_LABEL_KEY, 'POST');
      if (api.config.enhancedDatabaseReporting) {
        shimmer.wrap(call, 'sendMetadata', sendMetadataWrapper(transaction));
      }
      if (api.config.enhancedDatabaseReporting) {
        transaction.addLabel('argument', JSON.stringify(call.request));
      }
      var spanEnded = false;
      var endSpan = function () {
        if (!spanEnded) {
          spanEnded = true;
          transaction.endSpan();
        }
      };
      call.on('finish', function () {
        // End the span unless there is an error.
        if (call.status.code === 0) {
          endSpan();
        }
      });
      call.on('error', function (err) {
        if (api.config.enhancedDatabaseReporting) {
          transaction.addLabel('error', err);
        }
        endSpan();
      });
      return func.apply(this, arguments);
    };
  });
}

/**
 * Wraps a client streaming function in order to record trace spans.
 * @param {Object} handlerSet An object containing references to the function handle,
 * as well as serialize and deserialize handles.
 * @param {string} requestName The human-friendly name of the request.
 */
function wrapClientStream(handlerSet, requestName) {
  // Start right before call to function
  // End right after serialization (which is done in the callback)
  shimmer.wrap(handlerSet, 'func', function (func) {
    return function funcTrace(stream, callback) {
      var transaction = api.createTransaction({ name: requestName });
      if (!transaction) {
        return func.apply(this, arguments);
      }
      transaction.addLabel(TraceLabels.HTTP_METHOD_LABEL_KEY, 'POST');
      if (api.config.enhancedDatabaseReporting) {
        shimmer.wrap(stream, 'sendMetadata', sendMetadataWrapper(transaction));
      }
      // Preserve context in stream event handlers.
      api.wrapEmitter(stream);
      // arguments[1] is the callback
      arguments[1] = function (err, result, trailer, flags) {
        if (api.config.enhancedDatabaseReporting) {
          if (err) {
            transaction.addLabel('error', err);
          } else {
            transaction.addLabel('result', JSON.stringify(result));
          }
          if (trailer) {
            transaction.addLabel('trailing_metadata', JSON.stringify(trailer.getMap()));
          }
        }
        if (err) {
          // If there is an error, then no result will be serialized to
          // be sent back to the client. So end the root span here.
          transaction.endSpan();
        }
        return callback(err, result, trailer, flags);
      };
      return func.apply(this, arguments);
    };
  });
  shimmer.wrap(handlerSet, 'serialize', function (serialize) {
    return function serializeTrace(result) {
      var serializeResult = serialize.apply(this, arguments);
      var transaction = api.getTransaction();
      if (transaction) {
        transaction.endSpan();
      }
      return serializeResult;
    };
  });
}

/**
 * Wraps a bidirectional streaming function in order to record trace spans.
 * @param {Object} handlerSet An object containing references to the function handle,
 * as well as serialize and deserialize handles.
 * @param {string} requestName The human-friendly name of the request.
 */
function wrapBidi(handlerSet, requestName) {
  // Start right before call to function
  // End right after output stream 'finish' event
  shimmer.wrap(handlerSet, 'func', function (func) {
    return function funcTrace(stream) {
      var that = this;
      var args = arguments;
      return api.runInRootSpan(requestName, function(transaction) {
        if (!transaction) {
          return func.apply(that, args);
        }
        transaction.addLabel(TraceLabels.HTTP_METHOD_LABEL_KEY, 'POST');
        if (api.config.enhancedDatabaseReporting) {
          shimmer.wrap(stream, 'sendMetadata', sendMetadataWrapper(transaction));
        }
        // Preserve context in stream event handlers.
        api.wrapEmitter(stream);
        var spanEnded = false;
        var endSpan = function () {
          if (!spanEnded) {
            spanEnded = true;
            transaction.endSpan();
          }
        };
        stream.on('finish', function () {
          // End the span unless there is an error.
          if (stream.status.code === 0) {
            endSpan();
          }
        });
        stream.on('error', function (err) {
          if (api.config.enhancedDatabaseReporting) {
            transaction.addLabel('error', err);
          }
          endSpan();
        });
        return func.apply(that, args);
      });
    };
  });
}

/**
 * Returns a function that wraps the gRPC server register function in order
 * to create trace spans for gRPC service methods.
 * @param {Function} register The function Server.prototype.register
 * @returns {Function} registerTrace The new wrapper function.
 */
function serverRegisterWrap(register) {
  return function registerTrace(name, handler, serialize, deserialize, method_type) {
    // register(n, h, s, d, m) is called in addService once for each service method.
    // Its role is to assign the serialize, deserialize, and user logic handlers
    // for each exposed service method. Here, we wrap these functions depending on the
    // method type.
    var result = register.apply(this, arguments);
    var handlerSet = this.handlers[name];
    var requestName = 'grpc:' + name;
    // Proceed to wrap methods that are invoked when a gRPC service call is made.
    // In every case, the function 'func' is the user-implemented handling function.
    if (method_type === 'unary') {
      api.wrap(wrapUnary(handlerSet, requestName));
    } else if (method_type === 'server_stream') {
      wrapServerStream(handlerSet, requestName);
    } else if (method_type === 'client_stream') {
      wrapClientStream(handlerSet, requestName);
    } else if (method_type === 'bidi') {
      wrapBidi(handlerSet, requestName);
    } else {
      api.logger.warn('gRPC Server: Unrecognized method_type ' + method_type);
    }
    return result;
  };
}

// # Exports

module.exports = function(version_, api_) {
  if (!semver.satisfies(version_, SUPPORTED_VERSIONS)) {
    return {};
  }
  return {
    'src/node/src/client.js': {
      patch: function(client) {
        api = api_;
        shimmer.wrap(client, 'makeClientConstructor',
            makeClientConstructorWrap);
        client._plugin_patched = true;
      },
      unpatch: function(client) {
        // Only the Client constructor is unwrapped, so that future grpc.load's
        // will not wrap Client methods with tracing. However, existing Client
        // objects with wrapped prototype methods will continue tracing.
        shimmer.unwrap(client, 'makeClientConstructor');
        api.logger.info('gRPC makeClientConstructor: unpatched');
      }
    },
    'src/node/src/server.js': {
      patch: function(server) {
        api = api_;
        shimmer.wrap(server.Server.prototype, 'register', serverRegisterWrap);
        server._plugin_patched = true;
      },
      unpatch: function(server) {
        shimmer.unwrap(server.Server.prototype, 'register');
        api.logger.info('gRPC Server: unpatched');
      }
    }
  };
};
