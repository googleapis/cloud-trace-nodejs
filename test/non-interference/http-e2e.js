// Copyright 2015 Google LLC
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

'use strict';

var assert = require('assert');
var cp = require('child_process');
var fs = require('fs');
var glob = require('glob');
var path = require('path');
var tmp = require('tmp');

// Setup
var node_dir = tmp.dirSync().name;
cp.execFileSync('git', ['clone', '--branch', process.version,
    'https://github.com/nodejs/node.git', '--depth', '1', node_dir]);
fs.mkdirSync(path.join(node_dir, 'test', 'tmp'));
console.log('Turning off global checks');
// The use of the -i flag as '-i.bak' to specify a backup extension of '.bak'
// is needed to ensure that the command works on both Linux and OS X
var testCommonPath = [
    path.join(node_dir, 'test', 'common', 'index.js'),
    path.join(node_dir, 'test', 'common.js')
].find(function(candidatePath) {
    return fs.existsSync(candidatePath);
});
if (!testCommonPath) {
    console.error('No common.js or common/index.js found in test directory');
    process.exit(1);
}
cp.execFileSync('sed', ['-i.bak', 's/exports.globalCheck = true/' +
    'exports.globalCheck = false/g', testCommonPath]);
// Test files for http, https, and http2.
var test_glob = path.join(node_dir, 'test', 'parallel', 'test-http?(s|2)-*.js');

// Run tests
console.log('Running tests');
var gcloud_require =
    'var proxyquire = require(\'' +
    path.join(__dirname, '../../node_modules/proxyquire') +
    '\');' +
    'proxyquire(\'' +
    path.join(__dirname, '../../node_modules/gcp-metadata') +
    '\', { \'retry-request\': require(\'' +
    path.join(__dirname, '../../node_modules/request') +
    '\')});' +
    'require(\'' + path.join(__dirname, '../..') +
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

    // Check if the test has a '// Flags:' section at the top.
    const contents = fs.readFileSync(files[testCount], 'utf8');
    const matches = contents.match(/^\/\/ Flags: (.*)$/m);
    const flags = matches ? matches[1] : '';

    // The use of the -i flag as '-i.bak' to specify a backup extension of
    // '.bak' is needed to ensure that the command works on both Linux and OS X
    cp.execFileSync('sed', ['-i.bak', 's#\'use strict\';#' +
        '\'use strict\';' + gcloud_require + '#g', files[testCount]]);
    if (cp.spawnSync('grep', ['-q', gcloud_require, files[testCount]]).status) {
      cp.execSync('echo "' + gcloud_require + '" | cat - ' + files[testCount] +
          ' >' +  files[testCount] + '.instru.js' + '&& mv ' + files[testCount] +
          '.instru.js' + ' ' + files[testCount]);
    }

    var results = cp.spawnSync('node', [flags, files[testCount]]);
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
