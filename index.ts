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
if (require('semver').satisfies(process.version, '<8') ||
    !process.env.GCLOUD_TRACE_NEW_CONTEXT) {
  require('continuation-local-storage');
}

var path = require('path');
var cls = require('./src/cls'/*.js*/);
var common = require('@google-cloud/common');
var extend = require('extend');
var constants = require('./src/constants'/*.js*/);
var traceUtil = require('./src/util'/*.js*/);
var TraceAgent = require('./src/trace-api'/*.js*/);
var pluginLoader = require('./src/trace-plugin-loader'/*.js*/);
var TraceWriter = require('./src/trace-writer'/*.js*/);

var modulesLoadedBeforeTrace = [];

var traceAgent = new TraceAgent('Custom Span API');

var traceModuleName = path.join('@google-cloud', 'trace-agent');
for (var i = 0; i < filesLoadedBeforeTrace.length; i++) {
  var moduleName = traceUtil.packageNameFromPath(filesLoadedBeforeTrace[i]);
  if (moduleName && moduleName !== traceModuleName &&
      modulesLoadedBeforeTrace.indexOf(moduleName) === -1) {
    modulesLoadedBeforeTrace.push(moduleName);
  }
}

/**
 * Normalizes the user-provided configuration object by adding default values
 * and overriding with env variables when they are provided.
 * @param {*} projectConfig The user-provided configuration object. It will not
 * be modified.
 * @return A normalized configuration object.
 */
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

  var envSetConfig = {};
  if (process.env.hasOwnProperty('GCLOUD_TRACE_CONFIG')) {
    envSetConfig = require(path.resolve(process.env.GCLOUD_TRACE_CONFIG));
  }
  // Configuration order of precedence:
  // Default < Environment Variable Set Configuration File < Project
  var config = extend(true, {}, require('./config'/*.js*/), envSetConfig,
    projectConfig, envConfig);

  // Enforce the upper limit for the label value size.
  if (config.maximumLabelValueSize > constants.TRACE_SERVICE_LABEL_VALUE_LIMIT) {
    config.maximumLabelValueSize = constants.TRACE_SERVICE_LABEL_VALUE_LIMIT;
  }
  // Clamp the logger level.
  if (config.logLevel < 0) {
    config.logLevel = 0;
  } else if (config.logLevel >= common.logger.LEVELS.length) {
    config.logLevel = common.logger.LEVELS.length - 1;
  }
  return config;
}

/**
 * Stops the Trace Agent. This disables the publicly exposed agent instance,
 * as well as any instances passed to plugins. This also prevents the Trace
 * Writer from publishing additional traces.
 */
function stop() {
  if (traceAgent && traceAgent.isActive()) {
    TraceWriter.get().stop();
    traceAgent.disable();
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

  if (traceAgent.isActive() && !config.forceNewAgent_) { // already started.
    throw new Error('Cannot call start on an already started agent.');
  } else if (traceAgent.isActive()) {
    // For unit tests only.
    // Undoes initialization that occurred last time start() was called.
    stop();
  }

  if (!config.enabled) {
    return traceAgent;
  }

  var logger = common.logger({
    level: common.logger.LEVELS[config.logLevel],
    tag: '@google-cloud/trace-agent'
  });

  if (modulesLoadedBeforeTrace.length > 0) {
    logger.error('Tracing might not work as the following modules ' +
      'were loaded before the trace agent was initialized: ' +
      JSON.stringify(modulesLoadedBeforeTrace));
  }
  // CLS namespace for context propagation
  cls.createNamespace();
  TraceWriter.create(logger, config, function(err) {
    if (err) {
      stop();
    }
  });

  traceAgent.enable(logger, config);
  pluginLoader.activate(logger, config);

  if (typeof config.projectId !== 'string' && typeof config.projectId !== 'undefined') {
    logger.error('config.projectId, if provided, must be a string. ' +
      'Disabling trace agent.');
    stop();
    return traceAgent;
  }

  // Make trace agent available globally without requiring package
  global._google_trace_agent = traceAgent;

  logger.info('trace agent activated');
  return traceAgent;
}

function get() {
  return traceAgent;
}

module.exports = {
  start: start,
  get: get
};

// If the module was --require'd from the command line, start the agent.
if (module.parent && module.parent.id === 'internal/preload') {
  module.exports.start();
}

export default {};
