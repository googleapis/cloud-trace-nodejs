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

import {HOST_ADDRESS} from 'gcp-metadata';
import * as nock from 'nock';

const accept = () => true;

export function oauth2<T extends {} = {}>(
  validator?: (body: T) => boolean
): nock.Scope {
  validator = validator || accept;
  return nock(/https:\/\/(accounts\.google\.com|www\.googleapis\.com)/)
    .post(/\/oauth2.*token/, validator)
    .once()
    .reply(200, {
      refresh_token: 'hello',
      access_token: 'goodbye',
      expiry_date: new Date(9999, 1, 1),
    });
}

export function projectId(
  status: number | (() => string),
  reply?: () => string
) {
  if (typeof status === 'function') {
    reply = status;
    status = 200;
  }
  return nock(HOST_ADDRESS)
    .get('/computeMetadata/v1/project/project-id')
    .once()
    .reply(status, reply, {'Metadata-Flavor': 'Google'});
}

export function instanceId(
  status: number | (() => string),
  reply?: () => string
) {
  if (typeof status === 'function') {
    reply = status;
    status = 200;
  }
  return nock(HOST_ADDRESS)
    .get('/computeMetadata/v1/instance/id')
    .once()
    .reply(status, reply, {'Metadata-Flavor': 'Google'});
}

export function hostname(
  status: number | (() => string),
  reply?: () => string
) {
  if (typeof status === 'function') {
    reply = status;
    status = 200;
  }
  return nock(HOST_ADDRESS)
    .get('/computeMetadata/v1/instance/hostname')
    .once()
    .reply(status, reply, {'Metadata-Flavor': 'Google'});
}
