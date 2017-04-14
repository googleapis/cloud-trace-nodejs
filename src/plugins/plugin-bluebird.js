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
var is = require('is');

function wrapFunction(api, fn) {
  return fn && is.fn(fn) ? api.wrap(fn) : fn;
}

function patchPromise(Promise, api) {
  shimmer.wrap(Promise.prototype, '_addCallbacks', function(original) {
    return function(fulfill, reject, promise, receiver, domain) {
      return original.call(this, wrapFunction(api, fulfill),
                                 wrapFunction(api, reject),
                                 promise, receiver, domain);
    };
  });
}

module.exports = [
  {
    file: 'js/release/bluebird.js',
    versions: '3',
    patch: patchPromise
  }
];
