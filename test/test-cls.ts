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
import * as semver from 'semver';
import {inspect} from 'util';

import {TraceCLS, TraceCLSConfig, TraceCLSMechanism} from '../src/cls';
import {AsyncHooksCLS} from '../src/cls/async-hooks';
import {AsyncListenerCLS} from '../src/cls/async-listener';
import {CLS} from '../src/cls/base';
import {NullCLS} from '../src/cls/null';
import {SingularCLS} from '../src/cls/singular';
import {SpanType} from '../src/constants';
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
      assert.strictEqual(instance.getContext(), 'default');
      const result = instance.runWithContext(() => {
        assert.strictEqual(instance.getContext(), 'default');
        return instance.getContext();
      }, 'modified');
      assert.strictEqual(result, 'default');
      const boundFn = instance.runWithContext(() => {
        return instance.bindWithCurrentContext(() => {
          assert.strictEqual(instance.getContext(), 'default');
          return instance.getContext();
        });
      }, 'modified');
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

        it('Starts a new continuation with runWithContext', () => {
          const result = c.runWithContext(() => {
            assert.strictEqual(c.getContext(), 'modified');
            return 'returned value';
          }, 'modified');
          assert.strictEqual(result, 'returned value');
        });

        // To avoid I/O we don't test context propagation over anything
        // requiring opening sockets or files of any kind. The responsibility
        // of testing behavior like this should fall on the context
        // propagation libraries themselves.
        it('Propagates context across event ticks', (done) => {
          const progress = plan(done, 3);
          c.runWithContext(() => {
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
          }, 'modified');
          c.runWithContext(() => {}, 'default');
        });

        it('Propagates context to bound functions', () => {
          let runLater = () => {
            assert.strictEqual(c.getContext(), 'modified');
          };
          c.runWithContext(() => {
            runLater = c.bindWithCurrentContext(runLater);
          }, 'modified');
          c.runWithContext(() => {
            assert.strictEqual(c.getContext(), 'default');
            runLater();
            assert.strictEqual(c.getContext(), 'default');
          }, 'default');
          c.runWithContext(() => {
            // bind it again
            runLater = c.bindWithCurrentContext(runLater);
          }, 'modified-but-different');
          runLater();
        });

        it('Corrects context when function run with new context throws', () => {
          try {
            c.runWithContext(() => {
              throw new Error();
            }, 'modified');
          } catch (e) {
            assert.strictEqual(c.getContext(), 'default');
          }
        });

        it('Corrects context when function bound to a context throws', () => {
          let runLater = () => {
            throw new Error();
          };
          c.runWithContext(() => {
            runLater = c.bindWithCurrentContext(runLater);
          }, 'modified');
          try {
            runLater();
          } catch (e) {
            assert.strictEqual(c.getContext(), 'default');
          }
        });

        it('Can be used to patch event emitters to propagate context', () => {
          const ee = new EventEmitter();
          assert.strictEqual(c.getContext(), 'default');
          c.runWithContext(() => {
            c.patchEmitterToPropagateContext(ee);
            ee.on('a', () => {
              assert.strictEqual(c.getContext(), 'modified');
            });
          }, 'modified');
          c.runWithContext(() => {
            // Event listeners are bound lazily.
            ee.on('b', () => {
              assert.strictEqual(c.getContext(), 'modified-again');
            });
            ee.emit('a');
            assert.strictEqual(c.getContext(), 'modified-again');
          }, 'modified-again');
          ee.on('c', () => {
            assert.strictEqual(c.getContext(), 'default');
          });
          ee.emit('b');
          ee.emit('c');
        });

        it('Supports nesting contexts', (done) => {
          c.runWithContext(() => {
            c.runWithContext(() => {
              setImmediate(() => {
                assert.strictEqual(c.getContext(), 'inner');
                done();
              });
            }, 'inner');
            assert.strictEqual(c.getContext(), 'outer');
          }, 'outer');
        });

        it('Supports basic context propagation across Promise#then calls',
           () => {
             return c.runWithContext(() => {
               return Promise.resolve().then(() => {
                 assert.strictEqual(c.getContext(), 'modified');
               });
             }, 'modified');
           });
      });
    }

    describe('SingularCLS', () => {
      it('uses a single global context', async () => {
        const cls = new SingularCLS('default');
        cls.enable();
        cls.runWithContext(() => {}, 'modified');
        await Promise.resolve();
        assert.strictEqual(cls.getContext(), 'modified');
      });
    });
  });

  describe('TraceCLS', () => {
    const validTestCases:
        Array<{config: TraceCLSConfig, expectedDefaultType: SpanType}> = [
          {
            config: {mechanism: TraceCLSMechanism.ASYNC_LISTENER},
            expectedDefaultType: SpanType.UNCORRELATED
          },
          {
            config: {mechanism: TraceCLSMechanism.SINGULAR},
            expectedDefaultType: SpanType.UNCORRELATED
          },
          {
            config: {mechanism: TraceCLSMechanism.NONE},
            expectedDefaultType: SpanType.UNTRACED
          }
        ];
    if (asyncAwaitSupported) {
      validTestCases.push({
        config: {mechanism: TraceCLSMechanism.ASYNC_HOOKS},
        expectedDefaultType: SpanType.UNCORRELATED
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
             assert.ok(c.getContext().type, SpanType.UNTRACED);
             assert.ok(
                 c.runWithContext(() => 'hi', TraceCLS.UNCORRELATED), 'hi');
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
            c.runWithContext(() => {
              const frames = createStackTrace(1, c.rootSpanStackOffset);
              assert.strictEqual(frames[0].method_name, 'myFunction');
            }, TraceCLS.UNCORRELATED);
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
