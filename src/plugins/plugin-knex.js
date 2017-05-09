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

var VERSIONS = '0.12.x';

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

function patchMysqlIndex(Mysql, api) {
  shimmer.wrap(Mysql.prototype, 'transaction', function(original) {
    return function() {
      var args = Array.prototype.slice.call(arguments).map(function(item) {
        return item && is.fn(item) ? api.wrap(item) : item;
      });
      return original.apply(this, args);
    };
  });
}

function unpatchMysqlIndex(Mysql) {
  shimmer.unwrap(Mysql.prototype, 'transaction');
}

module.exports = [
  {
    file: 'lib/client.js',
    versions: VERSIONS,
    patch: patchClient,
    unpatch: unpatchClient
  },
  {
    file: 'lib/dialects/mysql/index.js',
    version: VERSIONS,
    patch: patchMysqlIndex,
    unpatch: unpatchMysqlIndex
  }
];
