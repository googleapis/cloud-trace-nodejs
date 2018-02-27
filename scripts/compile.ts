import * as path from 'path';
import { forkP } from './utils';
import * as ts from 'typescript';
import * as semver from 'semver';

export interface CompileOptions {
  strict: boolean;
  languageLevel: string;
}

export async function compile(options: CompileOptions) {
  let { strict, languageLevel } = options;
  if (languageLevel === 'auto') {
    languageLevel = semver.satisfies(process.version, '>=7.5') ? 'es2017' : 'es2015';
  }
  await forkP(`node_modules/typescript/lib/tsc`, [
    '-p',
    strict ? '.' : './tsconfig.full.json',
    '--target',
    languageLevel
  ]);
}
