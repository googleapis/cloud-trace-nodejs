import * as path from 'path';
import { BUILD_DIRECTORY, globP, statP, ncpP, spawnP } from './utils';

export default async function() {
  // Copy fixtures to build directory
  const fixtureDirectories = await globP('./test/**/fixtures');
  await Promise.all(fixtureDirectories.map(async (fixtureDirectory) => {
    const newLocation = `${BUILD_DIRECTORY}/${path.relative('.', fixtureDirectory)}`;
    await ncpP(fixtureDirectory, newLocation);
  }));

  // Run `npm install` for package fixtures
  const packageFixtures = await globP('./build/test/plugins/fixtures/*/');
  console.log(`travis_fold:start:npm_install_fixtures`);
  for (const packageDirectory of packageFixtures) {
    let hasNodeModules = true;
    try {
      await statP(`${packageDirectory}/node_modules`)
    } catch (e) {
      hasNodeModules = false;
    }

    if (!hasNodeModules) {
      console.log(`npm install in ${packageDirectory}`);
      await spawnP('npm', ['install', '--silent'], {
        cwd: packageDirectory
      });
    } else {
      console.log(`Skipping npm install in ${packageDirectory} since node_modules already exists`);
    }
  };
  console.log(`travis_fold:end:npm_install_fixtures`);
}
