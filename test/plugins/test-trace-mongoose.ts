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

// Prereqs:
// Start docker daemon
//   ex) docker -d
// Run a mongo image binding the mongo port
//   ex) docker run -p 27017:27017 -d mongo
// eslint-disable-next-line @typescript-eslint/no-var-requires
const common = require('./common' /*.js*/);

import {describe, it, before, beforeEach, afterEach} from 'mocha';
import * as assert from 'assert';

describe('mongoose integration tests', () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let agent;
  let Simple;
  before(() => {
    agent = require('../../..').start({
      projectId: '0',
      samplingRate: 0,
    });
  });

  const versions = [4, 5];
  for (const version of versions) {
    describe(`mongoose@${version}`, () => {
      let mongoose;

      before(() => {
        mongoose = require(`./fixtures/mongoose${version}`);
        mongoose.Promise = global.Promise;

        const Schema = mongoose.Schema;
        const simpleSchema = new Schema({
          f1: String,
          f2: Boolean,
          f3: Number,
        });

        Simple = mongoose.model('Simple', simpleSchema);
      });

      beforeEach(done => {
        const sim = new Simple({
          f1: 'sim',
          f2: true,
          f3: 42,
        });
        mongoose.connect('mongodb://localhost:27017/testdb', err => {
          assert(
            !err,
            'Skipping: error connecting to mongo at localhost:27017.'
          );
          sim.save(err => {
            assert(!err);
            common.cleanTraces();
            done();
          });
        });
      });

      afterEach(done => {
        mongoose.connection.db.dropDatabase(err => {
          assert(!err);
          mongoose.connection.close(err => {
            assert(!err);
            common.cleanTraces();
            done();
          });
        });
      });

      it('should accurately measure create time', done => {
        const data = new Simple({
          f1: 'val',
          f2: false,
          f3: 1729,
        });
        common.runInTransaction(endTransaction => {
          data.save(err => {
            endTransaction();
            assert(!err);
            const trace = common.getMatchingSpan(
              mongoPredicate.bind(null, 'mongo-insert')
            );
            assert(trace);
            done();
          });
        });
      });

      it('should accurately measure update time', done => {
        common.runInTransaction(endTransaction => {
          Simple.findOne({f1: 'sim'}, (err, res) => {
            assert(!err);
            res.f2 = false;
            res.save(err => {
              endTransaction();
              assert(!err);
              const trace = common.getMatchingSpan(
                mongoPredicate.bind(null, 'mongo-update')
              );
              assert(trace);
              done();
            });
          });
        });
      });

      it('should accurately measure retrieval time', done => {
        common.runInTransaction(endTransaction => {
          Simple.findOne({f1: 'sim'}, err => {
            endTransaction();
            assert(!err);
            const trace = common.getMatchingSpan(
              mongoPredicate.bind(null, 'mongo-cursor')
            );
            assert(trace);
            done();
          });
        });
      });

      it('should accurately measure delete time', done => {
        common.runInTransaction(endTransaction => {
          Simple.remove({f1: 'sim'}, err => {
            endTransaction();
            assert(!err);
            const trace = common.getMatchingSpan(
              mongoPredicate.bind(null, 'mongo-remove')
            );
            assert(trace);
            done();
          });
        });
      });

      it('should not break if no parent transaction', done => {
        Simple.findOne({f1: 'sim'}, (err, res) => {
          assert(!err);
          assert(res);
          done();
        });
      });

      it('should remove trace frames from stack', done => {
        common.runInTransaction(endTransaction => {
          Simple.findOne({f1: 'sim'}, err => {
            endTransaction();
            assert(!err);
            const trace = common.getMatchingSpan(
              mongoPredicate.bind(null, 'mongo-cursor')
            );
            const labels = trace.labels;
            const stackTrace = JSON.parse(
              labels[TraceLabels.STACK_TRACE_DETAILS_KEY]
            );
            // Ensure that our patch is on top of the stack
            assert(
              stackTrace.stack_frame[0].method_name.indexOf('next_trace') !== -1
            );
            done();
          });
        });
      });
    });
  }
});

function mongoPredicate(id, span) {
  return span.name.length >= 12 && span.name.substr(0, 12) === id;
}

export default {};
