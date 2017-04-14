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

var common = require('./common.js');
var traceLabels = require('../../src/trace-labels.js');

var RESULT_SIZE = 5;
var TABLE_NAME = 't';

var obj = {
  k: 1,
  v: 'obj'
};

describe('test-trace-knex with mysql', function() {
  var agent;
  var knex;
  var assert;
  before(function() {
    agent = require('../..').start({
      logLevel: 2,
      flushDelaySeconds: 1,
      enhancedDatabaseReporting: true,
      databaseResultReportingSize: RESULT_SIZE
    });
    assert = require('assert');
    knex = require('./fixtures/knex0.12')({
      client: 'mysql',
      connection: require('../mysql-config')
    });
  });

  beforeEach(function(done) {
    knex.schema.createTable(TABLE_NAME, function(table) {
      table.integer('k', 10);
      table.string('v', 10);
    }).then(function(result) {
      assert.ok(result);
      knex.insert(obj).into(TABLE_NAME).then(function(result) {
        assert.ok(result);
        common.cleanTraces(agent);
        done();
      });
    });
  });

  afterEach(function(done) {
    knex.schema.dropTable(TABLE_NAME).then(function(result) {
      assert.ok(result);
      common.cleanTraces(agent);
      done();
    });
  });

  it('should perform basic operations', function(done) {
    common.runInTransaction(agent, function(endRootSpan) {
      knex(TABLE_NAME).select().then(function(res) {
        endRootSpan();
        assert(res);
        assert.equal(res.length, 1);
        assert.equal(res[0].k, 1);
        assert.equal(res[0].v, 'obj');
        var spans = common.getMatchingSpans(agent, function (span) {
          return span.name === 'mysql-query';
        });
        assert.equal(spans.length, 1);
        assert.equal(spans[0].labels.sql, 'select * from `t`');
        done();
      });
    });
  });

  it('should propagate context', function(done) {
    common.runInTransaction(agent, function(endRootSpan) {
      knex.select().from(TABLE_NAME).then(function(res) {
        assert.ok(common.hasContext());
        endRootSpan();
        done();
      }).catch(function(e) {
        assert.ifError(e);
      });
    });
  });

  it('should remove trace frames from stack', function(done) {
    common.runInTransaction(agent, function(endRootSpan) {
      knex.select().from(TABLE_NAME).then(function(res) {
        endRootSpan();
        var spans = common.getMatchingSpans(agent, function (span) {
          return span.name === 'mysql-query';
        });
        var labels = spans[0].labels;
        var stackTrace = JSON.parse(labels[traceLabels.STACK_TRACE_DETAILS_KEY]);
        // Ensure that our patch is on top of the stack
        assert(
          stackTrace.stack_frame[0].method_name.indexOf('createQuery_trace') !== -1);
        done();
      }).catch(function(e) {
        assert.ifError(e);
      });
    });
  });

  it('should work with events', function(done) {
    common.runInTransaction(agent, function(endRootSpan) {
      knex.select().from(TABLE_NAME).on('query-response', function(response, obj, builder) {
        var row = response[0];
        assert.ok(row);
        assert.equal(row.k, 1);
        assert.equal(row.v, 'obj');
      }).on('query-error', function(err, obj) {
        assert.ifError(err);
      }).then(function(res) {
        endRootSpan();
        var spans = common.getMatchingSpans(agent, function (span) {
          return span.name === 'mysql-query';
        });
        assert.equal(spans.length, 1);
        assert.equal(spans[0  ].labels.sql, 'select * from `t`');
        done();
      }).catch(function(e) {
        assert.ifError(e);
      });
    });
  });

  it('should work without events or callback', function(done) {
    common.runInTransaction(agent, function(endRootSpan) {
      knex.select().from(TABLE_NAME).then(function(result) {
        setTimeout(function() {
          endRootSpan();
          var spans = common.getMatchingSpans(agent, function (span) {
            return span.name === 'mysql-query';
          });
          assert.equal(spans.length, 1);
          assert.equal(spans[0].labels.sql, 'select * from `t`');
          done();
        }, 50);
      });
    });
  });

  it('should perform basic transaction', function(done) {
    var obj2 = {
      k: 2,
      v: 'obj2'
    };
    common.runInTransaction(agent, function(endRootSpan) {
      knex.transaction(function(trx) {
        trx.insert(obj2)
           .into(TABLE_NAME)
           .transacting(trx)
           .then(function() {
             trx.select()
                .from(TABLE_NAME)
                .transacting(trx)
                .then(function(res) {
                  assert.equal(res.length, 2);
                  assert.equal(res[0].k, 1);
                  assert.equal(res[0].v, 'obj');
                  assert.equal(res[1].k, 2);
                  assert.equal(res[1].v, 'obj2');
                })
                .then(trx.rollback)
                .then(function() {
                  knex.select()
                      .from(TABLE_NAME)
                      .then(function(res) {
                        endRootSpan();
                        assert.equal(res.length, 1);
                        assert.equal(res[0].k, 1);
                        assert.equal(res[0].v, 'obj');
                        var spans = common.getMatchingSpans(agent, function (span) {
                          return span.name === 'mysql-query';
                        });
                        var expectedCmds = ['BEGIN;', 'insert into `t` (`k`, `v`) values (?, ?)',
                          'select * from `t`', 'ROLLBACK;', 'select * from `t`'];
                        assert.equal(expectedCmds.length, spans.length);
                        for (var i = 0; i < spans.length; i++) {
                          assert.equal(spans[i].labels.sql, expectedCmds[i]);
                        }
                        done();
                      });
                }).catch(function(err) {
                  assert.ifError(err);
                });
          }).catch(function(err) {
            assert.ifError(err);
          });
      }).catch(function(err) {
        assert.ifError(err);
      });
    });
  });
});
