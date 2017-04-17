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

var common = require('./common.js');
var assert = require('assert');
var mysql = require('./fixtures/mysql2');
var Promise = require('./fixtures/bluebird3');

var dbConfig = {
  host     : 'localhost',
  user     : 'travis',
  password : '',
  database : 'test'
};

var escapee;

// This timeout emulates blocking on a connection pool
setTimeout(function() {
  escapee();
}, 50);

describe('test-mysql-bluebird', function() {
  it('should perform basic operations', function(done) {
    common.runInTransaction(function(endRootSpan) {
      Promise.resolve(
        new Promise(function (resolve) {
          escapee = resolve;
        })
      ).then(function () {
        mysql.createConnection(dbConfig).query('SHOW TABLES', function(err, res) {
          endRootSpan();
          var spans = common.getMatchingSpans(function (span) {
            return span.name === 'mysql-query';
          });
          assert.equal(spans.length, 1);
          assert.equal(spans[0].labels.sql, 'SHOW TABLES');
          done();
        });
      });
    });
  });
});
