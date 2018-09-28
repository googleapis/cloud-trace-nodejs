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

import * as consoleLogLevel from 'console-log-level';
import {defaultConfig} from './config';

export type ConsoleLogLevel = 'error'|'warn'|'info'|'debug';
export type LogLevel = 'silent'|ConsoleLogLevel;

/**
 * The list of log levels.
 */
export const LEVELS: ReadonlyArray<LogLevel> =
    ['silent', 'error', 'warn', 'info', 'debug'];

export interface LoggerConfig {
  /**
   * The minimum log level that will print to the console.
   */
  level: string|false;

  /**
   * A tag to use in log messages.
   */
  tag: string;
}

function logLevelToName(level?: number): LogLevel {
  if (typeof level === 'string') {
    level = Number(level);
  }
  if (typeof level !== 'number') {
    level = defaultConfig.logLevel;
  }
  if (level < 0) level = 0;
  if (level >= LEVELS.length) level = LEVELS.length - 1;
  return LEVELS[level];
}

export class Logger {
  private logger: consoleLogLevel.Logger|null;

  constructor(opts?: Partial<LoggerConfig>) {
    const levelName = opts && opts.level !== undefined ?
        opts.level :
        logLevelToName(defaultConfig.logLevel);

    if (levelName === false || levelName === 'silent') {
      this.logger = null;
      return;
    }

    this.logger = consoleLogLevel({
      stderr: true,
      prefix: `${opts && opts.tag ? opts.tag : 'unknown'} ${
          levelName.toUpperCase()}`,
      level: levelName as ConsoleLogLevel
    });
  }

  error(...args: Array<{}>): void {
    if (this.logger) {
      this.logger.error(...args);
    }
  }

  warn(...args: Array<{}>): void {
    if (this.logger) {
      this.logger.warn(...args);
    }
  }

  debug(...args: Array<{}>): void {
    if (this.logger) {
      this.logger.debug(...args);
    }
  }

  info(...args: Array<{}>): void {
    if (this.logger) {
      this.logger.info(...args);
    }
  }
}
