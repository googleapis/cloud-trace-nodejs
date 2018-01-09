import * as path from 'path';
import { BUILD_DIRECTORY, globP, statP, ncpP, spawnP, readFileP, writeFileP, mkdirP } from './utils';

export async function initTestFixtures() {
  // Copy fixtures to build directory
  const fixtureDirectories = await globP('./test/**/fixtures');
  await Promise.all(fixtureDirectories.map(async (fixtureDirectory) => {
    const newLocation = `${BUILD_DIRECTORY}/${path.relative('.', fixtureDirectory)}`;
    await ncpP(fixtureDirectory, newLocation);
  }));

  // Run `npm install` for package fixtures
  const packageFixtures = JSON.parse(await readFileP('./test/fixtures/plugin-fixtures.json', 'utf8') as string);
  for (const packageName in packageFixtures) {
    const packageDirectory = `./build/test/plugins/fixtures/${packageName}`;
    let fixtureExists = true;
    try {
      await statP(packageDirectory);
    } catch (e) {
      fixtureExists = false;
    }

    if (!fixtureExists) {
      await mkdirP(packageDirectory);
      await writeFileP(`${packageDirectory}/package.json`, JSON.stringify(Object.assign({
        name: packageName,
        version: '1.0.0',
        main: 'index.js'
      }, packageFixtures[packageName]), null, 2));
      const mainModule = packageFixtures[packageName]._mainModule || Object.keys(packageFixtures[packageName].dependencies)[0];
      await writeFileP(`${packageDirectory}/index.js`, `module.exports = require('${mainModule}');\n`);
      console.log(`npm install in ${packageDirectory}`);
      await spawnP('npm', ['install', '--silent'], {
        cwd: packageDirectory
      });
    } else {
      console.log(`Skipping npm install in ${packageDirectory} since node_modules already exists`);
    }
  };
}
