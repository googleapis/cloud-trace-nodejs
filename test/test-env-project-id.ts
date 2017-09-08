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

process.env.GCLOUD_PROJECT = '1729';

var trace = require('..');

var assert = require('assert');

describe('should respect environment variables', function() {
  it('should respect GCLOUD_PROJECT', function() {
    var agent = trace.start({forceNewAgent_: true});
    assert.equal(agent.config_.projectId, 1729);
  });

  it('should prefer env to config', function() {
    var agent = trace.start({projectId: 1927, forceNewAgent_: true});
    assert.equal(agent.config_.projectId, 1729);
  });
});

export default {};
