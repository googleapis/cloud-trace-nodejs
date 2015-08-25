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

var nock = require('nock');
var assert = require('assert');

var utils = require('../lib/utils.js');
// var auth = proxyquire('../lib/auth.js', {
//   'google-auth-library': {
//     GoogleAuth: StubGoogleAuth
//   });
// function StubGoogleAuth() {
// }

nock.disableNetConnect();

describe('utils', function() {

  describe('getProjectNumber', function() {

    it('should check the env. var. first', function(done) {
      process.env.GCLOUD_PROJECT_NUM='789';
      utils.getProjectNumber(function(err, project) {
        assert.ok(!err);
        assert.strictEqual(project, '789');
        done();
      });
    });

    it('should be able to get project number from metadata service',
      function(done) {
        var scope = nock('http://metadata')
                      .get('/computeMetadata/v1/project/numeric-project-id')
                      .reply(200, '567');
        delete process.env.GCLOUD_PROJECT_NUM;
        utils.getProjectNumber(function(err, project) {
          assert.ok(!err);
          assert.strictEqual(project, '567');
          scope.done();
          done();
        });
      });
  });

  describe('authorizedRequestFactory', function() {

    it('should return a function', function() {
      var result = utils.authorizedRequestFactory(['fake-scope']);
      assert(typeof result === 'function');
    });

    // TODO: need to implement. This will be simpler if we could pass
    // in a (mock) authClient to the request factory.
    //
    // it('returned function should attempt to get credentials on first use',
    //   function(done) {
    //     var request = auth.authorizedRequestFactory(['fake-scope']);
    //     // process.env.GOOGLE_APPLICATION_CREDENTIALS =
    //     //   __dirname + '/fixtures/fake-key.json';

    //     var authScope = nock('https://accounts.google.com/')
    //                       .post('/o/oauth2/token')
    //                       .reply(200, {
    //                         access_token: '1/fake-token',
    //                         token_type: 'Bearer',
    //                         expires_in: 60
    //                       });
    //     var scope = nock('http://foo')
    //                   .get('/bar')
    //                   .reply(200, {qux: 1});

    //     request('http://foo/bar', function(err, response, body) {
    //       console.log(err);
    //       assert.ok(!err);
    //       assert.ok(body);
    //       assert.ok(response);

    //       assert.deepEqual(body, {qux: 1});

    //       scope.done();
    //       authScope.done();
    //       done();
    //     });
    //   });

  });

  describe('requestWithRetry', function() {

    it('should not retry on successful request', function(done) {
      var attempt = 0;
      // a request that always succeeds
      var request = function(options, callback) {
        attempt += 1;
        callback(null, 'response', 'body');
      };
      utils.requestWithRetry(request, {},
        function(err, response, body) {
          assert.strictEqual(attempt, 1);
          done();
        });
      });

    it('should not retry on non-transient errors', function(done){
      var attempt = 0;
      // a request that always fails with HTTP 404
      var request = function(options, callback) {
        attempt += 1;
        callback({code: 404});
      };
      utils.requestWithRetry(request, {}, function(err, response, body) {
        assert.strictEqual(attempt, 1);
        assert.equal(err.code, 404);
        done();
      });
    });

    it('should retry atleast 4 times on unsuccessful requests', function(done){
      this.timeout(30000); // this test takes a long time
      var attempt = 0;
      // a request that always fails
      var request = function(options, callback) {
        attempt += 1;
        callback({code: 429});
      };
      utils.requestWithRetry(request, {}, function(err, response, body) {
        assert.ok(attempt >= 4);
        done();
      });
    });

    it('should retry on errors 429, 500, 503', function(done) {
      this.timeout(30000); // this test takes a long time
      var attempt = 0;
      var request = function(options, callback) {
        attempt += 1;
        switch (attempt) {
          case 1:
            callback({code: 429});
            return;
          case 2:
            callback({code: 500});
            return;
          case 3:
            callback({code: 503});
            return;
          case 4:
            callback(null, 'response', 'body');
            return;
          default:
            assert.fail();
        }
      };

      utils.requestWithRetry(request, {}, function(err, response, body) {
        assert.ok(!err);
        assert.strictEqual(attempt, 4); // should have passed on 4th attempt
        done();
      });
    });
  });
});
