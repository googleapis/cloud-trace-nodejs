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

// This is required for @google-cloud/common types.
// tslint:disable-next-line:no-reference
/// <reference path="../src/types.d.ts" />

import * as assert from 'assert';
import {EventEmitter} from 'events';
import {ITestDefinition} from 'mocha';
import * as semver from 'semver';
import {inspect} from 'util';

import {TraceCLS, TraceCLSConfig} from '../src/cls';
import {AsyncHooksCLS} from '../src/cls/async-hooks';
import {AsyncListenerCLS} from '../src/cls/async-listener';
import {CLS} from '../src/cls/base';
import {SpanDataType} from '../src/constants';
import {createStackTrace, FORCE_NEW} from '../src/util';

import {TestLogger} from './logger';
import {plan} from './utils';

type CLSConstructor = {
  new (defaultValue: string): CLS<string>;
};

describe('Continuation-Local Storage', () => {
  const asyncAwaitSupported = semver.satisfies(process.version, '>=8');

  describe('Implementations', () => {
    const testCases: Array<{clazz: CLSConstructor, testAsyncAwait: boolean}> =
        asyncAwaitSupported ?
        [
          {clazz: AsyncHooksCLS, testAsyncAwait: true},
          {clazz: AsyncListenerCLS, testAsyncAwait: false}
        ] :
        [{clazz: AsyncListenerCLS, testAsyncAwait: false}];

    for (const testCase of testCases) {
      describe(`CLS for class ${testCase.clazz.name}`, () => {
        const maybeSkip = (it: ITestDefinition) =>
            testCase.testAsyncAwait ? it : it.skip;
        let c!: CLS<string>;

        beforeEach(() => {
          c = new testCase.clazz('default');
          c.enable();
        });

        afterEach(() => {
          c.disable();
        });

        it('[sanity check]', () => {
          assert.ok(c.isEnabled());
          // has a default value
          assert.strictEqual(c.getContext(), 'default');
        });

        it('Starts a new continuation with runWithNewContext', () => {
          const result = c.runWithNewContext(() => {
            assert.strictEqual(c.getContext(), 'default');
            c.setContext('modified');
            assert.strictEqual(c.getContext(), 'modified');
            return 'returned value';
          });
          assert.strictEqual(result, 'returned value');
          c.runWithNewContext(() => {
            assert.strictEqual(c.getContext(), 'default');
            c.setContext('also-modified');
            assert.strictEqual(c.getContext(), 'also-modified');
          });
        });

        // To avoid I/O we don't test context propagation over anything
        // requiring opening sockets or files of any kind. The responsibility
        // of testing behavior like this should fall on the context
        // propagation libraries themselves.
        it('Propagates context across event ticks', (done) => {
          const progress = plan(done, 3);
          c.runWithNewContext(() => {
            c.setContext('modified');
            process.nextTick(() => {
              assert.strictEqual(c.getContext(), 'modified');
              process.nextTick(() => {
                assert.strictEqual(c.getContext(), 'modified');
                progress();
              });
            });
            setImmediate(() => {
              assert.strictEqual(c.getContext(), 'modified');
              progress();
            }, 1);
            setTimeout(() => {
              assert.strictEqual(c.getContext(), 'modified');
              progress();
            }, 1);
          });
          c.runWithNewContext(() => {
            c.setContext('unexpected');
          });
        });

        it('Propagates context to bound functions', () => {
          let runLater = () => {
            assert.strictEqual(c.getContext(), 'modified');
          };
          c.runWithNewContext(() => {
            c.setContext('modified');
            runLater = c.bindWithCurrentContext(runLater);
          });
          c.runWithNewContext(() => {
            assert.strictEqual(c.getContext(), 'default');
            runLater();
            assert.strictEqual(c.getContext(), 'default');
          });
        });

        it('Can be used to patch event emitters to propagate context', () => {
          const ee = new EventEmitter();
          assert.strictEqual(c.getContext(), 'default');
          c.runWithNewContext(() => {
            c.setContext('modified');
            c.patchEmitterToPropagateContext(ee);
            ee.on('a', () => {
              assert.strictEqual(c.getContext(), 'modified');
            });
          });
          c.runWithNewContext(() => {
            c.setContext('modified-again');
            // Event listeners are bound lazily.
            ee.on('b', () => {
              assert.strictEqual(c.getContext(), 'modified-again');
            });
            ee.emit('a');
            assert.strictEqual(c.getContext(), 'modified-again');
          });
          ee.on('c', () => {
            assert.strictEqual(c.getContext(), 'default');
          });
          ee.emit('b');
          ee.emit('c');
        });

        it('Supports nesting contexts', (done) => {
          c.runWithNewContext(() => {
            c.setContext('outer');
            c.runWithNewContext(() => {
              c.setContext('inner');
              setImmediate(() => {
                assert.strictEqual(c.getContext(), 'inner');
                done();
              });
            });
            assert.strictEqual(c.getContext(), 'outer');
          });
        });

        it('Supports basic context propagation across Promise#then calls',
           () => {
             return c.runWithNewContext(() => {
               c.setContext('modified');
               return Promise.resolve().then(() => {
                 assert.strictEqual(c.getContext(), 'modified');
               });
             });
           });

        maybeSkip(it)(
            'Supports basic context propagation across await boundaries',
            () => {
              return c.runWithNewContext(async () => {
                c.setContext('modified');
                await Promise.resolve();
                assert.strictEqual(c.getContext(), 'modified');
              });
            });
      });
    }
  });

  describe('TraceCLS', () => {
    const testCases = [
      {
        config: {mechanism: 'async-hooks'},
        expectedImplementation: asyncAwaitSupported ? 'async-hooks' :
                                                      'async-listener'
      },
      {
        config: {mechanism: 'async-listener'},
        expectedImplementation: 'async-listener'
      },
      {
        // tslint:disable-next-line:no-any
        config: {mechanism: 'unknown' as any},
        expectedImplementation: 'async-listener'
      }
    ];
    for (const testCase of testCases) {
      describe(`with configuration ${inspect(testCase.config)}`, () => {
        const logger = new TestLogger();
        let c: TraceCLS;

        beforeEach(() => {
          c = new TraceCLS(logger, testCase.config);
          c.enable();
        });

        afterEach(() => {
          c.disable();
          logger.clearLogs();
        });

        it(`when disabled, doesn't throw and has reasonable default values`,
           () => {
             c.disable();
             assert.ok(!c.isEnabled());
             assert.ok(c.getContext().type, SpanDataType.UNTRACED);
             assert.ok(c.runWithNewContext(() => 'hi'), 'hi');
             const fn = () => {};
             assert.strictEqual(c.bindWithCurrentContext(fn), fn);
             c.patchEmitterToPropagateContext(new EventEmitter());
           });

        it('[sanity check]', () => {
          assert.ok(c.isEnabled());
          assert.strictEqual(c.getContext().type, SpanDataType.UNCORRELATED);
        });

        it('constructs the correct underlying CLS mechanism', () => {
          assert.strictEqual(
              logger.getNumLogsWith(
                  'info', `[${testCase.expectedImplementation}]`),
              1);
          if (testCase.config.mechanism !== testCase.expectedImplementation) {
            // We should warn if the above predicate is true.
            assert.strictEqual(
                logger.getNumLogsWith('warn', `[${testCase.config.mechanism}]`),
                1);
          }
        });

        it('exposes the correct number of stack frames to remove', () => {
          function myFunction() {
            c.runWithNewContext(() => {
              const frames = createStackTrace(1, c.rootSpanStackOffset);
              assert.strictEqual(frames[0].method_name, 'myFunction');
            });
          }
          myFunction();
        });
      });
    }
  });
});