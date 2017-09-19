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

// Prereqs:
// Start docker daemon
//   ex) docker -d
// Run a redis image binding the redis port
//   ex) docker run -p 6379:6379 -d redis
var common = require('./common'/*.js*/);

var RESULT_SIZE = 5;

var assert = require('assert');
var versions = {
  redis0: './fixtures/redis0.12',
  // Our patches are different on redis <=2.3, >2.3 <2.6, and >=2.6
  redis2dot3: './fixtures/redis2.3',
  redis2dot4: './fixtures/redis2.4',
  redis2dotx: './fixtures/redis2.x',
  redisHiredis04: './fixtures/redis2.3-hiredis0.4',
  redisHiredis05: './fixtures/redis2.3-hiredis0.5'
};

describe('redis', function() {
  var agent;

  before(function() {
    agent = require('../..').start({
      projectId: '0',
      samplingRate: 0,
      enhancedDatabaseReporting: true,
      databaseResultReportingSize: RESULT_SIZE
    });
  });

  var client;
  Object.keys(versions).forEach(function(version) {
    describe(version, function() {
      var redis;
      before(function() {
        redis = require(versions[version]);
      });

      beforeEach(function(done) {
        client = redis.createClient();
        client.on('error', function(err) {
          assert(false, 'redis error ' + err);
        });
        client.set('beforeEach', 42, function() {
          common.cleanTraces();
          done();
        });
      });

      afterEach(function(done) {
        client.quit(function() {
          common.cleanTraces();
          done();
        });
      });

      it('should accurately measure get time', function(done) {
        common.runInTransaction(function(endTransaction) {
          client.get('beforeEach', function(err, n) {
            endTransaction();
            assert.equal(n, 42);
            var trace = common.getMatchingSpan(redisPredicate.bind(null, 'redis-get'));
            assert(trace);
            done();
          });
        });
      });

      it('should propagate context', function(done) {
        common.runInTransaction(function(endTransaction) {
          client.get('beforeEach', function(err, n) {
            assert.ok(common.hasContext());
            endTransaction();
            done();
          });
        });
      });

      it('should accurately measure set time', function(done) {
        common.runInTransaction(function(endTransaction) {
          client.set('key', 'redis_value', function(err) {
            endTransaction();
            var trace = common.getMatchingSpan(redisPredicate.bind(null, 'redis-set'));
            assert(trace);
            done();
          });
        });
      });

      it('should accurately measure hset time', function(done) {
        common.runInTransaction(function(endTransaction) {
          // Test error case as hset requires 3 parameters
          client.hset('key', 'redis_value', function(err) {
            endTransaction();
            var trace = common.getMatchingSpan(redisPredicate.bind(null, 'redis-hset'));
            assert(trace);
            done();
          });
        });
      });

      it('should remove trace frames from stack', function(done) {
        common.runInTransaction(function(endTransaction) {
          // Test error case as hset requires 3 parameters
          client.hset('key', 'redis_value', function(err) {
            endTransaction();
            var trace = common.getMatchingSpan(redisPredicate.bind(null, 'redis-hset'));
            var labels = trace.labels;
            var stackTrace = JSON.parse(labels[TraceLabels.STACK_TRACE_DETAILS_KEY]);
            // Ensure that our patch is on top of the stack
            assert(
              stackTrace.stack_frame[0].method_name.indexOf('send_command_trace') !== -1);
            done();
          });
        });
      });
    });
  });
});

function redisPredicate(id, span) {
  return span.name.length >= id.length &&
      span.name.substr(0, id.length) === id;
}

export default {};
