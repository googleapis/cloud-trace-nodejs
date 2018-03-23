// TODO(kjin): Unify these definitions with those of the Debugger Agent.

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

declare module '@google-cloud/common' {
  import * as request from 'request';

  type LogFunction = (message: any, ...args: any[]) => void;

  export interface Logger {
    error: LogFunction;
    warn: LogFunction;
    info: LogFunction;
    debug: LogFunction;
    silly: LogFunction;
  }

  export interface LoggerOptions {
    level?: string;
    levels?: string[];
    tag?: string;
  }

  export const logger: {
    (options?: LoggerOptions | string): Logger;
    LEVELS: string[];
  };

  export class Service {
    constructor(config: ServiceConfig, options: ServiceAuthenticationConfig);
    request(options: request.Options,
      cb: (
        err: Error | null,
        body: any,
        response: request.RequestResponse
      ) => void): void;
  }

  export interface ServiceConfig {
    packageJson?: any;
    projectIdRequired?: boolean;
    baseUrl?: string;
    scopes?: string[];
  }

  export interface ServiceAuthenticationConfig {
    projectId?: string;
    keyFilename?: string;
    email?: string;
    credentials?: {
      client_email?: string;
      private_key?: string;
    };
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
