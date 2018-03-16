import * as path from 'path';
import { globP, forkP } from './utils';

export interface Options {
  includeGlobs: string[],
  excludeGlobs?: string[],
  rootDir: string,
  coverage?: boolean,
  timeout?: number
}

export async function runTests(options: Options) {
  const { includeGlobs, excludeGlobs, rootDir, coverage, timeout } = options;
  function nodule(nodule: string) {
    return path.relative(rootDir, `node_modules/${nodule}`);
  }
  let testNum = 0;
  const excludedFiles = ([] as string[])
    .concat(...await Promise.all((excludeGlobs || []).map(glob => globP(glob))));
  const includedFiles = ([] as string[])
    .concat(...await Promise.all(includeGlobs.map(glob => globP(glob))));
  // Take the difference
  const files = includedFiles.filter(i => excludedFiles.indexOf(i) < 0);
  for (const file of files) {
    const moduleAndArgs = [
      ...coverage ? [
        nodule('.bin/nyc'),
        '--reporter',
        'lcov',
        '--report-dir',
        `./coverage/${testNum++}`,
        '--exclude',
        'build/test/**'
      ] : [],
      nodule('mocha/bin/_mocha'),
      '--require',
      'source-map-support/register',
      path.relative(rootDir, file),
      ...timeout ? [
        '--timeout',
        `${timeout}`
      ] : [
        '--no-timeouts'
      ]
    ];

    await forkP(
      moduleAndArgs[0],
      moduleAndArgs.slice(1),
      { cwd: rootDir }
    );
  }
}
