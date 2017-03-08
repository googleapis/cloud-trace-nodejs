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
var findIndex = require('lodash.findindex');

var SKIP_FRAMES = 3;

// Required for adding distributed tracing metadata to outgoing gRPC requests.
// This value is assigned in patchMetadata, and used in patchClient.
// patchMetadata is guaranteed to be called before patchClient because Client
// depends on Metadata.
var Metadata;

function patchMetadata(metadata, api) {
  // metadata is the value of module.exports of src/node/src/metadata.js
  Metadata = metadata;
}

function patchClient(client, api) {
  /**
   * Wraps a callback so that the current span for this trace is also ended when
   * the callback is invoked.
   * @param {SpanData} span - The span that should end after this callback.
   * @param {function(?Error, value=)} done - The callback to be wrapped.
   */
  function wrapCallback(span, done) {
    var fn = function(err, res) {
      if (api.enhancedDatabaseReportingEnabled()) {
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
    return api.wrap(fn);
  }

  /**
   * This function is passed to shimmer.wrap in makeClientConstructorWrap below.
   * It starts a child span immediately before the client method is invoked,
   * and ends it either in a callback or stream event handler, depending on the
   * method type.
   */
  function makeClientMethod(method) {
    return function clientMethodTrace() {
      // The span name will be of form "grpc:/[Service]/[MethodName]".
      var span = api.createChildSpan({ name: 'grpc:' + method.path });
      if (!span) {
        // Span couldn't be created, either by policy or because a root span
        // doesn't exist.
        return method.apply(this, arguments);
      }
      var args = Array.prototype.slice.call(arguments);
      // Check if the response is through a stream or a callback.
      if (!method.responseStream) {
        // We need to wrap the callback with the context, to propagate it.
        // The callback is always required. It should be the only function in
        // the arguments, since we cannot send a function as an argument through
        // gRPC.
        var cbIndex = findIndex(args, function(arg) {
          return typeof arg === 'function';
        });
        if (cbIndex !== -1) {
          args[cbIndex] = wrapCallback(span, args[cbIndex]);
        }
      }
      // This finds an instance of Metadata among the arguments.
      // A possible issue that could occur is if the 'options' parameter from
      // the user contains an '_internal_repr' as well as a 'getMap' function,
      // but this is an extremely rare case.
      var metaIndex = findIndex(args, function(arg) {
        return arg && typeof arg === 'object' && arg._internal_repr &&
            typeof arg.getMap === 'function';
      });
      if (metaIndex === -1) {
        var metadata = new Metadata();
        if (!method.requestStream) {
          // unary or server stream
          if (args.length === 0) {
            // No argument (for the gRPC call) was provided, so we will have to
            // provide one, since metadata cannot be the first argument.
            // The internal representation of argument defaults to undefined
            // in its non-presence.
            // Note that we can't pass null instead of undefined because the
            // serializer within gRPC doesn't accept it.
            args.push(undefined);
          }
          metaIndex = 1;
        } else {
          // client stream or bidi
          metaIndex = 0;
        }
        args.splice(metaIndex, 0, metadata);
      }
      args[metaIndex].set(api.constants.TRACE_CONTEXT_HEADER_NAME,
        span.getTraceContext());
      var call = method.apply(this, args);
      // Add extra data only when call successfully goes through. At this point
      // we know that the arguments are correct.
      if (api.enhancedDatabaseReportingEnabled()) {
        span.addLabel('metadata', JSON.stringify(args[metaIndex].getMap()));
        if (!method.requestStream) {
          span.addLabel('argument', JSON.stringify(args[0]));
        }
      }
      // The user might need the current context in listeners to this stream.
      api.wrapEmitter(call);
      if (method.responseStream) {
        var spanEnded = false;
        call.on('error', function(err) {
          if (api.enhancedDatabaseReportingEnabled()) {
            span.addLabel('error', err);
          }
          if (!spanEnded) {
            span.endSpan();
            spanEnded = true;
          }
        });
        call.on('status', function(status) {
          if (api.enhancedDatabaseReportingEnabled()) {
            span.addLabel('status', JSON.stringify(status));
          }
          if (!spanEnded) {
            span.endSpan();
            spanEnded = true;
          }
        });
      }
      return call;
    };
  }

  /**
   * Modifies `makeClientConstructor` so that all of the methods available
   * through the client are wrapped upon calling the client object constructor.
   */
  function makeClientConstructorWrap(makeClientConstructor) {
    return function makeClientConstructorTrace(methods) {
      var Client = makeClientConstructor.apply(this, arguments);
      shimmer.massWrap(Client.prototype, Object.keys(methods), makeClientMethod);
      return Client;
    };
  }
  
  shimmer.wrap(client, 'makeClientConstructor', makeClientConstructorWrap);
}

function unpatchClient(client) {
  // Only the Client constructor is unwrapped, so that future grpc.load's
  // will not wrap Client methods with tracing. However, existing Client
  // objects with wrapped prototype methods will continue tracing.
  shimmer.unwrap(client, 'makeClientConstructor');
}

function patchServer(server, api) {
  var traceContextHeaderName = api.constants.TRACE_CONTEXT_HEADER_NAME;

  /**
   * A helper function to record metadata in a trace span. The return value of
   * this function can be used as the 'wrapper' argument to wrap sendMetadata.
   * sendMetadata is a member of each of ServerUnaryCall, ServerWriteableStream,
   * ServerReadableStream, and ServerDuplexStream.
   * @param rootSpan The span object to which the metadata should be added.
   * @returns {Function} A function that returns a wrapped form of sendMetadata.
   */
  function sendMetadataWrapper(rootSpan) {
    return function (sendMetadata) {
      return function sendMetadataTrace(responseMetadata) {
        rootSpan.addLabel('metadata',
          JSON.stringify(responseMetadata.getMap()));
        return sendMetadata.apply(this, arguments);
      };
    };
  }

  /**
   * Wraps a unary function in order to record trace spans.
   * @param {Object} handlerSet An object containing references to the function
   * handle.
   * @param {string} requestName The human-friendly name of the request.
   */
  function wrapUnary(handlerSet, requestName) {
    // handlerSet.func is the gRPC method implementation itself.
    // We wrap it so that a span is started immediately beforehand, and ended
    // when the callback provided to it as an argument is invoked.
    shimmer.wrap(handlerSet, 'func', function (serverMethod) {
      return function serverMethodTrace(call, callback) {
        var that = this;
        var rootSpanOptions = {
          name: requestName,
          url: requestName,
          traceContext: call.metadata.getMap()[traceContextHeaderName],
          skipFrames: SKIP_FRAMES
        };
        return api.runInRootSpan(rootSpanOptions, function(rootSpan) {
          if (!rootSpan) {
            return serverMethod.call(that, call, callback);
          }
          if (api.enhancedDatabaseReportingEnabled()) {
            shimmer.wrap(call, 'sendMetadata', sendMetadataWrapper(rootSpan));
            rootSpan.addLabel('argument', JSON.stringify(call.request));
          }
          rootSpan.addLabel(api.labels.HTTP_METHOD_LABEL_KEY, 'POST');
          // Here, we patch the callback so that the span is ended immediately
          // beforehand.
          var wrappedCb = function (err, result, trailer, flags) {
            if (api.enhancedDatabaseReportingEnabled()) {
              if (err) {
                rootSpan.addLabel('error', err); 
              } else {
                rootSpan.addLabel('result', JSON.stringify(result));
              }
              if (trailer) {
                rootSpan.addLabel('trailing_metadata',
                  JSON.stringify(trailer.getMap()));
              }
            }
            rootSpan.endSpan();
            return callback(err, result, trailer, flags);
          };
          return serverMethod.call(that, call, wrappedCb);
        });
      };
    });
  }

  /**
   * Wraps a server streaming function in order to record trace spans.
   * @param {Object} handlerSet An object containing references to the function
   * handle.
   * @param {string} requestName The human-friendly name of the request.
   */
  function wrapServerStream(handlerSet, requestName) {
    // handlerSet.func is the gRPC method implementation itself.
    // We wrap it so that a span is started immediately beforehand, and ended
    // when there is no data to be sent from the server.
    shimmer.wrap(handlerSet, 'func', function (serverMethod) {
      return function serverMethodTrace(stream) {
        var that = this;
        var rootSpanOptions = {
          name: requestName,
          url: requestName,
          traceContext: stream.metadata.getMap()[traceContextHeaderName],
          skipFrames: SKIP_FRAMES
        };
        return api.runInRootSpan(rootSpanOptions, function(rootSpan) {
          if (!rootSpan) {
            return serverMethod.call(that, stream);
          }
          if (api.enhancedDatabaseReportingEnabled()) {
            shimmer.wrap(stream, 'sendMetadata', sendMetadataWrapper(rootSpan));
            rootSpan.addLabel('argument', JSON.stringify(stream.request));
          }
          rootSpan.addLabel(api.labels.HTTP_METHOD_LABEL_KEY, 'POST');
          var spanEnded = false;
          var endSpan = function() {
            if (!spanEnded) {
              spanEnded = true;
              rootSpan.endSpan();
            }
          };
          // Propagate context to stream event handlers.
          api.wrapEmitter(stream);
          // stream is a WriteableStream. Emitting a 'finish' or 'error' event
          // suggests that no more data will be sent, so we end the span in
          // these event handlers.
          stream.on('finish', function () {
            // End the span unless there is an error. (If there is, the span
            // will be ended in the error event handler. This is to ensure that
            // the 'error' label is applied.)
            if (stream.status.code === 0) {
              endSpan();
            }
          });
          stream.on('error', function (err) {
            if (api.enhancedDatabaseReportingEnabled()) {
              rootSpan.addLabel('error', err);
            }
            endSpan();
          });
          return serverMethod.call(that, stream);
        });
      };
    });
  }

  /**
   * Wraps a client streaming function in order to record trace spans.
   * @param {Object} handlerSet An object containing references to the function
   * handle.
   * @param {string} requestName The human-friendly name of the request.
   */
  function wrapClientStream(handlerSet, requestName) {
    // handlerSet.func is the gRPC method implementation itself.
    // We wrap it so that a span is started immediately beforehand, and ended
    // when the callback provided to it as an argument is invoked.
    shimmer.wrap(handlerSet, 'func', function (serverMethod) {
      return function serverMethodTrace(stream, callback) {
        var that = this;
        var rootSpanOptions = {
          name: requestName,
          url: requestName,
          traceContext: stream.metadata.getMap()[traceContextHeaderName],
          skipFrames: SKIP_FRAMES
        };
        return api.runInRootSpan(rootSpanOptions, function(rootSpan) {
          if (!rootSpan) {
            return serverMethod.call(that, stream, callback);
          }
          if (api.enhancedDatabaseReportingEnabled()) {
            shimmer.wrap(stream, 'sendMetadata', sendMetadataWrapper(rootSpan));
          }
          rootSpan.addLabel(api.labels.HTTP_METHOD_LABEL_KEY, 'POST');
          // Propagate context to stream event handlers.
          // stream is a ReadableStream.
          // Note that unlike server streams, the length of the span is not
          // tied to the lifetime of the stream. It should measure the time for
          // the server to send a response, not the time until all data has been
          // received from the client.
          api.wrapEmitter(stream);
          // Here, we patch the callback so that the span is ended immediately
          // beforehand.
          var wrappedCb = function (err, result, trailer, flags) {
            if (api.enhancedDatabaseReportingEnabled()) {
              if (err) {
                rootSpan.addLabel('error', err);
              } else {
                rootSpan.addLabel('result', JSON.stringify(result));
              }
              if (trailer) {
                rootSpan.addLabel('trailing_metadata',
                  JSON.stringify(trailer.getMap()));
              }
            }
            rootSpan.endSpan();
            return callback(err, result, trailer, flags);
          };
          return serverMethod.call(that, stream, wrappedCb);
        });
      };
    });
  }

  /**
   * Wraps a bidirectional streaming function in order to record trace spans.
   * @param {Object} handlerSet An object containing references to the function
   * handle.
   * @param {string} requestName The human-friendly name of the request.
   */
  function wrapBidi(handlerSet, requestName) {
    // handlerSet.func is the gRPC method implementation itself.
    // We wrap it so that a span is started immediately beforehand, and ended
    // when there is no data to be sent from the server.
    shimmer.wrap(handlerSet, 'func', function (serverMethod) {
      return function serverMethodTrace(stream) {
        var that = this;
        var rootSpanOptions = {
          name: requestName,
          url: requestName,
          traceContext: stream.metadata.getMap()[traceContextHeaderName],
          skipFrames: SKIP_FRAMES
        };
        return api.runInRootSpan(rootSpanOptions, function(rootSpan) {
          if (!rootSpan) {
            return serverMethod.call(that, stream);
          }
          if (api.enhancedDatabaseReportingEnabled()) {
            shimmer.wrap(stream, 'sendMetadata', sendMetadataWrapper(rootSpan));
          }
          rootSpan.addLabel(api.labels.HTTP_METHOD_LABEL_KEY, 'POST');
          var spanEnded = false;
          var endSpan = function() {
            if (!spanEnded) {
              spanEnded = true;
              rootSpan.endSpan();
            }
          };
          // Propagate context in stream event handlers.
          api.wrapEmitter(stream);
          // stream is a Duplex. Emitting a 'finish' or 'error' event
          // suggests that no more data will be sent, so we end the span in
          // these event handlers.
          // Similar to client streams, the trace span should measure the time
          // until the server has finished sending data back to the client, not
          // the time that all data has been received from the client.
          stream.on('finish', function () {
            // End the span unless there is an error.
            if (stream.status.code === 0) {
              endSpan();
            }
          });
          stream.on('error', function (err) {
            if (!spanEnded && api.enhancedDatabaseReportingEnabled()) {
              rootSpan.addLabel('error', err);
            }
            endSpan();
          });
          return serverMethod.call(that, stream);
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
    return function registerTrace(name, handler, serialize, deserialize,
        method_type) {
      // register(n, h, s, d, m) is called in addService once for each service
      // method. Its role is to assign the serialize, deserialize, and user
      // logic handlers for each exposed service method. Here, we wrap these
      // functions depending on the method type.
      var result = register.apply(this, arguments);
      var handlerSet = this.handlers[name];
      var requestName = 'grpc:' + name;
      // Proceed to wrap methods that are invoked when a gRPC service call is
      // made. In every case, the function 'func' is the user-implemented
      // handling function.
      switch (method_type) {
        case 'unary':
          wrapUnary(handlerSet, requestName);
          break;
        case 'server_stream':
          wrapServerStream(handlerSet, requestName);
          break;
        case 'client_stream':
          wrapClientStream(handlerSet, requestName);
          break;
        case 'bidi':
          wrapBidi(handlerSet, requestName);
          break;
      }
      return result;
    };
  }

  // Wrap Server.prototype.register
  shimmer.wrap(server.Server.prototype, 'register', serverRegisterWrap);
}

function unpatchServer(server) {
  // Unwrap Server.prototype.register
  shimmer.unwrap(server.Server.prototype, 'register');
}

// # Exports

var SUPPORTED_VERSIONS = '0.13 - 1';

module.exports = [
  {
    file: 'src/node/src/client.js',
    versions: SUPPORTED_VERSIONS,
    patch: patchClient,
    unpatch: unpatchClient
  },
  {
    file: 'src/node/src/metadata.js',
    versions: SUPPORTED_VERSIONS,
    patch: patchMetadata,
    // patchMetadata doesn't modify the module exports of metadata.js.
    // So it's safe to have provide a no-op unpatch function.
    unpatch: function unpatchMetadata() {}
  },
  {
    file: 'src/node/src/server.js',
    versions: SUPPORTED_VERSIONS,
    patch: patchServer,
    unpatch: unpatchServer
  }
];
