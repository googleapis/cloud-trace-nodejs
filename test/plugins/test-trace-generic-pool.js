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

var assert = require('assert');
var common = require('./common');
var semver = require('semver');

describe('generic-pool2', function() {
  var ROOT_SPAN = 'root-span';
  var CHILD_SPAN_1 = 'child-span-1';
  var CHILD_SPAN_2 = 'child-span-2';

  var api;
  var genericPool;
  before(function() {
    api = require('../..').start({
      projectId: '0',
      samplingRate: 0,
      forceNewAgent_: true
    });
    genericPool = require('./fixtures/generic-pool2');
  });

  after(function() {
    common.cleanTraces();
  });

  it('preserves context', function(done) {
    var config = {
      name: 'generic-pool2 test',
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

    var pool = new genericPool.Pool(config);
    api.runInRootSpan({ name: ROOT_SPAN }, function(span) {
      pool.acquire(function(err, fn) {
        assert.ifError(err);
        var childSpan = api.createChildSpan({ name: CHILD_SPAN_1 });
        assert.ok(childSpan);
        fn();
        childSpan.endSpan();
        span.endSpan();

        var spans = common.getTraces(api)[0].spans;
        assert.ok(spans);
        assert.strictEqual(spans.length, 3);
        assert.strictEqual(spans[0].name, ROOT_SPAN);
        assert.strictEqual(spans[1].name, CHILD_SPAN_1);
        assert.strictEqual(spans[2].name, CHILD_SPAN_2);

        done();
      });
    });
  });
});

describe('generic-pool3', function() {
  var agent;
  var genericPool;
  if (semver.satisfies(process.version, '<4')) {
    console.log('Skipping testing generic-pool@3 on Node.js version ' +
                process.version + ' that predates version 4.');
    return;
  }

  before(function() {
    agent = require('../..').start({
      projectId: '0',
      samplingRate: 0,
      forceNewAgent_: true
    });
    genericPool = require('./fixtures/generic-pool3');
  });

  after(function() {
    common.cleanTraces();
  });

  it ('preserves context', function() {
    var ROOT_SPAN = 'root-span';
    var CHILD_SPAN_1 = 'child-span-1';
    var CHILD_SPAN_2 = 'child-span-2';
    var CHILD_SPAN_3 = 'child-span-3';

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
    agent.runInRootSpan({ name: ROOT_SPAN }, function(rootSpan) {
      promise = pool.acquire().then(function(fn) {
        var childSpan = agent.createChildSpan({ name: CHILD_SPAN_1 });
        assert.ok(childSpan);
        fn('SomeInput');
        childSpan.endSpan();
      }).then(function() {
        var childSpan = agent.createChildSpan({ name: CHILD_SPAN_3 });
        assert.ok(childSpan);
        childSpan.endSpan();
        rootSpan.endSpan();

        var spans = common.getTraces()[0].spans;
        assert.ok(spans);
        assert.strictEqual(spans.length, 4);
        assert.strictEqual(spans[0].name, ROOT_SPAN);
        assert.strictEqual(spans[1].name, CHILD_SPAN_1);
        assert.strictEqual(spans[2].name, CHILD_SPAN_2);
        assert.strictEqual(spans[3].name, CHILD_SPAN_3);
      });
    });

    return promise;
  });
});
