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

// Prereqs:
// Start docker daemon
//   ex) docker -d
// Run a redis image binding the redis port
//   ex) docker run -p 6379:6379 -d redis
var common = require('./common.js');

var assert = require('assert');
var versions = {
  redis0: require('./fixtures/redis0.12'),
  redis2: require('./fixtures/redis2')
};

var client;
Object.keys(versions).forEach(function(version) {
  var redis = versions[version];
  describe(version, function() {
    beforeEach(function(done) {
      client = redis.createClient();
      client.on('error', function(err) {
        assert(false, 'Skipping: no redis server found at localhost:6379.');
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

    it('should accurately measure set time', function(done) {
      common.runInTransaction(function(endTransaction) {
        client.set('key', 'val', function(err) {
          endTransaction();
          var trace = common.getMatchingSpan(redisPredicate.bind(null, 'redis-set'));
          assert(trace);
          done();
        });
      });
    });

    it('should accurately measure hset time', function(done) {
      common.runInTransaction(function(endTransaction) {
        client.hset('key', 'val', function(err) {
          endTransaction();
          var trace = common.getMatchingSpan(redisPredicate.bind(null, 'redis-hset'));
          assert(trace);
          done();
        });
      });
    });
  });
});

function redisPredicate(id, span) {
  return span.name.length >= id.length &&
      span.name.substr(0, id.length) === id;
}
