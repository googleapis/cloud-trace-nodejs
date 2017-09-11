/**
 * Copyright 2016 Google Inc. All Rights Reserved.
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

var assert = require('assert');
var cls = require('../../src/cls'/*.js*/);
var util = require('../../src/util'/*.js*/);
var constants = require('../../src/constants'/*.js*/);
var shimmer = require('shimmer');
var traceLabels = require('../../src/trace-labels'/*.js*/);
var TracingPolicy = require('../../src/tracing-policy'/*.js*/);
var common = require('./common'/*.js*/);

var versions = {
  grpc1: './fixtures/grpc1'
};

var protoFile = __dirname + '/../fixtures/test-grpc.proto';
var grpcPort = 50051;

// When received in the 'n' field, the server should perform the appropriate action
// (For client streaming methods, this would be the total sum of all requests)
var SEND_METADATA = 131;
var EMIT_ERROR = 13412;

// Regular expression matching client-side metadata labels
var metadataRegExp =
  /^{"a":"b","x-cloud-trace-context":"[a-f0-9]{32}\/[0-9]+;o=1"}$/;

// Whether asserts in checkServerMetadata should be run
// Turned on only for the test that checks propagated tract context
var checkMetadata;

function checkServerMetadata(metadata) {
  if (checkMetadata) {
    var traceContext = metadata.getMap()[constants.TRACE_CONTEXT_HEADER_NAME];
    assert.ok(/[a-f0-9]{32}\/[0-9]+;o=1/.test(traceContext));
    var parsedContext = util.parseContextFromHeader(traceContext);
    var root = cls.getNamespace().get('root');
    assert.strictEqual(root.span.parentSpanId, parsedContext.spanId);
  }
}

function startServer(proto, grpc, agent, metadata, trailing_metadata) {
  var _server = new grpc.Server();
  _server.addProtoService(proto.Tester.service, {
    testUnary: function(call, cb) {
      checkServerMetadata(call.metadata);
      if (call.request.n === EMIT_ERROR) {
        common.createChildSpan(function () {
          cb(new Error('test'));
        }, common.serverWait);
      } else if (call.request.n === SEND_METADATA) {
        call.sendMetadata(metadata);
        setTimeout(function() {
          cb(null, {n: call.request.n}, trailing_metadata);
        }, common.serverWait);
      } else {
        common.createChildSpan(function () {
          cb(null, {n: call.request.n});
        }, common.serverWait);
      }
    },
    testClientStream: function(call, cb) {
      checkServerMetadata(call.metadata);
      var sum = 0;
      var triggerCb = function () {
        cb(null, {n: sum});
      };
      var stopChildSpan;
      call.on('data', function(data) {
        // Creating child span in stream event handler to ensure that
        // context is propagated correctly
        if (!stopChildSpan) {
          stopChildSpan = common.createChildSpan(function () {
            triggerCb();
          }, common.serverWait);
        }
        sum += data.n;
      });
      call.on('end', function() {
        if (sum === EMIT_ERROR) {
          triggerCb = function() {
            if (stopChildSpan) {
              stopChildSpan();
            }
            cb(new Error('test'));
          };
        } else if (sum === SEND_METADATA) {
          call.sendMetadata(metadata);
          triggerCb = function() {
            cb(null, {n: sum}, trailing_metadata);
          };
        }
      });
    },
    testServerStream: function(stream) {
      checkServerMetadata(stream.metadata);
      if (stream.request.n === EMIT_ERROR) {
        common.createChildSpan(function () {
          stream.emit('error', new Error('test'));
        }, common.serverWait);
      } else {
        if (stream.request.n === SEND_METADATA) {
          stream.sendMetadata(metadata);
        }
        for (var i = 0; i < 10; ++i) {
          stream.write({n: i});
        }
        common.createChildSpan(function () {
          stream.end();
        }, common.serverWait);
      }
    },
    testBidiStream: function(stream) {
      checkServerMetadata(stream.metadata);
      var sum = 0;
      var stopChildSpan;
      var t = setTimeout(function() {
        stream.end();
      }, common.serverWait);
      stream.on('data', function(data) {
        // Creating child span in stream event handler to ensure that
        // context is propagated correctly
        if (!stopChildSpan) {
          stopChildSpan = common.createChildSpan(null, common.serverWait);
        }
        sum += data.n;
        stream.write({n: data.n});
      });
      stream.on('end', function() {
        stopChildSpan();
        if (sum === EMIT_ERROR) {
          clearTimeout(t);
          setTimeout(function() {
            if (stopChildSpan) {
              stopChildSpan();
            }
            stream.emit('error', new Error('test'));
          }, common.serverWait);
        } else if (sum === SEND_METADATA) {
          stream.sendMetadata(metadata);
        }
      });
    }
  });
  _server.bind('localhost:' + grpcPort,
      grpc.ServerCredentials.createInsecure());
  _server.start();
  return _server;
}

