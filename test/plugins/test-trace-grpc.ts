// Copyright 2016 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {cls} from '../../src/cls';
import {Constants} from '../../src/constants';
import {TraceLabels} from '../../src/trace-labels';
import * as TracingPolicy from '../../src/tracing-policy';
import * as util from '../../src/util';
import * as assert from 'assert';
import {it, before, after, afterEach} from 'mocha';
import {
  asRootSpanData,
  describeInterop,
  DEFAULT_SPAN_DURATION,
  assertSpanDuration,
} from '../utils';
import {Span} from '../../src/plugin-types';
import {FORCE_NEW} from '../../src/util';

import * as shimmer from 'shimmer';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const common = require('./common' /*.js*/);

const protoFile = __dirname + '/../fixtures/test-grpc.proto';
const grpcPort = 50051;

// When received in the 'n' field, the server should perform the appropriate action
// (For client streaming methods, this would be the total sum of all requests)
const SEND_METADATA = 131;
const EMIT_ERROR = 13412;

// Regular expression matching client-side metadata labels
const metadataRegExp = /"a":"b"/;

// Whether asserts in checkServerMetadata should be run
// Turned on only for the test that checks propagated trace context
let checkMetadata;

// When trace IDs are checked in checkServerMetadata, they should have this
// exact value. This only applies in the test "should support distributed
// context".
const COMMON_TRACE_ID = 'ffeeddccbbaa99887766554433221100';

function checkServerMetadata(metadata) {
  if (checkMetadata) {
    const traceContext = metadata.getMap()[
      Constants.TRACE_CONTEXT_GRPC_METADATA_NAME
    ];
    const parsedContext = util.deserializeTraceContext(traceContext);
    assert.ok(parsedContext);
    const root = asRootSpanData(cls.get().getContext() as Span);
    // Check that we were able to propagate trace context.
    assert.strictEqual(parsedContext!.traceId, COMMON_TRACE_ID);
    assert.strictEqual(root.trace.traceId, COMMON_TRACE_ID);
    // Check that we correctly assigned the parent ID of the current span to
    // that of the incoming span ID.
    assert.strictEqual(root.span.parentSpanId, parsedContext!.spanId);
  }
}

function startServer(proto, grpc, agent, metadata, trailing_metadata) {
  const _server = new grpc.Server();
  _server.addProtoService(proto.Tester.service, {
    testUnary: function (call, cb) {
      checkServerMetadata(call.metadata);
      if (call.request.n === EMIT_ERROR) {
        common.createChildSpan(() => {
          cb(new Error('test'));
        }, DEFAULT_SPAN_DURATION);
      } else if (call.request.n === SEND_METADATA) {
        call.sendMetadata(metadata);
        setTimeout(() => {
          cb(null, {n: call.request.n}, trailing_metadata);
        }, DEFAULT_SPAN_DURATION);
      } else {
        common.createChildSpan(() => {
          cb(null, {n: call.request.n});
        }, DEFAULT_SPAN_DURATION);
      }
    },
    testClientStream: function (call, cb) {
      checkServerMetadata(call.metadata);
      let sum = 0;
      let triggerCb = function () {
        cb(null, {n: sum});
      };
      let stopChildSpan;
      call.on('data', data => {
        // Creating child span in stream event handler to ensure that
        // context is propagated correctly
        if (!stopChildSpan) {
          stopChildSpan = common.createChildSpan(() => {
            triggerCb();
          }, DEFAULT_SPAN_DURATION);
        }
        sum += data.n;
      });
      call.on('end', () => {
        if (sum === EMIT_ERROR) {
          triggerCb = function () {
            if (stopChildSpan) {
              stopChildSpan();
            }
            cb(new Error('test'));
          };
        } else if (sum === SEND_METADATA) {
          call.sendMetadata(metadata);
          triggerCb = function () {
            cb(null, {n: sum}, trailing_metadata);
          };
        }
      });
    },
    testServerStream: function (stream) {
      checkServerMetadata(stream.metadata);
      if (stream.request.n === EMIT_ERROR) {
        common.createChildSpan(() => {
          stream.emit('error', new Error('test'));
        }, DEFAULT_SPAN_DURATION);
      } else {
        if (stream.request.n === SEND_METADATA) {
          stream.sendMetadata(metadata);
        }
        for (let i = 0; i < 10; ++i) {
          stream.write({n: i});
        }
        common.createChildSpan(() => {
          stream.end();
        }, DEFAULT_SPAN_DURATION);
      }
    },
    testBidiStream: function (stream) {
      checkServerMetadata(stream.metadata);
      let sum = 0;
      let stopChildSpan;
      const t = setTimeout(() => {
        stream.end();
      }, DEFAULT_SPAN_DURATION);
      stream.on('data', data => {
        // Creating child span in stream event handler to ensure that
        // context is propagated correctly
        if (!stopChildSpan) {
          stopChildSpan = common.createChildSpan(null, DEFAULT_SPAN_DURATION);
        }
        sum += data.n;
        stream.write({n: data.n});
      });
      stream.on('end', () => {
        stopChildSpan();
        if (sum === EMIT_ERROR) {
          clearTimeout(t);
          setTimeout(() => {
            if (stopChildSpan) {
              stopChildSpan();
            }
            stream.emit('error', new Error('test'));
          }, DEFAULT_SPAN_DURATION);
        } else if (sum === SEND_METADATA) {
          stream.sendMetadata(metadata);
        }
      });
    },
  });
  _server.bind(
    'localhost:' + grpcPort,
    grpc.ServerCredentials.createInsecure()
  );
  _server.start();
  return _server;
}

