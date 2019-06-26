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

// This module requires continuation-local-storage in the AsyncListenerCLS
// constructor, rather than upon module load.
import * as clsModule from 'continuation-local-storage';
import {EventEmitter} from 'events';

import {CLS, Func} from './base';

type CLSModule = typeof clsModule;

/**
 * An implementation of continuation-local storage that wraps the
 * "continuation-local-storage" module.
 */
export class AsyncListenerCLS<Context extends {}> implements CLS<Context> {
  static readonly TRACE_NAMESPACE = 'com.google.cloud.trace';
  static readonly ROOT_CONTEXT_KEY = 'root';
  private readonly cls: CLSModule;
  private readonly defaultContext: Context;

  constructor(defaultContext: Context) {
    // Conditionally load continuation-local-storage.
    // We make this a member field instead of assigning it to a module-scope
    // object to make its access uncomplicated.
    this.cls = require('continuation-local-storage');
    this.defaultContext = defaultContext;
  }

  isEnabled(): boolean {
    return !!this.getNamespace();
  }

  enable(): void {
    this.cls.createNamespace(AsyncListenerCLS.TRACE_NAMESPACE);
  }

  disable(): void {
    this.cls.destroyNamespace(AsyncListenerCLS.TRACE_NAMESPACE);
  }

  private getNamespace(): clsModule.Namespace {
    return this.cls.getNamespace(AsyncListenerCLS.TRACE_NAMESPACE);
  }

  getContext(): Context {
    const result = this.getNamespace().get(AsyncListenerCLS.ROOT_CONTEXT_KEY);
    if (result) {
      return result;
    }
    return this.defaultContext;
  }

  runWithContext<T>(fn: Func<T>, value: Context): T {
    const namespace = this.getNamespace();
    return namespace.runAndReturn(() => {
      namespace.set(AsyncListenerCLS.ROOT_CONTEXT_KEY, value);
      return fn();
    });
  }

  bindWithCurrentContext<T>(fn: Func<T>): Func<T> {
    return this.getNamespace().bind(fn) as Func<T>;
  }

  patchEmitterToPropagateContext(ee: EventEmitter): void {
    return this.getNamespace().bindEmitter(ee);
  }
}
