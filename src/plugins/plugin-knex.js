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
var util = require('util');

// knex 0.10.x and 0.11.x do not need patching
var VERSIONS = '>=0.12 <=0.13';

function patchClient(Client, api) {
  shimmer.wrap(Client.prototype, 'runner', function(original) {
    return function() {
      var runner = original.apply(this, arguments);
      runner.query = api.wrap(runner.query);
      return runner;
    };
  });
}

function unpatchClient(Client) {
  shimmer.unwrap(Client.prototype, 'runner');
}

function interceptTransaction(Transaction, api) {
  function WrappedTransaction(client, container, config, outerTx) {
    Transaction.call(this, client, api.wrap(container), config, outerTx);
  }
  util.inherits(WrappedTransaction, Transaction);
  return WrappedTransaction;
}

module.exports = [
  {
    file: 'lib/transaction.js',
    versions: VERSIONS,
    intercept: interceptTransaction
  },
  {
    file: 'lib/client.js',
    versions: VERSIONS,
    patch: patchClient,
    unpatch: unpatchClient
  }
];
