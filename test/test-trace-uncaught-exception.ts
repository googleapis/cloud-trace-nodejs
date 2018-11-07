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

import * as assert from 'assert';

import {Logger} from '../src/logger';
import {Trace} from '../src/trace';
import {TraceWriterConfig} from '../src/trace-writer';

import {TestLogger} from './logger';
import * as trace from './trace';

/**
 * Removes all global uncaught exception listeners, returning a function that,
 * when run, undoes this removal.
 */
function removeAllUncaughtExceptionListeners() {
  const listeners = process.listeners('uncaughtException');
  process.removeAllListeners('uncaughtException');
  return () => {
    listeners.forEach(
        listener => process.addListener('uncaughtException', listener));
  };
}

describe('Trace Writer', () => {
  const autoQueuedTrace = {traceId: '0', spans: [], projectId: '0'};
  let capturedPublishedTraces: string;
  let capturedLogger: CaptureInstanceTestLogger;

  class CaptureInstanceTestLogger extends TestLogger {
    constructor() {
      super();
      capturedLogger = this;
    }
  }

  class CapturePublishedTracesTestTraceWriter extends trace.TestTraceWriter {
    constructor(config: TraceWriterConfig, logger: Logger) {
      super(config, logger);
      // Don't run the risk of auto-flushing
      this.getConfig().bufferSize = Infinity;
      this.writeTrace(autoQueuedTrace);
    }

    writeTrace(trace: Trace) {
      super.writeTrace(trace);
      // Since flushBuffer doesn't call publish unless a trace is buffered,
      // do that as well
      this.buffer.push(JSON.stringify(trace));
    }

    protected publish(json: string) {
      capturedPublishedTraces = json;
    }
  }

  before(() => {
    trace.setTraceWriterForTest(CapturePublishedTracesTestTraceWriter);
    trace.setLoggerForTest(CaptureInstanceTestLogger);
  });

  after(() => {
    trace.setTraceWriterForTest(trace.TestTraceWriter);
    trace.setLoggerForTest(TestLogger);
  });

  it(`should publish on unhandled exception for 'flush' config option`,
     (done) => {
       const restoreOriginalUncaughtExceptionListeners =
           removeAllUncaughtExceptionListeners();
       trace.start({onUncaughtException: 'flush', projectId: '0'});
       setImmediate(() => {
         setImmediate(() => {
           removeAllUncaughtExceptionListeners();
           restoreOriginalUncaughtExceptionListeners();
           assert.strictEqual(
               capturedPublishedTraces,
               JSON.stringify({traces: [autoQueuedTrace]}));
           done();
         });
         throw new Error();
       });
     });

  it(`should not assign an oUE listener for 'ignore' config option`, () => {
    const restoreOriginalUncaughtExceptionListeners =
        removeAllUncaughtExceptionListeners();
    trace.start({onUncaughtException: 'ignore'});
    assert.strictEqual(process.listenerCount('onHandledException'), 0);
    restoreOriginalUncaughtExceptionListeners();
  });

  it('should log and disable on invalid config values', () => {
    trace.start({onUncaughtException: 'invalidValue'});
    assert.ok(capturedLogger);
    assert.strictEqual(
        capturedLogger.getNumLogsWith('error', 'Disabling the Trace Agent'), 1);
  });
});
