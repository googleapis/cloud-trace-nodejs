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

// This file requires continuation-local-storage in the AsyncHooksCLS
// constructor, rather than upon module load.
import * as asyncHooksModule from 'async_hooks';
import {EventEmitter} from 'events';
import * as shimmer from 'shimmer';

import {CLS, Func} from './base';

type AsyncHooksModule = typeof asyncHooksModule;

// A list of well-known EventEmitter methods that add event listeners.
const EVENT_EMITTER_METHODS: Array<keyof EventEmitter> =
    ['addListener', 'on', 'once', 'prependListener', 'prependOnceListener'];
// A symbol used to check if a method has been wrapped for context.
const WRAPPED = Symbol('@google-cloud/trace-agent:AsyncHooksCLS:WRAPPED');

type ContextWrapped<T> = T&{[WRAPPED]?: boolean};

/**
 * An implementation of continuation-local storage on top of the async_hooks
 * module.
 */
export class AsyncHooksCLS<Context extends {}> implements CLS<Context> {
  private currentContext: {value: Context};
  private contexts: {[id: number]: Context} = {};
  private hook: asyncHooksModule.AsyncHook;
  private enabled = false;

  constructor(private readonly defaultContext: Context) {
    this.currentContext = {value: this.defaultContext};
    this.hook = (require('async_hooks') as AsyncHooksModule).createHook({
      init: (id: number, type: string, triggerId: number, resource: {}) => {
        this.contexts[id] = this.currentContext.value;
      },
      before: (id: number) => {
        if (this.contexts[id]) {
          this.currentContext.value = this.contexts[id];
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
    this.currentContext.value = this.defaultContext;
    this.hook.enable();
    this.enabled = true;
  }

  disable(): void {
    this.currentContext.value = this.defaultContext;
    this.hook.disable();
    this.enabled = false;
  }

  getContext(): Context {
    return this.currentContext.value;
  }

  setContext(value: Context): void {
    this.currentContext.value = value;
  }

  runWithNewContext<T>(fn: Func<T>): T {
    const oldContext = this.currentContext.value;
    this.currentContext.value = this.defaultContext;
    try {
      return fn();
    } finally {
      this.currentContext.value = oldContext;
    }
  }

  bindWithCurrentContext<T>(fn: Func<T>): Func<T> {
    if ((fn as ContextWrapped<Func<T>>)[WRAPPED] || !this.currentContext) {
      return fn;
    }
    const current = this.currentContext;
    const boundContext = this.currentContext.value;
    const contextWrapper: ContextWrapped<Func<T>> = function(this: {}) {
      const oldContext = current.value;
      current.value = boundContext;
      try {
        return fn.apply(this, arguments) as T;
      } finally {
        current.value = oldContext;
      }
    };
    contextWrapper[WRAPPED] = true;
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
