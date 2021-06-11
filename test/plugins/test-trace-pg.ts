// Copyright 2017 Google LLC
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
import {FORCE_NEW} from '../../src/util';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const common = require('./common' /*.js*/);
import * as assert from 'assert';
import {describe, it, before, beforeEach, afterEach} from 'mocha';

// pg tests have issues in Node 14.
const pgVersions = []; // ['6', '7'];

pgVersions.forEach(pgVersion => {
  describe(`test-trace-pg (v${pgVersion})`, () => {
    let pg;
    let pool;
    let client;
    let releaseClient;
    before(() => {
      require('../../..').start({
        projectId: '0',
        samplingRate: 0,
        enhancedDatabaseReporting: true,
        [FORCE_NEW]: true,
      });
      pg = require(`./fixtures/pg${pgVersion}`);
      pool = new pg.Pool(require('../pg-config' /*.js*/));
    });

    beforeEach(done => {
      pool.connect((err, c, release) => {
        client = c;
        releaseClient = release;
        assert(!err);
        client.query('DROP TABLE t', [], err => {
          assert(!err || err.code === '42P01'); // table "t" does not exist
          client.query(
            'CREATE TABLE t (name text NOT NULL, id text NOT NULL)',
            [],
            err => {
              assert(!err);
              done();
            }
          );
        });
      });
    });

    afterEach(() => {
      releaseClient();
      common.cleanTraces();
    });

    it('should perform basic operations', done => {
      common.runInTransaction(endRootSpan => {
        client.query(
          'INSERT INTO t (name, id) VALUES($1, $2)',
          ['test_name', 'test_id'],
          err => {
            endRootSpan();
            assert(!err);
            const span = common.getMatchingSpan(span => {
              return span.name === 'pg-query';
            });
            assert.strictEqual(
              span.labels.query,
              'INSERT INTO t (name, id) VALUES($1, $2)'
            );
            assert.strictEqual(
              span.labels.values,
              "[ 'test_name', 'test_id' ]"
            );
            assert.strictEqual(span.labels.row_count, '1');
            assert.strictEqual(span.labels.oid, '0');
            assert.strictEqual(span.labels.rows, '[]');
            assert.strictEqual(span.labels.fields, '[]');
            done();
          }
        );
      });
    });

    it('should perform basic operations with promises', done => {
      common.runInTransaction(endRootSpan => {
        client
          .query('INSERT INTO t (name, id) VALUES($1, $2)', [
            'test_name',
            'test_id',
          ])
          .then(
            () => {
              endRootSpan();
              const span = common.getMatchingSpan(span => {
                return span.name === 'pg-query';
              });
              assert.strictEqual(
                span.labels.query,
                'INSERT INTO t (name, id) VALUES($1, $2)'
              );
              assert.strictEqual(
                span.labels.values,
                "[ 'test_name', 'test_id' ]"
              );
              assert.strictEqual(span.labels.row_count, '1');
              assert.strictEqual(span.labels.oid, '0');
              assert.strictEqual(span.labels.rows, '[]');
              assert.strictEqual(span.labels.fields, '[]');
              done();
            },
            () => {
              assert.fail('Error not expected');
            }
          );
      });
    });

    it('should propagate context', done => {
      common.runInTransaction(endRootSpan => {
        client.query(
          'INSERT INTO t (name, id) VALUES($1, $2)',
          ['test_name', 'test_id'],
          () => {
            assert.ok(common.hasContext());
            endRootSpan();
            done();
          }
        );
      });
    });

    it('should propagate context with promises', done => {
      common.runInTransaction(endRootSpan => {
        client
          .query('INSERT INTO t (name, id) VALUES($1, $2)', [
            'test_name',
            'test_id',
          ])
          .then(() => {
            assert.ok(common.hasContext());
            endRootSpan();
            done();
          });
      });
    });

    it('should remove trace frames from stack', done => {
      common.runInTransaction(endRootSpan => {
        client.query('SELECT $1::int AS number', [1], err => {
          endRootSpan();
          assert(!err);
          const span = common.getMatchingSpan(span => {
            return span.name === 'pg-query';
          });
          const labels = span.labels;
          const stackTrace = JSON.parse(
            labels[TraceLabels.STACK_TRACE_DETAILS_KEY]
          );
          // Ensure that our patch is on top of the stack
          assert(
            stackTrace.stack_frame[0].method_name.indexOf('query_trace') !== -1
          );
          done();
        });
      });
    });

    it('should work with events', done => {
      common.runInTransaction(endRootSpan => {
        const query = client.query(
          new pg.Query('SELECT $1::int AS number', [1])
        );
        query.on('row', row => {
          assert.strictEqual(row.number, 1);
        });
        query.on('end', () => {
          endRootSpan();
          const span = common.getMatchingSpan(span => {
            return span.name === 'pg-query';
          });
          assert.strictEqual(span.labels.query, 'SELECT $1::int AS number');
          assert.strictEqual(span.labels.values, '[ 1 ]');
          done();
        });
      });
    });

    it('should work with generic Submittables', done => {
      common.runInTransaction(endRootSpan => {
        client.query({
          submit: connection => {
            // Indicate that the next item may be processed.
            connection.emit('readyForQuery');
          },
          handleReadyForQuery: () => {
            endRootSpan();
            common.getMatchingSpan(span => {
              return span.name === 'pg-query';
            });
            done();
          },
        });
      });
    });

    it('should work without events or callback', done => {
      common.runInTransaction(endRootSpan => {
        client.query('SELECT $1::int AS number', [1]);
        setTimeout(() => {
          endRootSpan();
          const span = common.getMatchingSpan(span => {
            return span.name === 'pg-query';
          });
          assert.strictEqual(span.labels.query, 'SELECT $1::int AS number');
          assert.strictEqual(span.labels.values, '[ 1 ]');
          done();
        }, 50);
      });
    });
  });
});

export default {};
