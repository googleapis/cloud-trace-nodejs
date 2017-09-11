const [bin, script, ...steps] = process.argv;

import decryptServiceAccountKey from './decrypt-service-account-key';
import initTestFixtures from './init-test-fixtures';
import reportCoverage from './report-coverage';
import runTests from './run-tests';
import testNonInterference from './test-non-interference';
import { BUILD_DIRECTORY, existsP, spawnP } from './utils';

async function run(steps: string[]) {
  for (const step of steps) {
    console.log(`> Running step: ${step}`);
    if (step.indexOf('npm-') === 0) {
      const moduleAndArgs = step.split('-');
      await spawnP(
        'npm',
        [
          'run',
          ...moduleAndArgs.slice(1)
        ]
      );
      continue;
    }
    switch (step) {
      case 'decrypt-service-account-key':
        if (process.env.TRAVIS_PULL_REQUEST === 'false') {
          await decryptServiceAccountKey();
        } else {
          console.log('> Not decrypting service account key in PRs');
        }
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
          coverage: true,
          timeout: 4000
        });
        break;
      case 'run-system-tests':
        if (process.env.TRAVIS_PULL_REQUEST && !(await existsP('node-team-test-d0b0be11c23d.json'))) {
          console.log('> Not running system tests in PRs');
        } else {
          await runTests({
            globs: [
              `system-test/*.js`,
            ],
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
