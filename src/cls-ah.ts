/**
 * Copyright 2017 Google Inc. All Rights Reserved.
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

const asyncHook = require('async_hooks');

const wrappedSymbol = Symbol('context_wrapped');
let contexts = {};
let current = {};

asyncHook.createHook({init, before, destroy}).enable();

function Namespace() {}

Namespace.prototype.get = function(k) {
  return current[k];
};

Namespace.prototype.set = function(k, v) {
  current[k] = v;
};

Namespace.prototype.run = function(fn) {
  const oldContext = current;
  current = {};
  const res = fn();
  current = oldContext;
  return res;
};

Namespace.prototype.runAndReturn = Namespace.prototype.run;

Namespace.prototype.bind = function(cb) {
  if (cb[wrappedSymbol] || !current) {
    return cb;
  }
  const boundContext = current;
  const contextWrapper = function() {
    const oldContext = current;
    current = boundContext;
    const res = cb.apply(this, arguments);
    current = oldContext;
    return res;
  };
  contextWrapper[wrappedSymbol] = true;
  Object.defineProperty(contextWrapper, 'length', {
    enumerable: false,
    configurable: true,
    writable: false,
    value: cb.length
  });
  return contextWrapper;
};

const eventEmitterMethods =
  [ 'addListener', 'on', 'once', 'prependListener', 'prependOncelistener' ];

// This function is not technically needed and all tests currently pass without it
// (after removing call sites). While it is not a complete solution, restoring
// correct context before running every request/response event handler reduces
// the number of situations in which userspace queuing will cause us to lose context.
Namespace.prototype.bindEmitter = function(ee) {
  var ns = this;
  eventEmitterMethods.forEach(function(method) {
    const oldMethod = ee[method];
    ee[method] = function(e, f) { return oldMethod.call(this, e, ns.bind(f)); };
  });
};

var namespace = new Namespace();

// AsyncWrap Hooks

function init(uid, provider, parentUid, parentHandle) {
  contexts[uid] = current;
}

function before(uid) {
  if (contexts[uid]) {
    current = contexts[uid];
  }
}

function destroy(uid) {
  delete contexts[uid];
}

module.exports = {
  createNamespace: function() {
    return namespace;
  },

  destroyNamespace: function() {
    current = {};
    contexts = {};
  },

  getNamespace: function() { return namespace; }
};

export default {};
