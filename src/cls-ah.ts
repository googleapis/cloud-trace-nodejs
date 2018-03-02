/**
 * Copyright 2017 Google Inc. All Rights Reserved.
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

import * as asyncHook from 'async_hooks';
import {Context, Func, Namespace as CLSNamespace} from 'continuation-local-storage';
import {EventEmitter} from 'events';
import * as shimmer from 'shimmer';

const wrappedSymbol = Symbol('context_wrapped');
let contexts: {[asyncId: number]: Context;} = {};
let current: Context = {};

asyncHook.createHook({init, before, destroy}).enable();

const EVENT_EMITTER_METHODS: Array<keyof EventEmitter> =
    ['addListener', 'on', 'once', 'prependListener', 'prependOnceListener'];

class AsyncHooksNamespace implements CLSNamespace {
  get name(): string {
    throw new Error('Not implemented');
  }

  get active(): Context {
    throw new Error('Not implemented');
  }

  createContext(): Context {
    throw new Error('Not implemented');
  }

  get(k: string) {
    return current[k];
  }

  set<T>(k: string, v: T): T {
    current[k] = v;
    return v;
  }

  run<T>(fn: Func<T>): Context {
    this.runAndReturn(fn);
    return current;
  }

  runAndReturn<T>(fn: Func<T>): T {
    const oldContext = current;
    current = {};
    const res = fn();
    current = oldContext;
    return res;
  }

  bind<T>(cb: Func<T>): Func<T> {
    // TODO(kjin): Monitor https://github.com/Microsoft/TypeScript/pull/15473.
    // When it's landed and released, we can remove these `any` casts.
    // tslint:disable-next-line:no-any
    if ((cb as any)[wrappedSymbol] as boolean || !current) {
      return cb;
    }
    const boundContext = current;
    const contextWrapper = function(this: {}) {
      const oldContext = current;
      current = boundContext;
      const res = cb.apply(this, arguments) as T;
      current = oldContext;
      return res;
    };
    // tslint:disable-next-line:no-any
    (contextWrapper as any)[wrappedSymbol] = true;
    Object.defineProperty(contextWrapper, 'length', {
      enumerable: false,
      configurable: true,
      writable: false,
      value: cb.length
    });
    return contextWrapper;
  }

  // This function is not technically needed and all tests currently pass
  // without it (after removing call sites). While it is not a complete
  // solution, restoring correct context before running every request/response
  // event handler reduces the number of situations in which userspace queuing
  // will cause us to lose context.
  bindEmitter(ee: NodeJS.EventEmitter): void {
    const ns = this;
    EVENT_EMITTER_METHODS.forEach((method) => {
      if (ee[method]) {
        shimmer.wrap(ee, method, (oldMethod) => {
          return function(this: {}, event: string, cb: Func<void>) {
            return oldMethod.call(this, event, ns.bind(cb));
          };
        });
      }
    });
  }
}

const namespace = new AsyncHooksNamespace();

// AsyncWrap Hooks

function init(
    uid: number, provider: string, parentUid: number, parentHandle: {}) {
  contexts[uid] = current;
}

function before(uid: number) {
  if (contexts[uid]) {
    current = contexts[uid];
  }
}

function destroy(uid: number) {
  delete contexts[uid];
}

export function createNamespace(): CLSNamespace {
  return namespace;
}

export function destroyNamespace(): void {
  current = {};
  contexts = {};
}

export function getNamespace(): CLSNamespace {
  return namespace;
}

export function reset(): void {
  throw new Error('Not implemented');
}
