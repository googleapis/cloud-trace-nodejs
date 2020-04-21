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

import * as path from 'path';
import {globP, forkP} from './utils';

export interface Options {
  includeGlobs: string[];
  excludeGlobs?: string[];
  rootDir: string;
  coverage?: boolean;
  timeout?: number;
}

export async function runTests(options: Options) {
  const {includeGlobs, excludeGlobs, rootDir, coverage, timeout} = options;
  function nodule(nodule: string) {
    return (
      '.' + path.sep + path.relative(rootDir, path.join('node_modules', nodule))
    );
  }
  let testNum = 0;
  const excludedFiles = ([] as string[]).concat(
    ...(await Promise.all((excludeGlobs || []).map(glob => globP(glob))))
  );
  const includedFiles = ([] as string[]).concat(
    ...(await Promise.all(includeGlobs.map(glob => globP(glob))))
  );
  // Take the difference
  const files = includedFiles.filter(i => excludedFiles.indexOf(i) < 0);
  for (const file of files) {
    const moduleAndArgs = [
      ...(coverage
        ? [
            nodule(path.join('.bin', 'c8')),
            '--report-dir',
            path.join('.', '.coverage', (testNum++).toString()),
            '--exclude',
            path.join('build', 'test', 'fixtures', '**'),
            '--exclude',
            path.join('build', 'test', 'plugins', 'fixtures', '**'),
          ]
        : []),
      nodule(path.join('mocha', 'bin', '_mocha')),
      '--require',
      'source-map-support/register',
      path.relative(rootDir, file),
      ...(timeout ? ['--timeout', `${timeout}`] : ['--no-timeouts']),
    ];

    await forkP(moduleAndArgs[0], moduleAndArgs.slice(1), {cwd: rootDir});
  }
}
