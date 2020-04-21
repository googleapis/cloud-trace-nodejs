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

import {mkdir, stat, readFile, writeFile} from 'fs';
import * as glob from 'glob';
import * as path from 'path';
import {promisify} from 'util';
import {
  ChildProcess,
  ForkOptions,
  fork,
  SpawnOptions,
  spawn,
} from 'child_process';
import * as once from 'once';
import * as tmp from 'tmp';

export const BUILD_DIRECTORY = 'build';

export const globP = promisify(glob);
export const mkdirP = promisify(mkdir);
export const readFileP = promisify(readFile);
export const writeFileP = promisify(writeFile);
export const statP = promisify(stat);
export const tmpDirP = promisify(tmp.dir) as () => Promise<string>;

export function nodule(nodule: string) {
  return path.relative(BUILD_DIRECTORY, `node_modules/${nodule}`);
}

function promisifyChildProcess(childProcess: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const exit = (err?: Error) => once(() => (err ? reject(err) : resolve()))();
    childProcess.on('error', exit);
    childProcess.on('close', code => {
      if (code === 0) {
        exit();
      } else {
        exit(
          new Error(`Process ${childProcess.pid} exited with code ${code}.`)
        );
      }
    });
  });
}

export function spawnP(
  command: string,
  args: string[] = [],
  options: SpawnOptions = {}
): Promise<void> {
  const stringifiedCommand = `\`${command}${
    args ? ' ' + args.join(' ') : ''
  }\``;
  console.log(`> Running: ${stringifiedCommand}`);
  return promisifyChildProcess(
    spawn(
      command,
      args,
      Object.assign(
        {
          stdio: 'inherit',
          shell: true,
        },
        options
      )
    )
  );
}

export function forkP(
  moduleName: string,
  args: string[] = [],
  options: ForkOptions = {}
): Promise<void> {
  const stringifiedCommand = `\`${moduleName}${
    args ? ' ' + args.join(' ') : ''
  }\``;
  console.log(`> Running: ${stringifiedCommand}`);
  return promisifyChildProcess(
    fork(
      moduleName,
      args,
      Object.assign(
        {
          stdio: 'inherit',
          execArgv: [],
        },
        options
      )
    )
  );
}
