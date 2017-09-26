// TODO(kjin): Unify these definitions with those of the Debugger Agent.

declare namespace NodeJS {
  export interface Global {
    _google_trace_agent: any;
  }
  export interface Process {
    _preload_modules: string[];
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
  
  export function logger(options?: LoggerOptions | string): Logger;

  export namespace logger {
    export const LEVELS: string[];
  }

  export class Service {
    constructor(config: Service.ServiceConfig, options: Service.AuthenticationConfig);
    request(options: request.Options,
      cb: (
        err: Error | null,
        body: any,
        response: request.RequestResponse
      ) => void);
  }

  export namespace Service {
    export interface ServiceConfig {
      packageJson?: any;
      projectIdRequired?: false;
      baseUrl?: string;
      scopes?: string[];
    }
    
    export interface AuthenticationConfig {
      projectId?: string;
      keyFilename?: string;
      email?: string;
      credentials?: {
        client_email?: string;
        private_key?: string;
      };
    }
  }
}

// There is a @types/extend, but it's not expressive enough.
declare module 'extend' {
  function extend<T, U>(deep: boolean, target: T, source: U): T & U;
  function extend<T, U, V>(deep: boolean, target: T, source1: U, source2: V): T & U & V;
  function extend<T, U, V, W>(deep: boolean, target: T, source1: U, source2: V,
    source3: W): T & U & V & W;
  function extend<T, U, V, W, X>(deep: boolean, target: T, source1: U, source2: V,
    source3: W, source4: X): T & U & V & W & X;
  function extend<T>(deep: boolean, target: T, ...sources: any[]): any;
  namespace extend {} // Prevents TS2497
  export = extend;
}

declare module 'shimmer' {
  global {
    interface Function {
      __wrapped: boolean;
    }
  }

  namespace shimmer {
    export function wrap<T extends Function>(
      nodule: Object,
      name: string,
      wrapper: (original: T) => T
    ): void;
  
    export function massWrap<T extends Function>(
      nodules: Object[],
      names: string[],
      wrapper: (original: T) => T
    ): void;
    
    export function unwrap<T extends Function>(
      nodule: Object,
      name: string
    ): void;
  }

  function shimmer(options: { logger?: (msg: string) => void }): void;

  export = shimmer;
}
