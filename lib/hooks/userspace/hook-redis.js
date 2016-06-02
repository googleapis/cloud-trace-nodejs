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

var cls = require('../../cls.js');
var shimmer = require('shimmer');
var semver = require('semver');
var SpanData = require('../../span-data.js');
var agent;

var SUPPORTED_VERSIONS = '<=2.6.x';

function createClientWrap(createClient) {
  return function createClientTrace() {
    var client = createClient.apply(this, arguments);
    cls.getNamespace().bindEmitter(client);
    return client;
  };
}

// Used for redis version > 2.3
function createStreamWrap(create_stream) {
  return function create_stream_trace() {
    if (!this.stream) {
      Object.defineProperty(this, 'stream', {
        get: function () { return this._google_trace_stream; },
        set: function (val) {
          cls.getNamespace().bindEmitter(val);
          this._google_trace_stream = val;
        }
      });
    }
    return create_stream.apply(this, arguments);
  };
}

// Used for redis version <= 2.3
function streamListenersWrap(install_stream_listeners) {
  return function install_stream_listeners_trace() {
    cls.getNamespace().bindEmitter(this.stream);
    return install_stream_listeners.apply(this, arguments);
  };
}

function setupSpan(cmd, args, skipped_frames) {
  var labels = { command: cmd };
  if (agent.config_.enhancedDatabaseReporting) {
    labels.arguments = JSON.stringify(args);
  }
  return agent.startSpan('redis-' + cmd, labels, skipped_frames + 1);
}

function startSpanFromArguments(cmd, args, cb, send_command) {
  if (!cmd || !args || typeof cmd !== 'string' || !Array.isArray(args) ||
    (cb && typeof cb !== 'function')) {
    return send_command(cmd, args, cb);
  }
  if (!cb) {
    if (typeof args[args.length - 1] === 'function' ||
        typeof args[args.length - 1] === 'undefined') {
      cb = args.pop();
    }
  }
  var span = setupSpan(cmd, args, 1);
  return send_command(cmd, args, wrapCallback(span, cb));
}

function validRootSpan(root, cmd, args) {
  if (!root) {
    agent.logger.debug('Untraced redis command:', cmd, args);
    return false;
  } else if (root === SpanData.nullSpan) {
    return false;
  }
  return true;
}

function internalSendCommandWrap(internal_send_command) {
  return function internal_send_command_trace(cmd, args, cb) {
    var root = cls.getRootContext();
    if (!validRootSpan(root, cmd, args)) {
      return internal_send_command.call(this, cmd, args, cb);
    }
    if (arguments.length === 1 && typeof cmd === 'object') {
      var span = setupSpan(cmd.command, cmd.args, 0);
      cmd.callback = wrapCallback(span, cmd.callback);
      return internal_send_command.call(this, cmd);
    }
    return startSpanFromArguments(cmd, args, cb, internal_send_command.bind(this));
  };
}

function sendCommandWrap(send_command) {
  return function send_command_trace(cmd, args, cb) {
    var root = cls.getRootContext();
    if (!validRootSpan(root, cmd, args)) {
      return send_command.call(this, cmd, args, cb);
    }
    return startSpanFromArguments(cmd, args, cb, send_command.bind(this));
  };
}

function wrapCallback(span, done) {
  var fn = function(err, res) {
    var labels = {};
    if (agent.config_.enhancedDatabaseReporting) {
      if (err) {
        labels.error = err;
      }
      if (res) {
        labels.result = res;
      }
    }
    agent.endSpan(span, labels);
    if (done) {
      done(err, res);
    }
  };
  return cls.getNamespace().bind(fn);
}

module.exports = function(version_, agent_) {
  if (!semver.satisfies(version_, SUPPORTED_VERSIONS)) {
    agent_.logger.info('Redis: unsupported version ' + version_ + ' loaded');
    return {};
  }
  return {
    // An empty relative path here matches the root module being loaded.
    '': {
      patch: function(redis) {
        agent = agent_;
        if (semver.satisfies(version_, '<2.6')) {
          shimmer.wrap(redis.RedisClient.prototype, 'send_command', sendCommandWrap);
        } else {
          shimmer.wrap(redis.RedisClient.prototype, 'internal_send_command',
            internalSendCommandWrap);
        }
        if (semver.satisfies(version_, '<=2.3.x')) {
          shimmer.wrap(redis.RedisClient.prototype, 'install_stream_listeners',
            streamListenersWrap);
        } else {
          shimmer.wrap(redis.RedisClient.prototype, 'create_stream',
            createStreamWrap);
        }
        shimmer.wrap(redis, 'createClient', createClientWrap);
      },
      unpatch: function(redis) {
        if (semver.satisfies(version_, '<2.6')) {
          shimmer.unwrap(redis.RedisClient.prototype, 'send_command');
        } else {
          shimmer.unwrap(redis.RedisClient.prototype, 'internal_send_command');
        }
        if (semver.satisfies(version_, '<=2.3.x')) {
          shimmer.unwrap(redis.RedisClient.prototype, 'install_stream_listeners');
        } else {
          shimmer.unwrap(redis.RedisClient.prototype, 'create_stream');
        }
        shimmer.unwrap(redis, 'createClient');
        agent_.logger.info('Redis: unpatched');
      }
    }
  };
};