function createClient(proto, grpc) {
  return new proto.Tester('localhost:' + grpcPort,
      grpc.credentials.createInsecure());
}

function callUnary(client, grpc, metadata, cb) {
  var args = [
    {n: 42},
    function(err, result) {
      assert.ifError(err);
      assert.strictEqual(result.n, 42);
      cb();
    }
  ];
  if (Object.keys(metadata).length > 0) {
    var m = new grpc.Metadata();
    for (var key in metadata) {
      m.add(key, metadata[key]);
    }
    args.splice(1, 0, m);
  }
  client.testUnary.apply(client, args);
}

function callClientStream(client, grpc, metadata, cb) {
  var args = [function(err, result) {
    assert.ifError(err);
    assert.strictEqual(result.n, 45);
    cb();
  }];
  if (Object.keys(metadata).length > 0) {
    var m = new grpc.Metadata();
    for (var key in metadata) {
      m.set(key, metadata[key]);
    }
    args.unshift(m);
  }
  var stream = client.testClientStream.apply(client, args);
  for (var i = 0; i < 10; ++i) {
    stream.write({n: i});
  }
  stream.end();
}

function callServerStream(client, grpc, metadata, cb) {
  var args = [ {n: 42} ];
  if (Object.keys(metadata).length > 0) {
    var m = new grpc.Metadata();
    for (var key in metadata) {
      m.add(key, metadata[key]);
    }
    args.push(m);
  }
  var stream = client.testServerStream.apply(client, args);
  var sum = 0;
  stream.on('data', function(data) {
    sum += data.n;
  });
  stream.on('status', function(status) {
    assert.strictEqual(status.code, grpc.status.OK);
    assert.strictEqual(sum, 45);
    cb();
  });
}

function callBidi(client, grpc, metadata, cb) {
  var args = [];
  if (Object.keys(metadata).length > 0) {
    var m = new grpc.Metadata();
    for (var key in metadata) {
      m.add(key, metadata[key]);
    }
    args.push(m);
  }
  var stream = client.testBidiStream.apply(client, args);
  var sum = 0;
  stream.on('data', function(data) {
    sum += data.n;
  });
  for (var i = 0; i < 10; ++i) {
    stream.write({n: i});
  }
  stream.end();
  stream.on('status', function(status) {
    assert.strictEqual(status.code, grpc.status.OK);
    assert.strictEqual(sum, 45);
    cb();
  });
}

