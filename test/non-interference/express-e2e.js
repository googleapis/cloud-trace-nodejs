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
  console.log('Express tests do not pass on Node.js 4.0 yet');
  process.exit(0);
}

// Setup
var express_dir = tmp.dirSync().name;
cp.execFileSync('git', ['clone', '--branch', '4.13.1',
    'https://github.com/strongloop/express.git', '--depth', '1', express_dir]);
var test_glob = path.join(express_dir, 'test', '*.js');
var error;
process.chdir(express_dir);

// Remove name to allow for cyclic dependency
console.log('Updating express metadata');
cp.execFileSync('sed', ['-i.bak', 's/"express"/"e"/', 'package.json']);

// Install express as it's own dependency
console.log('Installing express dependencies');
cp.execFileSync('npm', ['install', '--save', 'express@4.13.1']);
cp.execFileSync('npm', ['install']);

// Reformat tests to use newly installed express
console.log('Reformating tests');
glob(test_glob, function(err, files) {
  error = error || err;
  for (var i = 0; i < files.length; i++) {
    cp.execFileSync('sed', ['-i', 's#require(\'\\.\\./\\?\')#require(\'express\')#',
        files[i]]);
  }
  // Run tests
  console.log('Running tests');
  var results = cp.spawnSync('mocha', [
    '--require',
    path.join(__dirname, 'start-agent.js'),
    test_glob
  ]);
  console.log(results.output[1].toString() || results.output[2].toString());
  error = error || results.status;

  // Teardown
  console.log('Cleaning up');
  assert(!error, error);
});
