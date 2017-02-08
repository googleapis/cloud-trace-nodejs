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

var shimmer = require('shimmer');

function createClientWrap(api, createClient) {
  return function createClientTrace() {
    var client = createClient.apply(this, arguments);
    api.wrapEmitter(client);
    return client;
  };
}

// Used for redis version > 2.3
function createStreamWrap(api, create_stream) {
  return function create_stream_trace() {
    if (!this.stream) {
      Object.defineProperty(this, 'stream', {
        get: function () { return this._google_trace_stream; },
        set: function (val) {
          api.wrapEmitter(val);
          this._google_trace_stream = val;
        }
      });
    }
    return create_stream.apply(this, arguments);
  };
}

// Used for redis version <= 2.3
function streamListenersWrap(api, install_stream_listeners) {
  return function install_stream_listeners_trace() {
    api.wrapEmitter(this.stream);
    return install_stream_listeners.apply(this, arguments);
  };
}

function setupSpan(api, cmd, args, skipped_frames) {
  var labels = { command: cmd };
  if (api.enhancedDatabaseReportingEnabled()) {
    labels.arguments = JSON.stringify(args);
  }
  var span = api.createChildSpan({
    name: 'redis-' + cmd,
    skipFrames: skipped_frames + 1
  });
  Object.keys(labels).forEach(function(key) {
    span.addLabel(key, labels[key]);
  });
  return span;
}

function startSpanFromArguments(api, cmd, args, cb, send_command) {
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
  var span = setupSpan(api, cmd, args, 1);
  return send_command(cmd, args, wrapCallback(api, span, cb));
}

function internalSendCommandWrap(api, internal_send_command) {
  return function internal_send_command_trace(cmd, args, cb) {
    var root = api.getTransaction();
    if (!root) {
      return internal_send_command.call(this, cmd, args, cb);
    }
    if (arguments.length === 1 && typeof cmd === 'object') {
      var span = setupSpan(api, cmd.command, cmd.args, 0);
      cmd.callback = wrapCallback(api, span, cmd.callback);
      return internal_send_command.call(this, cmd);
    }
    return startSpanFromArguments(api, cmd, args, cb, internal_send_command.bind(this));
  };
}

function sendCommandWrap(api, send_command) {
  return function send_command_trace(cmd, args, cb) {
    var root = api.getTransaction();
    if (!root) {
      return send_command.call(this, cmd, args, cb);
    }
    return startSpanFromArguments(api, cmd, args, cb, send_command.bind(this));
  };
}

function wrapCallback(api, span, done) {
  var fn = function(err, res) {
    var labels = {};
    if (api.enhancedDatabaseReportingEnabled()) {
      if (err) {
        labels.error = err;
      }
      if (res) {
        labels.result = res;
      }
    }
    Object.keys(labels).forEach(function(key) {
      span.addLabel(key, labels[key]);
    });
    span.endSpan();
    if (done) {
      done(err, res);
    }
  };
  return api.wrap(fn);
}

////////////////////////////////////////////////////////////////////////////////

// patches for verions < 2.6
function patchBelowV2_6(redis, api) {
  shimmer.wrap(redis.RedisClient.prototype, 'send_command',
    sendCommandWrap.bind(null, api));
}

function patchEqualV2_6(redis, api) {
  shimmer.wrap(redis.RedisClient.prototype, 'internal_send_command',
    internalSendCommandWrap.bind(null, api));
}

// patches for versions < 2.3.x
function patchBelowV2_3(redis, api) {
  // The same action is done for versions <= 2.3.x
  patchEqualV2_3(redis, api);
}

function patchEqualV2_3(redis, api) {
  shimmer.wrap(redis.RedisClient.prototype, 'install_stream_listeners',
          streamListenersWrap.bind(null, api));
}

function patchAboveV2_3(redis, api) {
  shimmer.wrap(redis.RedisClient.prototype, 'create_stream',
          createStreamWrap.bind(null, api));
}

function patchAll(redis, api) {
  shimmer.wrap(redis, 'createClient', createClientWrap.bind(null, api));
}

module.exports = [
  {
    file: '',
    versions: '<2.3.x',
    patch: function(redis, api) {
      patchBelowV2_6(redis, api);
      patchAll(redis, api);
    }
  },
  {
    file: '',
    versions: '2.3.x',
    patch: function(redis, api) {
      patchBelowV2_6(redis, api);
      patchEqualV2_3(redis, api);
      patchAll(redis, api);
    }
  },
  {
    file: '',
    versions: '>2.3.x <2.6',
    patch: function(redis, api) {
      patchAboveV2_3(redis, api);
      patchBelowV2_6(redis, api);
      patchAll(redis, api);
    }
  },
  {
    file: '',
    versions: '2.6.x',
    patch: function(redis, api) {
      patchEqualV2_6(redis, api);
      patchAll(redis, api);
    }
  }
];
