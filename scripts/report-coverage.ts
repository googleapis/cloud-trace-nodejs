import { BUILD_DIRECTORY, nodule, forkP } from './utils';
import * as path from 'path';

export async function reportCoverage() {
  await forkP(nodule('.bin/codecov'), [`--root=${path.resolve(BUILD_DIRECTORY, '..')}`], {
    cwd: BUILD_DIRECTORY
  });
}
