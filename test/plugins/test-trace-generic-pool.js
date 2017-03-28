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

if (!process.env.GCLOUD_PROJECT) {
  console.log('The GCLOUD_PROJECT environment variable must be set.');
  process.exit(1);
}

var assert = require('assert');
var common = require('./common');

describe('generic-pool-2', function() {
  var ROOT_SPAN = 'root-span';
  var CHILD_SPAN_1 = 'child-span-1';
  var CHILD_SPAN_2 = 'child-span-2';

  var api;
  var genericPool;
  before(function() {
    api = require('../..').start({ samplingRate: 0, stackTraceLimit: 0 });
    genericPool = require('./fixtures/generic-pool-2');
  });

  after(function() {
    common.stopAgent(api);
  });

  it('perserves context', function(done) {
    var config = {
      name: 'generic-pool-2 test',
      create: function(callback) {
        callback(function() {
          var childSpan = api.createChildSpan({ name: CHILD_SPAN_2 });
          assert.ok(childSpan);
          childSpan.endSpan();
        });
      },
      destroy: function(fn) {
      }
    };

    var pool;
    api.runInRootSpan({ name: ROOT_SPAN }, function(span) {
      pool = new genericPool.Pool(config);
      span.endSpan();
    });

    pool.acquire(function(err, fn) {
      assert.ifError(err);
      var childSpan = api.createChildSpan({ name: CHILD_SPAN_1 });
      assert.ok(childSpan);
      fn();
      childSpan.endSpan();
      done();

      var spans = common.getTraces(agent)[0].spans;
      assert.ok(spans);
      assert.strictEqual(spans.length, 3);
      assert.strictEqual(spans[0].name, ROOT_SPAN);
      assert.strictEqual(spans[1].name, CHILD_SPAN_1);
      assert.strictEqual(spans[2].name, CHILD_SPAN_2);
    });
  });
});

describe('generic-pool-3', function() {
  var agent;
  var genericPool;
  before(function() {
    agent = require('../..').start({ samplingRate: 0, stackTraceLimit: 0 });
    genericPool = require('./fixtures/generic-pool-3');
  });

  after(function() {
    common.stopAgent(agent);
  });

  it ('preserves context', function() {
    var ROOT_SPAN = 'root-span';
    var CHILD_SPAN_1 = 'child-span-1';
    var CHILD_SPAN_2 = 'child-span-2';
    //var CHILD_SPAN_3 = 'child-span-3';

    var factory = {
      create: function() {
        return new Promise(function(resolve, reject) {
          resolve(function(input) {
            assert.strictEqual(input, 'SomeInput');
            var childSpan = agent.createChildSpan({ name: CHILD_SPAN_2 });
            assert.ok(childSpan);
            childSpan.endSpan();
          });
        });
      },

      destroy: function(fn) {
        return new Promise(function(resolve) {
          resolve();
        });
      }
    };

    var opts = {
      max: 1,
      min: 1
    };

    var pool = genericPool.createPool(factory, opts);

    var promise;
    agent.runInRootSpan({ name: ROOT_SPAN }, function(span) {
      promise = pool.acquire().then(function(fn) {
        var childSpan = agent.createChildSpan({ name: CHILD_SPAN_1 });
        assert.ok(childSpan);
        fn('SomeInput');
        childSpan.endSpan();
        span.endSpan();
      }).then(function() {
        // With the current implementation, context propogation is lost
        // at this point and the commented out assert that verifies
        // that the child span is not null will fail.
        // It looks like a generalized Promise context propogation solution
        // is needed to support this invocation of then().

        //var childSpan = agent.createChildSpan({ name: childSpanName3 });
        //assert.ok(childSpan);
        //childSpan.endSpan();

        var spans = common.getTraces(agent)[0].spans;
        assert.ok(spans);
        assert.strictEqual(spans.length, 3);
        assert.strictEqual(spans[0].name, ROOT_SPAN);
        assert.strictEqual(spans[1].name, CHILD_SPAN_1);
        assert.strictEqual(spans[2].name, CHILD_SPAN_2);
      });
    });

    return promise;
  });
});
