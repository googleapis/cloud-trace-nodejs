/**
 * Copyright 2015 Google Inc. All Rights Reserved.
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

import * as CLS from 'continuation-local-storage';
import * as semver from 'semver';

import {SpanDataType} from './constants';
import {UNCORRELATED_SPAN, UNTRACED_SPAN} from './span-data';
import {Trace, TraceSpan} from './trace';

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
export type RootContext = ({
  readonly span: TraceSpan;
  readonly trace: Trace;
  readonly type: SpanDataType.ROOT;
}|{
  readonly type: SpanDataType.UNCORRELATED|SpanDataType.UNTRACED;
});

export type Namespace = CLS.Namespace;
export type Func<T> = CLS.Func<T>;

const useAsyncHooks: boolean = semver.satisfies(process.version, '>=8') &&
    !!process.env.GCLOUD_TRACE_NEW_CONTEXT;

const cls: typeof CLS =
    useAsyncHooks ? require('./cls-ah') : require('continuation-local-storage');

const TRACE_NAMESPACE = 'com.google.cloud.trace';

/**
 * Stack traces are captured when a root span is started. Because the stack
 * trace height varies on the context propagation mechanism, to keep published
 * stack traces uniform we need to remove the top-most frames when using the
 * c-l-s module. Keep track of this number here.
 */
export const ROOT_SPAN_STACK_OFFSET = useAsyncHooks ? 0 : 2;

export function createNamespace(): CLS.Namespace {
  return cls.createNamespace(TRACE_NAMESPACE);
}

export function destroyNamespace(): void {
  cls.destroyNamespace(TRACE_NAMESPACE);
}

export function getNamespace(): CLS.Namespace {
  return cls.getNamespace(TRACE_NAMESPACE);
}

/**
 * Get a RootContext object from continuation-local storage.
 */
export function getRootContext(): RootContext {
  // First getNamespace check is necessary in case any
  // patched closures escaped before the agent was stopped and the
  // namespace was destroyed.
  const namespace = getNamespace();
  if (namespace) {
    // A few things can be going on here:
    // 1. setRootContext has been called earlier to store a real root span
    //    in continuation-local storage, so retrieve it.
    // 2. setRootContext has been called earlier to explicitly specify that
    //    the request corresponding to this continuation is _not_ being traced
    //    (by being passed UNTRACED_SPAN), so retrieve it as well.
    // 3. setRootContext has _never_ been called in this continuation. This
    //    indicates that context was lost, and namespace.get('root') will
    //    return null. Therefore, explicitly return UNCORRELATED_SPAN to
    //    indicate that context was lost.
    return namespace.get('root') || UNCORRELATED_SPAN;
  } else {
    // No namespace indicates that the Trace Agent is disabled. This is a
    // special case where _all_ requests are explicitly not being traced,
    // so return UNTRACED_SPAN to be consistent with that.
    return UNTRACED_SPAN;
  }
}

/**
 * Store a RootContext object in continuation-local storage.
 * @param rootContext Either a root span or UNTRACED_SPAN. It doesn't make
 * sense to pass UNCORRELATED_SPAN, which is a value specifically reserved for
 * when getRootContext is known to give an unusable value.
 */
export function setRootContext(rootContext: RootContext): void {
  getNamespace().set('root', rootContext);
}

// This is only used in tests (and is temporary), so it doesn't apply in the
// comment in getRootContext about the possible values of namespace.get('root').
// It's functionally identical to setRootContext(null).
export function clearRootContext(): void {
  setRootContext(UNCORRELATED_SPAN);
}
