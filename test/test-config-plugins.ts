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

import {Logger} from '@google-cloud/common';
import * as assert from 'assert';

import {defaultConfig} from '../src/config';
import {PluginLoader, PluginLoaderConfig} from '../src/trace-plugin-loader';

import * as trace from './trace';

describe('Configuration: Plugins', () => {
  const instrumentedModules = Object.keys(defaultConfig.plugins);
  let plugins: {[pluginName: string]: string}|null;

  class ConfigTestPluginLoader extends PluginLoader {
    constructor(logger: Logger, config: PluginLoaderConfig) {
      super(logger, config);
      plugins = config.plugins;
    }
  }

  before(() => {
    trace.setPluginLoader(ConfigTestPluginLoader);
  });

  after(() => {
    trace.setPluginLoader(trace.TestPluginLoader);
  });

  afterEach(() => {
    plugins = null;
  });

  it('should have correct defaults', () => {
    trace.start();
    assert.ok(plugins);
    assert.strictEqual(
        JSON.stringify(Object.keys(plugins!)),
        JSON.stringify(instrumentedModules));
    instrumentedModules.forEach(
        e => assert.ok(plugins![e].includes(`plugin-${e}.js`)));
  });

  it('should handle empty object', () => {
    trace.start({plugins: {}});
    assert.ok(plugins);
    assert.strictEqual(
        JSON.stringify(Object.keys(plugins!)),
        JSON.stringify(instrumentedModules));
    instrumentedModules.forEach(
        e => assert.ok(plugins![e].includes(`plugin-${e}.js`)));
  });

  it('should overwrite builtin plugins correctly', () => {
    trace.start({plugins: {express: 'foo'}});
    assert.ok(plugins);
    assert.strictEqual(
        JSON.stringify(Object.keys(plugins!)),
        JSON.stringify(instrumentedModules));
    instrumentedModules.filter(e => e !== 'express')
        .forEach(e => assert.ok(plugins![e].includes(`plugin-${e}.js`)));
    assert.strictEqual(plugins!.express, 'foo');
  });
});
