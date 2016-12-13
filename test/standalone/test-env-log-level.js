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

process.env.GCLOUD_TRACE_LOGLEVEL = 4;

var assert = require('assert');
var agent = require('../..');

describe('should respect environment variables', function() {
  it('should respect GCLOUD_TRACE_LOGLEVEL', function() {
    agent.startAgent();
    assert.equal(agent.private_().config_.logLevel, 4);
    agent.stop();
  });

  it('should prefer env to config', function() {
    agent.startAgent({logLevel: 2});
    assert.equal(agent.private_().config_.logLevel, 4);
    agent.stop();
  });
});
