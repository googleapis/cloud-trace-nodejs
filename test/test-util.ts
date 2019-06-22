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
import {inspect} from 'util';

import {Constants} from '../src/constants';
import {Logger} from '../src/logger';
import * as util from '../src/util';

import {TestLogger} from './logger';

const notNull = <T>(x: T | null | undefined): T => {
  assert.notStrictEqual(x, null);
  assert.notStrictEqual(x, undefined);
  return x as T;
};

describe('Singleton', () => {
  const logger = new TestLogger();
  class MyClass {
    constructor(public config: {}, public logger: Logger) {}
  }

  describe('create', () => {
    it('creates an instance of the given class', () => {
      const createResult = new util.Singleton(MyClass).create({}, logger);
      assert.ok(createResult instanceof MyClass);
    });

    it('passes arguments to the underlying constructor', () => {
      const config = {};
      const createResult = new util.Singleton(MyClass).create(config, logger);
      assert.strictEqual(createResult.logger, logger);
      assert.strictEqual(createResult.config, config);
    });

    it('throws when used more than once, by default', () => {
      const singleton = new util.Singleton(MyClass);
      singleton.create({}, logger);
      assert.throws(() => singleton.create({}, logger));
    });

    it('creates a new instance when [FORCE_NEW] is true in the config', () => {
      const singleton = new util.Singleton(MyClass);
      const createResult1 = singleton.create({}, logger);
      const createResult2 = singleton.create({[util.FORCE_NEW]: true}, logger);
      assert.notStrictEqual(createResult1, createResult2);
    });
  });

  describe('get', () => {
    it('throws if create was not called first', () => {
      assert.throws(() => new util.Singleton(MyClass).get());
    });

    it('returns the same value returned by create function', () => {
      const singleton = new util.Singleton(MyClass);
      const createResult = singleton.create({}, logger);
      const getResult = singleton.get();
      assert.strictEqual(getResult, createResult);
    });

    it('does not return a stale value', () => {
      const singleton = new util.Singleton(MyClass);
      singleton.create({}, logger);
      const createResult = singleton.create({[util.FORCE_NEW]: true}, logger);
      const getResult = singleton.get();
      assert.strictEqual(getResult, createResult);
    });
  });
});

describe('util.lastOf', () => {
  it('should return the last non-null/undefined/NaN parameter', () => {
    const {lastOf} = util;
    assert.strictEqual(lastOf<number>(1), 1);
    assert.strictEqual(lastOf<number>(1, 2, null), 2);
    assert.strictEqual(lastOf<number>(1, null, 2), 2);
    assert.strictEqual(lastOf<number>(1, 2, undefined), 2);
    assert.strictEqual(lastOf<number>(1, 2, NaN), 2);
    assert.strictEqual(lastOf<number>(1, 2, null, undefined, NaN, -NaN), 2);
    assert.strictEqual(lastOf<number>(1, 0), 0);
    assert.strictEqual(lastOf<number | string>(1, ''), '');
  });
});

describe('util.truncate', () => {
  it('should truncate objects larger than size', () => {
    assert.strictEqual(util.truncate('abcdefghijklmno', 5), 'ab...');
  });

  it('should not truncate objects smaller than size', () => {
    assert.strictEqual(util.truncate('abcdefghijklmno', 50), 'abcdefghijklmno');
  });

  it('should handle unicode characters', () => {
    const longName = new Array(120).join('☃');
    assert.strictEqual(
      util.truncate(longName, Constants.TRACE_SERVICE_SPAN_NAME_LIMIT),
      `${new Array(42).join('☃')}...`
    );
  });
});

