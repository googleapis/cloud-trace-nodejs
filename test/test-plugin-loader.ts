/**
 * Copyright 2018 Google LLC
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

import * as assert from 'assert';
import * as path from 'path';
import * as hook from 'require-in-the-middle';
import * as shimmer from 'shimmer';

import {PluginLoader, PluginLoaderState, PluginWrapper} from '../src/trace-plugin-loader';

import {TestLogger} from './logger';

export interface SimplePluginLoaderConfig {
  // An object which contains paths to files that should be loaded as plugins
  // upon loading a module with a given name.
  plugins: {[pluginName: string]: string};
}

const SEARCH_PATH = `${__dirname}/fixtures/loader/node_modules`;
const PROCESS_VERSION = process.version.slice(1);

const clearRequireCache = () => {
  Object.keys(require.cache).forEach(key => delete require.cache[key]);
};

describe('Trace Plugin Loader', () => {
  let logger: TestLogger;
  const makePluginLoader = (config: SimplePluginLoaderConfig) => {
    return new PluginLoader(
        logger,
        Object.assign(
            {
              samplingRate: 0,
              ignoreUrls: [],
              enhancedDatabaseReporting: false,
              ignoreContextHeader: false,
              projectId: '0'
            },
            config));
  };

  before(() => {
    module.paths.push(SEARCH_PATH);
    PluginLoader.setPluginSearchPathForTestingOnly(SEARCH_PATH);
    logger = new TestLogger();
  });

  afterEach(() => {
    logger.clearLogs();
    clearRequireCache();
  });

  describe('interface', () => {
    describe('state', () => {
      it('returns NO_HOOK when first called', () => {
        const pluginLoader = makePluginLoader({plugins: {}});
        assert.strictEqual(pluginLoader.state, PluginLoaderState.NO_HOOK);
      });
    });

    describe('activate', () => {
      it('transitions from NO_HOOK to ACTIVATED, enabling require hook', () => {
        let requireHookCalled = false;
        const pluginLoader = makePluginLoader({plugins: {}});
        // TODO(kjin): Stop using index properties.
        pluginLoader['enableRequireHook'] = () => requireHookCalled = true;
        pluginLoader.activate();

        assert.strictEqual(pluginLoader.state, PluginLoaderState.ACTIVATED);
        assert.ok(requireHookCalled);
      });

      it('throws if internal state is already ACTIVATED', () => {
        let requireHookCalled = false;
        const pluginLoader = makePluginLoader({plugins: {}}).activate();
        assert.strictEqual(pluginLoader.state, PluginLoaderState.ACTIVATED);
        // TODO(kjin): Stop using index properties.
        pluginLoader['enableRequireHook'] = () => requireHookCalled = true;

        assert.throws(() => pluginLoader.activate());
        assert.ok(!requireHookCalled);
      });

      it('throws if internal state is DEACTIVATED', () => {
        // There is currently no reason to transition back and forth.
        // This behavior may change in the future.
        let requireHookCalled = false;
        const pluginLoader =
            makePluginLoader({plugins: {}}).activate().deactivate();
        assert.strictEqual(pluginLoader.state, PluginLoaderState.DEACTIVATED);
        // TODO(kjin): Stop using index properties.
        pluginLoader['enableRequireHook'] = () => requireHookCalled = true;

        assert.throws(() => pluginLoader.activate());
        assert.ok(!requireHookCalled);
      });
    });

    describe('deactivate', () => {
      class TestPluginWrapper implements PluginWrapper {
        unapplyCalled = false;
        isSupported(version: string): boolean {
          return false;
        }
        unapplyAll(): void {
          this.unapplyCalled = true;
        }
        applyPlugin<T>(moduleExports: T, file: string, version: string): T {
          return moduleExports;
        }
      }

      it('transitions state from ACTIVATED to DEACTIVATED, unapplying plugins',
         () => {
           const pluginLoader = makePluginLoader({plugins: {}}).activate();
           assert.strictEqual(pluginLoader.state, PluginLoaderState.ACTIVATED);
           const plugin = new TestPluginWrapper();
           // TODO(kjin): Stop using index properties.
           pluginLoader['pluginMap'].set('foo', plugin);
           pluginLoader.deactivate();

           assert.strictEqual(
               pluginLoader.state, PluginLoaderState.DEACTIVATED);
           assert.ok(plugin.unapplyCalled);
         });

      it('throws when internal state is not ACTIVATED', () => {
        const pluginLoader = makePluginLoader({plugins: {}});
        assert.strictEqual(pluginLoader.state, PluginLoaderState.NO_HOOK);
        const plugin = new TestPluginWrapper();
        // TODO(kjin): Stop using index properties.
        pluginLoader['pluginMap'].set('foo', plugin);

        assert.throws(() => pluginLoader.deactivate());
        assert.ok(!plugin.unapplyCalled);

        pluginLoader.activate().deactivate();
        assert.strictEqual(pluginLoader.state, PluginLoaderState.DEACTIVATED);

        plugin.unapplyCalled = false;
        assert.throws(() => pluginLoader.deactivate());
        assert.ok(!plugin.unapplyCalled);
      });
    });
  });

  describe('static interface', () => {
    describe('parseModuleString', () => {
      it('parses module strings', () => {
        const p = PluginLoader.parseModuleString;
        const sep = path.sep;
        assert.deepStrictEqual(p('m'), {name: 'm', file: ''});
        assert.deepStrictEqual(p('m/f'), {name: 'm', file: 'f'});
        assert.deepStrictEqual(p('m/d/f'), {name: 'm', file: 'd/f'});
        assert.deepStrictEqual(p(`m\\d\\f`), {name: 'm', file: 'd/f'});
        assert.deepStrictEqual(p(`@o\\m\\d\\f`), {name: '@o/m', file: 'd/f'});
        assert.deepStrictEqual(p('@o/m/d/f'), {name: '@o/m', file: 'd/f'});
        assert.deepStrictEqual(p('@o/m/d/f'), {name: '@o/m', file: 'd/f'});
      });
    });
  });

  describe('patching behavior', () => {
    it('[sanity check]', () => {
      // Ensure that module fixtures contain values that we expect.
      assert.strictEqual(require('small-number').value, 0);
      assert.strictEqual(require('large-number'), 1e100);
      assert.strictEqual(
          require('new-keyboard'),
          'The QUICK BROWN FOX jumps over the LAZY DOG');
      assert.strictEqual(require('my-version-1.0'), '1.0.0');
      assert.strictEqual(require('my-version-1.0-pre'), '1.0.0-pre');
      assert.strictEqual(require('my-version-1.1'), '1.1.0');
      assert.strictEqual(require('my-version-2.0'), '2.0.0');
    });

    it(`doesn't patch before activation`, () => {
      makePluginLoader({plugins: {'small-number': 'plugin-small-number'}});
      assert.strictEqual(require('small-number').value, 0);
    });

    it(`doesn't patch modules for which plugins aren't specified`, () => {
      makePluginLoader({plugins: {}}).activate();
      assert.strictEqual(require('small-number').value, 0);
    });

    it('patches modules when activated, with no plugin file field specifying the main file',
       () => {
         makePluginLoader({
           plugins: {'small-number': 'plugin-small-number'}
         }).activate();
         assert.strictEqual(require('small-number').value, 1);
         // Make sure requiring doesn't patch twice
         assert.strictEqual(require('small-number').value, 1);
         assert.strictEqual(
             logger.getNumLogsWith('info', '[small-number@0.0.1]'), 1);
       });

    it('accepts absolute paths in configuration', () => {
      makePluginLoader({
        plugins: {'small-number': `${SEARCH_PATH}/plugin-small-number`}
      }).activate();
      assert.strictEqual(require('small-number').value, 1);
      assert.strictEqual(
          logger.getNumLogsWith('info', '[small-number@0.0.1]'), 1);
    });

    it('unpatches modules when deactivated', () => {
      const loader = makePluginLoader({
                       plugins: {'small-number': 'plugin-small-number'}
                     }).activate();
      require('small-number');
      loader.deactivate();
      assert.strictEqual(require('small-number').value, 0);
      // One each for activate/deactivate
      assert.strictEqual(
          logger.getNumLogsWith('info', '[small-number@0.0.1]'), 2);
    });

    it('intercepts and patches internal files', () => {
      makePluginLoader({
        plugins: {'large-number': 'plugin-large-number'}
      }).activate();
      assert.strictEqual(require('large-number'), 2e100);
    });

    ['http', 'url', '[core]'].forEach(key => {
      it(`intercepts and patches core modules with key "${key}"`, () => {
        const loader =
            makePluginLoader({plugins: {[key]: 'plugin-core'}}).activate();
        const input = {protocol: 'http:', host: 'hi'};
        assert.strictEqual(require('url').format(input), 'patched-value');
        loader.deactivate();
        assert.strictEqual(require('url').format(input), 'http://hi');
        // One each for activate/deactivate
        assert.strictEqual(
            logger.getNumLogsWith('info', `[${key}@${PROCESS_VERSION}:url]`),
            2);
      });
    });

    it('intercepts and patches files with circular dependencies', () => {
      makePluginLoader({
        plugins: {'new-keyboard': 'plugin-new-keyboard'}
      }).activate();
      assert.strictEqual(
          require('new-keyboard'),
          'The lab-grown ketchup Fox jumps over the chili Dog');
    });

    it(`doesn't load plugins with falsey paths`, () => {
      makePluginLoader({plugins: {'small-number': ''}}).activate();
      assert.strictEqual(require('small-number').value, 0);
    });

    it('uses version ranges to determine how to patch internals', () => {
      makePluginLoader({
        plugins: {'my-version': 'plugin-my-version-1'}
      }).activate();
      assert.strictEqual(require('my-version-1.0'), '1.0.0-patched');
      // v1.1 has different internals.
      assert.strictEqual(require('my-version-1.1'), '1.1.0-patched');
      assert.strictEqual(require('my-version-2.0'), '2.0.0');
      // warns for my-version-2.0 that nothing matches
      assert.strictEqual(
          logger.getNumLogsWith('warn', '[my-version@2.0.0]'), 1);
    });

    it('patches pre-releases, but warns', () => {
      makePluginLoader({
        plugins: {'my-version': 'plugin-my-version-1'}
      }).activate();
      assert.strictEqual(require('my-version-1.0-pre'), '1.0.0-pre-patched');
      assert.strictEqual(
          logger.getNumLogsWith('warn', '[my-version@1.0.0-pre]'), 1);
    });

    it('throws when the plugin throws', () => {
      makePluginLoader({
        plugins: {'my-version': 'plugin-my-version-2'}
      }).activate();
      let threw = false;
      try {
        require('my-version-1.0');
      } catch (e) {
        threw = true;
      }
      assert.ok(threw);
    });

    it('warns when a module is patched by a non-conformant plugin', () => {
      makePluginLoader({plugins: {'[core]': 'plugin-core'}}).activate();
      // Reasons for possible warnings issued are listed as comments.
      require('crypto');  // neither patch nor intercept
      require('os');      // both patch and intercept
      require('dns');     // two Patch objects for a single file
      // Do not warn when there is no patch/intercept function.
      assert.strictEqual(
          logger.getNumLogsWith('warn', `[[core]@${PROCESS_VERSION}:crypto]`),
          0);
      assert.strictEqual(
          logger.getNumLogsWith('warn', `[[core]@${PROCESS_VERSION}:os]`), 1);
      assert.strictEqual(
          logger.getNumLogsWith('warn', `[[core]@${PROCESS_VERSION}:dns]`), 1);
    });
  });
});
