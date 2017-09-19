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

var nock = require('nock');

// In the future _=>true.
function accept() {
  return true;
}

function nockOAuth2(validator) {
  validator = validator || accept;
  return nock('https://accounts.google.com')
      .post('/o/oauth2/token', validator)
      .once()
      .reply(200, {
        refresh_token: 'hello',
        access_token: 'goodbye',
        expiry_date: new Date(9999, 1, 1)
      });
}

function nockProjectId(reply) {
  return nock('http://metadata.google.internal')
    .get('/computeMetadata/v1/project/project-id')
    .once()
    .reply(reply);
}

function nockInstanceId(reply) {
  return nock('http://metadata.google.internal')
    .get('/computeMetadata/v1/instance/id')
    .once()
    .reply(reply);
}

function nockHostname(reply) {
  return nock('http://metadata.google.internal')
    .get('/computeMetadata/v1/instance/hostname')
    .once()
    .reply(reply);
}

function nockPatchTraces(project, validator, reply, withError) {
  validator = validator || accept;
  var scope = nock('https://cloudtrace.googleapis.com')
      .intercept('/v1/projects/' + project + '/traces', 'PATCH', validator);
  if (withError) {
    scope = scope.replyWithError(reply);
  } else {
    scope = scope.reply(reply || 200);
  }
  return scope;
}

module.exports = {
  oauth2: nockOAuth2,
  patchTraces: nockPatchTraces,
  projectId: nockProjectId,
  instanceId: nockInstanceId,
  hostname: nockHostname
};

export default {};
