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
import * as semver from 'semver';

import {AsyncHooksCLS} from './cls/async-hooks';
import {AsyncListenerCLS} from './cls/async-listener';
import {CLS, Func} from './cls/base';
import {NullCLS} from './cls/null';
import {SingularCLS} from './cls/singular';
import {SpanType} from './constants';
import {Logger} from './logger';
import {RootSpan} from './plugin-types';
import {UNCORRELATED_ROOT_SPAN, DISABLED_ROOT_SPAN} from './span-data';
import {Trace, TraceSpan} from './trace';
import {Singleton} from './util';

const asyncHooksAvailable = semver.satisfies(process.version, '>=8');

export interface RealRootContext {
  readonly span: TraceSpan;
  readonly trace: Trace;
  readonly type: SpanType.ROOT;
}

export interface PhantomRootContext {
  readonly type: SpanType.UNCORRELATED | SpanType.UNSAMPLED | SpanType.DISABLED;
}

/**
 * This type represents the minimal information to store in continuation-local
 * storage for a request. We store either a root span corresponding to the
 * request, or a sentinel value (UNCORRELATED_SPAN or UNTRACED_SPAN) that tells
 * us that the request is not being traced (with the exact sentinel value
 * specifying whether this is on purpose or by accident, respectively).
 *
 * When we store an actual root span, the only information we need is its
 * current trace/span fields.
 */
export type RootContext = RootSpan & (RealRootContext | PhantomRootContext);

/**
 * An enumeration of the possible mechanisms for supporting context propagation
 * through continuation-local storage.
 */
export enum TraceCLSMechanism {
  /**
   * Use the AsyncHooksCLS class to propagate root span context.
   * Only available in Node 8+.
   */
  ASYNC_HOOKS = 'async-hooks',
  /**
   * Use the AsyncListenerCLS class to propagate root span context.
   * Note that continuation-local-storage should be loaded as the first module.
   */
  ASYNC_LISTENER = 'async-listener',
  /**
   * Do not use any special mechanism to propagate root span context.
   * Only a single root span can be open at a time.
   */
  SINGULAR = 'singular',
  /**
   * Do not write root span context; in other words, querying the current root
   * span context will always result in a default value.
   */
  NONE = 'none',
}

/**
 * Configuration options passed to the TraceCLS constructor.
 */
export interface TraceCLSConfig {
  mechanism: TraceCLSMechanism;
}

interface CLSConstructor {
  new (defaultContext: RootContext): CLS<RootContext>;
}

/**
 * An implementation of continuation-local storage for the Trace Agent.
 * In addition to the underlying API, there is a guarantee that when an instance
 * of this class is disabled, all context-manipulation methods will either be
 * no-ops or pass-throughs.
 */
export class TraceCLS implements CLS<RootContext> {
  private currentCLS: CLS<RootContext>;
  // tslint:disable-next-line:variable-name CLSClass is a constructor.
  private CLSClass: CLSConstructor;
  private enabled = false;

  static UNCORRELATED: RootContext = UNCORRELATED_ROOT_SPAN;
  static DISABLED: RootContext = DISABLED_ROOT_SPAN;

  /**
   * Stack traces are captured when a root span is started. Because the stack
   * trace height varies on the context propagation mechanism, to keep published
   * stack traces uniform we need to remove the top-most frames when using the
   * c-l-s module. Keep track of this number here.
   */
  readonly rootSpanStackOffset: number;

  constructor(config: TraceCLSConfig, private readonly logger: Logger) {
    switch (config.mechanism) {
      case TraceCLSMechanism.ASYNC_HOOKS:
        if (!asyncHooksAvailable) {
          throw new Error(
            `CLS mechanism [${config.mechanism}] is not compatible with Node <8.`
          );
        }
        this.CLSClass = AsyncHooksCLS;
        this.rootSpanStackOffset = 4;
        break;
      case TraceCLSMechanism.ASYNC_LISTENER:
        this.CLSClass = AsyncListenerCLS;
        this.rootSpanStackOffset = 8;
        break;
      case TraceCLSMechanism.SINGULAR:
        this.CLSClass = SingularCLS;
        this.rootSpanStackOffset = 4;
        break;
      case TraceCLSMechanism.NONE:
        this.CLSClass = NullCLS;
        this.rootSpanStackOffset = 4;
        break;
      default:
        throw new Error(
          `CLS mechanism [${config.mechanism}] was not recognized.`
        );
    }
    this.logger.info(
      `TraceCLS#constructor: Created [${config.mechanism}] CLS instance.`
    );
    this.currentCLS = new NullCLS(TraceCLS.DISABLED);
    this.currentCLS.enable();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  enable(): void {
    if (!this.enabled) {
      this.logger.info('TraceCLS#enable: Enabling CLS.');
      this.currentCLS.disable();
      this.currentCLS = new this.CLSClass(TraceCLS.UNCORRELATED);
      this.currentCLS.enable();
    }
    this.enabled = true;
  }

  disable(): void {
    if (this.enabled && this.CLSClass !== NullCLS) {
      this.logger.info('TraceCLS#disable: Disabling CLS.');
      this.currentCLS.disable();
      this.currentCLS = new NullCLS(TraceCLS.DISABLED);
      this.currentCLS.enable();
    }
    this.enabled = false;
  }

  getContext(): RootContext {
    return this.currentCLS.getContext();
  }

  runWithContext<T>(fn: Func<T>, value: RootContext): T {
    return this.currentCLS.runWithContext(fn, value);
  }

  bindWithCurrentContext<T>(fn: Func<T>): Func<T> {
    return this.currentCLS.bindWithCurrentContext(fn);
  }

  patchEmitterToPropagateContext<T>(ee: EventEmitter): void {
    this.currentCLS.patchEmitterToPropagateContext(ee);
  }
}

export const cls = new Singleton(TraceCLS);
