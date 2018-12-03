/**
 * Copyright 2018 Google LLC
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
import axiosModule from 'axios';
import * as semver from 'semver';

import * as cls from '../src/cls';
import {Constants} from '../src/constants';
import {TraceSpan} from '../src/trace';
import {TraceLabels} from '../src/trace-labels';
import {StackFrame} from '../src/util';

import * as testTraceModule from './trace';
import {assertSpanDuration, DEFAULT_SPAN_DURATION, isServerSpan, wait} from './utils';
import {WebFramework, WebFrameworkConstructor} from './web-frameworks/base';
import {Connect3} from './web-frameworks/connect';
import {Express4} from './web-frameworks/express';
import {Hapi17} from './web-frameworks/hapi17';
import {Hapi12, Hapi15, Hapi16, Hapi8} from './web-frameworks/hapi8_16';
import {Koa1} from './web-frameworks/koa1';
import {Koa2} from './web-frameworks/koa2';
import {Restify3, Restify4, Restify5, Restify6, Restify7} from './web-frameworks/restify';

// The type of a stack trace object after being parsed from a trace span's stack
// frame label.
type TraceSpanStackFrames = {
  stack_frame: StackFrame[]
};

// The number of times to retry counting spans in the aborted request test
const ABORTED_SPAN_RETRIES = 3;
// The list of web frameworks to test.
const FRAMEWORKS: WebFrameworkConstructor[] = [
  Connect3, Express4, Hapi8, Hapi12, Hapi15, Hapi16, Hapi17, Koa1, Koa2,
  Restify3, Restify4, Restify5, Restify6, Restify7
];

/**
 * Main
 */

