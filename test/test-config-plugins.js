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

var assert = require('assert');
var trace = require('..');

var common = require('./plugins/common.js');

var instrumentedModules = ['connect', 'express', 'grpc', 'hapi', 'http', 'koa',
  'mongodb-core', 'mysql', 'pg', 'redis', 'restify'];

describe('plugin configuration', function() {
  it('should have correct defaults', function() {
    var agent = trace.start({forceNewAgent_: true});
    var plugins = common.getConfig(agent).plugins;
    assert.strictEqual(JSON.stringify(Object.keys(plugins)),
      JSON.stringify(instrumentedModules));
    for (var i = 0; i < instrumentedModules.length; i++) {
      var name = instrumentedModules[i];
      assert.ok(plugins[name].indexOf('plugin-' + name + '.js') !== -1);
    }
  });

  it('should handle empty object', function() {
    var agent = trace.start({forceNewAgent_: true, plugins: {}});
    var plugins = common.getConfig(agent).plugins;
    assert.strictEqual(JSON.stringify(Object.keys(plugins)),
      JSON.stringify(instrumentedModules));
    assert.ok(instrumentedModules.every(function(e) {
      return plugins[e].indexOf('plugin-' + e + '.js') !== -1;
    }));
  });

  it('should overwrite builtin plugins correctly', function() {
    var agent = trace.start({forceNewAgent_: true, plugins: {
      express: 'foo'
    }});
    var plugins = common.getConfig(agent).plugins;
    assert.strictEqual(JSON.stringify(Object.keys(plugins)),
      JSON.stringify(instrumentedModules));
    assert.ok(instrumentedModules.filter(function(e) {
      return e !== 'express';
    }).every(function(e) {
      return plugins[e].indexOf('plugin-' + e + '.js') !== -1;
    }));
    assert.strictEqual(plugins.express, 'foo');
  });
});
