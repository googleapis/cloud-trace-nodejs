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
import {describeInterop} from '../utils';

// Prereqs:
// Start docker daemon
//   ex) docker -d
// Run a redis image binding the redis port
//   ex) docker run -p 6379:6379 -d redis
// eslint-disable-next-line @typescript-eslint/no-var-requires
const common = require('./common' /*.js*/);

const RESULT_SIZE = 5;

import * as assert from 'assert';
import {describe, it, before, beforeEach, afterEach} from 'mocha';

describe('redis', () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let agent;

  before(() => {
    agent = require('../../..').start({
      projectId: '0',
      samplingRate: 0,
      enhancedDatabaseReporting: true,
      databaseResultReportingSize: RESULT_SIZE,
    });
  });

  let client;
  describeInterop('redis', fixture => {
    let redis;
    before(() => {
      redis = fixture.require();
    });

    beforeEach(done => {
      client = redis.createClient();
      client.on('error', err => {
        assert(false, 'redis error ' + err);
      });
      client.set('beforeEach', 42, () => {
        common.cleanTraces();
        done();
      });
    });

    afterEach(done => {
      client.quit(() => {
        common.cleanTraces();
        done();
      });
    });

    it('should accurately measure get time', done => {
      common.runInTransaction(endTransaction => {
        client.get('beforeEach', (err, n) => {
          endTransaction();
          assert.strictEqual(Number(n), 42);
          const trace = common.getMatchingSpan(
            redisPredicate.bind(null, 'redis-get')
          );
          assert(trace);
          done();
        });
      });
    });

    it('should propagate context', done => {
      common.runInTransaction(endTransaction => {
        client.get('beforeEach', () => {
          assert.ok(common.hasContext());
          endTransaction();
          done();
        });
      });
    });

    it('should accurately measure set time', done => {
      common.runInTransaction(endTransaction => {
        client.set('key', 'redis_value', () => {
          endTransaction();
          const trace = common.getMatchingSpan(
            redisPredicate.bind(null, 'redis-set')
          );
          assert(trace);
          done();
        });
      });
    });

    it('should accurately measure hset time', done => {
      common.runInTransaction(endTransaction => {
        // Test error case as hset requires 3 parameters
        client.hset('key', 'redis_value', () => {
          endTransaction();
          const trace = common.getMatchingSpan(
            redisPredicate.bind(null, 'redis-hset')
          );
          assert(trace);
          done();
        });
      });
    });

    it('should remove trace frames from stack', done => {
      common.runInTransaction(endTransaction => {
        // Test error case as hset requires 3 parameters
        client.hset('key', 'redis_value', () => {
          endTransaction();
          const trace = common.getMatchingSpan(
            redisPredicate.bind(null, 'redis-hset')
          );
          const labels = trace.labels;
          const stackTrace = JSON.parse(
            labels[TraceLabels.STACK_TRACE_DETAILS_KEY]
          );
          // Ensure that our patch is on top of the stack
          assert(
            stackTrace.stack_frame[0].method_name.indexOf(
              'send_command_trace'
            ) !== -1
          );
          done();
        });
      });
    });
  });
});

function redisPredicate(id, span) {
  return span.name.length >= id.length && span.name.substr(0, id.length) === id;
}

export default {};
