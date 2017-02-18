/**
 * Copyright 2017 Google Inc. All Rights Reserved.
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

var shimmer = require('shimmer');
var agent = require('../../src/trace-agent.js');
// Stub getTraceContext so that it always returns the same thing.
shimmer.wrap(agent, 'get', function(original) {
  return function() {
    var privateAgent = original.apply(this, arguments);
    shimmer.wrap(privateAgent, 'generateTraceContext', function() {
      return function() {
        return 'ffeeddccbbaa99887766554433221100/0?o=1';
      };
    });
    return privateAgent;
  };
});
require('../..').start({
  logLevel: 1,
  samplingRate: 0
});