function createClient(proto, grpc) {
  return new proto.Tester(
    'localhost:' + grpcPort,
    grpc.credentials.createInsecure()
  );
}

function callUnary(client, grpc, metadata, cb) {
  const args = [
    {n: 42},
    function (err, result) {
      assert.ifError(err);
      assert.strictEqual(result.n, 42);
      cb();
    },
  ];
  if (Object.keys(metadata).length > 0) {
    const m = new grpc.Metadata();
    for (const key in metadata) {
      m.add(key, metadata[key]);
    }
    args.splice(1, 0, m);
  }
  // eslint-disable-next-line prefer-spread
  client.testUnary.apply(client, args);
}

function callClientStream(client, grpc, metadata, cb) {
  const args = [
    function (err, result) {
      assert.ifError(err);
      assert.strictEqual(result.n, 45);
      cb();
    },
  ];
  if (Object.keys(metadata).length > 0) {
    const m = new grpc.Metadata();
    for (const key in metadata) {
      m.add(key, metadata[key]);
    }
    args.unshift(m);
  }
  // eslint-disable-next-line prefer-spread
  const stream = client.testClientStream.apply(client, args);
  for (let i = 0; i < 10; ++i) {
    stream.write({n: i});
  }
  stream.end();
}

function callServerStream(client, grpc, metadata, cb) {
  const args = [{n: 42}];
  if (Object.keys(metadata).length > 0) {
    const m = new grpc.Metadata();
    for (const key in metadata) {
      m.add(key, metadata[key]);
    }
    args.push(m);
  }
  // eslint-disable-next-line prefer-spread
  const stream = client.testServerStream.apply(client, args);
  let sum = 0;
  stream.on('data', data => {
    sum += data.n;
  });
  stream.on('status', status => {
    assert.strictEqual(status.code, grpc.status.OK);
    assert.strictEqual(sum, 45);
    cb();
  });
}

function callBidi(client, grpc, metadata, cb) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const args: any[] = [];
  if (Object.keys(metadata).length > 0) {
    const m = new grpc.Metadata();
    for (const key in metadata) {
      m.add(key, metadata[key]);
    }
    args.push(m);
  }
  // eslint-disable-next-line prefer-spread
  const stream = client.testBidiStream.apply(client, args);
  let sum = 0;
  stream.on('data', data => {
    sum += data.n;
  });
  for (let i = 0; i < 10; ++i) {
    stream.write({n: i});
  }
  stream.end();
  stream.on('status', status => {
    assert.strictEqual(status.code, grpc.status.OK);
    assert.strictEqual(sum, 45);
    cb();
  });
}

