import * as path from 'path';
import { globP, ncpP, spawnP, tmpDirP } from './utils';

/**
 * Get the major version number of the current Node process.
 */
function getNodeMajorVersion() {
  return Number(process.version.slice(1).split('.')[0]);
}

/**
 * This function checks that the following two (sequential) operations succeed:
 * 1. In a temporary directory, installs from the `npm pack` of this directory
 * 2. Compiles a top-level file in that directory that imports this module
 */
export async function checkInstall() {
  // Determine a temporary directory in which this package should be installed.
  const installDir = await tmpDirP();
  console.log(installDir);
  // Create a tgz with package contents using npm pack
  await spawnP('npm', ['pack']);
  // Try to figure out the name of the tgz file that was just craeted
  // This assumes that you don't already have a TGZ file
  // in your current working directory.
  const tgz = await globP(`${process.cwd()}/*.tgz`);
  if (tgz.length !== 1) {
    throw new Error(`Expected 1 tgz file in current directory, but found ${tgz.length}`);
  }
  // Initialize a new npm package.json in the temp directory.
  await spawnP('npm', ['init', '-y'], {
    cwd: installDir
  });
  // Install the tgz file as a package, along with necessities.
  // @types/node version should match the current process version, but clamped
  // at >=9 (because of http2 types) and <11 (because Node 11 doesn't yet have
  // type definitions).
  const nodeTypesVersion = Math.min(Math.max(getNodeMajorVersion(), 9), 10);
  await spawnP('npm', ['install', 'typescript', `@types/node@${nodeTypesVersion}`, tgz[0]], {
    cwd: installDir
  });
  // Create an entry point for the package created in the temp directory
  // use-module.ts is a fixture that imports the Trace Agent
  await ncpP('./test/fixtures/use-module.ts', `${installDir}/index.ts`);
  // Compile it
  await spawnP(`node_modules${path.sep}.bin${path.sep}tsc`, ['index.ts', '--lib', 'es2015'], {
    cwd: installDir
  });
  console.log('`npm install` + `tsc` test was successful.');
  // Evaluate require('..').start() in Node.
  await spawnP(`node`, ['-e', `"require('@google-cloud/trace-agent').start()"`], {
    cwd: installDir
  });
  console.log('require + start test was successful.');
}
