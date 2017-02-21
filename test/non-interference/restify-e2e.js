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
var glob = require('glob');
var path = require('path');
var tmp = require('tmp');
var semver = require('semver');

var SUPPORTED_VERSIONS = '<4.x';

if (process.argv.length === 4 && process.argv[2] === '-p') {
  process.env.GCLOUD_PROJECT = process.argv[3];
}
if (!process.env.GCLOUD_PROJECT) {
  console.log('Project number must be provided with the -p flag or' +
      ' the GCLOUD_PROJECT environment variable must be set.');
  process.exit(1);
}
if (!semver.satisfies(process.version, SUPPORTED_VERSIONS)) {
  console.log('Restify tests do not pass on Node.js 4.0 yet');
  process.exit(0);
}

// Setup
var restify_dir = tmp.dirSync().name;
cp.execFileSync('git', ['clone', '--branch', 'v3.0.3',
    'https://github.com/restify/node-restify.git', '--depth', '1', restify_dir]);
var test_glob = path.join(restify_dir, 'test', '*.test.js');
process.chdir(restify_dir);

// Remove name to allow for cyclic dependency
console.log('Updating restify metadata');
cp.execFileSync('sed', ['-i.bak', 's/"restify"/"r"/', 'package.json']);

// Install restify as it's own dependency
console.log('Installing restify dependencies');
cp.execFileSync('npm', ['install', '--save', 'restify@3.0.3']);
cp.execFileSync('npm', ['install']);

// Reformat tests to use newly installed restify
console.log('Reformating tests');
var gcloud_require = 'require(\'' + path.join(__dirname, '..', '..') +
    '\').start({ forceNewAgent_: true, samplingRate: 0, projectId: \'0\', logLevel: 1 });';
glob(test_glob, function(err, files) {
  for (var i = 0; i < files.length; i++) {
    if (i === 0) {
      cp.execFileSync('sed', ['-i.bak', 's#\'use strict\';#' +
          '\'use strict\'; ' + gcloud_require + '#g', files[i]]);
      if (cp.spawnSync('grep', ['-q', gcloud_require, files[i]]).status) {
        cp.execSync('echo "' + gcloud_require + '" | cat - ' + files[i] +
            ' >' +  files[i] + '.instru.js' + '&& mv ' + files[i] +
            '.instru.js' + ' ' + files[i]);
      }
    }
    cp.execFileSync('sed', ['-i.bak', 's#require(\'\\.\\./lib\')#require(\'restify\')#',
        files[i]]);
  }
  // Run tests
  console.log('Running tests');
  var results = cp.spawnSync('make', ['test']);
  var output = results.output[1].toString() || results.output[2].toString();
  console.log(output);
  assert(output.indexOf('FAILURES:') === -1);
  assert(output.indexOf('OK:') !== -1);

  // Teardown
  console.log('Cleaning up');
  assert(!results.status, results.status);
});
