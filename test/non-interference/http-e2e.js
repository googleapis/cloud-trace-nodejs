/**
 * Copyright 2015 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var assert = require('assert');
var cp = require('child_process');
var fs = require('fs');
var glob = require('glob');
var path = require('path');
var tmp = require('tmp');
var semver = require('semver');

if (process.argv.length === 4 && process.argv[2] === '-p') {
  process.env.GCLOUD_PROJECT = process.argv[3];
}
if (!process.env.GCLOUD_PROJECT) {
  console.log('Project number must be provided with the -p flag or' +
      ' the GCLOUD_PROJECT environment variable must be set.');
  process.exit(1);
}

// Setup
var node_dir = tmp.dirSync().name;
cp.execFileSync('git', ['clone', '--branch', process.version,
    'https://github.com/nodejs/node.git', '--depth', '1', node_dir]);
fs.mkdirSync(path.join(node_dir, 'test', 'tmp'));
console.log('Turning off global checks');
// The use of the -i flag as '-i.bak' to specify a backup extension of '.bak'
// is needed to ensure that the command works on both Linux and OS X
cp.execFileSync('sed', ['-i.bak', 's/exports.globalCheck = true/' +
    'exports.globalCheck = false/g', path.join(node_dir, 'test', 'common.js')]);
var test_glob = semver.satisfies(process.version, '0.12.x') ?
    path.join(node_dir, 'test', 'simple', 'test-http*.js') :
    path.join(node_dir, 'test', 'parallel', 'test-http*.js');

// Run tests
console.log('Running tests');
var gcloud_require = 'require(\'' + path.join(__dirname, '..', '..') +
    '\').start();';
glob(test_glob, function(err, files) {
  var errors = 0;
  var testCount;
  for (testCount = 0; testCount < files.length; testCount++) {
    // parser-bad-ref: Relies on valgrind gc
    // max-headers-count: Breaks because we introduce new headers
    // parser-free: Breaks because we send outgoing http on startup
    // response-splitting: Breaks because we introduce new headers
    // http-chunk-problem: Relies on shasum of own file
    if (files[testCount].indexOf('parser-bad-ref') !== -1 ||
        files[testCount].indexOf('max-headers-count') !== -1 ||
        files[testCount].indexOf('parser-free') !== -1 ||
        files[testCount].indexOf('response-splitting') !== -1 ||
        files[testCount].indexOf('http-chunk-problem') !== -1) {
      console.log('Skipped: ' + files[testCount]);
      continue;
    }
    // The use of the -i flag as '-i.bak' to specify a backup extension of 
    // '.bak' is needed to ensure that the command works on both Linux and OS X
    cp.execFileSync('sed', ['-i.bak', 's#\'use strict\';#' +
        '\'use strict\';' + gcloud_require + '#g', files[testCount]]);
    if (cp.spawnSync('grep', ['-q', gcloud_require, files[testCount]]).status) {
      cp.execSync('echo "' + gcloud_require + '" | cat - ' + files[testCount] +
          ' >' +  files[testCount] + '.instru.js' + '&& mv ' + files[testCount] +
          '.instru.js' + ' ' + files[testCount]);
    }
    // Use natives flag to allow http tests to force GC.
    var results = cp.spawnSync('node', ['--allow_natives_syntax', files[testCount]]);
    if (results.status) {
      console.log('Failed: ' + files[testCount]);
      errors ++;
      console.log(results.stderr.toString());
    } else {
      console.log('Passed: ' + files[testCount]);
    }
  }
  console.log('total: ' + testCount);
  console.log('failed: ' + errors);

  assert(!errors);
});
