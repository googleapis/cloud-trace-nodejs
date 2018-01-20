import { BUILD_DIRECTORY, nodule, readFileP, forkP, spawnP } from './utils';
import * as path from 'path';
import * as pify from 'pify';

export async function reportCoverage() {
  await forkP(nodule('.bin/codecov'), [], {
    cwd: BUILD_DIRECTORY
  });
}
