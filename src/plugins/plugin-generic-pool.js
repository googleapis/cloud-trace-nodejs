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
}

module.exports = [
  {
    file: '',
    versions: '3.x.x',
    patch: patchModuleRoot
  },
];

/*

var util = require('util');
var cls = require('../cls.js');

      var transaction = api.getTransaction();
      console.log('NAMESPACE=' + util.inspect( transaction ));

      //var rootContext = cls.getRootContext();
      //var ns = rootContext.agent.namespace;

      var ns = cls.getNamespace().active.root.agent.namespace;





*/
