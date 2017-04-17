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
var Sequelize = require('./fixtures/sequelize3');

var sequelize = new Sequelize('test', 'travis', '', {
  host: 'localhost',
  dialect: 'mysql',
  pool: {
    max: 5,
    min: 0,
    idle: 10000
  }
});

var obj = {
  k: 1,
  v: 'obj'
};

describe('test-trace-mysql', function() {
  beforeEach(function(done) {
    sequelize.query('CREATE TABLE t (k int(10), v varchar(10))')
            .spread(function(res, meta) {
              assert(res);
              sequelize.query('INSERT INTO t SET :obj', { replacements: { obj: obj } })
                      .spread(function(res, meta) {
                        assert(res);
                        common.cleanTraces();
                        done();
                      });
            });
  });

  afterEach(function(done) {
    sequelize.query('DROP TABLE t')
            .spread(function(res, meta) {
              assert(res);
              common.cleanTraces();
              done();
            });
  });

  it('should perform basic queries', function(done) {
    common.runInTransaction(function(endRootSpan) {
      sequelize.query('SELECT * FROM t')
              .spread(function(res, meta) {
                assert(res);
                endRootSpan();
                var spans = common.getMatchingSpans(function (span) {
                  return span.name === 'mysql-query';
                });
                assert.equal(spans.length, 1);
                assert.equal(spans[0].labels.sql, 'SELECT * FROM t');
                done();
              });
    });
  });
});
