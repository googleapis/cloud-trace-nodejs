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

var tmp_dir = tmp.dirSync().name;
process.chdir(path.join(__dirname, '..', '..'));
console.log('Packing trace');
console.log(cp.execFileSync('npm', ['pack']).toString());
// Glob to avoid dependency on version
glob('google-cloud-trace-*.tgz', function(err, files) {
  // Files will be a singleton
  cp.execFileSync('mv', [files[0], tmp_dir]);
  cp.execFileSync('cp', [path.join(__dirname, 'docker', 'Dockerfile'), tmp_dir]);

  process.chdir(tmp_dir);
  console.log('Building docker image');
  var build = cp.spawn('docker', ['build', '-t', 'test', '.']);
  build.stdout.on('data', function(data) { console.log(data.toString()); });
  build.stderr.on('data', function(data) { console.log(data.toString()); });
  build.on('close', function(code) {
    if (!code) {
      var test = cp.spawn('docker', ['run', '-w', '/mongo', '-t', 'test', 'node',
          'test/runner.js', '-e', 'GCLOUD_PROJECT_NUM=' + process.env.GCLOUD_PROJECT_NUM,
          '-t', 'functional']);
      test.stdout.on('data', function(data) { console.log(data.toString()); });
      test.stderr.on('data', function(data) { console.log(data.toString()); });
      test.on('close', function(code) { console.log('Exited with code ' + code); });
    }
  });
});
