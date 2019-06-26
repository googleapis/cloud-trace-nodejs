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

import {LEVELS, Logger, LoggerConfig} from '../src/logger';

const PASS_THROUGH_LOG_LEVEL = Number(process.env.GCLOUD_TEST_LOG_LEVEL || 0);
// Capture the value of common.Logger so that we don't enter an infinite loop
// if common.Logger is wrapped elsewhere.
// tslint:disable-next-line:variable-name
const OriginalLogger = Logger;

// tslint:disable-next-line:no-any
type LoggerFunction<R> = (message: any, ...args: any[]) => R;

export class TestLogger extends Logger {
  private logs: {[k in keyof Logger]: string[]} = {
    error: [],
    warn: [],
    info: [],
    debug: [],
  };
  private innerLogger = new OriginalLogger({
    level: LEVELS[PASS_THROUGH_LOG_LEVEL],
  });

  constructor(options?: Partial<LoggerConfig>) {
    super(Object.assign({tag: '@google-cloud/trace-agent'}, options));
  }

  private makeLoggerFn(logLevel: keyof Logger): LoggerFunction<this> {
    // TODO(kjin): When we drop support for Node 4, use spread args.
    const that = this;
    return function(this: null) {
      const args = Array.prototype.slice.call(arguments, 0);
      that.logs[logLevel].push(args.join(' '));
      that.innerLogger[logLevel].apply(this, args);
      return that;
    };
  }

  error = this.makeLoggerFn('error');
  warn = this.makeLoggerFn('warn');
  info = this.makeLoggerFn('info');
  debug = this.makeLoggerFn('debug');

  getLogs(logLevel: keyof Logger): string[] {
    return this.logs[logLevel];
  }

  getNumLogsWith(logLevel: keyof Logger, strOrReg: string | RegExp): number {
    if (typeof strOrReg === 'string') {
      return this.logs[logLevel].filter(line => line.includes(strOrReg)).length;
    } else {
      return this.logs[logLevel].filter(line => line.match(strOrReg)).length;
    }
  }

  clearLogs(): void {
    (Object.keys(this.logs) as Array<keyof Logger>).forEach(
      logLevel => (this.logs[logLevel].length = 0)
    );
  }
}
