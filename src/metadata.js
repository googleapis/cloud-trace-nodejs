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

var gcpMetadata = require('gcp-metadata');
var constants = require('./constants.js');

// prevent self tracing
var headers = {};
headers[constants.TRACE_AGENT_REQUEST_HEADER] = 1;

module.exports = function getMetadata(endpoint, property) {
  return new Promise(function(resolve, reject) {
    gcpMetadata[endpoint]({
      property: property,
      headers: headers
    }, function(err, response, body) {
      if (response && response.statusCode !== 200) {
        if (response.statusCode === 503) {
          err = new Error('Metadata service responded with a 503 status ' +
            'code. This may be due to a temporary server error; please try ' +
            'again later.');
        } else {
          err = new Error('Metadata service responded with the following ' +
            'status code: ' + response.statusCode);
        }
      }
      if (err) {
        reject(err);
      } else {
        resolve(body);
      }
    });
  });
};