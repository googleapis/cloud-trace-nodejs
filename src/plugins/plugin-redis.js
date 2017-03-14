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

function createCreateClientWrap(api) {
  return function createClientWrap(createClient) {
    return function createClientTrace() {
      var client = createClient.apply(this, arguments);
      api.wrapEmitter(client);
      return client;
    };
  };
}

// Used for redis version > 2.3
function createCreateStreamWrap(api) {
  return function createStreamWrap(create_stream) {
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
  };
}

// Used for redis version <= 2.3
function createStreamListenersWrap(api) {
  return function streamListenersWrap(install_stream_listeners) {
    return function install_stream_listeners_trace() {
      api.wrapEmitter(this.stream);
      return install_stream_listeners.apply(this, arguments);
    };
  };
}

function setupSpan(api, cmd, args, skipped_frames) {
  var span = api.createChildSpan({
    name: 'redis-' + cmd,
    skipFrames: skipped_frames + 1
  });
  if (!span) {
    return null;
  }
  span.addLabel('command', cmd);
  if (api.enhancedDatabaseReportingEnabled()) {
    span.addLabel('arguments', JSON.stringify(args));
  }
  return span;
}

function startSpanFromArguments(api, cmd, args, cb, send_command) {
  // If the arguments cannot be processed in this plugin, let redis process
  // them so that if they are incorrect, redis reports an error instead of
  // this plugin.
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
  if (!span) {
    return send_command(cmd, args, cb);
  }
  return send_command(cmd, args, wrapCallback(api, span, cb));
}

function createInternalSendCommandWrap(api) {
  return function internalSendCommandWrap(internal_send_command) {
    return function internal_send_command_trace(cmd, args, cb) {
      if (arguments.length === 1 && typeof cmd === 'object') {
        // New versions of redis (2.4+) use a single options object instead
        // of separate named arguments.
        var span = setupSpan(api, cmd.command, cmd.args, 0);
        if (!span) {
          return internal_send_command.call(this, cmd);
        }
        cmd.callback = wrapCallback(api, span, cmd.callback);
        return internal_send_command.call(this, cmd);
      }
      return startSpanFromArguments(api, cmd, args, cb, internal_send_command.bind(this));
    };
  };
}

function createSendCommandWrap(api) {
  return function sendCommandWrap(send_command) {
    return function send_command_trace(cmd, args, cb) {
      return startSpanFromArguments(api, cmd, args, cb, send_command.bind(this));
    };
  };
}

function wrapCallback(api, span, done) {
  var fn = function(err, res) {
    if (api.enhancedDatabaseReportingEnabled()) {
      if (err) {
        span.addLabel('error', err);
      }
      if (res) {
        span.addLabel('result', res);
      }
    }
    span.endSpan();
    if (done) {
      done(err, res);
    }
  };
  return api.wrap(fn);
}

function wrapInternalSendCommand(redis, api) {
  shimmer.wrap(redis.RedisClient.prototype, 'internal_send_command',
               createInternalSendCommandWrap(api));
}

function unwrapInternalSendCommand(redis) {
  shimmer.unwrap(redis.RedisClient.prototype, 'internal_send_command');
}

function wrapCreateClient(redis, api) {
  shimmer.wrap(redis, 'createClient', createCreateClientWrap(api));
}

function unwrapCreateClient(redis) {
  shimmer.unwrap(redis, 'createClient');
}

function wrapCreateStream(redis, api) {
  shimmer.wrap(redis.RedisClient.prototype, 'create_stream',
               createCreateStreamWrap(api));
}

function unwrapCreateStream(redis) {
  shimmer.unwrap(redis.RedisClient.prototype, 'create_stream');
}

function wrapSendCommand(redis, api) {
  shimmer.wrap(redis.RedisClient.prototype, 'send_command',
               createSendCommandWrap(api));
}

function unwrapSendCommand(redis) {
  shimmer.unwrap(redis.RedisClient.prototype, 'send_command');
}

function wrapInstallStreamListeners(redis, api) {
  shimmer.wrap(redis.RedisClient.prototype, 'install_stream_listeners',
               createStreamListenersWrap(api));
}

function unwrapInstallStreamListeners(redis) {
  shimmer.unwrap(redis.RedisClient.prototype, 'install_stream_listeners');
}

module.exports = [
  {
    file: '',
    versions: '>=2.6',
    patch: function(redis, api) {
      wrapCreateStream(redis, api);
      wrapInternalSendCommand(redis, api);
      wrapCreateClient(redis, api);
    },
    unpatch: function(redis) {
      unwrapCreateStream(redis);
      unwrapInternalSendCommand(redis);
      unwrapCreateClient(redis);
    }
  },
  {
    file: '',
    versions: '>2.3 <2.6',
    patch: function(redis, api) {
      wrapSendCommand(redis, api);
      wrapCreateStream(redis, api);
      wrapCreateClient(redis, api);
    },
    unpatch: function(redis) {
      unwrapSendCommand(redis);
      unwrapCreateStream(redis);
      unwrapCreateClient(redis);
    }
  },
  {
    file: '',
    versions: '<=2.3',
    patch: function(redis, api) {
      wrapSendCommand(redis, api);
      wrapInstallStreamListeners(redis, api);
      wrapCreateClient(redis, api);
    },
    unpatch: function(redis) {
      unwrapSendCommand(redis);
      unwrapInstallStreamListeners(redis);
      unwrapCreateClient(redis);
    }
  }
];
