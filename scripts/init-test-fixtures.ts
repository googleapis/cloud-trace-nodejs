import * as path from 'path';
import { BUILD_DIRECTORY, globP, statP, ncpP, spawnP, readFileP, writeFileP, mkdirP } from './utils';
import { readdir } from 'fs';
import * as pify from 'pify';
import * as semver from 'semver';

const readdirP: (path: string) => Promise<string[]> = pify(readdir);

export async function initTestFixtures(installPlugins: boolean) {
  // Copy fixtures to build directory
  const fixtureDirectories = await globP('./test/**/fixtures');
  await Promise.all(fixtureDirectories.map(async (fixtureDirectory) => {
    const newLocation = `${BUILD_DIRECTORY}/${path.relative('.', fixtureDirectory)}`;
    await ncpP(fixtureDirectory, newLocation);
  }));

  if (!installPlugins) {
    return;
  }

  // Run `npm install` for package fixtures
  const packageFixtures = JSON.parse(await readFileP('./test/fixtures/plugin-fixtures.json', 'utf8') as string);
  for (const packageName in packageFixtures) {
    const packageDirectory = `./build/test/plugins/fixtures/${packageName}`;
    let fixtureExists = true;
    try {
      await statP(packageDirectory);
    } catch {
      fixtureExists = false;
    }

    /**
     * This is the general approach:
     * 
     *  if package supports this Node version:
     *    if fixtures don't already exist for this package:
     *      create fixtures
     *    else
     *      if gRPC module binary exists but for a different Node version:
     *        reinstall gRPC
     *      else
     *        skip install
     *  else
     *    skip install
     */
    const packageFixture = packageFixtures[packageName];
    const supportedNodeVersions = (packageFixture.engines && packageFixture.engines.node) || '*';
    if (semver.satisfies(process.version, supportedNodeVersions)) {
      if (!fixtureExists) {
        await mkdirP(packageDirectory);
        await writeFileP(`${packageDirectory}/package.json`, JSON.stringify(Object.assign({
          name: packageName,
          version: '1.0.0',
          main: 'index.js'
        }, packageFixture), null, 2));
        const mainModule = packageFixture._mainModule || Object.keys(packageFixture.dependencies)[0];
        await writeFileP(`${packageDirectory}/index.js`, `module.exports = require('${mainModule}');\n`);
        console.log(`npm install in ${packageDirectory}`);
        await spawnP('npm', ['install', '--reinstall'], {
          cwd: packageDirectory
        });
      } else {
        // Conditionally re-install if gRPC module binary exists but for a different Node version
        let reinstallGrpc = !fixtureExists;
        const extBinDirectory = `${packageDirectory}/node_modules/grpc/src/node/extension_binary`;
        try {
          await statP(extBinDirectory);
          const files = await readdirP(extBinDirectory);
          const modulesVersions = files.map(file => file.match(/^node-v([0-9]+)-/)).filter(x => x).map(matches => matches![1]);
          if (!modulesVersions.some(version => version === process.versions.modules)) {
            reinstallGrpc = true;
          }
        } catch {}
        if (reinstallGrpc) {
          console.log(`Re-installing gRPC in ${packageDirectory} because of stale gRPC binary`);
          const grpcPackageJson = JSON.parse(await readFileP(`${packageDirectory}/node_modules/grpc/package.json`, 'utf8') as string);
          await spawnP('npm', ['install', `grpc@${grpcPackageJson.version}`], {
            cwd: packageDirectory
          });
        } else {
          console.log(`Skipping npm install in ${packageDirectory} since node_modules already exists`);
        }
      }
    } else {
      console.log(`Skipping npm install in ${packageDirectory} since package not supported in Node ${process.version}`);
    }
  };
}
