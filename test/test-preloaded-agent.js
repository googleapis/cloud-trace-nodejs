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

var semver = require('semver');
var execSync = require('child_process').execSync;
var assert = require('assert');

// --require added `internal/preload` semantics in 2.2.0.
if (semver.satisfies(process.versions.node, '>= 2.2.0')) {
  describe('preloaded agent', function() {
    it('should start automatically when preloaded using --require', function() {
      var output = execSync('node --require "." test/fixtures/preloaded-agent.js');
      assert(output.toString().match(/passed/));
    });
  });
} else {
  console.log('Skipping --require test for node ', process.versions.node);
}
