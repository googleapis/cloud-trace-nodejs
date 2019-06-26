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
import * as fs from 'fs';
import * as semver from 'semver';

import {cls} from '../src/cls';
import {OpenCensusPropagation} from '../src/config';
import {SpanType} from '../src/constants';
import {Span} from '../src/plugin-types';
import {ChildSpanData, RootSpanData} from '../src/span-data';
import {TraceSpan} from '../src/trace';
import {StackdriverTracerConfig} from '../src/trace-api';

/**
 * Constants
 */

// The duration to give a span when it's important
export const DEFAULT_SPAN_DURATION = 200;
// The acceptable window of variation in span duration
export const ASSERT_SPAN_TIME_TOLERANCE_MS = 5;

export const SERVER_KEY = fs.readFileSync(`${__dirname}/fixtures/key.pem`);
export const SERVER_CERT = fs.readFileSync(`${__dirname}/fixtures/cert.pem`);

/**
 * Misc. Implementations
 */
export class NoPropagation implements OpenCensusPropagation {
  extract() {
    return null;
  }
  inject() {}
}

/**
 * Helper Functions
 */

export function getBaseConfig(): StackdriverTracerConfig {
  return {
    enhancedDatabaseReporting: false,
    rootSpanNameOverride: (name: string) => name,
    spansPerTraceSoftLimit: Infinity,
    spansPerTraceHardLimit: Infinity,
  };
}

export function isServerSpan(span: TraceSpan) {
  return span.kind === 'RPC_SERVER' && !span.name.startsWith('outer');
}

// Convenience function that, when awaited, stalls for a given duration of time
export function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Get the given span's duration in MS.
export function getDuration(span: TraceSpan) {
  return Date.parse(span.endTime) - Date.parse(span.startTime);
}

// Assert that the given span's duration is within the given range.
export function assertSpanDuration(span: TraceSpan, bounds: [number, number?]) {
  const spanDuration = getDuration(span);
  const lowerBound = bounds[0];
  const upperBound = bounds[1] !== undefined ? bounds[1] : bounds[0];
  assert.ok(
    spanDuration >= lowerBound - ASSERT_SPAN_TIME_TOLERANCE_MS &&
      spanDuration <= upperBound + ASSERT_SPAN_TIME_TOLERANCE_MS,
    `Span duration of ${spanDuration} ms is not in the acceptable expected range of [${bounds[0]}, ${bounds[1]}] ms (w/ ${ASSERT_SPAN_TIME_TOLERANCE_MS} ms leniency)`
  );
}

export function asRootSpanData(arg: Span): RootSpanData {
  assert.strictEqual(arg.type, SpanType.ROOT);
  return arg as RootSpanData;
}

export function asChildSpanData(arg: Span): ChildSpanData {
  assert.strictEqual(arg.type, SpanType.CHILD);
  return arg as ChildSpanData;
}

export function hasContext() {
  return cls.get().getContext().type !== SpanType.UNCORRELATED;
}

export function plan(done: Mocha.Done, num: number): Mocha.Done {
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
interface PluginFixtures {
  /**
   * Each fixture (module, version) is represented as an entry here. The
   * structure of the value is a rough subset of package.json, with extra fields
   * denoted by leading underscores.
   */
  [fixture: string]: {
    dependencies: {[moduleName: string]: string};
    engines?: {node?: string};
    /**
     * If there are multiple top-level dependencies, specifies which one is the
     * "main" one
     */
    _mainModule?: string;
  };
}

/**
 * An object containing helpful information and functions for a fixture.
 */
interface FixtureHelper<T> {
  /** The module version encapsulated by the fixture. */
  version: string;
  /** The parsed module version. */
  parsedVersion: {major: number; minor: number; patch: number};
  /** When called, loads the fixture. */
  require: () => T;
  /**
   * Returns it.skip if the selected module's version is in the version range
   * given; returns it otherwise.
   */
  skip: (
    it: Mocha.TestFunction,
    versionRange: string
  ) => Mocha.PendingTestFunction;
}

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
      const versionCompatible =
        !value.engines ||
        !value.engines.node ||
        semver.satisfies(process.version, value.engines.node);
      return moduleNameMatches && versionCompatible;
    })
    .map(key => {
      const version = require(`./plugins/fixtures/${key}/node_modules/${moduleName}/package.json`)
        .version as string;
      const parsedVersion = semver.parse(version)!;
      const getModule: () => T = () => require(`./plugins/fixtures/${key}`);
      // Convenience function -- returns if.skip if the selected module's
      // version is in the version range given.
      const skip = (it: Mocha.TestFunction, versionRange: string) => {
        return semver.satisfies(version, versionRange) ? it.skip : it;
      };
      return {version, parsedVersion, require: getModule, skip};
    });
}

/**
 * Given a module name, calls describe() on each fixture matching that module
 * name, with an appropriate description.
 * @param moduleName The module name.
 * @param describeFn A test suite to run.
 */
export function describeInterop<T>(
  moduleName: string,
  describeFn: (fixture: FixtureHelper<T>) => void
): void {
  const fixtures = getFixturesForModule<T>(moduleName);
  for (const fixture of fixtures) {
    describe(`Trace Agent interop w/ ${moduleName}@${fixture.version}`, () =>
      describeFn(fixture));
  }
}
