/**
 * Copyright 2015 Google Inc. All Rights Reserved.
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
import {EventEmitter} from 'events';
import * as fs from 'fs';
import * as httpModule from 'http';
import * as httpsModule from 'https';
import {AddressInfo} from 'net';
import * as path from 'path';
import * as semver from 'semver';
import * as stream from 'stream';
import {URL} from 'url';

import {Constants} from '../../src/constants';
import {SpanKind, TraceSpan} from '../../src/trace';
import {parseContextFromHeader, TraceContext} from '../../src/util';
import * as testTraceModule from '../trace';
import {assertSpanDuration, DEFAULT_SPAN_DURATION} from '../utils';
import {Express4} from '../web-frameworks/express';

// This type describes (http|https).(get|request).
type HttpRequest = (
  options:
    | string
    | httpModule.RequestOptions
    | httpsModule.RequestOptions
    | URL,
  callback?: (res: httpModule.IncomingMessage) => void
) => httpModule.ClientRequest;

/**
 * A class that represents a convenience object that allows us to await
 * http requests. This is done in lieu of promisifying http.request/http.get,
 * because they already have a meaningful return value.
 */
class WaitForResponse {
  private resolve!: (value: string) => void;
  private reject!: (err: Error) => void;
  // A Promise that is resolved when the request function to which
  // this.handleResponse is passed has received its full response, or
  // this.handleDone has been called.
  readonly done: Promise<string>;
  // A callback to be passed to http.request or http.get, so that when response
  // data has been fully consumed, this.done will be resolved.
  handleResponse = (res: httpModule.IncomingMessage) => {
    let data = '';
    res.on('data', d => (data += d));
    res.on('error', this.reject);
    res.on('end', () => this.resolve(data));
  };

  constructor() {
    this.done = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }

  /**
   * Resolves this.done. This should be used when passing handleResponse
   * to a function isn't applicable.
   */
  handleDone() {
    this.resolve('');
  }
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * A modification of the Express4 test server that uses HTTPS instead.
 */
class Express4Secure extends Express4 {
  static key = fs.readFileSync(
    path.join(__dirname, '..', 'fixtures', 'key.pem')
  );
  static cert = fs.readFileSync(
    path.join(__dirname, '..', 'fixtures', 'cert.pem')
  );
  private https: typeof httpsModule;

  constructor() {
    super();
    this.https = require('https');
  }

  listen(port: number): number {
    // The types of (http|https).Server are not compatible, but we don't
    // access any properties that aren't present on both in the test.
    this.server = (this.https.createServer(
      {key: Express4Secure.key, cert: Express4Secure.cert},
      this.app
    ) as {}) as httpModule.Server;
    this.server.listen(port);
    return (this.server.address() as AddressInfo).port;
  }

