/**
 * Copyright 2019 Google LLC
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

import {bluebird_3 as BluebirdPromise} from '../../src/plugins/types';
import {Trace} from '../../src/trace';
import * as traceTestModule from '../trace';

/**
 * Describes a test case.
 */
interface TestCase<T = void> {
  /**
   * Description of a test case; included in string argument to it().
   */
  description: string;
  /**
   * Creates and returns a new Promise.
   */
  makePromise: () => BluebirdPromise<T>;
  /**
   * Given a Promise and a callback, calls the callback some time after the
   * Promise has been resolved or rejected.
   */
  thenFn: (promise: BluebirdPromise<T>, cb: () => void) => void;
}
/**
 * For a given Promise implementation, create two traces:
 * 1. Constructs a new Promise and resolves it.
 * 2. Within a then callback to the above mentioned Promise, construct a child
 *    span.
 */
const getTracesForPromiseImplementation = <T>(
  makePromise: () => BluebirdPromise<T>,
  thenFn: (promise: BluebirdPromise<T>, cb: () => void) => void
): Promise<[Trace, Trace]> => {
  return new Promise((resolve, reject) => {
    const tracer = traceTestModule.get();
    let p: BluebirdPromise<T>;
    const firstSpan = tracer.runInRootSpan({name: 'first'}, span => {
      p = makePromise();
      return span;
    });
    tracer.runInRootSpan({name: 'second'}, secondSpan => {
      // Note to maintainers: Do NOT convert this to async/await,
      // as it changes context propagation behavior.
      thenFn(p, () => {
        tracer.createChildSpan().endSpan();
        secondSpan.endSpan();
        firstSpan.endSpan();
        setImmediate(() => {
          try {
            const trace1 = traceTestModule.getOneTrace(trace =>
              trace.spans.some(root => root.name === 'first')
            );
            const trace2 = traceTestModule.getOneTrace(trace =>
              trace.spans.some(root => root.name === 'second')
            );
            traceTestModule.clearTraceData();
            resolve([trace1, trace2]);
          } catch (e) {
            traceTestModule.clearTraceData();
            reject(e);
          }
        });
      });
    });
  });
};

describe('Patch plugin for bluebird', () => {
  // BPromise is a class.
  // tslint:disable-next-line:variable-name
  let BPromise: typeof BluebirdPromise;

  before(() => {
    traceTestModule.setCLSForTest();
    traceTestModule.setPluginLoaderForTest();
    traceTestModule.start();
    BPromise = require('./fixtures/bluebird3');
  });

  after(() => {
    traceTestModule.setCLSForTest(traceTestModule.TestCLS);
    traceTestModule.setPluginLoaderForTest(traceTestModule.TestPluginLoader);
  });

  const testCases = [
    {
      description: 'immediate resolve + child from then callback',
      makePromise: () => new BPromise(res => res()),
      thenFn: (p, cb) => p.then(cb),
    } as TestCase,
    {
      description: 'deferred resolve + child from then callback',
      makePromise: () => new BPromise(res => setTimeout(res, 0)),
      thenFn: (p, cb) => p.then(cb),
    } as TestCase,
    {
      description: 'bound, deferred resolve + child from then callback',
      makePromise: () => new BPromise<void>(res => setTimeout(res, 0)).bind({}),
      thenFn: (p, cb) => p.then(cb),
    } as TestCase,
    {
      description: 'deferred resolve + child from spread callback',
      makePromise: () => new BPromise(res => setTimeout(() => res([]), 0)),
      thenFn: (p, cb) => p.spread(cb),
    } as TestCase<never[]>,
    {
      description: 'deferred rejection + child from then callback',
      makePromise: () => new BPromise((res, rej) => setTimeout(rej, 0)),
      thenFn: (p, cb) => p.then(null, cb),
    } as TestCase,
    {
      description: 'deferred rejection + child from catch callback',
      makePromise: () => new BPromise((res, rej) => setTimeout(rej, 0)),
      thenFn: (p, cb) => p.catch(cb),
    } as TestCase,
    {
      description: 'deferred rejection + child from error callback',
      makePromise: () =>
        new BPromise((res, rej) =>
          setTimeout(() => rej(new BPromise.OperationalError()), 0)
        ),
      thenFn: (p, cb) => p.error(cb),
    } as TestCase,
    {
      description: 'deferred rejection + child from finally callback',
      makePromise: () => new BPromise((res, rej) => setTimeout(rej, 0)),
      thenFn: (p, cb) => p.catch(() => {}).finally(cb),
    } as TestCase,
    {
      description: 'immediate resolve + child after await',
      makePromise: () => new BPromise(res => res()),
      thenFn: async (p, cb) => {
        await p;
        cb();
      },
    } as TestCase,
    {
      description: 'deferred resolve + child after await',
      makePromise: () => new BPromise(res => setTimeout(res, 0)),
      thenFn: async (p, cb) => {
        await p;
        cb();
      },
    } as TestCase,
  ];

  // tslint:disable-next-line:no-any
  testCases.forEach((testCase: TestCase<any>) => {
    it(`enables context propagation in the same way as native promises for test case: ${testCase.description}`, async () => {
      const actual = (await getTracesForPromiseImplementation(
        testCase.makePromise,
        testCase.thenFn
      ))
        .map(trace => trace.spans.length)
        .join(', ');
      // In each case, the second trace should have the child span.
      // The format here is "[numSpansInFirstTrace],
      // [numSpansInSecondTrace]".
      assert.strictEqual(actual, '1, 2');
    });
  });
});
