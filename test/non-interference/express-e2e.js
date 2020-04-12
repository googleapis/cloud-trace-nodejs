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

const assert = require('assert');
const cp = require('child_process');
const glob = require('glob');
const path = require('path');
const tmp = require('tmp');

const expressVersion = '4.15.3';

// Setup
const express_dir = tmp.dirSync().name;
cp.execFileSync('git', [
  'clone',
  '--branch',
  expressVersion,
  'https://github.com/strongloop/express.git',
  '--depth',
  '1',
  express_dir,
]);
const test_glob = path.join(express_dir, 'test', '*.js');
let error;
process.chdir(express_dir);

// Remove name to allow for cyclic dependency
console.log('Updating express metadata');
cp.execFileSync('sed', ['-i.bak', 's/"express"/"e"/', 'package.json']);

// Install express as its own dependency
console.log('Installing express dependencies');
cp.execFileSync('npm', ['--version'], {stdio: 'inherit'});
cp.execFileSync('npm', ['install']);
cp.execFileSync('npm', ['install', 'express@' + expressVersion]);

// Reformat tests to use newly installed express
console.log('Reformatting tests');
glob(test_glob, (err, files) => {
  error = error || err;
  for (let i = 0; i < files.length; i++) {
    cp.execFileSync('sed', [
      '-i',
      "s#require('\\.\\./\\?')#require('express')#",
      files[i],
    ]);
  }
  // Run tests
  console.log('Running tests');
  const results = cp.spawnSync('mocha', [
    '--require',
    path.join(__dirname, 'start-agent.js'),
    test_glob,
  ]);
  console.log(results.output[1].toString() || results.output[2].toString());
  error = error || results.status;

  // Teardown
  console.log('Cleaning up');
  assert(!error, error);
});
