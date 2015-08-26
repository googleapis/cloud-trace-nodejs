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
var spawn = require('child_process').spawn;
var path = require('path');

var tests = {
  http: 'http/http-performance-runner.js',
  express: 'express/express-performance-runner.js',
  mongo: 'mongo/mongo-performance-runner.js',
  restify: 'restify/restify-performance-runner.js'
};

if (process.argv.length < 3) {
  console.log('Please specify framework to test: [express, http, mongo, restify]');
  return;
}

var baseOut = '';
var baseline = spawn('node', [path.join(__dirname, tests[process.argv[2]])]);
baseline.stdout.on('data', function (data) {
  baseOut += data;
});
baseline.stderr.on('data', function (data) {
  assert.fail(data);
});
baseline.on('close', function (code) {
  assert.equal(code, 0);
  var patchedOut = '';
  var instrumented = spawn('node', [path.join(__dirname, tests[process.argv[2]]),
      '-i']);
  instrumented.stdout.on('data', function (data) {
    patchedOut += data;
  });
  instrumented.stderr.on('data', function (data) {
    assert.fail(data);
  });
  instrumented.on('close', function (code) {
    assert.equal(code, 0);
    var baseTime = baseOut.trim().split('\n').pop();
    var patchedTime = patchedOut.trim().split('\n').pop();
    var percentSlower = (((patchedTime / baseTime) - 1) * 100).toFixed(1);
    console.log('Instrumented time was ' + percentSlower + '% slower',
        baseTime, patchedTime);
    // TODO: add some real think time to the smiley server and lower the bound
    // here.
    assert(percentSlower < 200); // 200% slower!
  });
});

