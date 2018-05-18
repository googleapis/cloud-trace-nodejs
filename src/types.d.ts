declare namespace NodeJS {
  export interface Global {
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
    function _resolveFilename(request: string, parent?: Module | NodeModule): string;
    function _load(request: string, parent?: Module | NodeModule, isMain?: boolean): any;
    function _resolveLookupPaths(request: string, parent?: Module | NodeModule): string;
  }
}

declare module 'require-in-the-middle' {
  namespace hook {
    type Options = {
      internals?: boolean;
    };
    type OnRequireFn = <T>(exports: T, name: string, basedir?: string) => T;
  }
  function hook(modules: string[]|null, options: hook.Options|null, onRequire: hook.OnRequireFn): void;
  function hook(modules: string[]|null, onRequire: hook.OnRequireFn): void;
  function hook(onRequire: hook.OnRequireFn): void;
  export = hook;
}
