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

var common = require('./common'/*.js*/);
var traceLabels = require('../../src/trace-labels'/*.js*/);
var assert = require('assert');

describe('test-trace-pg', function() {
  var traceApi;
  var pool;
  var client;
  var releaseClient;
  before(function() {
    traceApi = require('../..').start({
      projectId: '0',
      samplingRate: 0,
      enhancedDatabaseReporting: true
    });
    var pg = require('./fixtures/pg6');
    pool = new pg.Pool(require('../pg-config'/*.js*/));
  });

  beforeEach(function(done) {
    pool.connect(function(err, c, release) {
      client = c;
      releaseClient = release;
      assert(!err);
      client.query('CREATE TABLE t (name text NOT NULL, id text NOT NULL)', [],
          function(err, res) {
        assert(!err);
        common.cleanTraces();
        done();
      });
    });
  });

  afterEach(function(done) {
    client.query('DROP TABLE t', [], function(err, res) {
      assert(!err);
      releaseClient();
      common.cleanTraces();
      done();
    });
  });

  it('should perform basic operations', function(done) {
    common.runInTransaction(function(endRootSpan) {
      client.query('INSERT INTO t (name, id) VALUES($1, $2)',
          ['test_name', 'test_id'], function(err, res) {
        endRootSpan();
        assert(!err);
        var span = common.getMatchingSpan(function (span) {
          return span.name === 'pg-query';
        });
        assert.equal(span.labels.query, 'INSERT INTO t (name, id) VALUES($1, $2)');
        assert.equal(span.labels.values, '[ \'test_name\', \'test_id\' ]');
        assert.equal(span.labels.row_count, '1');
        assert.equal(span.labels.oid, '0');
        assert.equal(span.labels.rows, '[]');
        assert.equal(span.labels.fields, '[]');
        done();
      });
    });
  });

  it('should propagate context', function(done) {
    common.runInTransaction(function(endRootSpan) {
      client.query('INSERT INTO t (name, id) VALUES($1, $2)',
          ['test_name', 'test_id'], function(err, res) {
        assert.ok(common.hasContext());
        endRootSpan();
        done();
      });
    });
  });

  it('should remove trace frames from stack', function(done) {
    common.runInTransaction(function(endRootSpan) {
      client.query('SELECT $1::int AS number', [1], function(err, res) {
        endRootSpan();
        assert(!err);
        var span = common.getMatchingSpan(function (span) {
          return span.name === 'pg-query';
        });
        var labels = span.labels;
        var stackTrace = JSON.parse(labels[traceLabels.STACK_TRACE_DETAILS_KEY]);
        // Ensure that our patch is on top of the stack
        assert(
          stackTrace.stack_frame[0].method_name.indexOf('query_trace') !== -1);
        done();
      });
    });
  });

  it('should work with events', function(done) {
    common.runInTransaction(function(endRootSpan) {
      var query = client.query('SELECT $1::int AS number', [1]);
      query.on('row', function(row) {
        assert.strictEqual(row.number, 1);
      });
      query.on('end', function() {
        endRootSpan();
        var span = common.getMatchingSpan(function (span) {
          return span.name === 'pg-query';
        });
        assert.equal(span.labels.query, 'SELECT $1::int AS number');
        assert.equal(span.labels.values, '[ \'1\' ]');
        done();
      });
    });
  });

  it('should work without events or callback', function(done) {
    common.runInTransaction(function(endRootSpan) {
      client.query('SELECT $1::int AS number', [1]);
      setTimeout(function() {
        endRootSpan();
        var span = common.getMatchingSpan(function (span) {
          return span.name === 'pg-query';
        });
        assert.equal(span.labels.query, 'SELECT $1::int AS number');
        assert.equal(span.labels.values, '[ \'1\' ]');
        done();
      }, 50);
    });
  });
});

export default {};
