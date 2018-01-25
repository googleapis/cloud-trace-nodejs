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

import {SpanData} from './span-data';

export type RootContext = SpanData|{} /* null span */|null;
export type Namespace = CLS.Namespace;
export type Func<T> = CLS.Func<T>;

const useAsyncHooks: boolean = semver.satisfies(process.version, '>=8') &&
    !!process.env.GCLOUD_TRACE_NEW_CONTEXT;

const cls: typeof CLS =
    useAsyncHooks ? require('./cls-ah') : require('continuation-local-storage');

const TRACE_NAMESPACE = 'com.google.cloud.trace';

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

export function getRootContext(): RootContext {
  // First getNamespace check is necessary in case any
  // patched closures escaped before the agent was stopped and the
  // namespace was destroyed.
  if (getNamespace() && getNamespace().get('root')) {
    return getNamespace().get('root');
  }
  return null;
}

export function setRootContext(rootContext: RootContext): void {
  getNamespace().set('root', rootContext);
}
