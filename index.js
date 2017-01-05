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

var common = require('@google-cloud/common');
var constants = require('./src/constants.js');
var gcpMetadata = require('gcp-metadata');
var semver = require('semver');
var traceUtil = require('./src/util.js');
var SpanData = require('./src/span-data.js');
var util = require('util');

var modulesLoadedBeforeTrace = [];

for (var i = 0; i < filesLoadedBeforeTrace.length; i++) {
  var moduleName = traceUtil.packageNameFromPath(filesLoadedBeforeTrace[i]);
  if (moduleName && moduleName !== '@google/cloud-trace' &&
      modulesLoadedBeforeTrace.indexOf(moduleName) === -1) {
    modulesLoadedBeforeTrace.push(moduleName);
  }
}

var onUncaughtExceptionValues = ['ignore', 'flush', 'flushAndExit'];

/**
 * Phantom implementation of the trace agent. This allows API users to decouple
 * the enable/disable logic from the calls to the tracing API. The phantom API
 * has a lower overhead than isEnabled checks inside the API functions.
 * @private
 */
var phantomTraceAgent = {
  startSpan: function() { return SpanData.nullSpan; },
  endSpan: function(spanData) { spanData.close(); },
  runInSpan: function(name, labels, fn) {
    if (typeof(labels) === 'function') {
      fn = labels;
    }
    fn(function() {});
  },
  runInRootSpan: function(name, labels, fn) {
    if (typeof(labels) === 'function') {
      fn = labels;
    }
    fn(function() {});
  },
  setTransactionName: function() {},
  addTransactionLabel: function() {}
};

/** @private */
var agent = phantomTraceAgent;

var initConfig = function(projectConfig) {
  var config = {};
  util._extend(config, require('./config.js').trace);
  util._extend(config, projectConfig);
  if (process.env.hasOwnProperty('GCLOUD_TRACE_LOGLEVEL')) {
    var envLogLevel = parseInt(process.env.GCLOUD_TRACE_LOGLEVEL, 10);
    if (!isNaN(envLogLevel)) {
      config.logLevel = envLogLevel;
    } else {
      console.error('Warning: Ignoring env var GCLOUD_TRACE_LOGLEVEL as it ' +
        'contains an non-integer log level: ' +
        process.env.GCLOUD_TRACE_LOGLEVEL);
    }
  }
  if (process.env.hasOwnProperty('GCLOUD_PROJECT')) {
    config.projectId = process.env.GCLOUD_PROJECT;
  }
  return config;
};

/**
 * The singleton public agent. This is the public API of the module.
 */
var publicAgent = {
  isActive: function() {
    return agent !== phantomTraceAgent;
  },

  startSpan: function(name, labels) {
    return agent.startSpan(name, labels);
  },

  endSpan: function(spanData, labels) {
    return agent.endSpan(spanData, labels);
  },

  runInSpan: function(name, labels, fn) {
    return agent.runInSpan(name, labels, fn);
  },

  runInRootSpan: function(name, labels, fn) {
    return agent.runInRootSpan(name, labels, fn);
  },

  setTransactionName: function(name) {
    return agent.setTransactionName(name);
  },

  addTransactionLabel: function(key, value) {
    return agent.addTransactionLabel(key, value);
  },

  start: function(projectConfig) {
    if (this.isActive()) { // already started.
      agent.logger.warn('Calling start on already started agent.' +
        'New configuration will be ignored.');
      return this;
    }

    var config = initConfig(projectConfig);

    if (!config.enabled) {
      return this;
    }

    var logLevel = config.logLevel;
    if (logLevel < 0) {
      logLevel = 0;
    } else if (logLevel >= common.logger.LEVELS.length) {
      logLevel = common.logger.LEVELS.length - 1;
    }
    var logger = common.logger({
      level: common.logger.LEVELS[logLevel],
      tag: '@google/cloud-trace'
    });

    if (!semver.satisfies(process.versions.node, '>=0.12')) {
      logger.error('Tracing is only supported on Node versions >=0.12');
      return this;
    }

    if (config.projectId) {
      logger.info('Locally provided ProjectId: ' + config.projectId);
    }

    if (onUncaughtExceptionValues.indexOf(config.onUncaughtException) === -1) {
      logger.error('The value of onUncaughtException should be one of ',
        onUncaughtExceptionValues);
      throw new Error('Invalid value for onUncaughtException configuration.');
    }

    var headers = {};
    headers[constants.TRACE_AGENT_REQUEST_HEADER] = 1;

    if (modulesLoadedBeforeTrace.length > 0) {
      logger.warn('Tracing might not work as the following modules ' +
        'were loaded before the trace agent was initialized: ' +
        JSON.stringify(modulesLoadedBeforeTrace));
    }

    if (typeof config.projectId === 'undefined') {
      // Queue the work to acquire the projectId (potentially from the
      // network.)
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
          // Fatal error. Disable the agent.
          logger.error('Unable to acquire the project number from metadata ' +
            'service. Please provide a valid project number as an env. ' +
            'variable, or through config.projectId passed to start(). ' +
            'Disabling trace agent. ' + err);
          publicAgent.stop();
          return;
        }
        config.projectId = projectId;
      });
    } else if (typeof config.projectId !== 'string') {
      logger.error('config.projectId, if provided, must be a string. ' +
        'Disabling trace agent.');
      return this;
    }

    agent = require('./src/trace-agent.js').get(config, logger);
    return this; // for chaining
  },

  get: function() {
    if (this.isActive()) {
      return this;
    }
    throw new Error('The agent must be initialized by calling start.');
  },

  stop: function() {
    if (this.isActive()) {
      agent.stop();
      agent = phantomTraceAgent;
    }
  },

  /**
   * For use in tests only.
   * @private
   */
  private_: function() { return agent; }
};

module.exports = global._google_trace_agent = publicAgent;

// If the module was --require'd from the command line, start the agent.
if (module.parent && module.parent.id === 'internal/preload') {
  module.exports.start();
}