describeInterop('grpc', fixture => {
  let agent;
  let grpc;
  let metadata;
  let server;
  let client;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let shouldTraceArgs: any[] = [];
  before(() => {
    // Set up to record invocations of shouldTrace
    shimmer.wrap(
      TracingPolicy.BuiltinTracePolicy.prototype,
      'shouldTrace',
      original => {
        return function (options) {
          shouldTraceArgs.push(options);
          // eslint-disable-next-line prefer-rest-params
          return original.apply(this, arguments);
        };
      }
    );

    // It is necessary for the samplingRate to be 0 for the tests to succeed
    agent = require('../../..').start({
      projectId: '0',
      samplingRate: 0,
      enhancedDatabaseReporting: true,
      [FORCE_NEW]: true,
    });

    grpc = fixture.require();

    const oldRegister = grpc.Server.prototype.register;
    grpc.Server.prototype.register = function register(n, h, s, d, m) {
      const result = oldRegister.call(this, n, h, s, d, m);
      const oldFunc = this.handlers[n].func;
      this.handlers[n].func = function () {
        // eslint-disable-next-line prefer-rest-params
        return oldFunc.apply(this, arguments);
      };
      return result;
    };

    // This metadata can be used by all test methods.
    metadata = new grpc.Metadata();
    metadata.set('a', 'b');

    // Trailing metadata can be sent by unary and client stream requests.
    const trailing_metadata = new grpc.Metadata();
    trailing_metadata.set('c', 'd');

    const proto = grpc.load(protoFile).nodetest;
    server = startServer(proto, grpc, agent, metadata, trailing_metadata);
    client = createClient(proto, grpc);
  });

  after(() => {
    server.forceShutdown();
  });

  afterEach(() => {
    shouldTraceArgs = [];
    common.cleanTraces();
    checkMetadata = false;
  });

  it('should accurately measure time for unary requests', done => {
    const start = Date.now();
    common.runInTransaction(endTransaction => {
      callUnary(client, grpc, {}, () => {
        endTransaction();
        const assertTraceProperties = function (predicate) {
          const trace = common.getMatchingSpan(predicate);
          assert(trace);
          assertSpanDuration(common.getMatchingSpan(predicate), [
            DEFAULT_SPAN_DURATION,
            Date.now() - start,
          ]);
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

  it('should accurately measure time for client streaming requests', done => {
    const start = Date.now();
    common.runInTransaction(endTransaction => {
      callClientStream(client, grpc, {}, () => {
        endTransaction();
        const assertTraceProperties = function (predicate) {
          const trace = common.getMatchingSpan(predicate);
          assert(trace);
          assertSpanDuration(common.getMatchingSpan(predicate), [
            DEFAULT_SPAN_DURATION,
            Date.now() - start,
          ]);
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

  it('should accurately measure time for server streaming requests', done => {
    const start = Date.now();
    common.runInTransaction(endTransaction => {
      callServerStream(client, grpc, {}, () => {
        endTransaction();
        const assertTraceProperties = function (predicate) {
          const trace = common.getMatchingSpan(predicate);
          assert(trace);
          assertSpanDuration(common.getMatchingSpan(predicate), [
            DEFAULT_SPAN_DURATION,
            Date.now() - start,
          ]);
          assert.strictEqual(trace.labels.argument, '{"n":42}');
          return trace;
        };
        const clientTrace = assertTraceProperties(grpcClientPredicate);
        assert.strictEqual(
          clientTrace.labels.status,
          '{"code":0,"details":"OK","metadata":{"_internal_repr":{},"flags":0}}'
        );
        assertTraceProperties(grpcServerOuterPredicate);
        // Check that a child span was created in gRPC root span
        assert(common.getMatchingSpan(grpcServerInnerPredicate));
        done();
      });
    });
  });

  it('should accurately measure time for bidi streaming requests', done => {
    const start = Date.now();
    common.runInTransaction(endTransaction => {
      callBidi(client, grpc, {}, () => {
        endTransaction();
        const assertTraceProperties = function (predicate) {
          const trace = common.getMatchingSpan(predicate);
          assert(trace);
          assertSpanDuration(common.getMatchingSpan(predicate), [
            DEFAULT_SPAN_DURATION,
            Date.now() - start,
          ]);
          return trace;
        };
        const clientTrace = assertTraceProperties(grpcClientPredicate);
        assert.strictEqual(
          clientTrace.labels.status,
          '{"code":0,"details":"OK","metadata":{"_internal_repr":{},"flags":0}}'
        );
        assertTraceProperties(grpcServerOuterPredicate);
        // Check that a child span was created in gRPC root span
        assert(common.getMatchingSpan(grpcServerInnerPredicate));
        done();
      });
    });
  });

  // Older versions of gRPC (<1.7) do not add original names.
  fixture.skip(it, '1.6')(
    'should trace client requests using the original method name',
    done => {
      common.runInTransaction(endTransaction => {
        // The original method name is TestUnary.
        client.TestUnary({n: 10}, (err, result) => {
          assert.ifError(err);
          assert.strictEqual(result.n, 10);
          endTransaction();
          const assertTraceProperties = function (predicate) {
            const trace = common.getMatchingSpan(predicate);
            assert.ok(trace);
            assert.strictEqual(trace.labels.argument, '{"n":10}');
            assert.strictEqual(trace.labels.result, '{"n":10}');
          };
          assertTraceProperties(grpcClientPredicate);
          assertTraceProperties(grpcServerOuterPredicate);
          // Check that a child span was created in gRPC root span
          assert.ok(common.getMatchingSpan(grpcServerInnerPredicate));
          done();
        });
      });
    }
  );

  it('should propagate context', done => {
    common.runInTransaction(endTransaction => {
      callUnary(client, grpc, {}, () => {
        assert.ok(common.hasContext());
        endTransaction();
        done();
      });
    });
  });

  it('should not break if no parent transaction', done => {
    callUnary(client, grpc, {}, () => {
      assert.strictEqual(
        common.getMatchingSpans(grpcClientPredicate).length,
        0
      );
      done();
    });
  });

  it('should respect the tracing policy', done => {
    let next = function () {
      assert.strictEqual(
        shouldTraceArgs.length,
        4,
        'expected one call for each of four gRPC method types but got ' +
          shouldTraceArgs.length +
          ' instead'
      );
      const prefix = 'grpc:/nodetest.Tester/Test';
      // calls to shouldTrace should be in the order which the client method
      // of each type was called.
      assert.strictEqual(shouldTraceArgs[3].url, prefix + 'Unary');
      assert.strictEqual(shouldTraceArgs[2].url, prefix + 'ClientStream');
      assert.strictEqual(shouldTraceArgs[1].url, prefix + 'ServerStream');
      assert.strictEqual(shouldTraceArgs[0].url, prefix + 'BidiStream');
      done();
    };
    next = callUnary.bind(null, client, grpc, {}, next);
    next = callClientStream.bind(null, client, grpc, {}, next);
    next = callServerStream.bind(null, client, grpc, {}, next);
    next = callBidi.bind(null, client, grpc, {}, next);
    next();
  });

  it('should support distributed trace context', done => {
    function makeLink(fn, meta, next) {
      return function () {
        agent.runInRootSpan(
          {
            name: '',
            traceContext: {
              traceId: COMMON_TRACE_ID,
              spanId: '0',
              options: 1,
            },
          },
          span => {
            assert.strictEqual(span.type, agent.spanTypes.ROOT);
            fn(client, grpc, meta, () => {
              span.endSpan();
              next();
            });
          }
        );
      };
    }
    // Enable asserting properties of the metdata on the grpc server.
    checkMetadata = true;
    let next;
    const metadata = {a: 'b'};
    next = function () {
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

  it('should not let root spans interfere with one another', function (done) {
    this.timeout(8000);
    let next = done;
    // Calling queueCallTogether builds a call chain, with each link
    // testing interference between two gRPC calls spaced apart by half
    // of DEFAULT_SPAN_DURATION (to interleave them).
    // This chain is kicked off with an initial call to next().
    const queueCallTogether = function (first, second) {
      const prevNext = next;
      next = function () {
        let startFirst, startSecond, endFirst;
        common.runInTransaction(endTransaction => {
          let num = 0;
          common.cleanTraces();
          const callback = function () {
            if (num === 0) {
              endFirst = Date.now();
            }
            if (++num === 2) {
              endTransaction();
              const spans = common.getMatchingSpans(grpcServerOuterPredicate);
              assert(spans.length === 2);
              assert(spans[0].spanId !== spans[1].spanId);
              assert(spans[0].startTime !== spans[1].startTime);
              assertSpanDuration(spans[0], [
                DEFAULT_SPAN_DURATION,
                endFirst - startFirst,
              ]);
              assertSpanDuration(spans[1], [
                DEFAULT_SPAN_DURATION,
                Date.now() - startSecond,
              ]);
              setImmediate(prevNext);
            }
          };
          startFirst = Date.now();
          first(callback);
          setTimeout(() => {
            startSecond = Date.now();
            second(callback);
          }, DEFAULT_SPAN_DURATION / 2);
        });
      };
    };

    // Call queueCallTogether with every possible pair of gRPC calls.
    const methods = [
      callUnary.bind(null, client, grpc, {}),
      callClientStream.bind(null, client, grpc, {}),
      callServerStream.bind(null, client, grpc, {}),
      callBidi.bind(null, client, grpc, {}),
    ];
    for (const m of methods) {
      for (const n of methods) {
        queueCallTogether(m, n);
      }
    }

    // Kick off call chain.
    next();
  });

  it('should remove trace frames from stack', done => {
    common.runInTransaction(endTransaction => {
      client.testUnary({n: 42}, (err, result) => {
        endTransaction();
        assert.ifError(err);
        assert.strictEqual(result.n, 42);
        function getMethodName(predicate) {
          const trace = common.getMatchingSpan(predicate);
          const labels = trace.labels;
          const stack = JSON.parse(labels[TraceLabels.STACK_TRACE_DETAILS_KEY]);
          return stack.stack_frame[0].method_name;
        }
        assert.notStrictEqual(
          -1,
          getMethodName(grpcClientPredicate).indexOf('clientMethodTrace')
        );
        assert.notStrictEqual(
          -1,
          getMethodName(grpcServerOuterPredicate).indexOf('serverMethodTrace')
        );
        done();
      });
    });
  });

  it('should trace errors for unary requests', done => {
    common.runInTransaction(endTransaction => {
      client.testUnary({n: EMIT_ERROR}, err => {
        endTransaction();
        assert(err);
        const assertTraceProperties = function (predicate) {
          const trace = common.getMatchingSpan(predicate);
          assert.ok(trace);
          assert.strictEqual(trace.labels.argument, '{"n":' + EMIT_ERROR + '}');
          assert.ok(trace.labels.error.indexOf('test') !== -1);
        };
        assertTraceProperties(grpcClientPredicate);
        assertTraceProperties(grpcServerOuterPredicate);
        // Check that a child span was created in gRPC root span
        assert(common.getMatchingSpan(grpcServerInnerPredicate));
        done();
      });
    });
  });

  it('should trace errors for client streaming requests', done => {
    common.runInTransaction(endTransaction => {
      const stream = client.testClientStream(err => {
        endTransaction();
        assert(err);
        const assertTraceProperties = function (predicate) {
          const trace = common.getMatchingSpan(predicate);
          assert.ok(trace);
          assert.ok(trace.labels.error.indexOf('test') !== -1);
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

  it('should trace errors for server streaming requests', done => {
    common.runInTransaction(endTransaction => {
      const stream = client.testServerStream({n: EMIT_ERROR}, metadata);
      stream.on('data', () => {});
      stream.on('error', () => {
        endTransaction();
        const assertTraceProperties = function (predicate) {
          const trace = common.getMatchingSpan(predicate);
          assert.ok(trace);
          assert.ok(trace.labels.error.indexOf('test') !== -1);
        };
        assertTraceProperties(grpcClientPredicate);
        assertTraceProperties(grpcServerOuterPredicate);
        // Check that a child span was created in gRPC root span
        assert(common.getMatchingSpan(grpcServerInnerPredicate));
        done();
      });
    });
  });

  it('should trace errors for bidi streaming requests', done => {
    common.runInTransaction(endTransaction => {
      const stream = client.testBidiStream(metadata);
      stream.on('data', () => {});
      stream.write({n: EMIT_ERROR});
      stream.end();
      stream.on('error', () => {
        endTransaction();
        const assertTraceProperties = function (predicate) {
          const trace = common.getMatchingSpan(predicate);
          assert.ok(trace);
          assert.ok(trace.labels.error.indexOf('test') !== -1);
        };
        assertTraceProperties(grpcClientPredicate);
        assertTraceProperties(grpcServerOuterPredicate);
        // Check that a child span was created in gRPC root span
        assert(common.getMatchingSpan(grpcServerInnerPredicate));
        done();
      });
    });
  });

  it('should trace metadata for server streaming requests', done => {
    const start = Date.now();
    common.runInTransaction(endTransaction => {
      const stream = client.testServerStream({n: SEND_METADATA}, metadata);
      stream.on('data', () => {});
      stream.on('status', status => {
        endTransaction();
        assert.strictEqual(status.code, grpc.status.OK);
        const assertTraceProperties = function (predicate) {
          const trace = common.getMatchingSpan(predicate);
          assert(trace);
          assertSpanDuration(common.getMatchingSpan(predicate), [
            DEFAULT_SPAN_DURATION,
            Date.now() - start,
          ]);
          assert.ok(metadataRegExp.test(trace.labels.metadata));
        };
        assertTraceProperties(grpcClientPredicate);
        assertTraceProperties(grpcServerOuterPredicate);
        done();
      });
    });
  });

  it('should trace metadata for bidi streaming requests', done => {
    const start = Date.now();
    common.runInTransaction(endTransaction => {
      const stream = client.testBidiStream(metadata);
      stream.on('data', () => {});
      stream.write({n: SEND_METADATA});
      stream.end();
      stream.on('status', status => {
        endTransaction();
        assert.strictEqual(status.code, grpc.status.OK);
        const assertTraceProperties = function (predicate) {
          const trace = common.getMatchingSpan(predicate);
          assert(trace);
          assertSpanDuration(common.getMatchingSpan(predicate), [
            DEFAULT_SPAN_DURATION,
            Date.now() - start,
          ]);
          assert.ok(metadataRegExp.test(trace.labels.metadata));
        };
        assertTraceProperties(grpcClientPredicate);
        assertTraceProperties(grpcServerOuterPredicate);
        done();
      });
    });
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
