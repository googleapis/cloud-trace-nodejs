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
var assert = require('assert');
var path = require('path');

describe('google-gax', function() {
  var agent;
  var speech;

  before(function() {
    agent = require('../..').start({
      projectId: '0',
      keyFilename: path.join(__dirname, '..', 'fixtures', 
          'gcloud-credentials.json'),
      enhancedDatabaseReporting: true,
      samplingRate: 0
    });
    speech = require('./fixtures/google-cloud-speech0.6')({
      projectId: '0',
      keyFilename: path.join(__dirname, '..', 'fixtures', 
          'gcloud-credentials.json'),    
    });
  });

  it('should not interfere with google-cloud api tracing', function(done) {
    common.runInTransaction(function(endRootSpan) {
      speech.recognize('./index.js', {
        encoding: 'LINEAR16',
        sampleRate: 16000
      }, function(err, res) {
        endRootSpan();
        // Authentication will fail due to invalid credentials but a span will still be
        // generated.
        assert.equal(err.message,
          'Getting metadata from plugin failed with error: invalid_client');
        assert.equal(err.code, 16);
        var span = common.getMatchingSpan(function(span) {
          return span.kind === 'RPC_CLIENT' && span.name.indexOf('grpc:') === 0;
        });
        assert.ok(span);
        assert.equal(span.name, 'grpc:/google.cloud.speech.v1beta1.Speech/SyncRecognize');
        done();
      });
    });
  });

});

export default {};
