import * as path from 'path';
import { globP, forkP } from './utils';

export interface Options {
  globs: string[],
  rootDir: string,
  coverage?: boolean,
  timeout?: number
}

export async function runTests(options: Options) {
  const { globs, rootDir, coverage, timeout } = options;
  function nodule(nodule: string) {
    return path.relative(rootDir, `node_modules/${nodule}`);
  }
  let testNum = 0;
  const files = ([] as string[])
    .concat(...await Promise.all(globs.map(glob => globP(glob))))
    .filter(_ => true);
  for (const file of files) {
    const moduleAndArgs = [
      ...coverage ? [
        nodule('istanbul/lib/cli'),
        'cover',
        '--dir',
        `./coverage/${testNum++}`,
        nodule('mocha/bin/_mocha'),
        '--'
      ] : [
        nodule('mocha/bin/_mocha')
      ],
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
