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

var path = require('path');
var assert = require('assert');
var nock = require('nock');
var cls = require('../src/cls'/*.js*/);
var common = require('./plugins/common'/*.js*/);

var queueSpans = function(n, agent) {
  for (var i = 0; i < n; i++) {
    common.runInTransaction(function(end) {
      end();
    });
  }
};

describe('test-config-credentials', function() {
  var savedProject;

  before(function() {
    savedProject = process.env.GCLOUD_PROJECT;
    process.env.GCLOUD_PROJECT = '0';
  });

  after(function() {
    process.env.GCLOUD_PROJECT = savedProject;
  });

  it('should use the keyFilename field of the config object', function(done) {
    var credentials = require('./fixtures/gcloud-credentials.json');
    var config = {
      bufferSize: 2,
      samplingRate: 0,
      keyFilename: path.join('test', 'fixtures', 'gcloud-credentials.json'),
      forceNewAgent_: true
    };
    var agent = require('..').start(config);
    nock.disableNetConnect();
    var scope = nock('https://accounts.google.com')
      .intercept('/o/oauth2/token', 'POST', function(body) {
        assert.equal(body.client_id, credentials.client_id);
        assert.equal(body.client_secret, credentials.client_secret);
        assert.equal(body.refresh_token, credentials.refresh_token);
        return true;
      }).reply(200, {
        refresh_token: 'hello',
        access_token: 'goodbye',
        expiry_date: new Date(9999, 1, 1)
      });
    // Since we have to get an auth token, this always gets intercepted second
    nock('https://cloudtrace.googleapis.com')
      .intercept('/v1/projects/0/traces', 'PATCH', function() {
        scope.done();
        setImmediate(done);
        return true;
      }).reply(200);
    cls.getNamespace().run(function() {
      queueSpans(2, agent);
    });
  });

  it('should use the credentials field of the config object', function(done) {
    var config = {
      bufferSize: 2,
      samplingRate: 0,
      credentials: require('./fixtures/gcloud-credentials.json'),
      forceNewAgent_: true
    };
    var agent = require('..').start(config);
    nock.disableNetConnect();
    var scope = nock('https://accounts.google.com')
      .intercept('/o/oauth2/token', 'POST', function(body) {
        assert.equal(body.client_id, config.credentials.client_id);
        assert.equal(body.client_secret, config.credentials.client_secret);
        assert.equal(body.refresh_token, config.credentials.refresh_token);
        return true;
      }).reply(200, {
        refresh_token: 'hello',
        access_token: 'goodbye',
        expiry_date: new Date(9999, 1, 1)
      });
    // Since we have to get an auth token, this always gets intercepted second
    nock('https://cloudtrace.googleapis.com')
      .intercept('/v1/projects/0/traces', 'PATCH', function() {
        scope.done();
        setImmediate(done);
        return true;
      }).reply(200);
    cls.getNamespace().run(function() {
      queueSpans(2, agent);
    });
  });

  it('should ignore keyFilename if credentials is provided', function(done) {
    var correctCredentials = {
      client_id: 'a',
      client_secret: 'b',
      refresh_token: 'c',
      type: 'authorized_user'
    };
    var config = {
      bufferSize: 2,
      samplingRate: 0,
      credentials: correctCredentials,
      keyFilename: path.join('test', 'fixtures', 'gcloud-credentials.json'),
      forceNewAgent_: true
    };
    var agent = require('..').start(config);
    nock.disableNetConnect();
    var scope = nock('https://accounts.google.com')
      .intercept('/o/oauth2/token', 'POST', function(body) {
        assert.equal(body.client_id, correctCredentials.client_id);
        assert.equal(body.client_secret, correctCredentials.client_secret);
        assert.equal(body.refresh_token, correctCredentials.refresh_token);
        return true;
      }).reply(200, {
        refresh_token: 'hello',
        access_token: 'goodbye',
        expiry_date: new Date(9999, 1, 1)
      });
    // Since we have to get an auth token, this always gets intercepted second
    nock('https://cloudtrace.googleapis.com')
      .intercept('/v1/projects/0/traces', 'PATCH', function() {
        scope.done();
        setImmediate(done);
        return true;
      }).reply(200);
    cls.getNamespace().run(function() {
      queueSpans(2, agent);
    });
  });
});

export default {};
