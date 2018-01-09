import { BUILD_DIRECTORY, nodule, readFileP, forkP, spawnP } from './utils';
import * as path from 'path';
import * as pify from 'pify';

export async function reportCoverage() {
  await forkP(nodule('istanbul/lib/cli'), [
    'report',
    'lcovonly'
  ], {
    cwd: BUILD_DIRECTORY
  });
  const lcov = await readFileP(`${BUILD_DIRECTORY}/coverage/lcov.info`, 'utf8');
  await forkP(nodule('.bin/codecov'), [], {
    cwd: BUILD_DIRECTORY
  });
}
