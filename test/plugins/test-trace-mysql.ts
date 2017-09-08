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

import { TraceLabels } from '../../src/trace-labels';

var common = require('./common'/*.js*/);
var assert = require('assert');

var RESULT_SIZE = 5;

var connection;

var obj = {
  k: 1,
  v: 'obj'
};

describe('test-trace-mysql', function() {
  var agent;
  var mysql;
  var pool;
  before(function() {
    agent = require('../..').start({
      projectId: '0',
      enhancedDatabaseReporting: true,
      databaseResultReportingSize: RESULT_SIZE
    });
    mysql = require('./fixtures/mysql2');
    pool = mysql.createPool(require('../mysql-config'/*.js*/));
  });

  beforeEach(function(done) {
    pool.getConnection(function(err, conn) {
      assert(!err, 'Skipping: Failed to connect to mysql.');
      conn.query('CREATE TABLE t (k int(10), v varchar(10))', function(err) {
        assert(!err, err);
        conn.query('INSERT INTO t SET ?', obj, function(err, res) {
          connection = conn;
          assert(!err);
          assert.equal(res.affectedRows, 1);
          common.cleanTraces();
          done();
        });
      });
    });
  });

  afterEach(function(done) {
    connection.query('DROP TABLE t', function(err) {
      assert(!err);
      connection.release();
      common.cleanTraces();
      done();
    });
  });

  it('should perform basic operations', function(done) {
    common.runInTransaction(function(endRootSpan) {
      connection.query('SELECT * FROM t', function(err, res) {
        endRootSpan();
        assert(!err);
        assert.equal(res.length, 1);
        assert.equal(res[0].k, 1);
        assert.equal(res[0].v, 'obj');
        var spans = common.getMatchingSpans(function (span) {
          return span.name === 'mysql-query';
        });
        assert.equal(spans.length, 1);
        assert.equal(spans[0].labels.sql, 'SELECT * FROM t');
        done();
      });
    });
  });

  it('should propagate context', function(done) {
    common.runInTransaction(function(endRootSpan) {
      connection.query('SELECT * FROM t', function(err, res) {
        assert.ok(common.hasContext());
        endRootSpan();
        done();
      });
    });
  });

  it('should remove trace frames from stack', function(done) {
    common.runInTransaction(function(endRootSpan) {
      connection.query('SELECT * FROM t', function(err, res) {
        endRootSpan();
        assert(!err);
        var spans = common.getMatchingSpans(function (span) {
          return span.name === 'mysql-query';
        });
        var labels = spans[0].labels;
        var stackTrace = JSON.parse(labels[TraceLabels.STACK_TRACE_DETAILS_KEY]);
        // Ensure that our patch is on top of the stack
        assert(
          stackTrace.stack_frame[0].method_name.indexOf('createQuery_trace') !== -1);
        done();
      });
    });
  });

  it('should work with events', function(done) {
    common.runInTransaction(function(endRootSpan) {
      var query = connection.query('SELECT * FROM t');
      query.on('result', function(row) {
        assert.equal(row.k, 1);
        assert.equal(row.v, 'obj');
      });
      query.on('end', function() {
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

  it('should work without events or callback', function(done) {
    common.runInTransaction(function(endRootSpan) {
      connection.query('SELECT * FROM t');
      setTimeout(function() {
        endRootSpan();
        var spans = common.getMatchingSpans(function (span) {
          return span.name === 'mysql-query';
        });
        assert.equal(spans.length, 1);
        assert.equal(spans[0].labels.sql, 'SELECT * FROM t');
        done();
      }, 50);
    });
  });

  it('should perform basic transaction', function(done) {
    var obj2 = {
      k: 2,
      v: 'obj2'
    };
    common.runInTransaction(function(endRootSpan) {
      connection.beginTransaction(function(err) {
        assert(!err);
        connection.query('INSERT INTO t SET ?', obj2, function(err, res) {
          assert(!err);
          connection.query('SELECT * FROM t', function(err, res) {
            assert(!err);
            assert.equal(res.length, 2);
            assert.equal(res[0].k, 1);
            assert.equal(res[0].v, 'obj');
            assert.equal(res[1].k, 2);
            assert.equal(res[1].v, 'obj2');
            connection.rollback(function(err) {
              assert(!err);
              connection.query('SELECT * FROM t', function(err, res) {
                assert(!err);
                connection.commit(function(err) {
                  endRootSpan();
                  assert(!err);
                  assert.equal(res.length, 1);
                  assert.equal(res[0].k, 1);
                  assert.equal(res[0].v, 'obj');
                  var spans = common.getMatchingSpans(function (span) {
                    return span.name === 'mysql-query';
                  });
                  var expectedCmds = ['START TRANSACTION', 'INSERT INTO t SET ?',
                    'SELECT * FROM t', 'ROLLBACK', 'SELECT * FROM t', 'COMMIT'];
                  assert.equal(expectedCmds.length, spans.length);
                  for (var i = 0; i < spans.length; i++) {
                    assert.equal(spans[i].labels.sql, expectedCmds[i]);
                  }
                  done();
                });
              });
            });
          });
        });
      });
    });
  });
});

export default {};
