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
import {EventEmitter} from 'events';
import {ITestDefinition} from 'mocha';
import * as semver from 'semver';
import {inspect} from 'util';

import {TraceCLS, TraceCLSConfig, TraceCLSMechanism} from '../src/cls';
import {AsyncHooksCLS} from '../src/cls/async-hooks';
import {AsyncListenerCLS} from '../src/cls/async-listener';
import {CLS} from '../src/cls/base';
import {NullCLS} from '../src/cls/null';
import {SingularCLS} from '../src/cls/singular';
import {SpanDataType} from '../src/constants';
import {createStackTrace, FORCE_NEW} from '../src/util';

import {TestLogger} from './logger';
import {plan} from './utils';

type CLSConstructor = {
  new (defaultValue: string): CLS<string>;
};

describe('Continuation-Local Storage', () => {
  const asyncAwaitSupported = semver.satisfies(process.version, '>=8');

  describe('No-op implementation', () => {
    const clazz = NullCLS;
    let instance: CLS<string>;

    beforeEach(() => {
      instance = new clazz('default');
      instance.enable();
    });

    afterEach(() => {
      instance.disable();
    });

    it('always returns the default value', () => {
      assert.strictEqual(instance.getContext(), 'default');
      instance.setContext('modified');
      assert.strictEqual(instance.getContext(), 'default');
      const result = instance.runWithNewContext(() => {
        assert.strictEqual(instance.getContext(), 'default');
        instance.setContext('modified');
        return instance.getContext();
      });
      assert.strictEqual(result, 'default');
      const boundFn = instance.bindWithCurrentContext(() => {
        assert.strictEqual(instance.getContext(), 'default');
        instance.setContext('modified');
        return instance.getContext();
      });
      assert.strictEqual(boundFn(), 'default');
    });
  });

  describe('Implementations', () => {
    const testCases: CLSConstructor[] = asyncAwaitSupported ?
        [AsyncHooksCLS, AsyncListenerCLS] :
        [AsyncListenerCLS];

    for (const testCase of testCases) {
      describe(`CLS for class ${testCase.name}`, () => {
        let c!: CLS<string>;

        beforeEach(() => {
          c = new testCase('default');
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
          c.runWithNewContext(() => {
            c.setContext('modified-but-different');
            // bind it again
            runLater = c.bindWithCurrentContext(runLater);
          });
          runLater();
        });

        it('Corrects context when function run with new context throws', () => {
          try {
            c.runWithNewContext(() => {
              c.setContext('modified');
              throw new Error();
            });
          } catch (e) {
            assert.strictEqual(c.getContext(), 'default');
          }
        });

        it('Corrects context when function bound to a context throws', () => {
          let runLater = () => {
            c.setContext('modified');
            throw new Error();
          };
          c.runWithNewContext(() => {
            runLater = c.bindWithCurrentContext(runLater);
          });
          try {
            runLater();
          } catch (e) {
            assert.strictEqual(c.getContext(), 'default');
          }
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
      });
    }

    describe('SingularCLS', () => {
      it('uses a single global context', async () => {
        const cls = new SingularCLS('default');
        cls.enable();
        cls.runWithNewContext(() => {
          cls.setContext('modified');
        });
        await Promise.resolve();
        cls.runWithNewContext(() => {
          assert.strictEqual(cls.getContext(), 'modified');
        });
      });
    });
  });

  describe('TraceCLS', () => {
    const validTestCases:
        Array<{config: TraceCLSConfig, expectedDefaultType: SpanDataType}> = [
          {
            config: {mechanism: TraceCLSMechanism.ASYNC_LISTENER},
            expectedDefaultType: SpanDataType.UNCORRELATED
          },
          {
            config: {mechanism: TraceCLSMechanism.SINGULAR},
            expectedDefaultType: SpanDataType.UNCORRELATED
          },
          {
            config: {mechanism: TraceCLSMechanism.NONE},
            expectedDefaultType: SpanDataType.UNTRACED
          }
        ];
    if (asyncAwaitSupported) {
      validTestCases.push({
        config: {mechanism: TraceCLSMechanism.ASYNC_HOOKS},
        expectedDefaultType: SpanDataType.UNCORRELATED
      });
    }
    for (const testCase of validTestCases) {
      describe(`with configuration ${inspect(testCase)}`, () => {
        const logger = new TestLogger();
        let c: TraceCLS;

        beforeEach(() => {
          try {
            c = new TraceCLS(testCase.config, logger);
            c.enable();
          } catch {
            c = {disable: () => {}} as TraceCLS;
          }
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
          assert.strictEqual(c.getContext().type, testCase.expectedDefaultType);
        });

        it('constructs the correct underlying CLS mechanism', () => {
          assert.strictEqual(
              logger.getNumLogsWith('info', `[${testCase.config.mechanism}]`),
              1);
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

    const invalidTestCases: TraceCLSConfig[] = asyncAwaitSupported ?
        [
          {mechanism: 'unknown'} as any  // tslint:disable-line:no-any
        ] :
        [
          {mechanism: 'unknown'} as any,  // tslint:disable-line:no-any
          {mechanism: 'async-hooks'}
        ];

    for (const testCase of invalidTestCases) {
      describe(`with configuration ${inspect(testCase)}`, () => {
        const logger = new TestLogger();

        it('throws', () => {
          assert.throws(() => new TraceCLS(testCase, logger));
        });
      });
    }
  });
});
