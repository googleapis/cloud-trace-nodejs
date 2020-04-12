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

import {FORCE_NEW} from '../src/util';

delete process.env.GCLOUD_PROJECT;

import * as assert from 'assert';
import {describe, it} from 'mocha';

describe('index.js', () => {
  it('should complain when config.projectId is not a string or number', () => {
    const agent = require('../..').start({
      projectId: {test: false},
      enabled: true,
      logLevel: 0,
      [FORCE_NEW]: true,
    });
    assert(!agent.isActive());
  });
});

export default {};
