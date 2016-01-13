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


var cls = require('continuation-local-storage');

/** @const {string} */
var TRACE_NAMESPACE = 'com.google.cloud.trace';

function createNamespace() {
  return cls.createNamespace(TRACE_NAMESPACE);
}

function destroyNamespace() {
  cls.destroyNamespace(TRACE_NAMESPACE);
}

function getNamespace() {
  return cls.getNamespace(TRACE_NAMESPACE);
}

module.exports = {
  createNamespace: createNamespace,

  destroyNamespace: destroyNamespace,

  getNamespace: getNamespace,

  getRootContext: function getRootContext() {
    // First getNamespace check is necessary in case any
    // patched closures escaped before the agent was stopped and the
    // namespace was destroyed.
    if (getNamespace() && getNamespace().get('root')) {
      return getNamespace().get('root');
    }
    return null;
  },

  setRootContext: function setRootContext(rootContext) {
    getNamespace().set('root', rootContext);
  }
};

