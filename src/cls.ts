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

import {Logger} from '@google-cloud/common';
import {EventEmitter} from 'events';
import * as semver from 'semver';

import {AsyncHooksCLS} from './cls/async-hooks';
import {AsyncListenerCLS} from './cls/async-listener';
import {CLS, Func} from './cls/base';
import {UniversalCLS} from './cls/universal';
import {SpanDataType} from './constants';
import {UNCORRELATED_SPAN, UNTRACED_SPAN} from './span-data';
import {Trace, TraceSpan} from './trace';
import {Singleton} from './util';

export interface RealRootContext {
  readonly span: TraceSpan;
  readonly trace: Trace;
  readonly type: SpanDataType.ROOT;
}

export interface PhantomRootContext {
  readonly type: SpanDataType.UNCORRELATED|SpanDataType.UNTRACED;
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
export type RootContext = RealRootContext|PhantomRootContext;

const asyncHooksAvailable = semver.satisfies(process.version, '>=8');

export interface TraceCLSConfig { mechanism: 'async-listener'|'async-hooks'; }

/**
 * An implementation of continuation-local storage for the Trace Agent.
 * In addition to the underlying API, there is a guarantee that when an instance
 * of this class is disabled, all context-manipulation methods will either be
 * no-ops or pass-throughs.
 */
export class TraceCLS implements CLS<RootContext> {
  private currentCLS: CLS<RootContext>;
  private spareCLS: CLS<RootContext>;
  private readonly logger: Logger;
  private enabled = false;

  /**
   * Stack traces are captured when a root span is started. Because the stack
   * trace height varies on the context propagation mechanism, to keep published
   * stack traces uniform we need to remove the top-most frames when using the
   * c-l-s module. Keep track of this number here.
   */
  readonly rootSpanStackOffset: number;

  constructor(logger: Logger, config: TraceCLSConfig) {
    this.logger = logger;
    const uncorrelated: RootContext = {type: SpanDataType.UNCORRELATED};
    const untraced: RootContext = {type: SpanDataType.UNTRACED};
    const useAH = config.mechanism === 'async-hooks' && asyncHooksAvailable;
    if (useAH) {
      this.spareCLS = new AsyncHooksCLS(uncorrelated);
      this.rootSpanStackOffset = 4;
      this.logger.info(
          'TraceCLS#constructor: Created [async-hooks] CLS instance.');
    } else {
      if (config.mechanism !== 'async-listener') {
        if (config.mechanism === 'async-hooks') {
          this.logger.warn(
              'TraceCLS#constructor: [async-hooks]-based context',
              `propagation is not available in Node ${process.version}.`,
              'Falling back to using async-listener.');
        } else {
          this.logger.warn(
              'TraceCLS#constructor: The specified CLS mechanism',
              `[${config.mechanism}] was not recognized.`,
              'Falling back to using async-listener.');
        }
      }
      this.spareCLS = new AsyncListenerCLS(uncorrelated);
      this.rootSpanStackOffset = 8;
      this.logger.info(
          'TraceCLS#constructor: Created [async-listener] CLS instance.');
    }
    this.currentCLS = new UniversalCLS(untraced);
    this.currentCLS.enable();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private rotate(): void {
    this.currentCLS.disable();
    const temp = this.currentCLS;
    this.currentCLS = this.spareCLS;
    this.spareCLS = temp;
    this.currentCLS.enable();
  }

  enable(): void {
    if (!this.enabled) {
      this.logger.info('TraceCLS#enable: Enabling CLS.');
      this.enabled = true;
      this.rotate();
    }
  }

  disable(): void {
    if (this.enabled) {
      this.logger.info('TraceCLS#disable: Disabling CLS.');
      this.enabled = false;
      this.rotate();
    }
  }

  getContext(): RootContext {
    return this.currentCLS.getContext();
  }

  setContext(value: RootContext): void {
    this.currentCLS.setContext(value);
  }

  runWithNewContext<T>(fn: Func<T>): T {
    return this.currentCLS.runWithNewContext(fn);
  }

  bindWithCurrentContext<T>(fn: Func<T>): Func<T> {
    return this.currentCLS.bindWithCurrentContext(fn);
  }

  patchEmitterToPropagateContext<T>(ee: EventEmitter): void {
    this.currentCLS.patchEmitterToPropagateContext(ee);
  }
}

export const cls = new Singleton(TraceCLS);
