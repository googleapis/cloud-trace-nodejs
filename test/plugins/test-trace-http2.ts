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

import * as assert from 'assert';
// This is imported only for types. Generated .js file should NOT load 'http2'
// in this place. It is dynamically loaded later from each test suite below.
import * as http2Types from 'http2';
import * as semver from 'semver';
import * as stream from 'stream';

import {Constants, SpanType} from '../../src/constants';
import {TraceLabels} from '../../src/trace-labels';
import * as traceTestModule from '../trace';
import {
  assertSpanDuration,
  DEFAULT_SPAN_DURATION,
  hasContext,
  SERVER_CERT,
  SERVER_KEY,
} from '../utils';

const serverRes = '1729';
const serverPort = 9042;

const maybeSkipHttp2 = semver.satisfies(process.version, '<8')
  ? describe.skip
  : describe;

maybeSkipHttp2('Trace Agent integration with http2', () => {
  let http2: typeof http2Types;

  before(() => {
    traceTestModule.setPluginLoaderForTest();
    traceTestModule.setCLSForTest();
    traceTestModule.start();
    http2 = require('http2');
  });

  after(() => {
    traceTestModule.setPluginLoaderForTest(traceTestModule.TestPluginLoader);
    traceTestModule.setCLSForTest(traceTestModule.TestCLS);
  });

  afterEach(() => {
    traceTestModule.clearTraceData();
  });

  describe('test-trace-http2', () => {
    let server: http2Types.Http2Server;

    before(() => {
      server = http2.createServer();
      server.on('stream', s => {
        setTimeout(() => {
          s.respond({':status': 200});
          s.end(serverRes);
        }, DEFAULT_SPAN_DURATION);
      });
    });

    afterEach(done => {
      if (server.listening) {
        server.close(done);
      } else {
        done();
      }
    });

    it('should patch the necessary functions', () => {
      assert.strictEqual(http2.connect['__wrapped'], true);
    });

    it('should accurately measure request time', done => {
      server.listen(serverPort, () => {
        traceTestModule.get().runInRootSpan({name: 'outer'}, rootSpan => {
          assert.ok(rootSpan.type === SpanType.ROOT);
          const start = Date.now();
          const session = http2.connect(`http://localhost:${serverPort}`);
          const s = session.request({':path': '/'});
          s.setEncoding('utf8');
          let result = '';
          s.on('data', (data: string) => {
            result += data;
          }).on('end', () => {
            rootSpan.endSpan();
            assert.strictEqual(result, serverRes);
            assertSpanDuration(
              traceTestModule.getOneSpan(span => span.name !== 'outer'),
              [DEFAULT_SPAN_DURATION, Date.now() - start]
            );
            session.destroy();
            done();
          });
          s.end();
        });
      });
    });

    it('should propagate context', done => {
      server.listen(serverPort, () => {
        traceTestModule.get().runInRootSpan({name: 'outer'}, rootSpan => {
          assert.ok(rootSpan.type === SpanType.ROOT);
          const session = http2.connect(`http://localhost:${serverPort}`);
          const s = session.request({':path': '/'});
          s.on('data', () => {
            assert.ok(hasContext());
          }).on('end', () => {
            assert.ok(hasContext());
            rootSpan.endSpan();
            session.destroy();
            done();
          });
          s.end();
        });
      });
    });

    it('should not trace api requests', done => {
      server.listen(serverPort, () => {
        traceTestModule.get().runInRootSpan({name: 'outer'}, rootSpan => {
          assert.ok(rootSpan.type === SpanType.ROOT);
          const session = http2.connect(`http://localhost:${serverPort}`);
          const headers: http2Types.OutgoingHttpHeaders = {':path': '/'};
          headers[Constants.TRACE_AGENT_REQUEST_HEADER] = 'yay';
          const s = session.request(headers);
          s.end();
          setTimeout(() => {
            rootSpan.endSpan();
            const traces = traceTestModule.getTraces();
            assert.strictEqual(traces.length, 1);
            // The only span present should be the outer span.
            assert.strictEqual(traces[0].spans.length, 1);
            assert.strictEqual(traces[0].spans[0].name, 'outer');
            session.destroy();
            done();
          }, DEFAULT_SPAN_DURATION * 1.5);
        });
      });
    });

    it('should not break with no headers', done => {
      server.listen(serverPort, () => {
        traceTestModule.get().runInRootSpan({name: 'outer'}, rootSpan => {
          assert.ok(rootSpan.type === SpanType.ROOT);
          const session = http2.connect(`http://localhost:${serverPort}`);
          // `headers` are not passed
          const s = session.request();
          s.setEncoding('utf8');
          s.on('data', (data: string) => {}).on('end', () => {
            rootSpan.endSpan();
            const traces = traceTestModule.getTraces();
            assert.strictEqual(traces.length, 1);
            // /http/method and /http/url must be set correctly even when the
            // `headers` argument is not passed to the request() call.
            assert.strictEqual(
              traces[0].spans[1].labels['/http/method'],
              'GET'
            );
            assert.strictEqual(
              traces[0].spans[1].labels['/http/url'],
              `http://localhost:${serverPort}/`
            );
            session.destroy();
            done();
          });
          s.end();
        });
      });
    });

    it('should leave request streams in paused mode', done => {
      server.listen(serverPort, () => {
        traceTestModule.get().runInRootSpan({name: 'outer'}, rootSpan => {
          assert.ok(rootSpan.type === SpanType.ROOT);
          const start = Date.now();
          const session = http2.connect(`http://localhost:${serverPort}`);
          const s = session.request({':path': '/'});
          let result = '';
          const writable = new stream.Writable();
          writable._write = (chunk, encoding, next) => {
            result += chunk;
            next();
          };
          writable.on('finish', () => {
            rootSpan.endSpan();
            assert.strictEqual(result, serverRes);
            assertSpanDuration(
              traceTestModule.getOneSpan(span => span.name !== 'outer'),
              [DEFAULT_SPAN_DURATION, Date.now() - start]
            );
            session.destroy();
            done();
          });
          setImmediate(() => {
            s.pipe(writable);
          });
          s.end();
        });
      });
    });

    it('should not include query parameters in span name', done => {
      server.listen(serverPort, () => {
        traceTestModule.get().runInRootSpan({name: 'outer'}, rootSpan => {
          assert.ok(rootSpan.type === SpanType.ROOT);
          const session = http2.connect(`http://localhost:${serverPort}`);
          const s = session.request({':path': '/?foo=bar'});
          s.on('data', () => {}); // enter flowing mode
          s.end();
          setTimeout(() => {
            rootSpan.endSpan();
            const traces = traceTestModule.getTraces();
            assert.strictEqual(traces.length, 1);
            assert.strictEqual(traces[0].spans[1].name, 'localhost');
            session.destroy();
            done();
          }, DEFAULT_SPAN_DURATION * 1.5);
        });
      });
    });

    it('custom port number must be included in the url label', done => {
      server.listen(serverPort, () => {
        traceTestModule.get().runInRootSpan({name: 'outer'}, rootSpan => {
          assert.ok(rootSpan.type === SpanType.ROOT);
          const session = http2.connect(`http://localhost:${serverPort}`);
          const s = session.request({':path': '/'});
          s.on('data', () => {}); // enter flowing mode
          s.end();
          setTimeout(() => {
            rootSpan.endSpan();
            const traces = traceTestModule.getTraces();
            assert.strictEqual(traces.length, 1);
            assert.strictEqual(
              traces[0].spans[1].labels['/http/url'],
              `http://localhost:${serverPort}/`
            );
            session.destroy();
            done();
          }, DEFAULT_SPAN_DURATION * 1.5);
        });
      });
    });

    it('should accurately measure request time, error', done => {
      const server: http2Types.Http2Server = http2.createServer();
      server.on(
        'stream',
        (
          s: http2Types.ServerHttp2Stream & ({rstWithInternalError: () => void})
        ) => {
          // In Node 9.9+, the error handler is not added by default.
          s.on('error', () => {});
          setTimeout(() => {
            if (semver.satisfies(process.version, '^8.11||>=9.4')) {
              // Node 8.11/9.4 removed rstWithInternalError() in favor of new
              // close() function.
              s.close(http2.constants.NGHTTP2_INTERNAL_ERROR);
            } else {
              s.rstWithInternalError();
            }
          }, DEFAULT_SPAN_DURATION / 2);
        }
      );
      server.listen(serverPort, () => {
        traceTestModule.get().runInRootSpan({name: 'outer'}, rootSpan => {
          assert.ok(rootSpan.type === SpanType.ROOT);
          const start = Date.now();
          const session = http2.connect(`http://localhost:${serverPort}`);
          const s = session.request({':path': '/'});
          s.on('error', () => {
            rootSpan.endSpan();
            const span = traceTestModule.getOneSpan(
              span => span.name !== 'outer'
            );
            assertSpanDuration(span, [
              DEFAULT_SPAN_DURATION / 2,
              Date.now() - start,
            ]);
            if (semver.satisfies(process.version, '>=12')) {
              assert.strictEqual(
                span.labels[TraceLabels.ERROR_DETAILS_NAME],
                'Error'
              );
            } else {
              assert.strictEqual(
                span.labels[TraceLabels.ERROR_DETAILS_NAME],
                'Error [ERR_HTTP2_STREAM_ERROR]'
              );
            }
            if (semver.satisfies(process.version, '>=9.11 || >=8.12')) {
              assert.strictEqual(
                span.labels[TraceLabels.ERROR_DETAILS_MESSAGE],
                'Stream closed with error code NGHTTP2_INTERNAL_ERROR'
              );
            } else {
              assert.strictEqual(
                span.labels[TraceLabels.ERROR_DETAILS_MESSAGE],
                'Stream closed with error code 2'
              );
            }
            session.destroy();
            server.close();
            done();
          });
          s.end();
        });
      });
    });

    it('should accurately measure request time, event emitter', done => {
      server.listen(serverPort, () => {
        traceTestModule.get().runInRootSpan({name: 'outer'}, rootSpan => {
          assert.ok(rootSpan.type === SpanType.ROOT);
          const start = Date.now();
          const session = http2.connect(`http://localhost:${serverPort}`);
          const s: http2Types.ClientHttp2Stream = session.request({
            ':path': '/',
          });
          s.setEncoding('utf8');
          s.on('response', () => {
            let result = '';
            s.on('data', data => {
              result += data;
            }).on('end', () => {
              rootSpan.endSpan();
              assert.strictEqual(result, serverRes);
              assertSpanDuration(
                traceTestModule.getOneSpan(span => span.name !== 'outer'),
                [DEFAULT_SPAN_DURATION, Date.now() - start]
              );
              session.destroy();
              done();
            });
          });
        });
      });
    });

    it('should handle concurrent requests', function(done) {
      this.timeout(10000); // this test takes a long time
      let count = 200;
      const slowServer: http2Types.Http2Server = http2.createServer();
      slowServer.on('stream', s => {
        setTimeout(() => {
          s.respond({':status': count++});
          s.end();
        }, 5000);
      });
      slowServer.listen(serverPort, () => {
        traceTestModule.get().runInRootSpan({name: 'outer'}, rootSpan => {
          assert.ok(rootSpan.type === SpanType.ROOT);
          let completed = 0;
          for (let i = 0; i < 5; i++) {
            const session = http2.connect(`http://localhost:${serverPort}`);
            const s = session.request({':path': '/'});
            s.on('data', () => {}).on('end', () => {
              if (++completed === 5) {
                rootSpan.endSpan();
                const spans = traceTestModule.getSpans(
                  span => span.name !== 'outer'
                );
                assert.strictEqual(spans.length, 5);
                // We need to check a property attached at the end of a span.
                const statusCodes: number[] = [];
                for (let j = 0; j < spans.length; j++) {
                  const code = Number(
                    spans[j].labels[TraceLabels.HTTP_RESPONSE_CODE_LABEL_KEY]
                  );
                  assert.strictEqual(statusCodes.indexOf(code), -1);
                  statusCodes.push(code);
                }
                assert.strictEqual(statusCodes.reduce((a, b) => a + b), 1010);
                slowServer.close();
                done();
              }
              session.destroy();
            });
            s.end();
          }
        });
      });
    });
  });

  describe('Secure HTTP2', () => {
    it('should accurately measure request time', done => {
      const options: http2Types.SecureServerOptions = {
        key: SERVER_KEY,
        cert: SERVER_CERT,
      };
      const secureServer: http2Types.Http2SecureServer = http2.createSecureServer(
        options
      );
      secureServer.on('stream', s => {
        setTimeout(() => {
          s.respond({':status': 200});
          s.end(serverRes);
        }, DEFAULT_SPAN_DURATION);
      });
      secureServer.listen(serverPort, () => {
        traceTestModule.get().runInRootSpan({name: 'outer'}, rootSpan => {
          assert.ok(rootSpan.type === SpanType.ROOT);
          const start = Date.now();
          const session = http2.connect(`https://localhost:${serverPort}`, {
            rejectUnauthorized: false,
          });
          const s = session.request({':path': '/'});
          s.setEncoding('utf8');
          let result = '';
          s.on('data', (data: string) => {
            result += data;
          }).on('end', () => {
            rootSpan.endSpan();
            assert.strictEqual(result, serverRes);
            assertSpanDuration(
              traceTestModule.getOneSpan(span => span.name !== 'outer'),
              [DEFAULT_SPAN_DURATION, Date.now() - start]
            );
            session.destroy();
            secureServer.close();
            done();
          });
          s.end();
        });
      });
    });
  });
});
