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

function patchModuleRoot(genericPool, api) {
  shimmer.wrap(genericPool.Pool.prototype, 'acquire', function(original) {
    return function() {
      var result = original.apply(this, arguments);
      shimmer.wrap(result, 'then', function(original) {
        return function(onFulfilled, onRejected) {
          return original.apply(this,
                                [ api.wrap(onFulfilled),
                                  api.wrap(onRejected) ]);
        };
      });
      return result;
    };
  });

  shimmer.wrap(genericPool, 'Pool', function(OriginalPool) {
    return function(Evictor, Deque, PriorityQueue, factory, options) {
      var pool = new OriginalPool(Evictor, Deque, PriorityQueue, factory, options);
      pool._factory = {
        create: api.wrap(pool._factory.create),
        destroy: api.wrap(pool._factory.destory),
        validate: api.wrap(pool._factory.validate)
      };
      return pool;
    };
  });
}

module.exports = [
  {
    file: '',
    versions: '3.x.x',
    patch: patchModuleRoot
  }
];
