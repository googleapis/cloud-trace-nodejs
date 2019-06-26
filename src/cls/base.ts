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

import {EventEmitter} from 'events';

// tslint:disable-next-line:no-any
export type Func<T = void> = (...args: any[]) => T;

/**
 * An interface that represents a background mechanism which is capable of
 * storing, propagating and retrieving arbitrary continuation-local data (also
 * called "context").
 *
 * A continuation refers to a logical tree of execution paths; a function passed
 * to CLS#runWithCurrentContext is considered the root of such a tree, and
 * subsequent child nodes are functions that are "triggered" because of
 * asynchronous operations started by their parent (for example, a function that
 * calls fs.readFile "triggers" the callback that is passed to it).
 * The exact definition of "trigger" is implementation-dependent.
 *
 * CLS stands for continuation-local storage.
 *
 *
 */
export interface CLS<Context extends {}> {
  /**
   * Returns whether this continuation-local storage mechanism is enabled.
   */
  isEnabled(): boolean;

  /**
   * Enables this instance.
   */
  enable(): void;

  /**
   * Disables this instance.
   * Behavior of the API other than enable() is implementation-dependent when
   * this instance is disabled.
   */
  disable(): void;

  /**
   * Gets the current continuation-local value.
   * If not called from within a continuation, a default value should be
   * returned.
   * If called before setContext has been called within a continuation, the
   * default value should be returned as well.
   */
  getContext(): Context;

  /**
   * Runs the given function as the start of a new continuation.
   * @param fn The function to run synchronously.
   * @param value The value to set as the context in that continuation.
   * @returns The return result of running `fn`.
   */
  runWithContext<T>(fn: Func<T>, value: Context): T;

  /**
   * Binds a function to the current continuation. This should be used when
   * the CLS implementation's propagating mechanism doesn't automatically do so.
   * If not called from within a continuation, behavior is implementation-
   * defined.
   * @param fn The function to bind.
   * @returns A wrapped version of the given function with the same signature.
   */
  bindWithCurrentContext<T>(fn: Func<T>): Func<T>;

  /**
   * Patches an EventEmitter to lazily bind all future event listeners on this
   * instance so that they belong in the same continuation as the execution
   * path in which they were attached to the EventEmitter object.
   * @param ee The EventEmitter to bind. This instance will be mutated.
   */
  patchEmitterToPropagateContext(ee: EventEmitter): void;
}
