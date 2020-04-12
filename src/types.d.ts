// Copyright 2017 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

declare namespace NodeJS {
  export interface Global {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _google_trace_agent: any;
  }
  export interface Process {
    _preload_modules: string[];
  }
  export namespace Module {
    // According to https://github.com/DefinitelyTyped/DefinitelyTyped/pull/19612,
    // NodeModule will be removed in favor of NodeJS.Module.
    // Currently, neither depends on the other, though NodeJS.Module's interface is
    // a superset of NodeModule.
    function _resolveFilename(
      request: string,
      parent?: Module | NodeModule
    ): string;
    function _load(
      request: string,
      parent?: Module | NodeModule,
      isMain?: boolean
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): any;
    function _resolveLookupPaths(
      request: string,
      parent?: Module | NodeModule
    ): string;
  }
}

declare module 'require-in-the-middle' {
  namespace hook {
    type Options = {
      internals?: boolean;
    };
    type OnRequireFn = <T>(exports: T, name: string, basedir?: string) => T;
  }
  function hook(
    modules: string[] | null,
    options: hook.Options | null,
    onRequire: hook.OnRequireFn
  ): void;
  function hook(modules: string[] | null, onRequire: hook.OnRequireFn): void;
  function hook(onRequire: hook.OnRequireFn): void;
  export = hook;
}
