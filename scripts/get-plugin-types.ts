// Copyright 2017 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {mkdirP, readFileP, spawnP, writeFileP} from './utils';

const TYPES_DIRECTORY = 'src/plugins/types';

async function mkdirSafeP(dir: string) {
  try {
    await mkdirP(dir);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw new Error(`Error creating directory ${dir}`);
    }
    return false;
  }
}

export async function getPluginTypes() {
  await mkdirSafeP(TYPES_DIRECTORY);

  const indexTs = (
    (await readFileP(`${TYPES_DIRECTORY}/index.d.ts`, 'utf8')) as string
  ).split('\n');
  for (const line of indexTs) {
    const matches = line.match(
      /^import \* as .* from '\.\/(.+)';\s*\/\/\s*(.+)@(.+)/
    );
    if (!matches) {
      continue;
    }
    const [, packageName, name, version] = matches;
    const installDir = `${TYPES_DIRECTORY}/${packageName}`;
    if (await mkdirSafeP(installDir)) {
      await spawnP('npm', ['init', '-y'], {
        cwd: installDir,
      });
      await spawnP('npm', ['install', `@types/${name}@${version}`], {
        cwd: installDir,
      });
      await writeFileP(
        `${installDir}/index.ts`,
        `import * as _ from '${name}'; export = _;\n`,
        'utf8'
      );
    }
  }
}
