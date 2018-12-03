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
  describe('URL Filtering', () => {
    it('should not allow filtered urls', () => {
      const policy = new TracePolicy({
        samplingRate: 0,
        ignoreUrls: ['/_ah/health', /\/book*/],
        ignoreMethods: []
      });
      assert.ok(
          !policy.shouldTrace({timestamp: 0, url: '/_ah/health', method: ''}));
      assert.ok(
          !policy.shouldTrace({timestamp: 0, url: '/book/test', method: ''}));
    });

    it('should allow non-filtered urls', () => {
      const policy = new TracePolicy(
          {samplingRate: 0, ignoreUrls: ['/_ah/health'], ignoreMethods: []});
      assert.ok(policy.shouldTrace(
          {timestamp: 0, url: '/_ah/background', method: ''}));
    });
  });

  describe('Method Filtering', () => {
    it('should not allow filtered methods', () => {
      const policy = new TracePolicy({
        samplingRate: 0,
        ignoreUrls: [],
        ignoreMethods: ['method1', 'method2']
      });
      assert.ok(
          !policy.shouldTrace({timestamp: 0, url: '', method: 'method1'}));
      assert.ok(
          !policy.shouldTrace({timestamp: 0, url: '', method: 'method2'}));
    });

    it('should allow non-filtered methods', () => {
      const policy = new TracePolicy(
          {samplingRate: 0, ignoreUrls: [], ignoreMethods: ['method']});
      assert.ok(policy.shouldTrace({timestamp: 0, url: '', method: 'method1'}));
    });
  });

  describe('Sampling', () => {
    const NUM_SECONDS = 10;
    const testCases = [0.1, 0.5, 1, 10, 50, 150, 200, 500, 1000];
    for (const testCase of testCases) {
      it(`should throttle traces when samplingRate = ` + testCase, () => {
        const policy = new TracePolicy(
            {samplingRate: testCase, ignoreUrls: [], ignoreMethods: []});
        const expected = NUM_SECONDS * testCase;
        let actual = 0;
        const start = Date.now();
        for (let timestamp = start; timestamp < start + 1000 * NUM_SECONDS;
             timestamp++) {
          if (policy.shouldTrace({timestamp, url: '', method: ''})) {
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
      const policy =
          new TracePolicy({samplingRate: 0, ignoreUrls: [], ignoreMethods: []});
      let numSamples = 0;
      const start = Date.now();
      for (let timestamp = start; timestamp < start + 1000; timestamp++) {
        if (policy.shouldTrace({timestamp, url: '', method: ''})) {
          numSamples++;
        }
      }
      assert.strictEqual(numSamples, 1000);
    });

    it('should never sample when samplingRate < 0', () => {
      const policy = new TracePolicy(
          {samplingRate: -1, ignoreUrls: [], ignoreMethods: []});
      let numSamples = 0;
      const start = Date.now();
      for (let timestamp = start; timestamp < start + 1000; timestamp++) {
        if (policy.shouldTrace({timestamp, url: '', method: ''})) {
          numSamples++;
        }
      }
      assert.strictEqual(numSamples, 0);
    });
  });
});