describe('Web framework tracing', () => {
  let axios: typeof axiosModule;
  before(() => {
    testTraceModule.setCLSForTest();
    testTraceModule.setPluginLoaderForTest();
    testTraceModule.start({ignoreUrls: [/ignore-me/], ignoreMethods: []});
    axios = require('axios');
  });

  after(() => {
    testTraceModule.setCLSForTest(testTraceModule.TestCLS);
    testTraceModule.setPluginLoaderForTest(testTraceModule.TestPluginLoader);
  });

  FRAMEWORKS.forEach((webFrameworkConstructor) => {
    const commonName = webFrameworkConstructor.commonName;
    const expectedTopStackFrame = webFrameworkConstructor.expectedTopStackFrame;
    const versionRange = webFrameworkConstructor.versionRange;

    // Skip this set for incompatible versions of Node
    const skip = !semver.satisfies(process.version, versionRange);

    (skip ? describe.skip : describe)(`Tracing ${commonName}`, () => {
      let webFramework: WebFramework;
      let port: number;

      before(async () => {
        webFramework = new webFrameworkConstructor();
        webFramework.addHandler({
          path: '/one-handler',
          hasResponse: true,
          fn: async () => {
            await wait(DEFAULT_SPAN_DURATION);
            return {statusCode: 200, message: 'hello!'};
          }
        });
        webFramework.addHandler({
          path: '/two-handlers',
          hasResponse: false,
          fn: async () => {
            await wait(DEFAULT_SPAN_DURATION / 2);
          }
        });
        webFramework.addHandler({
          path: '/two-handlers',
          hasResponse: true,
          fn: async () => {
            await wait(DEFAULT_SPAN_DURATION / 2);
            return {statusCode: 200, message: 'hellohello!!'};
          }
        });
        webFramework.addHandler({
          path: '/propagate-hello',
          hasResponse: true,
          fn: async () => {
            await wait(
                0);  // Add an additional link to the async execution chain.
            const response = await axios.get(`http://localhost:${port}/hello`);
            return {statusCode: response.status, message: response.data};
          }
        });
        webFramework.addHandler({
          path: '/hello',
          hasResponse: true,
          fn: async () => {
            return {statusCode: 200, message: '[incessant barking]'};
          }
        });
        webFramework.addHandler({
          path: '/error',
          hasResponse: true,
          fn: async () => {
            throw new Error('[restrained whimpering]');
          }
        });
        webFramework.addHandler({
          path: '/ignore-me',
          hasResponse: true,
          fn: async () => {
            return {statusCode: 200, message: '[unrestrained whimpering]'};
          }
        });
        port = await webFramework.listen(0);
      });

      after(() => {
        webFramework.shutdown();
      });

      afterEach(() => {
        testTraceModule.clearTraceData();
      });

      it('accurately measures get time (1 handler)', async () => {
        let recordedTime = 0;
        await testTraceModule.get().runInRootSpan(
            {name: 'outer'}, async (span) => {
              assert.ok(testTraceModule.get().isRealSpan(span));
              recordedTime = Date.now();
              await axios.get(`http://localhost:${port}/one-handler`);
              recordedTime = Date.now() - recordedTime;
              span!.endSpan();
            });
        assert.strictEqual(testTraceModule.getSpans().length, 3);
        const serverSpan = testTraceModule.getOneSpan(isServerSpan);
        assertSpanDuration(serverSpan, [DEFAULT_SPAN_DURATION, recordedTime]);
      });

      it('accurately measures get time (2 handlers)', async () => {
        let recordedTime = 0;
        await testTraceModule.get().runInRootSpan(
            {name: 'outer'}, async (span) => {
              assert.ok(testTraceModule.get().isRealSpan(span));
              recordedTime = Date.now();
              // Hit endpoint with two middlewares/handlers.
              await axios.get(`http://localhost:${port}/two-handlers`);
              recordedTime = Date.now() - recordedTime;
              span!.endSpan();
            });
        assert.strictEqual(testTraceModule.getSpans().length, 3);
        const serverSpan = testTraceModule.getOneSpan(isServerSpan);
        assertSpanDuration(serverSpan, [DEFAULT_SPAN_DURATION, recordedTime]);
      });

      it('handles errors', async () => {
        await testTraceModule.get().runInRootSpan(
            {name: 'outer'}, async (span) => {
              assert.ok(testTraceModule.get().isRealSpan(span));
              // Hit endpoint which always throws an error.
              await axios.get(`http://localhost:${port}/error`, {
                validateStatus: () => true  // Obviates try/catch.
              });
              span!.endSpan();
            });
        assert.strictEqual(testTraceModule.getSpans().length, 3);
        const serverSpan = testTraceModule.getOneSpan(isServerSpan);
        assert.strictEqual(
            serverSpan.labels[TraceLabels.HTTP_RESPONSE_CODE_LABEL_KEY], '500');
      });

      it('doesn\'t trace ignored urls', async () => {
        await testTraceModule.get().runInRootSpan(
            {name: 'outer'}, async (span) => {
              assert.ok(testTraceModule.get().isRealSpan(span));
              // Hit endpoint that always gets ignored.
              await axios.get(`http://localhost:${port}/ignore-me`);
              span!.endSpan();
            });
        assert.strictEqual(testTraceModule.getSpans().length, 2);
        assert.strictEqual(testTraceModule.getSpans(isServerSpan).length, 0);
      });

      it('ends span upon client abort', async () => {
        await testTraceModule.get().runInRootSpan(
            {name: 'outer'}, async (span) => {
              assert.ok(testTraceModule.get().isRealSpan(span));
              // Hit endpoint, but time out before it has a chance to respond.
              // To ensure that a trace is written, also waits
              await axios
                  .get(
                      `http://localhost:${port}/one-handler`,
                      {timeout: DEFAULT_SPAN_DURATION / 2})
                  .catch(() => {/* swallow */});
              // Wait remainder of server response time to ensure that trace is
              // written.
              await wait(DEFAULT_SPAN_DURATION / 2);
              span!.endSpan();
            });
        // Check that the aborted span is written.
        // Retry in intervals because to minimize flakes -- there is no way for
        // us to be notified client-side when the server has completed the
        // client-aborted request.
        for (let i = 0; i < ABORTED_SPAN_RETRIES; i++) {
          if (testTraceModule.getSpans().length === 3) {
            break;
          }
          if (i === ABORTED_SPAN_RETRIES - 1) {
            assert.fail(`Aborted span was not written after ${
                DEFAULT_SPAN_DURATION * ABORTED_SPAN_RETRIES} milliseconds.`);
          } else {
            await wait(DEFAULT_SPAN_DURATION);
          }
        }
      });

      it('assigns different trace IDs to distinct requests', async () => {
        // tslint:disable-next-line:no-any
        let requests: Array<Promise<any>>;
        // Setting the URL allows us not to record this root span, but also
        // not get warnings for child spans.
        await testTraceModule.get().runInRootSpan(
            {name: 'outer', url: '/ignore-me'}, async (span) => {
              requests = [
                axios.get(`http://localhost:${port}/hello?this-is=dog`),
                axios.get(`http://localhost:${port}/hello?this-is=puppy`)
              ];
              await Promise.all(requests);
            });
        assert.strictEqual(
            testTraceModule.getTraces(trace => trace.spans.some(isServerSpan))
                .length,
            requests!.length);
      });

      it('propagates trace context', async () => {
        await testTraceModule.get().runInRootSpan(
            {name: 'outer'}, async (span) => {
              assert.ok(testTraceModule.get().isRealSpan(span));
              // Hits endpoint that will make an additional outgoing HTTP
              // request (to another endpoint on the same server).
              await axios.get(`http://localhost:${port}/propagate-hello`);
              span!.endSpan();
            });
        assert.strictEqual(testTraceModule.getSpans().length, 5);
        const spans = [
          // outer
          testTraceModule.getOneSpan(s => s.name === 'outer'),
          // /propagate-hello client
          testTraceModule.getOneSpan(
              s => s.kind === 'RPC_CLIENT' &&
                  s.labels[TraceLabels.HTTP_URL_LABEL_KEY].includes(
                      '/propagate-hello')),
          // /propagate-hello server
          testTraceModule.getOneSpan(
              s => s.kind === 'RPC_SERVER' &&
                  s.name.includes('/propagate-hello')),
          // /hello client
          testTraceModule.getOneSpan(
              s => s.kind === 'RPC_CLIENT' &&
                  s.labels[TraceLabels.HTTP_URL_LABEL_KEY].includes('/hello')),
          // /hello server
          testTraceModule.getOneSpan(
              s => s.kind === 'RPC_SERVER' && s.name.includes('/hello'))
        ];
        for (let i = 0; i < spans.length - 1; i++) {
          // When i is odd, the following assert can only be true if distributed
          // context propagation works. When i is even, it can only be true if
          // application context propagation works.
          assert.strictEqual(spans[i].spanId, spans[i + 1].parentSpanId);
        }
      });

      describe('span properties', () => {
        let serverSpan: TraceSpan;

        beforeEach(async () => {
          await testTraceModule.get().runInRootSpan(
              {name: 'outer'}, async (span) => {
                assert.ok(testTraceModule.get().isRealSpan(span));
                // Hit an endpoint with a query parameter.
                await axios.get(`http://localhost:${port}/hello?this-is=dog`);
                span!.endSpan();
              });
          assert.strictEqual(testTraceModule.getSpans().length, 3);
          serverSpan = testTraceModule.getOneSpan(isServerSpan);
        });

        it('applies the correct labels', () => {
          const labels = serverSpan.labels;
          assert.strictEqual(
              labels[TraceLabels.HTTP_RESPONSE_CODE_LABEL_KEY], '200');
          assert.strictEqual(labels[TraceLabels.HTTP_METHOD_LABEL_KEY], 'GET');
          assert.strictEqual(
              labels[TraceLabels.HTTP_URL_LABEL_KEY],
              `http://localhost:${port}/hello?this-is=dog`);
          assert.ok(labels[TraceLabels.HTTP_SOURCE_IP]);
        });

        it('removes trace frames from stack', () => {
          const stackTrace: TraceSpanStackFrames = JSON.parse(
              serverSpan.labels[TraceLabels.STACK_TRACE_DETAILS_KEY]);
          assert.strictEqual(
              stackTrace.stack_frame[0].method_name, expectedTopStackFrame);
        });

        it('doesn\'t include query parameters in span name', () => {
          assert.strictEqual(
              serverSpan.name.indexOf('dog'), -1,
              `span name ${serverSpan.name} includes query parameters`);
        });
      });

      it('uses the span name override option', async () => {
        const oldSpanNameOverride =
            testTraceModule.get().getConfig().rootSpanNameOverride;
        testTraceModule.get().getConfig().rootSpanNameOverride =
            (path: string) => `${path}-goodbye`;
        try {
          await testTraceModule.get().runInRootSpan(
              {name: 'outer'}, async (span) => {
                assert.ok(testTraceModule.get().isRealSpan(span));
                await axios.get(`http://localhost:${port}/hello`);
                span!.endSpan();
              });
          assert.strictEqual(testTraceModule.getSpans().length, 3);
          const serverSpan = testTraceModule.getOneSpan(isServerSpan);
          assert.strictEqual(serverSpan.name, '/hello-goodbye');
        } finally {
          testTraceModule.get().getConfig().rootSpanNameOverride =
              oldSpanNameOverride;
        }
      });
    });
  });
});