Object.keys(versions).forEach(function(version) {
  var agent;
  var grpc;
  var metadata;
  var server;
  var client;
  var shouldTraceArgs = [];
  describe(version, function() {
    before(function() {
      // Set up to record invocations of shouldTrace
      shimmer.wrap(TracingPolicy, 'createTracePolicy', function(original) {
        return function() {
          var result = original.apply(this, arguments);
          var shouldTrace = result.shouldTrace;
          result.shouldTrace = function() {
            shouldTraceArgs.push([].slice.call(arguments, 0));
            return shouldTrace.apply(this, arguments);
          };
          return result;
        };
      });

      // It is necessary for the samplingRate to be 0 for the tests to succeed
      agent = require('../..').start({
        projectId: '0',
        samplingRate: 0,
        enhancedDatabaseReporting: true
      });

      grpc = require(versions[version]);

      var oldRegister = grpc.Server.prototype.register;
      grpc.Server.prototype.register = function register(n, h, s, d, m) {
        var result = oldRegister.call(this, n, h, s, d, m);
        var oldFunc = this.handlers[n].func;
        this.handlers[n].func = function() {
          if (cls.getRootContext()) {
            cls.setRootContext(null);
          }
          return oldFunc.apply(this, arguments);
        };
        return result;
      };

      // This metadata can be used by all test methods.
      metadata = new grpc.Metadata();
      metadata.set('a', 'b');

      // Trailing metadata can be sent by unary and client stream requests.
      var trailing_metadata = new grpc.Metadata();
      trailing_metadata.set('c', 'd');

      var proto = grpc.load(protoFile).nodetest;
      server = startServer(proto, grpc, agent, metadata, trailing_metadata);
      client = createClient(proto, grpc);
    });

    after(function() {
      server.forceShutdown();
    });

    afterEach(function() {
      shouldTraceArgs = [];
      common.cleanTraces();
      checkMetadata = false;
    });

    it('should accurately measure time for unary requests', function(done) {
      var start = Date.now();
      common.runInTransaction(function(endTransaction) {
        callUnary(client, grpc, {}, function() {
          endTransaction();
          var assertTraceProperties = function(predicate) {
            var trace = common.getMatchingSpan(predicate);
            assert(trace);
            common.assertDurationCorrect(Date.now() - start, predicate);
            assert.strictEqual(trace.labels.argument, '{"n":42}');
            assert.strictEqual(trace.labels.result, '{"n":42}');
          };
          assertTraceProperties(grpcClientPredicate);
          assertTraceProperties(grpcServerOuterPredicate);
          // Check that a child span was created in gRPC root span 
          assert(common.getMatchingSpan(grpcServerInnerPredicate));
          done();
        });
      });
    });

    it('should propagate context', function(done) {
      common.runInTransaction(function(endTransaction) {
        callUnary(client, grpc, {}, function() {
          assert.ok(common.hasContext());
          endTransaction();
          done();
        });
      });
    });

    it('should accurately measure time for client streaming requests', function(done) {
      var start = Date.now();
      common.runInTransaction(function(endTransaction) {
        callClientStream(client, grpc, {}, function() {
          endTransaction();
          var assertTraceProperties = function(predicate) {
            var trace = common.getMatchingSpan(predicate);
            assert(trace);
            common.assertDurationCorrect(Date.now() - start, predicate);
            assert.strictEqual(trace.labels.result, '{"n":45}');
          };
          assertTraceProperties(grpcClientPredicate);
          assertTraceProperties(grpcServerOuterPredicate);
          // Check that a child span was created in gRPC root span 
          assert(common.getMatchingSpan(grpcServerInnerPredicate));
          done();
        });
      });
    });

    it('should accurately measure time for server streaming requests', function(done) {
      var start = Date.now();
      common.runInTransaction(function(endTransaction) {
        callServerStream(client, grpc, {}, function() {
          endTransaction();
          var assertTraceProperties = function(predicate) {
            var trace = common.getMatchingSpan(predicate);
            assert(trace);
            common.assertDurationCorrect(Date.now() - start, predicate);
            assert.strictEqual(trace.labels.argument, '{"n":42}');
            return trace;
          };
          var clientTrace = assertTraceProperties(grpcClientPredicate);
          assert.strictEqual(clientTrace.labels.status,
              '{"code":0,"details":"OK","metadata":{"_internal_repr":{}}}');
          assertTraceProperties(grpcServerOuterPredicate);
          // Check that a child span was created in gRPC root span 
          assert(common.getMatchingSpan(grpcServerInnerPredicate));
          done();
        });
      });
    });

    it('should accurately measure time for bidi streaming requests', function(done) {
      var start = Date.now();
      common.runInTransaction(function(endTransaction) {
        callBidi(client, grpc, {}, function() {
          endTransaction();
          var assertTraceProperties = function(predicate) {
            var trace = common.getMatchingSpan(predicate);
            assert(trace);
            common.assertDurationCorrect(Date.now() - start, predicate);
            return trace;
          };
          var clientTrace = assertTraceProperties(grpcClientPredicate);
          assert.strictEqual(clientTrace.labels.status,
              '{"code":0,"details":"OK","metadata":{"_internal_repr":{}}}');
          assertTraceProperties(grpcServerOuterPredicate);
          // Check that a child span was created in gRPC root span 
          assert(common.getMatchingSpan(grpcServerInnerPredicate));
          done();
        });
      });
    });

    it('should not break if no parent transaction', function(done) {
      callUnary(client, grpc, {}, function() {
        assert.strictEqual(common.getMatchingSpans(grpcClientPredicate).length, 0);
        done();
      });
    });

    it('should respect the tracing policy', function(done) {
      var next = function() {
        assert.strictEqual(shouldTraceArgs.length, 4,
          'expected one call for each of four gRPC method types but got ' +
          shouldTraceArgs.length + ' instead');
        var prefix = 'grpc:/nodetest.Tester/Test';
        // calls to shouldTrace should be in the order which the client method
        // of each type was called.
        assert.strictEqual(shouldTraceArgs[3][1], prefix + 'Unary');
        assert.strictEqual(shouldTraceArgs[2][1], prefix + 'ClientStream');
        assert.strictEqual(shouldTraceArgs[1][1], prefix + 'ServerStream');
        assert.strictEqual(shouldTraceArgs[0][1], prefix + 'BidiStream');
        done();
      };
      next = callUnary.bind(null, client, grpc, {}, next);
      next = callClientStream.bind(null, client, grpc, {}, next);
      next = callServerStream.bind(null, client, grpc, {}, next);
      next = callBidi.bind(null, client, grpc, {}, next);
      next();
    });

    it('should support distributed trace context', function(done) {
      function makeLink(fn, meta, next) {
        return function() {
          cls.setRootContext(null);
          common.runInTransaction(function(terminate) {
            fn(client, grpc, meta, function() {
              terminate();
              next();
            });
          });
        };
      }
      // Enable asserting properties of the metdata on the grpc server.
      checkMetadata = true;
      common.runInTransaction(function (endTransaction) {
        var metadata = { a: 'b' };
        var next = function() {
          endTransaction();
          checkMetadata = false;
          done();
        };
        // Try without supplying metadata (call* will not supply metadata to
        // the grpc client methods at all if no fields are present).
        // The plugin should automatically create a new Metadata object and
        // populate it with trace context data accordingly.
        next = makeLink(callUnary, {}, next);
        next = makeLink(callClientStream, {}, next);
        next = makeLink(callServerStream, {}, next);
        next = makeLink(callBidi, {}, next);
        // Try with metadata. The plugin should simply add trace context data
        // to it.
        next = makeLink(callUnary, metadata, next);
        next = makeLink(callClientStream, metadata, next);
        next = makeLink(callServerStream, metadata, next);
        next = makeLink(callBidi, metadata, next);
        next();
      });
    });

    it('should not let root spans interfere with one another', function(done) {
      this.timeout(8000);
      var next = done;
      // Calling queueCallTogether builds a call chain, with each link
      // testing interference between two gRPC calls spaced apart by half
      // of common.serverWait (to interleave them).
      // This chain is kicked off with an initial call to next().
      var queueCallTogether = function(first, second) {
        var prevNext = next;
        next = function() {
          var startFirst, startSecond, endFirst;
          common.runInTransaction(function(endTransaction) {
            var num = 0;
            common.cleanTraces();
            var callback = function() {
              if (num === 0) {
                endFirst = Date.now();
              }
              if (++num === 2) {
                endTransaction();
                var traces = common.getMatchingSpans(grpcServerOuterPredicate);
                assert(traces.length === 2);
                assert(traces[0].spanId !== traces[1].spanId);
                assert(traces[0].startTime !== traces[1].startTime);
                common.assertSpanDurationCorrect(traces[0], endFirst - startFirst);
                common.assertSpanDurationCorrect(traces[1], Date.now() - startSecond);
                // Clear root context so the next call to runInTransaction
                // doesn't think we are still in one.
                // TODO: Maybe we should do this automatically upon root.endSpan
                cls.setRootContext(null);
                setImmediate(prevNext);
              }
            };
            startFirst = Date.now();
            first(callback);
            setTimeout(function() {
              startSecond = Date.now();
              second(callback);
            }, common.serverWait / 2);
          });
        };
      };

      // Call queueCallTogether with every possible pair of gRPC calls.
      var methods = [ callUnary.bind(null, client, grpc, {}),
                      callClientStream.bind(null, client, grpc, {}),
                      callServerStream.bind(null, client, grpc, {}),
                      callBidi.bind(null, client, grpc, {}) ];
      for (var m of methods) {
        for (var n of methods) {
          queueCallTogether(m, n);
        }
      }

      // Kick off call chain.
      next();
    });

    it('should remove trace frames from stack', function(done) {
      common.runInTransaction(function(endTransaction) {
        client.testUnary({n: 42}, function(err, result) {
          endTransaction();
          assert.ifError(err);
          assert.strictEqual(result.n, 42);
          function getMethodName(predicate) {
            var trace = common.getMatchingSpan(predicate);
            var labels = trace.labels;
            var stack = JSON.parse(labels[traceLabels.STACK_TRACE_DETAILS_KEY]);
            return stack.stack_frame[0].method_name;
          }
          assert.notStrictEqual(-1, getMethodName(grpcClientPredicate)
            .indexOf('clientMethodTrace'));
          assert.notStrictEqual(-1, getMethodName(grpcServerOuterPredicate)
            .indexOf('serverMethodTrace'));
          done();
        });
      });
    });

    it('should trace errors for unary requests', function(done) {
      common.runInTransaction(function(endTransaction) {
        client.testUnary({n: EMIT_ERROR}, function(err, result) {
          endTransaction();
          assert(err);
          var assertTraceProperties = function(predicate) {
            var trace = common.getMatchingSpan(predicate);
            assert(trace);
            assert.strictEqual(trace.labels.argument, '{"n":' + EMIT_ERROR + '}');
            assert(trace.labels.error.indexOf('Error: test') !== -1);
          };
          assertTraceProperties(grpcClientPredicate);
          assertTraceProperties(grpcServerOuterPredicate);
          // Check that a child span was created in gRPC root span 
          assert(common.getMatchingSpan(grpcServerInnerPredicate));
          done();
        });
      });
    });

    it('should trace errors for client streaming requests', function(done) {
      common.runInTransaction(function(endTransaction) {
        var stream = client.testClientStream(function(err, result) {
          endTransaction();
          assert(err);
          var assertTraceProperties = function(predicate) {
            var trace = common.getMatchingSpan(predicate);
            assert(trace);
            assert(trace.labels.error.indexOf('Error: test') !== -1);
          };
          assertTraceProperties(grpcClientPredicate);
          assertTraceProperties(grpcServerOuterPredicate);
          // Check that a child span was created in gRPC root span 
          assert(common.getMatchingSpan(grpcServerInnerPredicate));
          done();
        });
        stream.write({n: EMIT_ERROR});
        stream.end();
      });
    });

    it('should trace errors for server streaming requests', function(done) {
      common.runInTransaction(function(endTransaction) {
        var stream = client.testServerStream({n: EMIT_ERROR}, metadata);
        stream.on('data', function(data) {});
        stream.on('error', function (err) {
          endTransaction();
          var assertTraceProperties = function(predicate) {
            var trace = common.getMatchingSpan(predicate);
            assert(trace);
            assert(trace.labels.error.indexOf('Error: test') !== -1);
          };
          assertTraceProperties(grpcClientPredicate);
          assertTraceProperties(grpcServerOuterPredicate);
          // Check that a child span was created in gRPC root span 
          assert(common.getMatchingSpan(grpcServerInnerPredicate));
          done();
        });
      });
    });

    it('should trace errors for bidi streaming requests', function(done) {
      common.runInTransaction(function(endTransaction) {
        var stream = client.testBidiStream(metadata);
        stream.on('data', function(data) {});
        stream.write({n: EMIT_ERROR});
        stream.end();
        stream.on('error', function(err) {
          endTransaction();
          var assertTraceProperties = function(predicate) {
            var trace = common.getMatchingSpan(predicate);
            assert(trace);
            assert(trace.labels.error.indexOf('Error: test') !== -1);
          };
          assertTraceProperties(grpcClientPredicate);
          assertTraceProperties(grpcServerOuterPredicate);
          // Check that a child span was created in gRPC root span 
          assert(common.getMatchingSpan(grpcServerInnerPredicate));
          done();
        });
      });
    });

    it('should trace metadata for server streaming requests', function(done) {
      var start = Date.now();
      common.runInTransaction(function(endTransaction) {
        var stream = client.testServerStream({n: SEND_METADATA}, metadata);
        stream.on('data', function(data) {});
        stream.on('status', function(status) {
          endTransaction();
          assert.strictEqual(status.code, grpc.status.OK);
          var assertTraceProperties = function(predicate) {
            var trace = common.getMatchingSpan(predicate);
            assert(trace);
            common.assertDurationCorrect(Date.now() - start, predicate);
            assert.ok(metadataRegExp.test(trace.labels.metadata));
          };
          assertTraceProperties(grpcClientPredicate);
          assertTraceProperties(grpcServerOuterPredicate);
          done();
        });
      });
    });

    it('should trace metadata for bidi streaming requests', function(done) {
      var start = Date.now();
      common.runInTransaction(function(endTransaction) {
        var stream = client.testBidiStream(metadata);
        stream.on('data', function(data) {});
        stream.write({n: SEND_METADATA});
        stream.end();
        stream.on('status', function(status) {
          endTransaction();
          assert.strictEqual(status.code, grpc.status.OK);
          var assertTraceProperties = function(predicate) {
            var trace = common.getMatchingSpan(predicate);
            assert(trace);
            common.assertDurationCorrect(Date.now() - start, predicate);
            assert.ok(metadataRegExp.test(trace.labels.metadata));
          };
          assertTraceProperties(grpcClientPredicate);
          assertTraceProperties(grpcServerOuterPredicate);
          done();
        });
      });
    });

    if (version === 'grpc013') {
      it('should trace metadata for old arg orders (unary)', function(done) {
        var start = Date.now();
        common.runInTransaction(function(endTransaction) {
          client.testUnary({n: SEND_METADATA}, function(err, result) {
            endTransaction();
            assert.ifError(err);
            var assertTraceProperties = function(predicate) {
              var trace = common.getMatchingSpan(predicate);
              assert(trace);
              common.assertDurationCorrect(Date.now() - start, predicate);
              assert.ok(metadataRegExp.test(trace.labels.metadata));
              return trace;
            };
            assertTraceProperties(grpcClientPredicate);
            var serverTrace = assertTraceProperties(grpcServerOuterPredicate);
            // Also check trailing metadata
            assert.strictEqual(serverTrace.labels.trailing_metadata, '{"c":"d"}');
            done();
          }, metadata, {});
        });
      });

      it('should trace metadata for old arg orders (stream)', function(done) {
        var start = Date.now();
        common.runInTransaction(function(endTransaction) {
          var stream = client.testClientStream(function(err, result) {
            endTransaction();
            assert.ifError(err);
            var assertTraceProperties = function(predicate) {
              var trace = common.getMatchingSpan(predicate);
              assert(trace);
              common.assertDurationCorrect(Date.now() - start, predicate);
              assert.ok(metadataRegExp.test(trace.labels.metadata));
              return trace;
            };
            assertTraceProperties(grpcClientPredicate);
            var serverTrace = assertTraceProperties(grpcServerOuterPredicate);
            // Also check trailing metadata
            assert.strictEqual(serverTrace.labels.trailing_metadata, '{"c":"d"}');
            done();
          }, metadata, {});
          stream.write({n: SEND_METADATA});
          stream.end();
        });
      });
    } else {
      it('should trace metadata for new arg orders (unary)', function(done) {
        var start = Date.now();
        common.runInTransaction(function(endTransaction) {
          client.testUnary({n: SEND_METADATA}, metadata, {},
              function(err, result) {
                endTransaction();
                assert.ifError(err);
                var assertTraceProperties = function(predicate) {
                  var trace = common.getMatchingSpan(predicate);
                  assert(trace);
                  common.assertDurationCorrect(Date.now() - start, predicate);
                  assert.ok(metadataRegExp.test(trace.labels.metadata));
                  return trace;
                };
                assertTraceProperties(grpcClientPredicate);
                var serverTrace = assertTraceProperties(grpcServerOuterPredicate);
                // Also check trailing metadata
                assert.strictEqual(serverTrace.labels.trailing_metadata, '{"c":"d"}');
                done();
              });
        });
      });

      it('should trace metadata for new arg orders (stream)', function(done) {
        var start = Date.now();
        common.runInTransaction(function(endTransaction) {
          var stream = client.testClientStream(metadata, {},
              function(err, result) {
                endTransaction();
                assert.ifError(err);
                var assertTraceProperties = function(predicate) {
                  var trace = common.getMatchingSpan(predicate);
                  assert(trace);
                  common.assertDurationCorrect(Date.now() - start, predicate);
                  assert.ok(metadataRegExp.test(trace.labels.metadata));
                  return trace;
                };
                assertTraceProperties(grpcClientPredicate);
                var serverTrace = assertTraceProperties(grpcServerOuterPredicate);
                // Also check trailing metadata
                assert.strictEqual(serverTrace.labels.trailing_metadata, '{"c":"d"}');
                done();
              });
          stream.write({n: SEND_METADATA});
          stream.end();
        });
      });
    }
  });
});

function grpcClientPredicate(span) {
  return span.kind === 'RPC_CLIENT' && span.name.indexOf('grpc:') === 0;
}

function grpcServerOuterPredicate(span) {
  return span.kind === 'RPC_SERVER' && span.name.indexOf('grpc:') === 0;
}

function grpcServerInnerPredicate(span) {
  return span.kind === 'RPC_CLIENT' && span.name === 'inner';
}

export default {};
