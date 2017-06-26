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

var filesLoadedBeforeTrace = Object.keys(require.cache);

// Load continuation-local-storage first to ensure the core async APIs get
// patched before any user-land modules get loaded.
require('continuation-local-storage');

var cls = require('./src/cls.js');
var common = require('@google-cloud/common');
var extend = require('extend');
var constants = require('./src/constants.js');
var gcpMetadata = require('gcp-metadata');
var traceUtil = require('./src/util.js');
var TraceAgent = require('./src/trace-api.js');
var pluginLoader = require('./src/trace-plugin-loader.js');
var traceWriter = require('./src/trace-writer.js');

var modulesLoadedBeforeTrace = [];

var traceApi;

for (var i = 0; i < filesLoadedBeforeTrace.length; i++) {
  var moduleName = traceUtil.packageNameFromPath(filesLoadedBeforeTrace[i]);
  if (moduleName && moduleName !== '@google-cloud/trace-agent' &&
      modulesLoadedBeforeTrace.indexOf(moduleName) === -1) {
    modulesLoadedBeforeTrace.push(moduleName);
  }
}

function initConfig(projectConfig) {
  var envConfig = {
    logLevel: process.env.GCLOUD_TRACE_LOGLEVEL,
    projectId: process.env.GCLOUD_PROJECT,
    serviceContext: {
      service: process.env.GAE_SERVICE || process.env.GAE_MODULE_NAME,
      version: process.env.GAE_VERSION || process.env.GAE_MODULE_VERSION,
      minorVersion: process.env.GAE_MINOR_VERSION
    }
  };
  var config = extend(true, {}, require('./config.js'), projectConfig, envConfig);
  if (config.maximumLabelValueSize > constants.TRACE_SERVICE_LABEL_VALUE_LIMIT) {
    config.maximumLabelValueSize = constants.TRACE_SERVICE_LABEL_VALUE_LIMIT;
  }
  return config;
}

function createLogger(logLevel) {
  if (logLevel < 0) {
    logLevel = 0;
  } else if (logLevel >= common.logger.LEVELS.length) {
    logLevel = common.logger.LEVELS.length - 1;
  }
  return common.logger({
    level: common.logger.LEVELS[logLevel],
    tag: '@google-cloud/trace-agent'
  });
}

function getMetadata(logger, getProjectId) {
  // Headers for GCP metadata requests
  var headers = {};
  headers[constants.TRACE_AGENT_REQUEST_HEADER] = 1;

  var metadata = {};
  var getHostnameAndInstanceId = function() {
    gcpMetadata.instance({
      property: 'hostname',
      headers: headers
    }, function(err, response, hostname) {
      if (err && err.code !== 'ENOTFOUND') {
        // We are running on GCP.
        logger.warn('Unable to retrieve GCE hostname.', err);
      }
      // default to locally provided hostname.
      metadata.hostname = hostname || require('os').hostname();
      gcpMetadata.instance({
        property: 'id',
        headers: headers
      }, function(err, response, instanceId) {
        if (err && err.code !== 'ENOTFOUND') {
          // We are running on GCP.
          logger.warn('Unable to retrieve GCE instance id.', err);
        }
        metadata.instanceId = instanceId;
        traceWriter.get().setMetadata(metadata);
      });
    });
  };

  if (getProjectId) {
    gcpMetadata.project({
      property: 'project-id',
      headers: headers
    }, function(err, response, projectId) {
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
        logger.error('Unable to acquire the project number from metadata ' +
          'service. Please provide a valid project number as an env. ' +
          'variable, or through config.projectId passed to start(). ' + err);
        stop();
        return;
      }
      logger.info('Acquired ProjectId from metadata: ' + projectId);
      metadata.projectId = projectId;
      getHostnameAndInstanceId();
    });
  } else {
    getHostnameAndInstanceId();
  }
}

function stop() {
  if (traceApi && traceApi.isActive()) {
    traceWriter.get().stop();
    traceApi.disable();
    pluginLoader.deactivate();
    cls.destroyNamespace();
  }
}

/**
 * Start the Trace agent that will make your application available for
 * tracing with Stackdriver Trace.
 *
 * @param {object=} config - Trace configuration
 *
 * @resource [Introductory video]{@link
 * https://www.youtube.com/watch?v=NCFDqeo7AeY}
 *
 * @example
 * trace.start();
 */
function start(projectConfig) {
  var config = initConfig(projectConfig);

  if (traceApi && !config.forceNewAgent_) { // already started.
    throw new Error('Cannot call start on an already started agent.');
  } else if (traceApi) {
    // For unit tests only.
    // Undoes initialization that occurred last time start() was called.
    stop();
  }

  if (!config.enabled) {
    return traceApi;
  }

  var logger = createLogger(config.logLevel);
  // CLS namespace for context propagation
  cls.createNamespace();
  traceWriter.create(logger, config);

  if (modulesLoadedBeforeTrace.length > 0) {
    logger.error('Tracing might not work as the following modules ' +
      'were loaded before the trace agent was initialized: ' +
      JSON.stringify(modulesLoadedBeforeTrace));
  }

  traceApi = new TraceAgent('Custom Span API', logger, config);
  pluginLoader.activate(logger, config);

  // Get metadata.
  if (typeof config.projectId === 'string') {
    getMetadata(logger, false);
  } else if (typeof config.projectId === 'undefined') {
    getMetadata(logger, true);
  } else {
    logger.error('config.projectId, if provided, must be a string. ' +
      'Disabling trace agent.');
    stop();
  }

  // Make trace agent available globally without requiring package
  global._google_trace_agent = traceApi;

  logger.info('trace agent activated');
  return traceApi;
}

function get() {
  return traceApi;
}

module.exports = {
  start: start,
  get: get
};

// If the module was --require'd from the command line, start the agent.
if (module.parent && module.parent.id === 'internal/preload') {
  module.exports.start();
}
