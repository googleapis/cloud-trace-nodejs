// Copyright 2016 Google LLC
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

// Prereqs:
// Start docker daemon
//   ex) docker -d
// Run a mongo image binding the mongo port
//   ex) docker run -p 27017:27017 -d mongo
// eslint-disable-next-line @typescript-eslint/no-var-requires
const common = require('./common' /*.js*/);
import * as assert from 'assert';
import {describe, it, before, beforeEach, afterEach} from 'mocha';

const RESULT_SIZE = 5;

const versions = {
  mongodb1: './fixtures/mongodb-core1',
  mongodb2: './fixtures/mongodb-core2',
  mongodb3: './fixtures/mongodb-core3',
};

describe('mongodb', () => {
  before(() => {
    require('../../..').start({
      projectId: '0',
      samplingRate: 0,
      enhancedDatabaseReporting: true,
      databaseResultReportingSize: RESULT_SIZE,
    });
  });

  Object.keys(versions).forEach(version => {
    describe(version, () => {
      let mongodb;
      let server;

      before(() => {
        mongodb = require(versions[version]);
      });

      beforeEach(done => {
        server = new mongodb.Server({
          host: 'localhost',
          port: 27017,
        });
        const sim = {
          f1: 'sim',
          f2: true,
          f3: 42,
        };
        server.on('connect', () => {
          server.insert('testdb.simples', [sim], (err, res) => {
            assert.ifError(err);
            assert.strictEqual(res.result.n, 1);
            done();
          });
        });
        server.connect();
      });

      afterEach(done => {
        common.cleanTraces();
        server.command('testdb.$cmd', {dropDatabase: 1}, (err, res) => {
          assert.ifError(err);
          assert.strictEqual(res.result.dropped, 'testdb');
          server.destroy();
          done();
        });
      });

      it('should trace an insert', done => {
        const data = {
          f1: 'val',
          f2: false,
          f3: 1729,
        };
        common.runInTransaction(endTransaction => {
          server.insert('testdb.simples', [data], (err, res) => {
            endTransaction();
            assert.ifError(err);
            assert.strictEqual(res.result.n, 1);
            const trace = common.getMatchingSpan(
              mongoPredicate.bind(null, 'mongo-insert')
            );
            assert(trace);
            done();
          });
        });
      });

      it('should trace an update', done => {
        common.runInTransaction(endTransaction => {
          server.update(
            'testdb.simples',
            [
              {
                q: {f1: 'sim'},
                u: {$set: {f2: false}},
              },
            ],
            (err, res) => {
              endTransaction();
              assert.ifError(err);
              assert.strictEqual(res.result.n, 1);
              const trace = common.getMatchingSpan(
                mongoPredicate.bind(null, 'mongo-update')
              );
              assert(trace);
              done();
            }
          );
        });
      });

      it('should propagate context', done => {
        common.runInTransaction(endTransaction => {
          server.update(
            'testdb.simples',
            [
              {
                q: {f1: 'sim'},
                u: {$set: {f2: false}},
              },
            ],
            () => {
              assert.ok(common.hasContext());
              endTransaction();
              done();
            }
          );
        });
      });

      it('should trace a query', done => {
        common.runInTransaction(endTransaction => {
          server
            .cursor('testdb.simples', {
              find: 'testdb.simples',
              query: {f1: 'sim'},
            })
            .next((err, doc) => {
              endTransaction();
              assert.ifError(err);
              assert.strictEqual(doc.f3, 42);
              const trace = common.getMatchingSpan(
                mongoPredicate.bind(null, 'mongo-cursor')
              );
              assert(trace);
              done();
            });
        });
      });

      it('should trace a remove', done => {
        common.runInTransaction(endTransaction => {
          server.remove(
            'testdb.simples',
            [
              {
                q: {f1: 'sim'},
                limit: 0,
              },
            ],
            (err, res) => {
              endTransaction();
              assert.ifError(err);
              assert.strictEqual(res.result.n, 1);
              const trace = common.getMatchingSpan(
                mongoPredicate.bind(null, 'mongo-remove')
              );
              assert(trace);
              done();
            }
          );
        });
      });

      it('should trace a command', done => {
        common.runInTransaction(endTransaction => {
          server.command('admin.$cmd', {ismaster: true}, err => {
            endTransaction();
            assert.ifError(err);
            const trace = common.getMatchingSpan(
              mongoPredicate.bind(null, 'mongo-comman')
            );
            assert(trace);
            done();
          });
        });
      });

      it('should not break if no parent transaction', done => {
        server
          .cursor('testdb.simples', {
            find: 'testdb.simples',
            query: {f1: 'sim'},
          })
          .next((err, doc) => {
            assert.ifError(err);
            assert.strictEqual(doc.f3, 42);
            assert.strictEqual(common.getTraces().length, 0);
            done();
          });
      });

      it('should remove trace frames from stack', done => {
        common.runInTransaction(endTransaction => {
          server
            .cursor('testdb.simples', {
              find: 'testdb.simples',
              query: {f1: 'sim'},
            })
            .next((err, doc) => {
              endTransaction();
              assert.ifError(err);
              assert.strictEqual(doc.f3, 42);
              const trace = common.getMatchingSpan(
                mongoPredicate.bind(null, 'mongo-cursor')
              );
              const labels = trace.labels;
              const stack = JSON.parse(
                labels[TraceLabels.STACK_TRACE_DETAILS_KEY]
              );
              assert.notStrictEqual(
                -1,
                stack.stack_frame[0].method_name.indexOf('next_trace')
              );
              done();
            });
        });
      });
    });
  });
});

function mongoPredicate(id, span) {
  return span.name.length >= 12 && span.name.substr(0, 12) === id;
}

export default {};
