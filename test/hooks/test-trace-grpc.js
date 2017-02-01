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

var common = require('./common.js');
require('../..').private_().config_.enhancedDatabaseReporting = true;
var assert = require('assert');
var traceLabels = require('../../src/trace-labels.js');
var findIndex = require('lodash.findindex');

var versions = {
  grpc1: require('./fixtures/grpc1')
};

var protoFile = __dirname + '/../fixtures/test-grpc.proto';
var grpcPort = 50051;
var client, server;

// When received in the 'n' field, the server should perform the appropriate action
// (For client streaming methods, this would be the total sum of all requests)
var SEND_METADATA = 131;
var EMIT_ERROR = 13412;

Object.keys(versions).forEach(function(version) {
  var grpc = versions[version];

  // This metadata can be used by all test methods.
  var metadata = new grpc.Metadata();
  metadata.set('a', 'b');
  // Trailing metadata can be sent by unary and client stream requests.
  var trailing_metadata = new grpc.Metadata();
  trailing_metadata.set('c', 'd');

  function startServer(proto) {
    var _server = new grpc.Server();
    _server.addProtoService(proto.Tester.service, {
      testUnary: function(call, cb) {
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

  function createClient(proto) {
    return new proto.Tester('localhost:' + grpcPort,
        grpc.credentials.createInsecure());
  }

  function callUnary(cb) {
    client.testUnary({n: 42}, function(err, result) {
      assert.ifError(err);
      assert.strictEqual(result.n, 42);
      cb();
    });
  }

  function callClientStream(cb) {
    var stream = client.testClientStream(function(err, result) {
      assert.ifError(err);
      assert.strictEqual(result.n, 45);
      cb();
    });
    for (var i = 0; i < 10; ++i) {
      stream.write({n: i});
    }
    stream.end();
  }

  function callServerStream(cb) {
    var stream = client.testServerStream({n: 42});
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

  function callBidi(cb) {
    var stream = client.testBidiStream();
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

  describe(version, function() {
    before(function() {
      var proto = grpc.load(protoFile).nodetest;
      server = startServer(proto);
      client = createClient(proto);
    });

    after(function() {
      server.forceShutdown();
    });

    afterEach(function() {
      common.cleanTraces();
    });

    it('should accurately measure time for unary requests', function(done) {
      common.runInTransaction(function(endTransaction) {
        callUnary(function() {
          endTransaction();
          var assertTraceProperties = function(predicate) {
            var trace = common.getMatchingSpan(predicate);
            assert(trace);
            common.assertDurationCorrect(predicate);
            assert.strictEqual(trace.labels.argument, '{"n":42}');
            assert.strictEqual(trace.labels.result, '{"n":42}');
          };
          assertTraceProperties(grpcClientPredicate);
          assertTraceProperties(grpcServerOuterPredicate);
          // Check that a child span was created in gRPC root span 
          assert(common.getMatchingSpan(grpcServerInnerPredicate));
          // var shouldTraceArgs = common.getShouldTraceArgs();
          done();
        });
      });
    });

    it('should accurately measure time for client streaming requests', function(done) {
      common.runInTransaction(function(endTransaction) {
        callClientStream(function() {
          endTransaction();
          var assertTraceProperties = function(predicate) {
            var trace = common.getMatchingSpan(predicate);
            assert(trace);
            common.assertDurationCorrect(predicate);
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
      common.runInTransaction(function(endTransaction) {
        callServerStream(function() {
          endTransaction();
          var assertTraceProperties = function(predicate) {
            var trace = common.getMatchingSpan(predicate);
            assert(trace);
            common.assertDurationCorrect(predicate);
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
      common.runInTransaction(function(endTransaction) {
        callBidi(function() {
          endTransaction();
          var assertTraceProperties = function(predicate) {
            var trace = common.getMatchingSpan(predicate);
            assert(trace);
            common.assertDurationCorrect(predicate);
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
      callUnary(function() {
        assert.strictEqual(common.getMatchingSpans(grpcClientPredicate).length, 0);
        done();
      });
    });

    it('should respect the tracing policy', function(done) {
      var next = function() {
        var args = common.getShouldTraceArgs();
        assert.strictEqual(args.length, 4,
          'expected one call for each of four gRPC method types but got ' +
          args.length + ' instead');
        for (var i = 0; i < args.length; i++) {
          assert.strictEqual(args[i].length, 1);
        }
        var prefix = 'grpc:/nodetest.Tester/Test';
        assert.notStrictEqual(findIndex(args, function(arg) {
          return arg[0] === prefix + 'Unary';
        }, -1));
        assert.notStrictEqual(findIndex(args, function(arg) {
          return arg[0] === prefix + 'ClientStream';
        }, -1));
        assert.notStrictEqual(findIndex(args, function(arg) {
          return arg[0] === prefix + 'ServerStream';
        }, -1));
        assert.notStrictEqual(findIndex(args, function(arg) {
          return arg[0] === prefix + 'BidiStream';
        }, -1));
        done();
      };
      next = callUnary.bind(null, next);
      next = callClientStream.bind(null, next);
      next = callServerStream.bind(null, next);
      next = callBidi.bind(null, next);
      next();
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
          common.runInTransaction(function(endTransaction) {
            var num = 0;
            common.cleanTraces();
            var callback = function() {
              if (++num === 2) {
                endTransaction();
                var traces = common.getMatchingSpans(grpcServerOuterPredicate);
                assert(traces.length === 2);
                assert(traces[0].spanId !== traces[1].spanId);
                assert(traces[0].startTime !== traces[1].startTime);
                common.assertSpanDurationCorrect(traces[0]);
                common.assertSpanDurationCorrect(traces[1]);
                setImmediate(prevNext);
              }
            };
            first(callback);
            setTimeout(function() {
              second(callback);
            }, common.serverWait / 2);
          });
        };
      };

      // Call queueCallTogether with every possible pair of gRPC calls.
      var methods = [ callUnary, callClientStream, callServerStream, callBidi ];
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
      common.runInTransaction(function(endTransaction) {
        var stream = client.testServerStream({n: SEND_METADATA}, metadata);
        stream.on('data', function(data) {});
        stream.on('status', function(status) {
          endTransaction();
          assert.strictEqual(status.code, grpc.status.OK);
          var assertTraceProperties = function(predicate) {
            var trace = common.getMatchingSpan(predicate);
            assert(trace);
            common.assertDurationCorrect(predicate);
            assert.strictEqual(trace.labels.metadata, '{"a":"b"}');
          };
          assertTraceProperties(grpcClientPredicate);
          assertTraceProperties(grpcServerOuterPredicate);
          done();
        });
      });
    });

    it('should trace metadata for bidi streaming requests', function(done) {
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
            common.assertDurationCorrect(predicate);
            assert.strictEqual(trace.labels.metadata, '{"a":"b"}');
          };
          assertTraceProperties(grpcClientPredicate);
          assertTraceProperties(grpcServerOuterPredicate);
          done();
        });
      });
    });

    if (version === 'grpc013') {
      it('should trace metadata for old arg orders (unary)', function(done) {
        common.runInTransaction(function(endTransaction) {
          client.testUnary({n: SEND_METADATA}, function(err, result) {
            endTransaction();
            assert.ifError(err);
            var assertTraceProperties = function(predicate) {
              var trace = common.getMatchingSpan(predicate);
              assert(trace);
              common.assertDurationCorrect(predicate);
              assert.strictEqual(trace.labels.metadata, '{"a":"b"}');
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
        common.runInTransaction(function(endTransaction) {
          var stream = client.testClientStream(function(err, result) {
            endTransaction();
            assert.ifError(err);
            var assertTraceProperties = function(predicate) {
              var trace = common.getMatchingSpan(predicate);
              assert(trace);
              common.assertDurationCorrect(predicate);
              assert.strictEqual(trace.labels.metadata, '{"a":"b"}');
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
        common.runInTransaction(function(endTransaction) {
          client.testUnary({n: SEND_METADATA}, metadata, {},
              function(err, result) {
                endTransaction();
                assert.ifError(err);
                var assertTraceProperties = function(predicate) {
                  var trace = common.getMatchingSpan(predicate);
                  assert(trace);
                  common.assertDurationCorrect(predicate);
                  assert.strictEqual(trace.labels.metadata, '{"a":"b"}');
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
        common.runInTransaction(function(endTransaction) {
          var stream = client.testClientStream(metadata, {},
              function(err, result) {
                endTransaction();
                assert.ifError(err);
                var assertTraceProperties = function(predicate) {
                  var trace = common.getMatchingSpan(predicate);
                  assert(trace);
                  common.assertDurationCorrect(predicate);
                  assert.strictEqual(trace.labels.metadata, '{"a":"b"}');
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
