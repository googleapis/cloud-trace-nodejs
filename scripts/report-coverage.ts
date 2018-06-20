import { BUILD_DIRECTORY, nodule, readFileP, forkP, spawnP } from './utils';
import path from 'path';
import pify from 'pify';

export async function reportCoverage() {
  await forkP(nodule('.bin/codecov'), [], {
    cwd: BUILD_DIRECTORY
  });
}
