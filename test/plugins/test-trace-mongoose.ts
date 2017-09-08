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
// Run a mongo image binding the mongo port
//   ex) docker run -p 27017:27017 -d mongo
var common = require('./common'/*.js*/);

var assert = require('assert');

describe('test-trace-mongoose', function() {
  var agent;
  var mongoose;
  var Simple;
  before(function() {
    agent = require('../..').start({
      projectId: '0',
      samplingRate: 0
    });

    mongoose = require('./fixtures/mongoose4');
    mongoose.Promise = global.Promise;

    var Schema = mongoose.Schema;
    var simpleSchema = new Schema({
      f1: String,
      f2: Boolean,
      f3: Number
    });

    Simple = mongoose.model('Simple', simpleSchema);
  });

  beforeEach(function(done) {
    var sim = new Simple({
      f1: 'sim',
      f2: true,
      f3: 42
    });
    mongoose.connect('mongodb://localhost:27017/testdb', function(err) {
      assert(!err, 'Skipping: error connecting to mongo at localhost:27017.');
      sim.save(function(err) {
        assert(!err);
        common.cleanTraces();
        done();
      });
    });
  });

  afterEach(function(done) {
    mongoose.connection.db.dropDatabase(function(err) {
      assert(!err);
      mongoose.connection.close(function(err) {
        assert(!err);
        common.cleanTraces();
        done();
      });
    });
  });

  it('should accurately measure create time', function(done) {
    var data = new Simple({
      f1: 'val',
      f2: false,
      f3: 1729
    });
    common.runInTransaction(function(endTransaction) {
      data.save(function(err) {
        endTransaction();
        assert(!err);
        var trace = common.getMatchingSpan(mongoPredicate.bind(null, 'mongo-insert'));
        assert(trace);
        done();
      });
    });
  });

  it('should accurately measure update time', function(done) {
    common.runInTransaction(function(endTransaction) {
      Simple.findOne({f1: 'sim'}, function(err, res) {
        assert(!err);
        res.f2 = false;
        res.save(function(err) {
          endTransaction();
          assert(!err);
          var trace = common.getMatchingSpan(mongoPredicate.bind(null, 'mongo-update'));
          assert(trace);
          done();
        });
      });
    });
  });

  it('should accurately measure retrieval time', function(done) {
    common.runInTransaction(function(endTransaction) {
      Simple.findOne({f1: 'sim'}, function(err, res) {
        endTransaction();
        assert(!err);
        var trace = common.getMatchingSpan(mongoPredicate.bind(null, 'mongo-cursor'));
        assert(trace);
        done();
      });
    });
  });

  it('should accurately measure delete time', function(done) {
    common.runInTransaction(function(endTransaction) {
      Simple.remove({f1: 'sim'}, function(err, res) {
        endTransaction();
        assert(!err);
        var trace = common.getMatchingSpan(mongoPredicate.bind(null, 'mongo-remove'));
        assert(trace);
        done();
      });
    });
  });

  it('should not break if no parent transaction', function(done) {
    Simple.findOne({f1: 'sim'}, function(err, res) {
      assert(!err);
      assert(res);
      done();
    });
  });

  it('should remove trace frames from stack', function(done) {
    common.runInTransaction(function(endTransaction) {
      Simple.findOne({f1: 'sim'}, function(err, res) {
        endTransaction();
        assert(!err);
        var trace = common.getMatchingSpan(mongoPredicate.bind(null, 'mongo-cursor'));
        var labels = trace.labels;
        var stackTrace = JSON.parse(labels[TraceLabels.STACK_TRACE_DETAILS_KEY]);
        // Ensure that our patch is on top of the stack
        assert(
          stackTrace.stack_frame[0].method_name.indexOf('next_trace') !== -1);
        done();
      });
    });
  });
});

function mongoPredicate(id, span) {
  return span.name.length >= 12 && span.name.substr(0, 12) === id;
}

export default {};
