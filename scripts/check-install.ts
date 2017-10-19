import * as path from 'path';
import { globP, ncpP, spawnP, tmpDirP } from './utils';

/**
 * This function checks that the following two (sequential) operations succeed:
 * 1. In a temporary directory, installs from the `npm pack` of this directory
 * 2. Compiles a top-level file in that directory that imports this module
 */
export default async function() {
  // This script assumes that you don't already have a TGZ file
  // in your current working directory.
  const installDir = await tmpDirP();
  console.log(installDir);
  await spawnP('npm', ['pack']);
  const tgz = (await globP(`${process.cwd()}/*.tgz`)).join(' '); // should be only one
  await spawnP('npm', ['init', '-y'], {
    cwd: installDir
  });
  await spawnP('npm', ['install', 'typescript', '@types/node', tgz], {
    cwd: installDir
  });
  // use-module.ts is a fixture that imports the Trace Agent
  await ncpP('./test/fixtures/use-module.ts', `${installDir}/index.ts`);
  await spawnP(`node_modules${path.sep}.bin${path.sep}tsc`, ['index.ts'], {
    cwd: installDir
  });
  console.log('`npm install` + `tsc` test was successful.');
}