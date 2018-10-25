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
import * as asyncHooksModule from 'async_hooks';
import {IContextDefinition} from 'mocha';
import * as semver from 'semver';

import {AsyncHooksCLS} from '../src/cls/async-hooks';

type AsyncHooksModule = typeof asyncHooksModule;

const TEST_ASYNC_RESOURCE = '@google-cloud/trace-agent:test';
const maybeSkip = (describe: IContextDefinition) =>
    semver.satisfies(process.version, '>=8.1') ? describe : describe.skip;

maybeSkip(describe)('AsyncHooks-based CLS', () => {
  let asyncHooks: AsyncHooksModule;
  // tslint:disable-next-line:variable-name
  let AsyncResource: typeof asyncHooksModule.AsyncResource;
  let cls: AsyncHooksCLS<string>;

  before(() => {
    asyncHooks = require('async_hooks') as AsyncHooksModule;
    AsyncResource = class extends asyncHooks.AsyncResource {
      // tslint:disable:no-any
      runInAsyncScope<This, Result>(
          fn: (this: This, ...args: any[]) => Result, thisArg?: This): Result {
        // tslint:enable:no-any
        // Polyfill for versions in which runInAsyncScope isn't defined
        if (super.runInAsyncScope) {
          return super.runInAsyncScope.apply(this, arguments);
        } else {
          this.emitBefore();
          try {
            return fn.apply(
                thisArg, Array.prototype.slice.apply(arguments).slice(2));
          } finally {
            this.emitAfter();
          }
        }
      }
    };
  });

  beforeEach(() => {
    cls = new AsyncHooksCLS('default');
    cls.enable();
  });

  it('Correctly assumes the type of Promise resources', () => {
    const actual: Array<Promise<void>> = [];
    const expected: Array<Promise<void>> = [];
    const hook = asyncHooks
                     .createHook({
                       init:
                           (uid: number, type: string, tid: number,
                            resource: {promise: Promise<void>}) => {
                             if (type === 'PROMISE') {
                               actual.push(resource.promise);
                             }
                           }
                     })
                     .enable();
    expected.push(Promise.resolve());
    expected.push(actual[0].then(() => {}));
    assert.deepStrictEqual(actual, expected);
    hook.disable();
  });

  it('Supports basic context propagation across async-await boundaries', () => {
    return cls.runWithContext(async () => {
      await Promise.resolve();
      assert.strictEqual(cls.getContext(), 'modified');
      await Promise.resolve();
      assert.strictEqual(cls.getContext(), 'modified');
    }, 'modified');
  });

  describe('Compatibility with AsyncResource API', () => {
    it('Supports context propagation without trigger ID', async () => {
      let res!: asyncHooksModule.AsyncResource;
      await cls.runWithContext(async () => {
        res = new AsyncResource(TEST_ASYNC_RESOURCE);
      }, 'modified');
      res.runInAsyncScope(() => {
        assert.strictEqual(cls.getContext(), 'modified');
      });
    });

    it('Supports context propagation with trigger ID', async () => {
      let triggerId!: number;
      let res!: asyncHooksModule.AsyncResource;
      await cls.runWithContext(async () => {
        triggerId = new AsyncResource(TEST_ASYNC_RESOURCE).asyncId();
      }, 'correct');
      await cls.runWithContext(async () => {
        res = new AsyncResource(TEST_ASYNC_RESOURCE, triggerId);
      }, 'incorrect');
      res.runInAsyncScope(() => {
        assert.strictEqual(cls.getContext(), 'correct');
      });
    });
  });

  describe('Memory consumption with Promises', () => {
    const createdPromiseIDs: number[] = [];
    let hook: asyncHooksModule.AsyncHook;

    before(() => {
      hook = asyncHooks
                 .createHook({
                   init: (uid: number, type: string) => {
                     if (type === 'PROMISE') {
                       createdPromiseIDs.push(uid);
                     }
                   }
                 })
                 .enable();
    });

    after(() => {
      hook.disable();
    });

    const testCases:
        Array<{description: string; skip?: boolean; fn: () => {}}> = [
          {description: 'a no-op async function', fn: async () => {}}, {
            description: 'an async function that throws',
            fn: async () => {
              throw new Error();
            }
          },
          {
            description: 'an async function that awaits a rejected value',
            fn: async () => {
              await new Promise(reject => setImmediate(reject));
            }
          },
          {
            description: 'an async function with awaited values',
            fn: async () => {
              await 0;
              await new Promise(resolve => resolve());
              await new Promise(resolve => setImmediate(resolve));
            }
          },
          {
            description: 'an async function that awaits another async function',
            fn: async () => {
              await (async () => {
                await Promise.resolve();
              })();
            }
          },
          {
            description: 'a plain function that returns a Promise',
            fn: () => Promise.resolve()
          },
          {
            description:
                'a plain function that returns a Promise that will reject',
            fn: () => Promise.reject()
          },
          {
            description: 'an async function with spread args',
            // TODO(kjin): A possible bug in exists that causes an extra Promise
            // async resource to be initialized when an async function with
            // spread args is invoked. promiseResolve is not called for this
            // async resource. Fix this bug and then remove this skip directive.
            skip: true,
            fn: async (...args: number[]) => args
          }
        ];

    for (const testCase of testCases) {
      const skipIfTestSpecifies = !!testCase.skip ? it.skip : it;
      skipIfTestSpecifies(
          `Doesn't retain stale references when running ${
              testCase.description} in a context`,
          async () => {
            createdPromiseIDs.length = 0;
            try {
              // Run the test function in a new context.
              await cls.runWithContext(testCase.fn, 'will-be-stale');
            } catch (e) {
              // Ignore errors; they aren't important for this test.
            } finally {
              // At this point, Promises created from invoking the test function
              // should have had either their destroy or promiseResolve hook
              // called. We observe this by iterating through the Promises that
              // were created in this context, and checking to see that getting
              // the current context in the scope of an async resource that
              // references any of these Promises as its trigger parent doesn't
              // yield the stale context value from before. The only way this is
              // possible is if the CLS implementation internally kept a stale
              // reference to a context-local value keyed on the ID of a PROMISE
              // resource that should have been disposed.
              const stalePromiseIDs = createdPromiseIDs.filter((id) => {
                const a = new AsyncResource('test', id);
                const result = a.runInAsyncScope(() => {
                  return cls.getContext() === 'will-be-stale';
                });
                a.emitDestroy();
                return result;
              });
              assert.strictEqual(stalePromiseIDs.length, 0);
            }
          });
    }
  });
});
