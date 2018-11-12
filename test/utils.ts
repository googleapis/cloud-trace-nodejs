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

// TODO(kjin): This file should supercede plugins/common.ts.

import * as assert from 'assert';
import * as semver from 'semver';

import {SpanType} from '../src/constants';
import {Span} from '../src/plugin-types';
import {ChildSpanData, RootSpanData} from '../src/span-data';
import {TraceSpan} from '../src/trace';

/**
 * Constants
 */

// The duration to give a span when it's important
export const DEFAULT_SPAN_DURATION = 200;
// The acceptable window of variation in span duration
export const ASSERT_SPAN_TIME_TOLERANCE_MS = 40;

/**
 * Helper Functions
 */

export function isServerSpan(span: TraceSpan) {
  return span.kind === 'RPC_SERVER' && !span.name.startsWith('outer');
}

// Convenience function that, when awaited, stalls for a given duration of time
export function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Assert that the given span's duration is within the given range.
export function assertSpanDuration(span: TraceSpan, bounds: [number, number]) {
  const spanDuration = Date.parse(span.endTime) - Date.parse(span.startTime);
  assert.ok(
      spanDuration >= bounds[0] && spanDuration <= bounds[1],
      `Span duration of ${
          spanDuration} ms is not in the acceptable expected range of [${
          bounds[0]}, ${bounds[1]}] ms`);
}

export function asRootSpanData(arg: Span): RootSpanData {
  assert.strictEqual(arg.type, SpanType.ROOT);
  return arg as RootSpanData;
}

export function asChildSpanData(arg: Span): ChildSpanData {
  assert.strictEqual(arg.type, SpanType.CHILD);
  return arg as ChildSpanData;
}

export function plan(done: MochaDone, num: number): MochaDone {
  return (err?: Error) => {
    if (err) {
      num = 0;
      setImmediate(done, err);
    } else {
      num--;
      if (num === 0) {
        setImmediate(done);
      } else if (num < 0) {
        throw new Error('done called too many times');
      }
    }
  };
}

/**
 * A type that describes the shape of ./fixtures/plugin-fixtures.json, which
 * contains the data used by `npm run init-test-fixtures` to create all module
 * fixtures for testing.
 */
type PluginFixtures = {
  /**
   * Each fixture (module, version) is represented as an entry here. The
   * structure of the value is a rough subset of package.json, with extra fields
   * denoted by leading underscores.
   */
  [fixture: string]: {
    dependencies: {[moduleName: string]: string;};
    engines?: {node?: string;};
    /**
     * If there are multiple top-level dependencies, specifies which one is the
     * "main" one
     */
    _mainModule?: string;
  }
};

/**
 * An object containing helpful information and functions for a fixture.
 */
type FixtureHelper<T> = {
  /** The module version encapsulated by the fixture. */
  version: string;
  /** When called, loads the fixture. */
  require: () => T;
  /**
   * Returns it.skip if the selected module's version is in the version range
   * given; returns it otherwise.
   */
  skip: (it: Mocha.TestFunction, versionRange: string) =>
      Mocha.PendingTestFunction;
};

/**
 * Given a module name, return a list of objects that are useful for importing
 * test fixtures for that module.
 * @param moduleName The module name to look up.
 */
function getFixturesForModule<T>(moduleName: string): Array<FixtureHelper<T>> {
  const pluginFixtures: PluginFixtures = require('./fixtures/plugin-fixtures');
  const keys = Object.keys(pluginFixtures);
  return keys
      .filter(key => {
        const value = pluginFixtures[key];
        let mainModule: string;
        if (value._mainModule) {
          mainModule = value._mainModule;
        } else {
          const dependencies = Object.keys(value.dependencies);
          if (dependencies.length === 0) {
            // No main module?
            return;
          }
          mainModule = dependencies[0];
        }
        const moduleNameMatches = mainModule === moduleName;
        const versionCompatible = !value.engines || !value.engines.node ||
            semver.satisfies(process.version, value.engines.node);
        return moduleNameMatches && versionCompatible;
      })
      .map(key => {
        const version = require(`./plugins/fixtures/${key}/node_modules/${
                                    moduleName}/package.json`)
                            .version;
        const getModule: () => T = () => require(`./plugins/fixtures/${key}`);
        // Convenience function -- returns if.skip if the selected module's
        // version is in the version range given.
        const skip = (it: Mocha.TestFunction, versionRange: string) => {
          return semver.satisfies(version, versionRange) ? it.skip : it;
        };
        return {version, require: getModule, skip};
      });
}

/**
 * Given a module name, calls describe() on each fixture matching that module
 * name, with an appropriate description.
 * @param moduleName The module name.
 * @param describeFn A test suite to run.
 */
export function describeInterop<T>(
    moduleName: string, describeFn: (fixture: FixtureHelper<T>) => void): void {
  const fixtures = getFixturesForModule<T>(moduleName);
  for (const fixture of fixtures) {
    describe(
        `Trace Agent interop w/ ${moduleName}@${fixture.version}`,
        () => describeFn(fixture));
  }
}
