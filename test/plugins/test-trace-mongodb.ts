/**
 * Copyright 2016 Google Inc. All Rights Reserved.
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
// Run a mongo image binding the mongo port
//   ex) docker run -p 27017:27017 -d mongo
var common = require('./common'/*.js*/);
var traceLabels = require('../../src/trace-labels'/*.js*/);
var assert = require('assert');

var RESULT_SIZE = 5;

var versions = {
  mongodb1: './fixtures/mongodb-core1',
  mongodb2: './fixtures/mongodb-core2'
};

describe('mongodb', function() {
  before(function() {
    require('../..').start({
      projectId: '0',
      samplingRate: 0,
      enhancedDatabaseReporting: true,
      databaseResultReportingSize: RESULT_SIZE
    });
  });

  Object.keys(versions).forEach(function(version) {
    describe(version, function() {
      var mongodb;
      var server;

      before(function() {
        mongodb = require(versions[version]);
      });

      beforeEach(function(done) {
        server = new mongodb.Server({
          host: 'localhost',
          port: 27017
        });
        var sim = {
          f1: 'sim',
          f2: true,
          f3: 42
        };
        server.on('connect', function(_server) {
          server.insert('testdb.simples', [sim], function(err, res) {
            assert.ifError(err);
            assert.strictEqual(res.result.n, 1);
            done();
          });
        });
        server.connect();
      });

      afterEach(function(done) {
        common.cleanTraces();
        server.command('testdb.$cmd', {dropDatabase: 1}, function(err, res) {
          assert.ifError(err);
          assert.strictEqual(res.result.dropped, 'testdb');
          server.destroy();
          done();
        });
      });

      it('should trace an insert', function(done) {
        var data = {
          f1: 'val',
          f2: false,
          f3: 1729
        };
        common.runInTransaction(function(endTransaction) {
          server.insert('testdb.simples', [data], function(err, res) {
            endTransaction();
            assert.ifError(err);
            assert.strictEqual(res.result.n, 1);
            var trace = common.getMatchingSpan(
              mongoPredicate.bind(null, 'mongo-insert'));
            assert(trace);
            done();
          });
        });
      });

      it('should trace an update', function(done) {
        common.runInTransaction(function(endTransaction) {
          server.update('testdb.simples', [{
            q: {f1: 'sim'},
            u: {'$set': {f2: false}}
          }], function(err, res) {
            endTransaction();
            assert.ifError(err);
            assert.strictEqual(res.result.n, 1);
            var trace = common.getMatchingSpan(
              mongoPredicate.bind(null, 'mongo-update'));
            assert(trace);
            done();
          });
        });
      });

      it('should propagate context', function(done) {
        common.runInTransaction(function(endTransaction) {
          server.update('testdb.simples', [{
            q: {f1: 'sim'},
            u: {'$set': {f2: false}}
          }], function(err, res) {
            assert.ok(common.hasContext());
            endTransaction();
            done();
          });
        });
      });

      it('should trace a query', function(done) {
        common.runInTransaction(function(endTransaction) {
          server.cursor('testdb.simples', {
            find: 'testdb.simples',
            query: {f1: 'sim'}
          }).next(function(err, doc) {
            endTransaction();
            assert.ifError(err);
            assert.strictEqual(doc.f3, 42);
            var trace = common.getMatchingSpan(
              mongoPredicate.bind(null, 'mongo-cursor'));
            assert(trace);
            done();
          });
        });
      });

      it('should trace a remove', function(done) {
        common.runInTransaction(function(endTransaction) {
          server.remove('testdb.simples', [{
            q: {f1: 'sim'},
            limit: 0
          }], function(err, res) {
            endTransaction();
            assert.ifError(err);
            assert.strictEqual(res.result.n, 1);
            var trace = common.getMatchingSpan(
              mongoPredicate.bind(null, 'mongo-remove'));
            assert(trace);
            done();
          });
        });
      });

      it('should trace a command', function(done) {
        common.runInTransaction(function(endTransaction) {
          server.command('admin.$cmd', {ismaster: true}, function(err, res) {
            endTransaction();
            assert.ifError(err);
            var trace = common.getMatchingSpan(
              mongoPredicate.bind(null, 'mongo-comman'));
            assert(trace);
            done();
          });
        });
      });

      it('should not break if no parent transaction', function(done) {
        server.cursor('testdb.simples', {
          find: 'testdb.simples',
          query: {f1: 'sim'}
        }).next(function(err, doc) {
          assert.ifError(err);
          assert.strictEqual(doc.f3, 42);
          assert.strictEqual(common.getTraces().length, 0);
          done();
        });
      });

      it('should remove trace frames from stack', function(done) {
        common.runInTransaction(function(endTransaction) {
          server.cursor('testdb.simples', {
            find: 'testdb.simples',
            query: {f1: 'sim'}
          }).next(function(err, doc) {
            endTransaction();
            assert.ifError(err);
            assert.strictEqual(doc.f3, 42);
            var trace = common.getMatchingSpan(
              mongoPredicate.bind(null, 'mongo-cursor'));
            var labels = trace.labels;
            var stack = JSON.parse(labels[traceLabels.STACK_TRACE_DETAILS_KEY]);
            assert.notStrictEqual(-1,
              stack.stack_frame[0].method_name.indexOf('next_trace'));
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
