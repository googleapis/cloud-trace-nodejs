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

var common = require('./common'/*.js*/);
var nock = require('nock');
var assert = require('assert');
var path = require('path');

nock.disableNetConnect();

describe('test-trace-datastore', function() {
  var agent;
  before(function() {
    agent = require('../..').start({
      projectId: '0',
      samplingRate: 0,
      enhancedDatabaseReporting: true
    });
  });

  // This does a gcloud.datastore.get() request that makes a gRPC 'lookup' call.
  // It attempts to authenticate using Google Auth by connecting to
  // 'accounts.google.com:443/o/oauth2/token', but fails because of Nock.
  // An auth error is returned, and a trace span for the gRPC call is created
  // with an error.
  it('should create gRPC spans', function(done) {
    // gRPC does a remote request to datastore.googleapis.com through C and not
    // through JavaScript, so Nock is unable to intercept the request. A larger
    // timeout is set to accommodate for this remote request and reduce
    // flakiness.
    this.timeout(20000);
    common.runInTransaction(function(endTransaction) {
      var ds = require('./fixtures/google-cloud-datastore1')({
        projectId: '-1',
        keyFilename: path.join(__dirname, '..', 'fixtures', 'gcloud-credentials.json')
      });
      var key = ds.key(['bad', 'key']);
      ds.get(key, function(err, entity) {
        endTransaction();
        assert(err);
        assert.strictEqual(err.code, 401);
        assert.notStrictEqual(
            err.message.indexOf('accounts.google.com:443/o/oauth2/token'), -1);
        var trace = common.getMatchingSpan(grpcPredicate);
        assert(trace);
        assert.notStrictEqual(trace.labels.argument.indexOf(
            '"keys":[{"path":[{"kind":"bad","name":"key"}]}]'), -1);
        assert(trace.labels.error);
        delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
        common.cleanTraces();
        done();
      });
    });
  });
});

function grpcPredicate(span) {
  return span.name.indexOf('grpc:') === 0;
}

export default {};
