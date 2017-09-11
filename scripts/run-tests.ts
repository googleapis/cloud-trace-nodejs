import * as path from 'path';
import { BUILD_DIRECTORY, globP, forkP } from './utils';

function nodule(nodule: string) {
  return path.relative(BUILD_DIRECTORY, `node_modules/${nodule}`);
}

export interface Options {
  globs: string[],
  coverage?: boolean,
  timeout?: number
}

export default async function(options: Options) {
  const { globs, coverage, timeout } = options;
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
      path.relative(BUILD_DIRECTORY, file),
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
      { cwd: BUILD_DIRECTORY }
    );
  }
}
