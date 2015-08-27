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

var GoogleAuth = require('google-auth-library');
// we only need a single instance
var googleAuth = new GoogleAuth();

/** @const {number} */ var MAX_RETRY_ATTEMPTS = 5;
/** @const {number} */ var MIN_RETRY_TIMEOUT = 1000; // milliseconds

/**
 * Returns true if `err` is a transient error code.
 * @param {?number} err The error code.
 * @return {boolean} Whether `err` is a transient error.
 */
function isTransientError(err) {
  // 429 - Too many requests.
  // 500 - Internal server error.
  // 503 - Service Unavailable.
  return (err && [429, 500, 503].indexOf(err.code) !== -1);
}

/**
 * Returns a backoff delay using an exponential backoff algorithm.
 * @param {number} attempt 1-indexed attempt number. The first retry would
 *    be attempt number 2.
 * @return {number} backoff delay in milliseconds.
 */
function retryDelay(attempt) {
  return MIN_RETRY_TIMEOUT * Math.pow(2, (attempt-1));
}

/**
 * Performs the provided request fn using the options and callback. If the
 * request fails with a server error, it automatically retries using exponential
 * backoff. This will retry atleast 4 times.
 *
 * TODO(ofrobots): maybe accept a config object instead of the request function?
 *     Perhaps we can allow the caller to specify retry count, etc.
 *
 * @param {function(Object, function(=?,=?,=?):?} request style function
 *     accepting (options, callback).
 * @param {Object} options options to pass to request function
 * @param {Function} callback for request
 */
function requestWithRetry(request, options, callback) {
  function tryRequest(attempt) {
    request(options, function(err, response, body) {
      if (isTransientError(err) && attempt < MAX_RETRY_ATTEMPTS) {
        var delay = retryDelay(attempt);
        setTimeout(function() {
          tryRequest(attempt + 1);
        }, delay);
        return;
      }
      // not a (server) error, or retried too many times already.
      callback(err, response, body);
    });
  }

  tryRequest(1);
}

/**
 * Returns a request style function that can make authorized requests to a
 * Google API using Google Application Default credentials. This hides the
 * the details of working with auth in the client code.
 *
 * @param {Array<string>} scopes list of scopes to request as part of auth
 * @return {function(Object, function(=?,=?,=?):?)} request style function
 *     accepting (options, callback)
 */
function authorizedRequestFactory(scopes) {
  var cachedAuthClient = null;

  function makeRequest(options, callback) {
    // authClient expects options to be an object rather than a bare url.
    // Coerce into an object here
    if (typeof options === 'string') {
      options = {url: options};
    }
    cachedAuthClient.request(options, function(err, body, response) {
      // Ugh. google-auth-library changes the argument order for the
      // callback. Fix that here.
      callback(err, response, body);
    });
  }

  function authorizedRequest(options, callback) {
    if (!cachedAuthClient) {
      googleAuth.getApplicationDefault(function(err, authClient) {
        if (err) {
          callback(err);
          return;
        }
        if (authClient.createScopedRequired && authClient.createScopedRequired()) {
          authClient = authClient.createScoped(scopes);
        }
        cachedAuthClient = authClient;
        requestWithRetry(makeRequest, options, callback);
      });
    } else {
      requestWithRetry(makeRequest, options, callback);
    }
  }

  return authorizedRequest;
}

/**
 * Attempts to retrieve the project number for the current active project from
 * the metadata service (See https://cloud.google.com/compute/docs/metadata).
 *
 * @param {object=} headers optional headers to include in the http request.
 *     Note that the headers, if provided, may be extended with extra
 *     properties.
 * @param {function(?, number):?} callback an (err, result) style callback
 */
function getProjectNumber(headers, callback) {
  if (typeof headers === 'function') {
    callback = headers;
    headers = {};
  }

  headers['Metadata-Flavor'] = 'Google';

  var request = require('request');
  requestWithRetry(request, {
    url: 'http://metadata.google.internal/computeMetadata/v1/project/' +
         'numeric-project-id',
    headers: headers,
    method: 'GET'
  }, function(err, response, project) {
    if (!err && response.statusCode === 200) {
      callback(null, project);
    } else if (err && err.code === 'ENOTFOUND') {
      callback(new Error('Could not auto-discover project-id. Please export ' +
        'GCLOUD_PROJECT_NUM with your numeric project id'));
    } else {
      callback(err || new Error('Error discovering project num'));
    }
  });
}

module.exports = {
  getProjectNumber: getProjectNumber,
  authorizedRequestFactory: authorizedRequestFactory,
  requestWithRetry: requestWithRetry
};
