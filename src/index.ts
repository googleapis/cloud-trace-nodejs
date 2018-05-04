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

const filesLoadedBeforeTrace = Object.keys(require.cache);

// This file's top-level imports must not transitively depend on modules that
// do I/O, or continuation-local-storage will not work.
import * as semver from 'semver';
import {Config} from './config';
import * as path from 'path';
import * as PluginTypes from './plugin-types';
import {tracing, Tracing} from './tracing';
import {Singleton} from './util';

export {Config, PluginTypes};

let tracingSingleton: typeof tracing;

/**
 * Start the Stackdriver Trace Agent with the given configuration (if provided).
 * This function should only be called once, and before any other modules are
 * loaded.
 * @param config A configuration object.
 * @returns An object exposing functions for creating custom spans.
 *
 * @resource [Introductory video]{@link
 * https://www.youtube.com/watch?v=NCFDqeo7AeY}
 *
 * @example
 * trace.start();
 */
export function start(config?: Config): PluginTypes.TraceAgent {
  // Determine the preferred context propagation mechanism, as
  // continuation-local-storage should be loaded before any modules that do I/O.
  const ahAvailable = semver.satisfies(process.version, '>=8') &&
      process.env.GCLOUD_TRACE_NEW_CONTEXT;
  const agentEnabled = !config || config.enabled !== false;
  const alAutoPreferred =
      !ahAvailable && (!config || config.clsMechanism === 'auto');
  const alUserPreferred = config && (config.clsMechanism === 'async-listener');
  if (agentEnabled && (alAutoPreferred || alUserPreferred)) {
    // This is the earliest we can load continuation-local-storage.
    require('continuation-local-storage');
  }
  if (!tracingSingleton) {
    tracingSingleton = require('./tracing').tracing;
  }

  try {
    let tracing: Tracing;
    try {
      tracing = tracingSingleton.create(config || {}, {});
    } catch (e) {
      // An error could be thrown if create() is called multiple times.
      // It's not a helpful error message for the end user, so make it more
      // useful here.
      throw new Error('Cannot call start on an already created agent.');
    }
    tracing.enable();
    tracing.logModulesLoadedBeforeTrace(filesLoadedBeforeTrace);
    return tracingSingleton.get().traceAgent;
  } catch (e) {
    throw e;
  } finally {
    // Stop storing these entries in memory
    filesLoadedBeforeTrace.length = 0;
  }
}

/**
 * Get the previously created TraceAgent object.
 * @returns An object exposing functions for creating custom spans.
 */
export function get(): PluginTypes.TraceAgent {
  if (!tracingSingleton) {
    tracingSingleton = require('./tracing').tracing;
  }
  if (tracingSingleton.exists()) {
    return tracingSingleton.get().traceAgent;
  } else {
    // This code path maintains the current contract that calling get() before
    // start() yields a disabled custom span API. It assumes that the use case
    // for doing so (instead of returning null) is when get() is called in
    // a file where it is unknown whether start() has been called.

    // Based on this assumption, and because we document that start() must be
    // called first in an application, it's OK to create a permanently disabled
    // Trace Agent here and assume that start() will never be called to enable
    // it.
    return tracingSingleton.create({enabled: false}, {}).traceAgent;
  }
}

// If the module was --require'd from the command line, start the agent.
if (module.parent && module.parent.id === 'internal/preload') {
  start();
}
