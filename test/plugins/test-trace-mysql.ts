// Copyright 2015 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {TraceLabels} from '../../src/trace-labels';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const common = require('./common' /*.js*/);
import * as assert from 'assert';
import {describe, it, before, beforeEach, after, afterEach} from 'mocha';

const RESULT_SIZE = 5;

const obj = {
  k: 1,
  v: 'obj',
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const agent = require('../../..').start({
  projectId: '0',
  enhancedDatabaseReporting: true,
  databaseResultReportingSize: RESULT_SIZE,
});

const fixtures = ['mysql-2', 'mysql2-1'];
fixtures.forEach(fixture => {
  describe('test-trace-' + fixture, () => {
    let connection;
    let mysql;
    let pool;
    before(() => {
      mysql = require('./fixtures/' + fixture);
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      pool = mysql.createPool(require('../mysql-config' /*.js*/));
    });

    after(() => {
      pool.end();
    });

    beforeEach(done => {
      pool.getConnection((err, conn) => {
        assert(!err, 'Skipping: Failed to connect to mysql.');
        conn.query('CREATE TABLE t (k int(10), v varchar(10))', err => {
          assert(!err, err);
          conn.query('INSERT INTO t SET ?', obj, (err, res) => {
            connection = conn;
            assert(!err);
            assert.strictEqual(res.affectedRows, 1);
            common.cleanTraces();
            done();
          });
        });
      });
    });

    afterEach(done => {
      connection.query('DROP TABLE t', err => {
        assert(!err);
        connection.release();
        common.cleanTraces();
        done();
      });
    });

    it('should perform basic operations', done => {
      common.runInTransaction(endRootSpan => {
        connection.query('SELECT * FROM t', (err, res) => {
          endRootSpan();
          assert(!err);
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].k, 1);
          assert.strictEqual(res[0].v, 'obj');
          const spans = common.getMatchingSpans(span => {
            return span.name === 'mysql-query';
          });
          assert.strictEqual(spans.length, 1);
          assert.strictEqual(spans[0].labels.sql, 'SELECT * FROM t');
          done();
        });
      });
    });

    it('should propagate context', done => {
      common.runInTransaction(endRootSpan => {
        connection.query('SELECT * FROM t', () => {
          assert.ok(common.hasContext());
          endRootSpan();
          done();
        });
      });
    });

    it('should remove trace frames from stack', done => {
      common.runInTransaction(endRootSpan => {
        connection.query('SELECT * FROM t', err => {
          endRootSpan();
          assert(!err);
          const spans = common.getMatchingSpans(span => {
            return span.name === 'mysql-query';
          });
          const labels = spans[0].labels;
          const stackTrace = JSON.parse(
            labels[TraceLabels.STACK_TRACE_DETAILS_KEY]
          );
          // Ensure that our patch is on top of the stack
          assert(
            stackTrace.stack_frame[0].method_name.indexOf(
              'createQuery_trace'
            ) !== -1
          );
          done();
        });
      });
    });

    it('should work with events', done => {
      common.runInTransaction(endRootSpan => {
        const query = connection.query('SELECT * FROM t');
        query.on('result', row => {
          assert.strictEqual(row.k, 1);
          assert.strictEqual(row.v, 'obj');
        });
        query.on('end', () => {
          endRootSpan();
          const spans = common.getMatchingSpans(span => {
            return span.name === 'mysql-query';
          });
          assert.strictEqual(spans.length, 1);
          assert.strictEqual(spans[0].labels.sql, 'SELECT * FROM t');
          done();
        });
      });
    });

    it('should work without events or callback', done => {
      common.runInTransaction(endRootSpan => {
        connection.query('SELECT * FROM t');
        setTimeout(() => {
          endRootSpan();
          const spans = common.getMatchingSpans(span => {
            return span.name === 'mysql-query';
          });
          assert.strictEqual(spans.length, 1);
          assert.strictEqual(spans[0].labels.sql, 'SELECT * FROM t');
          done();
        }, 50);
      });
    });

    it('should perform basic transaction', done => {
      const obj2 = {
        k: 2,
        v: 'obj2',
      };
      common.runInTransaction(endRootSpan => {
        connection.beginTransaction(err => {
          assert(!err);
          connection.query('INSERT INTO t SET ?', obj2, err => {
            assert(!err);
            connection.query('SELECT * FROM t', (err, res) => {
              assert(!err);
              assert.strictEqual(res.length, 2);
              assert.strictEqual(res[0].k, 1);
              assert.strictEqual(res[0].v, 'obj');
              assert.strictEqual(res[1].k, 2);
              assert.strictEqual(res[1].v, 'obj2');
              connection.rollback(err => {
                assert(!err);
                connection.query('SELECT * FROM t', (err, res) => {
                  assert(!err);
                  connection.commit(err => {
                    endRootSpan();
                    assert(!err);
                    assert.strictEqual(res.length, 1);
                    assert.strictEqual(res[0].k, 1);
                    assert.strictEqual(res[0].v, 'obj');
                    const spans = common.getMatchingSpans(span => {
                      return span.name === 'mysql-query';
                    });
                    const expectedCmds = [
                      'START TRANSACTION',
                      'INSERT INTO t SET ?',
                      'SELECT * FROM t',
                      'ROLLBACK',
                      'SELECT * FROM t',
                      'COMMIT',
                    ];
                    assert.strictEqual(expectedCmds.length, spans.length);
                    for (let i = 0; i < spans.length; i++) {
                      assert.strictEqual(spans[i].labels.sql, expectedCmds[i]);
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
});

export default {};