describe('util.parseContextFromHeader', () => {
  describe('valid inputs', () => {
    it('should return expected values: 123456/667;o=1', () => {
      const result = notNull(util.parseContextFromHeader('123456/667;o=1'));
      assert.strictEqual(result.traceId, '123456');
      assert.strictEqual(result.spanId, '667');
      assert.strictEqual(result.options, 1);
    });

    it(
      'should return expected values:' +
        '123456/123456123456123456123456123456123456;o=1',
      () => {
        const result = notNull(
          util.parseContextFromHeader(
            '123456/123456123456123456123456123456123456;o=1'
          )
        );
        assert.strictEqual(result.traceId, '123456');
        assert.strictEqual(
          result.spanId,
          '123456123456123456123456123456123456'
        );
        assert.strictEqual(result.options, 1);
      }
    );

    it('should return expected values: 123456/667', () => {
      const result = notNull(util.parseContextFromHeader('123456/667'));
      assert.strictEqual(result.traceId, '123456');
      assert.strictEqual(result.spanId, '667');
      assert.strictEqual(result.options, undefined);
    });
  });

  describe('invalid inputs', () => {
    const inputs = [
      '',
      null,
      undefined,
      '123456',
      '123456;o=1',
      'o=1;123456',
      '123;456;o=1',
      '123/o=1;456',
      '123/abc/o=1',
    ];
    inputs.forEach(s => {
      it(`should reject ${s}`, () => {
        // TS: Cast s as any rather than coerce it to a value
        // tslint:disable-next-line:no-any
        const result = util.parseContextFromHeader(s as any);
        assert.ok(!result);
      });
    });
  });
});

describe('util.generateTraceContext', () => {
  const inputs: util.TraceContext[] = [
    {traceId: '123456', spanId: '667', options: 1},
    {traceId: '123456', spanId: '667', options: undefined},
  ];

  inputs.forEach(s => {
    it(`returns well-formatted trace context for ${inspect(s)}`, () => {
      const context = util.generateTraceContext(s);
      const parsed = util.parseContextFromHeader(context);
      assert.deepStrictEqual(parsed, s);
    });
  });

  it('returns an empty string if passed a falsy value', () => {
    // tslint:disable-next-line:no-any
    const context = util.generateTraceContext(null as any);
    assert.strictEqual(context, '');
  });
});

describe('binary trace context', () => {
  const commonTraceId = 'ffeeddccbbaa99887766554433221100';
  const testCases: Array<{
    structured: util.TraceContext | null;
    binary: string;
    description: string;
  }> = [
    {
      structured: {
        traceId: commonTraceId,
        spanId: (0x111111111111).toString(),
        options: 1,
      },
      binary: `0000${commonTraceId}01${'0000111111111111'}02${'01'}`,
      description: 'trace context with 48-bit span ID',
    },
    {
      structured: {
        traceId: commonTraceId,
        spanId: '8603657889541918976',
        options: 1,
      },
      binary: `0000${commonTraceId}01${'7766554433221100'}02${'01'}`,
      description: 'trace context with 64-bit span ID',
    },
    {
      structured: {traceId: commonTraceId, spanId: '1', options: 255},
      binary: `0000${commonTraceId}01${'0000000000000001'}02${'ff'}`,
      description: 'trace context with 8-bit options',
    },
    {
      structured: {traceId: commonTraceId, spanId: '1'},
      binary: `0000${commonTraceId}01${'0000000000000001'}02${'00'}`,
      description: 'trace context with no options',
    },
    {
      structured: null,
      binary: '00',
      description: 'incomplete binary trace context (by returning null)',
    },
    {
      structured: null,
      binary: '0'.repeat(58),
      description: 'bad binary trace context (by returning null)',
    },
  ];

  describe('util.serializeTraceContext', () => {
    testCases.forEach(
      testCase =>
        testCase.structured &&
        it(`should serialize ${testCase.description}`, () => {
          assert.deepStrictEqual(
            util.serializeTraceContext(testCase.structured!).toString('hex'),
            testCase.binary
          );
        })
    );
  });

  describe('util.deserializeTraceContext', () => {
    testCases.forEach(testCase =>
      it(`should deserialize ${testCase.description}`, () => {
        assert.deepStrictEqual(
          util.deserializeTraceContext(Buffer.from(testCase.binary, 'hex')),
          testCase.structured &&
            Object.assign({options: 0}, testCase.structured)
        );
      })
    );
  });
});
