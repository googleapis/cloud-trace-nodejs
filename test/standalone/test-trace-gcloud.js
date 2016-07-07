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

if (process.platform === 'win32') {
  // Skip grpc due to https://github.com/nodejs/node/issues/4932.
  process.exit(0);
}

var common = require('../hooks/common.js');
var nock = require('nock');
var assert = require('assert');
var path = require('path');

nock.disableNetConnect();

describe('test-trace-gcloud', function() {
  // This does a gcloud.datastore.get() request that makes a gRPC 'lookup' call.
  // It attempts to authenticate using Google Auth by connecting to
  // 'accounts.google.com:443/o/oauth2/token', but fails because of Nock.
  // An auth error is returned, and a trace span for the gRPC call is created
  // with an error.
  it('should create gRPC spans', function(done) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS =
        path.join(__dirname, '..', 'fixtures', 'gcloud-credentials.json');
    common.runInTransaction(function(endTransaction) {
      var gcloud = require('../hooks/fixtures/gcloud0.36');
      var ds = gcloud.datastore();
      var key = ds.key(['bad', 'key']);
      ds.get(key, function(err, entity) {
        endTransaction();
        assert(err);
        assert.strictEqual(err.code, 401);
        assert.strictEqual(err.message, 'Unauthorized');
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
