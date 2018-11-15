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

import {TracePolicy} from '../src/tracing-policy';

describe('TracePolicy', () => {
  const createMergeWith = <T>(baseObject: T) => <U>(additionalObject: U) =>
      Object.assign({}, baseObject, additionalObject) as T & U;
  const mergeWithBaseConfig =
      createMergeWith({samplingRate: 0, ignoreMethods: [], ignoreUrls: []});
  const mergeWithBaseParams =
      createMergeWith({timestamp: 0, method: 'GET', url: '/'});

  describe('URL Filtering', () => {
    it('should not allow filtered urls', () => {
      const policy = new TracePolicy(
          mergeWithBaseConfig({ignoreUrls: ['/_ah/health', /\/book*/]}));
      assert.ok(!policy.shouldTrace(mergeWithBaseParams({url: '/_ah/health'})));
      assert.ok(!policy.shouldTrace(mergeWithBaseParams({url: '/book/test'})));
    });

    it('should allow non-filtered urls', () => {
      const policy =
          new TracePolicy(mergeWithBaseConfig({ignoreUrls: ['/_ah/health']}));
      assert.ok(
          policy.shouldTrace(mergeWithBaseParams({url: '/_ah/background'})));
    });
  });

  describe('Method Filtering', () => {
    it('should not allow filtered methods', () => {
      // We ignore case.
      const policy =
          new TracePolicy(mergeWithBaseConfig({ignoreMethods: ['GeT']}));
      assert.ok(!policy.shouldTrace(mergeWithBaseParams({method: 'get'})));
      assert.ok(!policy.shouldTrace(mergeWithBaseParams({method: 'Get'})));
    });

    it('should allow non-filtered methods', () => {
      const policy =
          new TracePolicy(mergeWithBaseConfig({ignoreMethods: ['options']}));
      assert.ok(policy.shouldTrace(mergeWithBaseParams({method: 'get'})));
    });
  });

  describe('Sampling', () => {
    const NUM_SECONDS = 10;
    const testCases = [0.1, 0.5, 1, 10, 50, 150, 200, 500, 1000];
    for (const testCase of testCases) {
      it(`should throttle traces when samplingRate = ` + testCase, () => {
        const policy =
            new TracePolicy(mergeWithBaseConfig({samplingRate: testCase}));
        const expected = NUM_SECONDS * testCase;
        let actual = 0;
        const start = Date.now();
        for (let timestamp = start; timestamp < start + 1000 * NUM_SECONDS;
             timestamp++) {
          if (policy.shouldTrace(mergeWithBaseParams({timestamp}))) {
            actual++;
          }
        }
        assert.ok(
            actual <= expected,
            `Expected less than ${expected} traced but got ${actual}`);
        assert.ok(
            actual > expected * 0.8,
            `Expected close to (>=0.8*) ${expected} traced but got ${actual}`);
      });
    }

    it('should always sample when samplingRate = 0', () => {
      const policy = new TracePolicy(mergeWithBaseConfig({samplingRate: 0}));
      let numSamples = 0;
      const start = Date.now();
      for (let timestamp = start; timestamp < start + 1000; timestamp++) {
        if (policy.shouldTrace(mergeWithBaseParams({timestamp}))) {
          numSamples++;
        }
      }
      assert.strictEqual(numSamples, 1000);
    });

    it('should never sample when samplingRate < 0', () => {
      const policy = new TracePolicy(mergeWithBaseConfig({samplingRate: -1}));
      let numSamples = 0;
      const start = Date.now();
      for (let timestamp = start; timestamp < start + 1000; timestamp++) {
        if (policy.shouldTrace(mergeWithBaseParams({timestamp}))) {
          numSamples++;
        }
      }
      assert.strictEqual(numSamples, 0);
    });
  });
});
