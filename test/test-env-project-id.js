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

process.env.GCLOUD_PROJECT = 1729;

var trace = require('..');

var assert = require('assert');
var common = require('./plugins/common.js');
var nock = require('nock');
var nocks = require('./nocks.js');
var TraceWriter = require('../src/trace-writer.js');

describe('should respect environment variables', function() {
  before(function() {
    nock.disableNetConnect();
  });

  beforeEach(function() {
    nocks.hostname('');
    nocks.instanceId('');
  });

  after(function() {
    nock.enableNetConnect();
  });

  it('should respect GCLOUD_PROJECT', function(done) {
    common.wrapTraceWriterInitialize(function(err, metadata) {
      // ensure that projectId wasn't set from environment
      assert.ok(!metadata.project);
      assert.strictEqual(TraceWriter.get().config_.projectId, '1729');
      done();
    });
    trace.start({forceNewAgent_: true});
  });

  it('should prefer env to config', function(done) {
    common.wrapTraceWriterInitialize(function(err, metadata) {
      // ensure that projectId wasn't set from environment
      assert.ok(!metadata.project);
      assert.strictEqual(TraceWriter.get().config_.projectId, '1729');
      done();
    });
    trace.start({projectId: 1927, forceNewAgent_: true});
  });
});
