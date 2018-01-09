const [bin, script, ...steps] = process.argv;

import { checkInstall } from './check-install';
import { encryptCredentials, decryptCredentials } from './credentials';
import { initTestFixtures } from './init-test-fixtures';
import { reportCoverage } from './report-coverage';
import { runTests } from './run-tests';
import { testNonInterference } from './test-non-interference';
import { BUILD_DIRECTORY, existsP, spawnP } from './utils';

const keyID = 'de480e4f9023';

async function run(steps: string[]) {
  for (const step of steps) {
    console.log(`> Running step: ${step}`);
    if (step.indexOf('npm-') === 0) {
      const moduleAndArgs = step.split('-');
      await spawnP(
        'npm',
        [
          'run',
          moduleAndArgs.slice(1).join('-')
        ]
      );
      continue;
    }
    switch (step) {
      case 'check-install':
        await checkInstall();
        break;
      case 'encrypt-service-account-credentials':
        const keyAndIV = await encryptCredentials(`node-team-test-${keyID}.json`);
        console.log([
          `key: ${keyAndIV.key}`,
          `iv: ${keyAndIV.iv}`
        ].join('\n'));
        break;
      case 'decrypt-service-account-credentials':
        const {
          TRACE_SYSTEM_TEST_ENCRYPTED_CREDENTIALS_KEY: key,
          TRACE_SYSTEM_TEST_ENCRYPTED_CREDENTIALS_IV: iv,
        } = process.env;
      
        if (!key || !iv) {
          console.log('> Environment insufficient to decrypt service account credentials');
          break;
        }

        await decryptCredentials({ key, iv }, `node-team-test-${keyID}.json`);
        break;
      case 'init-test-fixtures':
        await initTestFixtures();
        break;
      case 'run-unit-tests':
        await runTests({
          globs: [
            `${BUILD_DIRECTORY}/test/test-*.js`,
            `${BUILD_DIRECTORY}/test/plugins/test-*.js`
          ],
          rootDir: BUILD_DIRECTORY,
          coverage: false,
          timeout: 4000
        });
        break;
      case 'run-unit-tests-with-coverage':
        await runTests({
          globs: [
            `${BUILD_DIRECTORY}/test/test-*.js`,
            `${BUILD_DIRECTORY}/test/plugins/test-*.js`
          ],
          rootDir: BUILD_DIRECTORY,
          coverage: true,
          timeout: 4000
        });
        break;
      case 'run-system-tests':
        if (process.env.CI_PULL_REQUEST && !(await existsP('node-team-test-d0b0be11c23d.json'))) {
          console.log('> Not running system tests in PRs');
        } else {
          await runTests({
            globs: [
              `system-test/*.js`,
            ],
            rootDir: '.',
            coverage: false
          });
        }
        break;
      case 'report-coverage':
        await reportCoverage();
        break;
      case 'test-non-interference':
        await testNonInterference();
        break;
      default:
        console.log(`> ${step}: not found`);
        break;
    }
  }
}

run(steps).catch((err) => {
  console.error(err);
  process.exit(1);
});
