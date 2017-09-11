import { Stats, stat, readFile } from 'fs';
import * as glob from 'glob';
import { ncp } from 'ncp';
import * as path from 'path';
import * as pify from 'pify';
import { ChildProcess, ForkOptions, fork, SpawnOptions, spawn } from 'child_process';
import * as once from 'once';

export const BUILD_DIRECTORY = 'build';

export const globP: (pattern: string) => Promise<string[]> = pify(glob);
export const ncpP: (src: string, dest: string) => Promise<void> = pify(ncp);
export const statP: (path: string) => Promise<Stats> = pify(stat);
export const readFileP: (path: string, encoding?: string) => Promise<Buffer|string> = pify(readFile);

export async function existsP(path: string): Promise<boolean> {
  let exists = true;
  try {
    await statP(path);
  } catch (e) {
    exists = false;
  }
  return exists;
}

function promisifyChildProcess(childProcess: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const exit = (err?: Error) => once(() => err ? reject(err) : resolve())();
    childProcess.on('error', exit);
    childProcess.on('close', (code) => {
      if (code === 0) {
        exit();
      } else {
        exit(new Error(`Process ${childProcess.pid} exited with code ${code}.`));
      }
    });
  });
}

export function spawnP(command: string, args?: string[], options?: SpawnOptions): Promise<void> {
  const stringifiedCommand = `\`${command}${args ? (' ' + args.join(' ')) : ''}\``;
  console.log(`> Running: ${stringifiedCommand}`);
  return promisifyChildProcess(spawn(command, args, Object.assign({
    stdio: 'inherit',
    shell: true
  }, options)));
}

export function forkP(moduleName: string, args?: string[], options?: ForkOptions): Promise<void> {
  const stringifiedCommand = `\`${moduleName}${args ? (' ' + args.join(' ')) : ''}\``;
  console.log(`> Running: ${stringifiedCommand}`);
  return promisifyChildProcess(fork(moduleName, args, Object.assign({
    stdio: 'inherit'
  }, options)));
}
