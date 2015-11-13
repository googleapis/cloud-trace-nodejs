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

var SpanData = require('./lib/span-data.js');
var common = require('@google/cloud-diagnostics-common');
var semver = require('semver');
var constants = require('./lib/constants.js');

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
  setTransactionName: function() {},
  addTransactionLabel: function() {}
};

/** @private */
var agent = phantomTraceAgent;

var initConfig = function(projectConfig) {
  var util = require('util');
  var config = {};
  util._extend(config, require('./config.js'));
  util._extend(config, projectConfig);
  if (process.env.hasOwnProperty('GCLOUD_TRACE_CONFIG')) {
    util._extend(config, require(process.env.GCLOUD_TRACE_CONFIG));
  }
  if (process.env.hasOwnProperty('GCLOUD_TRACE_LOGLEVEL')) {
    config.logLevel = process.env.GCLOUD_TRACE_LOGLEVEL;
  }
  if (process.env.hasOwnProperty('GCLOUD_TRACE_DISABLE')) {
    config.enabled = false;
  }
  if (process.env.hasOwnProperty('GCLOUD_PROJECT_NUM')) {
    config.projectId = process.env.GCLOUD_PROJECT_NUM;
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

  setTransactionName: function(name) {
    return agent.setTransactionName(name);
  },

  addTransactionLabel: function(key, value) {
    return agent.addTransactionLabel(key, value);
  },

  start: function(projectConfig) {
    if (this.isActive()) { // already started.
      return this;
    }

    var config = initConfig(projectConfig);
    if (!config.enabled) {
      return this;
    }
    var logger = common.logger.create(config.logLevel, '@google/cloud-trace');
    if (!semver.satisfies(process.versions.node, '>=0.12')) {
      logger.error('Tracing is only supported on Node versions >=0.12');
      return this;
    }

    if (config.projectId) {
      logger.info('Locally provided ProjectId: ' + config.projectId);
    }

    var headers = {};
    headers[constants.TRACE_AGENT_REQUEST_HEADER] = 1;

    common.utils.getHostname(headers, function(err, hostname) {
      if (err) {
        if (err.code !== 'ENOTFOUND') {
          // We are running on GCP.
          logger.warn('Unable to retrieve GCE hostname.', err);
        }
        config.hostname = require('os').hostname();
      } else {
        config.hostname = hostname;
      }
    });

    common.utils.getInstanceId(headers, function(err, instanceId) {
      if (err) {
        if (err.code !== 'ENOTFOUND') {
          // We are running on GCP.
          logger.warn('Unable to retrieve GCE instance id.', err);
        }
      } else {
        config.instanceId = instanceId;
      }
    });

    if (typeof config.projectId === 'undefined') {
      // Queue the work to acquire the projectNumber (potentially from the
      // network.)
      common.utils.getProjectNumber(headers, function(err, project) {
        if (err) {
          // Fatal error. Disable the agent.
          logger.error('Unable to acquire the project number from metadata ' +
            'service. Please provide a valid project number as an env. ' +
            'variable, or through config.projectId passed to start().' +
            err);
          publicAgent.stop();
          return;
        }
        config.projectId = project;
      });
    } else if (typeof config.projectId === 'number') {
      config.projectId = config.projectId.toString();
    } else if (typeof config.projectId !== 'string') {
      logger.error('config.projectId, if provided, must be' +
        ' a string or number. Disabling trace agent.');
      return this;
    }

    if (process.env.GAE_MODULE_NAME) {
      config.gae_module_name = process.env.GAE_MODULE_NAME;
    }
    if (process.env.GAE_MODULE_VERSION) {
      config.gae_module_version = process.env.GAE_MODULE_VERSION;
    }

    agent = require('./lib/trace-agent.js').get(config, logger);
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
if (module.parent.id === 'internal/preload') {
  module.exports.start();
}
