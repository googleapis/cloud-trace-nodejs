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

interface CallSite {
  getThis: () => any | undefined;
  getTypeName: () => string;
  getFunction: () => Function | undefined;
  getFunctionName: () => string;
  getMethodName: () => string;
  getFileName: () => string | undefined;
  getLineNumber: () => number | undefined;
  getColumnNumber: () => number | undefined;
  getEvalOrigin: () => CallSite | undefined;
  isToplevel: () => boolean;
  isEval: () => boolean;
  isNative: () => boolean;
  isConstructor: () => boolean;
}

interface ErrorConstructor {
  prepareStackTrace?: (
    error: Error,
    structuredStackTrace: CallSite[]
  ) => CallSite[] | string;
  captureStackTrace(targetObject: Object, constructorOpt?: Function): void;
  stackTraceLimit: number;
}

declare module 'gcp-metadata' {
  import * as http from 'http';

  // TODO: Determine if the signature of the callback on these methods are
  //       correct.
  type PropFunction = (
    options: string | {
      property: string;
      headers?: http.OutgoingHttpHeaders
    },
    callback: (
      err: Error & { code?: string },
      response?: http.ServerResponse,
      metadataProject?: string
    ) => void
  ) => http.ServerResponse;
  
  export const instance: PropFunction;
  export const project: PropFunction;
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
    projectIdRequired?: false;
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

declare module 'shimmer' {
  global {
    interface Function {
      __wrapped: boolean;
    }
  }

  const shimmer: {
    (options: { logger?: (msg: string) => void }): void;
    wrap: <T extends Function>(
      nodule: Object,
      name: string,
      wrapper: (original: T) => T
    ) => void;
    massWrap: <T extends Function>(
      nodules: Object[],
      names: string[],
      wrapper: (original: T) => T
    ) => void;
    unwrap: <T extends Function>(
      nodule: Object,
      name: string
    ) => void;
  }

  export = shimmer;
}
