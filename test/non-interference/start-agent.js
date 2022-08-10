// Copyright 2017 Google LLC
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

const shimmer = require('shimmer');
// eslint-disable-next-line node/no-missing-require
const util = require('../../build/src/util.js');
// Stub generateTraceContext so that it always returns the same thing.
// This is because web framework unit tests check that similar/identical
// incoming requests yield the same outgoing headers (for example, express
// tests that the same request body with either HEAD or GET method have the
// same response headers).
// This problem doesn't manifest when samplingRate is set to default, because
// traces are almost never generated.
shimmer.wrap(util, 'generateTraceContext', () => {
  return function () {
    return 'ffeeddccbbaa99887766554433221100/0?o=1';
  };
});
// eslint-disable-next-line node/no-missing-require
require('../..').start({
  projectId: '0',
  logLevel: 1,
  samplingRate: 0,
});
