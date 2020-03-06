// Copyright 2017 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as assert from 'assert';
import {describe, it} from 'mocha';

import {defaultConfig} from '../src/config';
import {StackdriverTracerComponents} from '../src/trace-api';
import {PluginLoader, PluginLoaderConfig} from '../src/trace-plugin-loader';

import * as testTraceModule from './trace';

function assertPluginPath(
  plugins: {[pluginName: string]: string},
  pluginName: string
) {
  // hapi was renamed to @hapi/hapi in v18. We still use the same plugin
  // filename.
  if (pluginName === '@hapi/hapi') {
    pluginName = 'hapi';
  }
  assert.ok(plugins[pluginName].includes(`plugin-${pluginName}.js`));
}

describe('Configuration: Plugins', () => {
  const instrumentedModules = Object.keys(defaultConfig.plugins);
  let plugins: {[pluginName: string]: string} | null;

  class ConfigTestPluginLoader extends PluginLoader {
    constructor(
      config: PluginLoaderConfig,
      components: StackdriverTracerComponents
    ) {
      super(config, components);
      plugins = config.plugins;
    }
  }

  before(() => {
    testTraceModule.setPluginLoaderForTest(ConfigTestPluginLoader);
  });

  after(() => {
    testTraceModule.setPluginLoaderForTest(testTraceModule.TestPluginLoader);
  });

  afterEach(() => {
    plugins = null;
  });

  it('should have correct defaults', () => {
    testTraceModule.start();
    assert.ok(plugins);
    assert.strictEqual(
      JSON.stringify(Object.keys(plugins!)),
      JSON.stringify(instrumentedModules)
    );
    instrumentedModules.forEach(e => assertPluginPath(plugins!, e));
  });

  it('should handle empty object', () => {
    testTraceModule.start({plugins: {}});
    assert.ok(plugins);
    assert.strictEqual(
      JSON.stringify(Object.keys(plugins!)),
      JSON.stringify(instrumentedModules)
    );
    instrumentedModules.forEach(e => assertPluginPath(plugins!, e));
  });

  it('should handle non-object', () => {
    testTraceModule.start({plugins: false as {}});
    assert.deepStrictEqual(plugins, {});
  });

  it('should overwrite builtin plugins correctly', () => {
    testTraceModule.start({plugins: {express: 'foo'}});
    assert.ok(plugins);
    assert.strictEqual(
      JSON.stringify(Object.keys(plugins!)),
      JSON.stringify(instrumentedModules)
    );
    instrumentedModules
      .filter(e => e !== 'express')
      .forEach(e => assertPluginPath(plugins!, e));
    assert.strictEqual(plugins!.express, 'foo');
  });
});
