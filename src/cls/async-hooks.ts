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

import * as asyncHooksModule from 'async_hooks';
import {EventEmitter} from 'events';
import * as shimmer from 'shimmer';

import {CLS, Func} from './base';

const EVENT_EMITTER_METHODS: Array<keyof EventEmitter> =
    ['addListener', 'on', 'once', 'prependListener', 'prependOnceListener'];
const WRAPPED = Symbol('context_wrapped');

/**
 * An implementation of continuation-local storage on top of the async_hooks
 * module.
 */
export class AsyncHooksCLS<Context extends {}> implements CLS<Context> {
  private current: {value: Context};
  private contexts: {[id: number]: Context} = {};
  private readonly defaultContext: Context;
  private hook: asyncHooksModule.AsyncHook;
  private enabled = false;

  constructor(defaultContext: Context) {
    this.defaultContext = defaultContext;
    this.current = {value: this.defaultContext};
    this.hook = (require('async_hooks') as typeof asyncHooksModule).createHook({
      init: (id: number, type: string, triggerId: number, resource: {}) => {
        this.contexts[id] = this.current.value;
      },
      before: (id: number) => {
        if (this.contexts[id]) {
          this.current.value = this.contexts[id];
        }
      },
      destroy: (id: number) => {
        delete this.contexts[id];
      }
    });
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  enable(): void {
    this.current.value = this.defaultContext;
    this.hook.enable();
    this.enabled = true;
  }

  disable(): void {
    this.current.value = this.defaultContext;
    this.hook.disable();
    this.enabled = false;
  }

  getContext(): Context {
    return this.current.value;
  }

  setContext(value: Context): void {
    this.current.value = value;
  }

  runWithNewContext<T>(fn: Func<T>): T {
    const oldContext = this.current.value;
    this.current.value = this.defaultContext;
    const res = fn();
    this.current.value = oldContext;
    return res;
  }

  bindWithCurrentContext<T>(fn: Func<T>): Func<T> {
    // TODO(kjin): Monitor https://github.com/Microsoft/TypeScript/pull/15473.
    // When it's landed and released, we can remove these `any` casts.
    // tslint:disable-next-line:no-any
    if (((fn as any)[WRAPPED] as boolean) || !this.current) {
      return fn;
    }
    const current = this.current;
    const boundContext = this.current.value;
    const contextWrapper = function(this: {}) {
      const oldContext = current.value;
      current.value = boundContext;
      const res = fn.apply(this, arguments) as T;
      current.value = oldContext;
      return res;
    };
    // tslint:disable-next-line:no-any
    (contextWrapper as any)[WRAPPED] = true;
    Object.defineProperty(contextWrapper, 'length', {
      enumerable: false,
      configurable: true,
      writable: false,
      value: fn.length
    });
    return contextWrapper;
  }

  // This function is not technically needed and all tests currently pass
  // without it (after removing call sites). While it is not a complete
  // solution, restoring correct context before running every request/response
  // event handler reduces the number of situations in which userspace queuing
  // will cause us to lose context.
  patchEmitterToPropagateContext(ee: EventEmitter): void {
    const that = this;
    EVENT_EMITTER_METHODS.forEach((method) => {
      if (ee[method]) {
        shimmer.wrap(ee, method, (oldMethod) => {
          return function(this: {}, event: string, cb: Func<void>) {
            return oldMethod.call(this, event, that.bindWithCurrentContext(cb));
          };
        });
      }
    });
  }
}