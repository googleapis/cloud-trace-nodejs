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

var OpaqueSpan = require('./lib/opaque-span.js');
var common = require('@google/cloud-diagnostics-common');
var Logger = common.logger;
var semver = require('semver');

/**
 * Phantom implementation of the trace agent. This allows API users to decouple
 * the enable/disable logic from the calls to the tracing API. The phantom API
 * has a lower overhead than isEnabled checks inside the API functions.
 * @private
 */
var phantomTraceAgent = {
  startSpan: function() { return OpaqueSpan.nullSpan; },
  endSpan: function(opaque) { opaque.end(); },
  setTransactionName: function() {},
  addTransactionLabel: function() {}
};

/** @private */
var agent = phantomTraceAgent;

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

  endSpan: function(opaque, labels) {
    return agent.endSpan(opaque, labels);
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

    var util = require('util');
    var config = {};
    util._extend(config, require('./config.js'));
    util._extend(config, projectConfig);
    var logger = new Logger(config.logLevel, '@google/cloud-trace');
    if (!semver.satisfies(process.versions.node, '>=0.12')) {
      logger.error('Tracing is only supported on Node versions >=0.12');
      return this;
    }

    if (typeof config.projectId === 'undefined' &&
        process.env.GCLOUD_PROJECT_NUM) {
      config.projectId = process.env.GCLOUD_PROJECT_NUM;
    }

    if (typeof config.projectId === 'undefined') {
      // Queue the work to acquire the projectNumber (potentially from the
      // network.)
      common.utils.getProjectNumber(function(err, project) {
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
    } else if (typeof config.projectId !== 'string') {
      logger.error('config.projectId, if provided, must be a string. '+
        'Disabling trace agent.');
      return this;
    }

    agent = require('./lib/trace-agent.js').get(config, logger);
    return this; // for chaining
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

// TODO: if the module was --require'd on the command line, auto-start the agent

module.exports = publicAgent;