  shutdown() {
    this.server!.close();
  }
}

// Server abstraction class definitions. These are borrowed from web framework
// tests -- which are useful because they already expose a Promise API.
const servers = {
  http: Express4,
  https: Express4Secure,
};

for (const nodule of Object.keys(servers) as Array<keyof typeof servers>) {
  // ServerFramework is a class constructor.
  // tslint:disable-next-line:variable-name
  const ServerFramework = servers[nodule];
  describe(`${nodule} client tracing`, () => {
    let http: {get: HttpRequest; request: HttpRequest};
    before(() => {
      testTraceModule.setCLSForTest();
      testTraceModule.setPluginLoaderForTest();
      testTraceModule.start({
        plugins: {
          express: '', // we are not interested in tracing express.
        },
      });
      http = require(nodule);
    });

    afterEach(() => {
      testTraceModule.clearTraceData();
    });

    describe('in various usage scenarios', () => {
      let server: Express4;
      let port: number;

      const testCases = [
        {
          description: 'calling http.get with callback',
          fn: async () => {
            const waitForResponse = new WaitForResponse();
            http.get(
              {port, rejectUnauthorized: false},
              waitForResponse.handleResponse
            );
            await waitForResponse.done;
          },
        },
        {
          description: 'calling http.get and using return value',
          fn: async () => {
            const waitForResponse = new WaitForResponse();
            const req = http.get({port, rejectUnauthorized: false});
            req.on('response', waitForResponse.handleResponse);
            await waitForResponse.done;
          },
        },
        {
          description: 'calling http.get and piping from res',
          fn: async () => {
            const waitForResponse = new WaitForResponse();
            http.get({port, rejectUnauthorized: false}, res => {
              let result = '';
              const writable = new stream.Writable();
              writable._write = (chunk, encoding, next) => {
                result += chunk;
                next();
              };
              writable.on('finish', () => {
                waitForResponse.handleDone();
              });
              setImmediate(() => {
                res.pipe(writable);
              });
            });
            await waitForResponse.done;
          },
        },
        {
          description: 'calling http.request',
          fn: async () => {
            const waitForResponse = new WaitForResponse();
            const req = http.request(
              {port, rejectUnauthorized: false},
              waitForResponse.handleResponse
            );
            req.end();
            await waitForResponse.done;
          },
        },
        {
          description: 'calling http.get, but timing out and emitting an error',
          fn: async () => {
            // server.server is a handle to the underlying server in an
            // Express4 instance.
            server.server!.timeout = DEFAULT_SPAN_DURATION / 2;
            const waitForResponse = new WaitForResponse();
            const req = http.get({port, rejectUnauthorized: false});
            req.on('error', () => {
              waitForResponse.handleDone();
            });
            await waitForResponse.done;
          },
        },
        ...['Expect', 'expect', 'EXPECT', 'eXpEcT'].map(key => ({
          description: `calling http.get with ${key} header`,
          fn: async () => {
            const waitForResponse = new WaitForResponse();
            http.get(
              {
                port,
                rejectUnauthorized: false,
                headers: {[key]: '100-continue'},
              },
              waitForResponse.handleResponse
            );
            await waitForResponse.done;
          },
        })),
      ];

      beforeEach(async () => {
        server = new ServerFramework();
        server.addHandler({
          path: '/',
          hasResponse: true,
          fn: async () => {
            await wait(DEFAULT_SPAN_DURATION);
            return {statusCode: 200, message: 'hi'};
          },
        });
        port = server.listen(0);
      });

      afterEach(() => {
        server.shutdown();
      });

      for (const testCase of testCases) {
        it(`creates spans with accurate timespans when ${testCase.description}`, async () => {
          let recordedTime = 0;
          await testTraceModule
            .get()
            .runInRootSpan({name: 'outer'}, async rootSpan => {
              assert.ok(testTraceModule.get().isRealSpan(rootSpan));
              recordedTime = Date.now();
              await testCase.fn();
              recordedTime = Date.now() - recordedTime;
              rootSpan.endSpan();
            });
          const clientSpan = testTraceModule.getOneSpan(
            span => span.kind === 'RPC_CLIENT'
          );
          assertSpanDuration(clientSpan, [recordedTime]);
        });
      }
    });

    // We can't specify { rejectAuthorized: false } for strings, so skip this
    // test for https.
    const maybeIt = nodule === 'http' ? it : it.skip;
    maybeIt('should work if options is a string', async () => {
      const server = new ServerFramework();
      server.addHandler({
        path: '/',
        hasResponse: true,
        fn: async () => {
          return {statusCode: 200, message: 'hi'};
        },
      });
      const port = server.listen(0);
      try {
        await testTraceModule
          .get()
          .runInRootSpan({name: 'outer'}, async rootSpan => {
            assert.ok(testTraceModule.get().isRealSpan(rootSpan));
            const waitForResponse = new WaitForResponse();
            http.get(
              `http://localhost:${port}`,
              waitForResponse.handleResponse
            );
            await waitForResponse.done;
            rootSpan.endSpan();
          });
        assert.doesNotThrow(() =>
          testTraceModule.getOneSpan(span => span.kind === 'RPC_CLIENT')
        );
      } finally {
        server.shutdown();
      }
    });

    it('should propagate trace context across network boundaries', async () => {
      const server = new ServerFramework();
      // On the server side, capture the incoming trace context.
      // The values in the captured context should be consistent with those
      // observed on the client side.
      let serverCapturedTraceContext: TraceContext | null = null;
      server.addHandler({
        path: '/',
        hasResponse: true,
        fn: async headers => {
          const traceContext = headers[Constants.TRACE_CONTEXT_HEADER_NAME];
          assert.ok(traceContext && typeof traceContext === 'string');
          serverCapturedTraceContext = parseContextFromHeader(
            traceContext as string
          );
          return {statusCode: 200, message: 'hi'};
        },
      });
      const port = server.listen(0);
      try {
        await testTraceModule
          .get()
          .runInRootSpan({name: 'root'}, async rootSpan => {
            assert.ok(testTraceModule.get().isRealSpan(rootSpan));
            const waitForResponse = new WaitForResponse();
            http.get(
              {port, rejectUnauthorized: false},
              waitForResponse.handleResponse
            );
            await waitForResponse.done;
            rootSpan.endSpan();
          });
      } finally {
        server.shutdown();
      }
      // There should be a single trace with two spans:
      // [0] outer root span
      // [1] http request on behalf of outer
      const clientTrace = testTraceModule.getOneTrace();
      assert.strictEqual(clientTrace.spans.length, 2);
      assert.strictEqual(clientTrace.spans[1].kind, SpanKind.RPC_CLIENT);
      const httpSpan = clientTrace.spans[1];
      // Check that trace context is as expected.
      assert.ok(serverCapturedTraceContext);
      assert.strictEqual(
        serverCapturedTraceContext!.traceId,
        clientTrace.traceId
      );
      assert.strictEqual(serverCapturedTraceContext!.spanId, httpSpan.spanId);
    });

    it('should preserve trace context across async boundaries', async () => {
      const server = new ServerFramework();
      server.addHandler({
        path: '/',
        hasResponse: true,
        fn: async () => {
          return {statusCode: 200, message: 'hi'};
        },
      });
      const port = server.listen(0);
      try {
        await testTraceModule
          .get()
          .runInRootSpan({name: 'outer'}, async rootSpan => {
            assert.ok(testTraceModule.get().isRealSpan(rootSpan));
            const waitForResponse = new WaitForResponse();
            http.get(
              {port, rejectUnauthorized: false},
              waitForResponse.handleResponse
            );
            await waitForResponse.done;
            // This code executes after the HTTP request is done; i.e. in a
            // descendant continuation from the request 'end' event handler.
            // We make sure that trace context is still accessible here.
            const afterHttpSpan = testTraceModule
              .get()
              .createChildSpan({name: 'after-http'});
            assert.ok(testTraceModule.get().isRealSpan(afterHttpSpan));
            afterHttpSpan.endSpan();
            rootSpan.endSpan();
          });
      } finally {
        server.shutdown();
      }
    });

    it('should not trace api requests', async () => {
      const server = new ServerFramework();
      server.addHandler({
        path: '/',
        hasResponse: true,
        fn: async () => {
          return {statusCode: 200, message: 'hi'};
        },
      });
      const port = server.listen(0);
      try {
        await testTraceModule
          .get()
          .runInRootSpan({name: 'outer'}, async rootSpan => {
            assert.ok(testTraceModule.get().isRealSpan(rootSpan));
            const waitForResponse = new WaitForResponse();
            const headers: httpModule.OutgoingHttpHeaders = {};
            headers[
              testTraceModule.get().constants.TRACE_AGENT_REQUEST_HEADER
            ] = 'yay';
            http.get(
              {port, rejectUnauthorized: false, headers},
              waitForResponse.handleResponse
            );
            await waitForResponse.done;
            rootSpan.endSpan();
          });
        assert.strictEqual(
          testTraceModule.getSpans(span => span.kind === 'RPC_CLIENT').length,
          0
        );
      } finally {
        server.shutdown();
      }
    });

    it('should not break with no target', () => {
      return new Promise(resolve =>
        testTraceModule.get().runInRootSpan({name: 'outer'}, rootSpan => {
          assert.ok(testTraceModule.get().isRealSpan(rootSpan));
          (http.get as (arg?: {}) => EventEmitter)().on('error', err => {
            resolve();
          });
          rootSpan.endSpan();
        })
      );
    });

    it('should handle concurrent requests', async () => {
      const server = new ServerFramework();
      let statusCode = 200;
      server.addHandler({
        path: '/',
        hasResponse: true,
        fn: async () => {
          await wait(DEFAULT_SPAN_DURATION);
          return {statusCode: statusCode++, message: 'hi'};
        },
      });
      const port = server.listen(0);
      try {
        await testTraceModule
          .get()
          .runInRootSpan({name: 'outer'}, async rootSpan => {
            await Promise.all(
              [0, 1, 2, 3, 4].map(async i => {
                assert.ok(testTraceModule.get().isRealSpan(rootSpan));
                const waitForResponse = new WaitForResponse();
                http.get(
                  {port, rejectUnauthorized: false},
                  waitForResponse.handleResponse
                );
                await waitForResponse.done;
              })
            );
            rootSpan.endSpan();
          });
        assert.strictEqual(
          testTraceModule
            .getSpans(span => span.kind === 'RPC_CLIENT')
            .map(span =>
              Number(
                span.labels[
                  testTraceModule.get().labels.HTTP_RESPONSE_CODE_LABEL_KEY
                ]
              )
            )
            .reduce((a, b) => a + b, 0),
          1010
        );
      } finally {
        server.shutdown();
      }
    });

    describe('trace spans', () => {
      const ERROR_DETAILS_NAME = testTraceModule.get().labels
        .ERROR_DETAILS_NAME;
      const ERROR_DETAILS_MESSAGE = testTraceModule.get().labels
        .ERROR_DETAILS_MESSAGE;
      let port: number;
      let successSpan: TraceSpan;
      let errorSpan: TraceSpan;

      before(async () => {
        const server = new ServerFramework();
        server.addHandler({
          path: '/',
          hasResponse: true,
          fn: async () => {
            await wait(DEFAULT_SPAN_DURATION);
            return {statusCode: 200, message: 'hi'};
          },
        });
        port = server.listen(0);
        await testTraceModule
          .get()
          .runInRootSpan({name: 'outer'}, async rootSpan => {
            assert.ok(testTraceModule.get().isRealSpan(rootSpan));
            let waitForResponse = new WaitForResponse();
            http.get(
              {port, rejectUnauthorized: false, path: '/?foo=bar'},
              waitForResponse.handleResponse
            );
            await waitForResponse.done;
            server.server!.timeout = DEFAULT_SPAN_DURATION / 2;
            waitForResponse = new WaitForResponse();
            http.get({port, rejectUnauthorized: false}).on('error', () => {
              waitForResponse.handleDone();
            });
            await waitForResponse.done;
            rootSpan.endSpan();
          });
        successSpan = testTraceModule.getOneSpan(
          span => span.kind === 'RPC_CLIENT' && !span.labels[ERROR_DETAILS_NAME]
        );
        errorSpan = testTraceModule.getOneSpan(
          span =>
            span.kind === 'RPC_CLIENT' && !!span.labels[ERROR_DETAILS_NAME]
        );
        server.shutdown();
      });

      it('should not include query parameters in span name', () => {
        assert.strictEqual(successSpan.name, 'localhost');
      });

      it('should include custom port number in the url label', () => {
        assert.strictEqual(
          successSpan.labels[testTraceModule.get().labels.HTTP_URL_LABEL_KEY],
          `${nodule}://localhost:${port}/?foo=bar`
        );
      });

      it('should include error information if there was one', () => {
        assert.strictEqual(errorSpan.labels[ERROR_DETAILS_NAME], 'Error');
        assert.strictEqual(
          errorSpan.labels[ERROR_DETAILS_MESSAGE],
          'socket hang up'
        );
      });
    });
  });
}
