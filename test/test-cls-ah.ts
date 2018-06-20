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

import assert from 'assert';
import asyncHooksModule from 'async_hooks';
import {IContextDefinition} from 'mocha';
import semver from 'semver';

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

  describe('Using AsyncResource API', () => {
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
});
