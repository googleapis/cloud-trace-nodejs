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
var http = require('http');
var semver = require('semver');

if (semver.satisfies(process.version, '<8') || !process.env.GCLOUD_TRACE_NEW_CONTEXT) {
  console.log('Skipping cls-ah tests on node version without async hooks');
  return;
}

var cls = require('../src/cls-ah'/*.js*/);

describe('test-cls-ah', function() {
  it('should preserve request context', function(done) {
    var namespace = cls.createNamespace();
    var id = 0;
    var ended = 0;
    var server = http.createServer(function(req, res) {
      var reqId = id++;
      namespace.run(function() {
        namespace.set('id', reqId);
        assert.equal(namespace.get('id'), reqId);
        var count = 0;
        var i = setInterval(function () {
          assert.equal(namespace.get('id'), reqId);
          if (count++ > reqId) {
            clearInterval(i);
            res.end('yay');
            if (++ended === 10) {
              done();
            }
          }
        }, Math.random() * 50);
      });
    });
    server.listen(8080, function() {
      for (var i = 0; i < 10; i++) {
        http.get('http://localhost:8080');
      }
    });
  });

  it('should correctly run context in series', function(done) {
    var namespace = cls.createNamespace();
    namespace.run(function() {
      assert.equal(namespace.get('id'), null);
      namespace.set('id', 'first');
      setTimeout(function() {
        assert.equal(namespace.get('id'), 'first');
        done();
      }, 30);
      assert.equal(namespace.get('id'), 'first');
    });
    namespace.run(function() {
      assert.equal(namespace.get('id'), null);
      namespace.set('id', 'second');
      setTimeout(function() {
        assert.equal(namespace.get('id'), 'second');
      }, 10);
      assert.equal(namespace.get('id'), 'second');
    });
  });

  it('should correctly run context nested', function(done) {
    var namespace = cls.createNamespace();
    namespace.run(function() {
      assert.equal(namespace.get('id'), null);
      namespace.set('id', 'first');
      namespace.run(function() {
        assert.equal(namespace.get('id'), null);
        namespace.set('id', 'second');
        setTimeout(function() {
          assert.equal(namespace.get('id'), 'second');
        }, 10);
        assert.equal(namespace.get('id'), 'second');
      });
      setTimeout(function() {
        assert.equal(namespace.get('id'), 'first');
        done();
      }, 30);
      assert.equal(namespace.get('id'), 'first');
    });
  });
});

export default {};
