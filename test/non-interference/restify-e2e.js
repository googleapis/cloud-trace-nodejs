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

if (process.argv.length === 4 && process.argv[2] === '-p') {
  process.env.GCLOUD_PROJECT_NUM = process.argv[3];
}
if (!process.env.GCLOUD_PROJECT_NUM) {
  console.log('Project number must be provided with the -p flag or' +
      ' the GCLOUD_PROJECT_NUM environment variable must be set.');
  process.exit(1);
}

// Setup
var restify_dir = tmp.dirSync().name;
cp.execFileSync('git', ['clone', '--branch', 'v4.0.0',
    'https://github.com/restify/node-restify.git', '--depth', '1', restify_dir]);
var test_glob = path.join(restify_dir, 'test', '*.test.js');
process.chdir(restify_dir);

// Remove name to allow for cyclic dependency
console.log('Updating restify metadata');
cp.execFileSync('sed', ['-i', 's/"restify"/"r"/', 'package.json']);

// Install restify as it's own dependency
console.log('Installing restify dependencies');
cp.execFileSync('npm', ['install', '--save', 'restify@4.0.0']);
cp.execFileSync('npm', ['install']);

// Reformat tests to use newly installed restify
console.log('Reformating tests');
var gcloud_require = 'require(\'' + path.join(__dirname, '..', '..') +
    '\').start();';
glob(test_glob, function(err, files) {
  for (var i = 0; i < files.length; i++) {
    cp.execFileSync('sed', ['-i', 's#\'use strict\';#' +
        '\'use strict\'; ' + gcloud_require + '#g', files[i]]);
    if (cp.spawnSync('grep', ['-q', gcloud_require, files[i]]).status) {
      cp.execSync('echo "' + gcloud_require + '" | cat - ' + files[i] +
          ' >' +  files[i] + '.instru.js' + '&& mv ' + files[i] +
          '.instru.js' + ' ' + files[i]);
    }
    cp.execFileSync('sed', ['-i', 's#require(\'\\.\\./lib\')#require(\'restify\')#',
        files[i]]);
  }
  // Run tests
  console.log('Running tests');
  var results = cp.spawnSync('make', ['test']);
  console.log(results.output[1].toString() || results.output[2].toString());

  // Teardown
  console.log('Cleaning up');
  assert(!results.status, results.status);
});
