/**
 * The main entry point for cross-platform build scripts.
 * Usage (in repository root directory):
 *   ts-node -P ./scripts ./scripts [step1] [step2 ... stepN]
 * Alias for above:
 *   npm run script [step1] [step2 ... stepN]
 */

const [, , ...steps] = process.argv;
const {
  CIRCLE_PR_NUMBER,
  TRACE_TEST_EXCLUDE_INTEGRATION,
  TRACE_SYSTEM_TEST_ENCRYPTED_CREDENTIALS_KEY,
  TRACE_SYSTEM_TEST_ENCRYPTED_CREDENTIALS_IV
} = process.env;

import { checkInstall } from './check-install';
import { compile } from './compile';
import { encryptCredentials, decryptCredentials } from './credentials';
import { getPluginTypes } from './get-plugin-types';
import { initTestFixtures } from './init-test-fixtures';
import { reportCoverage } from './report-coverage';
import { runTests } from './run-tests';
import { testNonInterference } from './test-non-interference';
import { BUILD_DIRECTORY, existsP, spawnP } from './utils';

// The identifying components in the service account credentials file path.
const projectID = 'long-door-651';
const keyID = 'a179efbeda21';

// Globs to exclude when running unit tests only.
const unitTestExcludeGlobs: string[] = TRACE_TEST_EXCLUDE_INTEGRATION ? [
  `${BUILD_DIRECTORY}/test/plugins/test-*`,
  `${BUILD_DIRECTORY}/test/test-agent-stopped.js`,
  `${BUILD_DIRECTORY}/test/test-grpc-context.js`,
  `${BUILD_DIRECTORY}/test/test-mysql-pool.js`,
  `${BUILD_DIRECTORY}/test/test-plugins-*`,
  `${BUILD_DIRECTORY}/test/test-trace-web-frameworks.js`,
  `${BUILD_DIRECTORY}/test/test-unpatch.js`
] : [];

/**
 * Sequentially runs a list of commands.
 */
async function run(steps: string[]) {
  for (const step of steps) {
    console.log(`> Running step: ${step}`);
    // If the step string is prefixed with "npm-", treat it as an "npm run"
    // command, and then short-circuit.
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
    } else if (step.startsWith('compile-')) {
      const [, languageLevel, strict] = step.split('-');
      await compile({ strict: !!strict, languageLevel });
      continue;
    } else {
      switch (step) {
        case 'check-install':
          await checkInstall();
          break;
        case 'encrypt-service-account-credentials':
          const keyAndIV = await encryptCredentials(`${projectID}-${keyID}.json`);
          console.log([
            `key: ${keyAndIV.key}`,
            `iv: ${keyAndIV.iv}`
          ].join('\n'));
          break;
        case 'decrypt-service-account-credentials':
          const key = TRACE_SYSTEM_TEST_ENCRYPTED_CREDENTIALS_KEY;
          const iv = TRACE_SYSTEM_TEST_ENCRYPTED_CREDENTIALS_IV;
          if (!key || !iv) {
            console.log('> Environment insufficient to decrypt service account credentials');
            break;
          }

          await decryptCredentials({ key, iv }, `${projectID}-${keyID}.json`);
          break;
        case 'get-plugin-types':
          await getPluginTypes();
          break;
        case 'init-test-fixtures':
          await initTestFixtures(!TRACE_TEST_EXCLUDE_INTEGRATION);
          break;
        case 'run-unit-tests':
          await runTests({
            includeGlobs: [
              `${BUILD_DIRECTORY}/test/test-*.js`,
              `${BUILD_DIRECTORY}/test/plugins/test-*.js`
            ],
            excludeGlobs: unitTestExcludeGlobs,
            rootDir: BUILD_DIRECTORY,
            coverage: false,
            timeout: 4000
          });
          break;
        case 'run-unit-tests-with-coverage':
          await runTests({
            includeGlobs: [
              `${BUILD_DIRECTORY}/test/test-*.js`,
              `${BUILD_DIRECTORY}/test/plugins/test-*.js`
            ],
            excludeGlobs: unitTestExcludeGlobs,
            rootDir: BUILD_DIRECTORY,
            coverage: true,
            timeout: 4000
          });
          break;
        case 'run-system-tests':
          if (CIRCLE_PR_NUMBER) {
            console.log('> Not running system tests in PRs');
          } else {
            await spawnP(
              'npm', ['install'], { cwd: 'system-test' }
            );
            await runTests({
              includeGlobs: [
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
}

run(steps).catch((err) => {
  console.error(err);
  process.exit(1);
});
