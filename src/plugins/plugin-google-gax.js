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

module.exports = [
  {
    file: '',
    versions: '^0.10.x',
    patch: function(gax, api) {
      shimmer.wrap(gax, 'createApiCall', function(createApiCall) {
        return function createApiCall_trace(funcWithAuth, settings, optDescriptor) {
          var funcWithAuthThen = funcWithAuth.then;
          funcWithAuth.then = function(cb) {
            var result = funcWithAuthThen.call(this, cb);
            var resultThen = result.then;
            result.then = function(cb) {
              return resultThen.call(this, api.wrap(cb));
            };
            return result;
          };
          var apiCallInner = createApiCall.call(this, funcWithAuth, settings, optDescriptor);
          return function apiCallInner_trace(request, callOptions, callback) {
            // This api.wrap is only applied to ensure context is restored when the user callback
            // is invoked. It is not required to trace google api libraries.
            return apiCallInner.call(this, request, callOptions, api.wrap(callback));
          };
        };
      });
    },
    unpatch: function(gax) {
      shimmer.unwrap(gax, 'createApiCall');
    }
  }
];
