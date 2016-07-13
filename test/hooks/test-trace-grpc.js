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
var traceLabels = require('../../lib/trace-labels.js');

var versions = {
  grpc014: require('./fixtures/grpc0.14'),
  grpc015: require('./fixtures/grpc0.15')
};
if (process.platform !== 'win32') {
  // On Windows, skip grpc0.13 due to https://github.com/grpc/grpc/issues/6141.
  // The build error was fixed in grpc0.14.
  versions.grpc013 = require('./fixtures/grpc0.13');
}

var protoFile = __dirname + '/../fixtures/test-grpc.proto';
var grpcPort = 50051;
var client, server;

Object.keys(versions).forEach(function(version) {
  var grpc = versions[version];
  // This metadata can be used by all test methods.
  var metadata = new grpc.Metadata();
  metadata.set('a', 'b');

  function startServer(proto) {
    var _server = new grpc.Server();
    _server.addProtoService(proto.Tester.service, {
      testUnary: function(call, cb) {
        // This is for testing errors.
        if (call.request.n === 13412) {
          cb(new Error('test'));
          return;
        }
        setTimeout(function() {
          cb(null, {n: call.request.n});
        }, common.serverWait);
      },
      testClientStream: function(call, cb) {
        var sum = 0;
        call.on('data', function(data) {
          sum += data.n;
        });
        call.on('end', function() {
          // This is for testing errors.
          if (sum === 13412) {
            cb(new Error('test'));
            return;
          }
          setTimeout(function() {
            cb(null, {n: sum});
          }, common.serverWait);
        });
      },
      testServerStream: function(stream) {
        for (var i = 0; i < 10; ++i) {
          stream.write({n: i});
        }
        setTimeout(function() {
          stream.end();
        }, common.serverWait);
      },
      testBidiStream: function(stream) {
        stream.on('data', function(data) {
          stream.write({n: data.n});
        });
        stream.on('end', function() {
          setTimeout(function() {
            stream.end();
          }, common.serverWait);
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
        client.testUnary({n: 42}, function(err, result) {
          endTransaction();
          assert.ifError(err);
          assert.strictEqual(result.n, 42);
          var trace = common.getMatchingSpan(grpcPredicate);
          assert(trace);
          common.assertDurationCorrect();
          assert.strictEqual(trace.labels.argument, '{"n":42}');
          assert.strictEqual(trace.labels.result, '{"n":42}');
          done();
        });
      });
    });

    it('should accurately measure time for client requests', function(done) {
      common.runInTransaction(function(endTransaction) {
        var stream = client.testClientStream(function(err, result) {
          endTransaction();
          assert.ifError(err);
          assert.strictEqual(result.n, 45);
          var trace = common.getMatchingSpan(grpcPredicate);
          assert(trace);
          common.assertDurationCorrect();
          assert.strictEqual(trace.labels.result, '{"n":45}');
          done();
        });
        for (var i = 0; i < 10; ++i) {
          stream.write({n: i});
        }
        stream.end();
      });
    });

    it('should accurately measure time for server requests', function(done) {
      common.runInTransaction(function(endTransaction) {
        var stream = client.testServerStream({n: 42});
        var sum = 0;
        stream.on('data', function(data) {
          sum += data.n;
        });
        stream.on('status', function(status) {
          endTransaction();
          assert.strictEqual(status.code, grpc.status.OK);
          assert.strictEqual(sum, 45);
          var trace = common.getMatchingSpan(grpcPredicate);
          assert(trace);
          common.assertDurationCorrect();
          assert.strictEqual(trace.labels.argument, '{"n":42}');
          assert.strictEqual(trace.labels.status,
              '{"code":0,"details":"OK","metadata":{"_internal_repr":{}}}');
          done();
        });
      });
    });

    it('should accurately measure time for bidi requests', function(done) {
      common.runInTransaction(function(endTransaction) {
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
          endTransaction();
          assert.strictEqual(status.code, grpc.status.OK);
          assert.strictEqual(sum, 45);
          var trace = common.getMatchingSpan(grpcPredicate);
          assert(trace);
          common.assertDurationCorrect();
          assert.strictEqual(trace.labels.status,
              '{"code":0,"details":"OK","metadata":{"_internal_repr":{}}}');
          done();
        });
      });
    });

    it('should not break if no parent transaction', function(done) {
      client.testUnary({n: 42}, function(err, result) {
        assert.ifError(err);
        assert.strictEqual(result.n, 42);
        assert.strictEqual(common.getTraces().length, 0);
        done();
      });
    });

    it('should remove trace frames from stack', function(done) {
      common.runInTransaction(function(endTransaction) {
        client.testUnary({n: 42}, function(err, result) {
          endTransaction();
          assert.ifError(err);
          assert.strictEqual(result.n, 42);
          var trace = common.getMatchingSpan(grpcPredicate);
          var labels = trace.labels;
          var stack = JSON.parse(labels[traceLabels.STACK_TRACE_DETAILS_KEY]);
          assert.notStrictEqual(-1,
              stack.stack_frame[0].method_name.indexOf('clientMethodTrace'));
          done();
        });
      });
    });

    it('should trace errors for unary requests', function(done) {
      common.runInTransaction(function(endTransaction) {
        client.testUnary({n: 13412}, function(err, result) {
          endTransaction();
          assert(err);
          var trace = common.getMatchingSpan(grpcPredicate);
          assert(trace);
          assert.strictEqual(trace.labels.argument, '{"n":13412}');
          assert.strictEqual(trace.labels.error, 'Error: test');
          done();
        });
      });
    });

    it('should trace errors for client requests', function(done) {
      common.runInTransaction(function(endTransaction) {
        var stream = client.testClientStream(function(err, result) {
          endTransaction();
          assert(err);
          var trace = common.getMatchingSpan(grpcPredicate);
          assert(trace);
          assert.strictEqual(trace.labels.error, 'Error: test');
          done();
        });
        stream.write({n: 13412});
        stream.end();
      });
    });

    it('should trace metadata for server requests', function(done) {
      common.runInTransaction(function(endTransaction) {
        var stream = client.testServerStream({n: 42}, metadata);
        stream.on('data', function(data) {});
        stream.on('status', function(status) {
          endTransaction();
          assert.strictEqual(status.code, grpc.status.OK);
          var trace = common.getMatchingSpan(grpcPredicate);
          assert(trace);
          common.assertDurationCorrect();
          assert.strictEqual(trace.labels.metadata, '{"a":"b"}');
          done();
        });
      });
    });

    it('should trace metadata for bidi requests', function(done) {
      common.runInTransaction(function(endTransaction) {
        var stream = client.testBidiStream(metadata);
        stream.on('data', function(data) {});
        stream.end();
        stream.on('status', function(status) {
          endTransaction();
          assert.strictEqual(status.code, grpc.status.OK);
          var trace = common.getMatchingSpan(grpcPredicate);
          assert(trace);
          common.assertDurationCorrect();
          assert.strictEqual(trace.labels.metadata, '{"a":"b"}');
          done();
        });
      });
    });

    if (version === 'grpc013') {
      it('should trace metadata for old arg orders (unary)', function(done) {
        common.runInTransaction(function(endTransaction) {
          client.testUnary({n: 42}, function(err, result) {
            endTransaction();
            assert.ifError(err);
            var trace = common.getMatchingSpan(grpcPredicate);
            assert(trace);
            common.assertDurationCorrect();
            assert.strictEqual(trace.labels.metadata, '{"a":"b"}');
            done();
          }, metadata, {});
        });
      });

      it('should trace metadata for old arg orders (stream)', function(done) {
        common.runInTransaction(function(endTransaction) {
          var stream = client.testClientStream(function(err, result) {
            endTransaction();
            assert.ifError(err);
            var trace = common.getMatchingSpan(grpcPredicate);
            assert(trace);
            common.assertDurationCorrect();
            assert.strictEqual(trace.labels.metadata, '{"a":"b"}');
            done();
          }, metadata, {});
          stream.end();
        });
      });
    } else {
      it('should trace metadata for new arg orders (unary)', function(done) {
        common.runInTransaction(function(endTransaction) {
          client.testUnary({n: 42}, metadata, {},
              function(err, result) {
                endTransaction();
                assert.ifError(err);
                var trace = common.getMatchingSpan(grpcPredicate);
                assert(trace);
                common.assertDurationCorrect();
                assert.strictEqual(trace.labels.metadata, '{"a":"b"}');
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
                var trace = common.getMatchingSpan(grpcPredicate);
                assert(trace);
                common.assertDurationCorrect();
                assert.strictEqual(trace.labels.metadata, '{"a":"b"}');
                done();
              });
          stream.end();
        });
      });
    }
  });
});

function grpcPredicate(span) {
  return span.name.indexOf('grpc:') === 0;
}
