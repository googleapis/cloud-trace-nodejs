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

/**
 * google-gax exports createApiCall, a transform on a function that accepts an
 * argument and callback (representing arbitrary asynchronous work), as well as
 * metadata and call options (details specific to gRPC). Internally, it does the
 * necessary work to generate metadata and call options for each call to this
 * function, as well as scheduling retries, etc. so that the caller doesn't
 * have to be concerned with these details. The returned, transformed function
 * has a different call signature as a result.
 *
 * There is a caveat to the above -- the input is not the pre-transformed
 * function itself, but rather a *Promise* that will resolve to that function.
 *
 * Because every call of the transformed function must defer the actual
 * asynchronous work until the above mentioned Promise has been resolved,
 * createApiCall presents a possible source of context loss. The test in this
 * file ensures that spans corresponding to that asynchronous work and spans
 * created in its callback are created with the correct root span context, which
 * is the context in which the transformed function is called, *not* the context
 * in which createApiCall was called.
 */

import * as assert from 'assert';

import * as testTraceModule from '../trace';
import {describeInterop} from '../utils';

interface ApiCallSettings {
  merge: () => {
    otherArgs: {}
  };
}
type Callback<T> = (err: Error|null, res?: T) => void;
type InnerApiCall<I, O> =
    (request: I, metadata: {}, options: {}, callback: Callback<O>) => void;
type OuterApiCall<I, O> =
    (request: I, options: {timeout: number}, callback: Callback<O>) => void;
type GaxModule = {
  createApiCall: <I, O>(
      funcWithAuth: Promise<InnerApiCall<I, O>>, settings: ApiCallSettings) =>
      OuterApiCall<I, O>;
};

describeInterop<GaxModule>('google-gax', fixture => {
  let googleGax: GaxModule;

  before(() => {
    testTraceModule.setCLSForTest();
    testTraceModule.setPluginLoaderForTest();
    testTraceModule.start();
    googleGax = fixture.require();
  });

  after(() => {
    testTraceModule.setCLSForTest(testTraceModule.TestCLS);
    testTraceModule.setPluginLoaderForTest(testTraceModule.TestPluginLoader);
  });

  it(`doesn't break context`, (done) => {
    const authPromise = Promise.resolve(
        ((args, metadata, opts, cb) => {
          // Simulate an RPC.
          testTraceModule.get().createChildSpan({name: 'in-request'}).endSpan();
          setImmediate(() => cb(null, {}));
        }) as InnerApiCall<{}, {}>);
    const apiCall =
        googleGax.createApiCall(authPromise, {merge: () => ({otherArgs: {}})});

    testTraceModule.get().runInRootSpan({name: 'root'}, (root) => {
      apiCall({}, {timeout: 20}, (err) => {
        assert.ifError(err);
        testTraceModule.get().createChildSpan({name: 'in-callback'}).endSpan();
        root.endSpan();

        // Both children should be nested under the root span where the API call
        // was made, instead of inheriting the (non-existent) context where
        // createApiCall was called.
        const correctTrace = testTraceModule.getOneTrace(
            t => t.spans.some(span => span.name === 'root'));
        assert.strictEqual(correctTrace.spans.length, 3);
        done();
      });
    });
  });
});
