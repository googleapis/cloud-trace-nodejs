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

'use strict';

import { Constants } from '../src/constants';
import * as util from '../src/util';
import { Logger } from '@google-cloud/common';

var assert = require('assert');
var common = require('./plugins/common'/*.js*/);
var inspect = require('util').inspect;
var Module = require('module');
var semver = require('semver');
var path = require('path');

function notNull<T>(arg: T|null): T {
  assert.ok(arg);
  return arg as T;
}

// TODO(kjin): Use TypeScript in the rest of this file. This is already done
// in PR #686.
describe('Singleton', () => {
  // A real test logger class is also introduced as part of #686.
  const logger = {} as any as Logger;
  class MyClass {
    constructor(public logger: Logger, public config: {}) {}
  }

  describe('create', () => {
    it('creates an instance of the given class', () => {
      const createResult = new util.Singleton(MyClass).create(logger, {});
      assert.ok(createResult instanceof MyClass);
    });

    it('passes arguments to the underlying constructor', () => {
      const config = {};
      const createResult = new util.Singleton(MyClass).create(logger, config);
      assert.strictEqual(createResult.logger, logger);
      assert.strictEqual(createResult.config, config);
    });

    it('throws when used more than once, by default', () => {
      const singleton = new util.Singleton(MyClass);
      singleton.create(logger, {});
      assert.throws(() => singleton.create(logger, {}));
    });

    it('creates a new instance when forceNewAgent_ is true in the config', () => {
      const singleton = new util.Singleton(MyClass);
      const createResult1 = singleton.create(logger, {});
      const createResult2 = singleton.create(logger, { forceNewAgent_: true });
      assert.notStrictEqual(createResult1, createResult2);
    });
  });

  describe('get', () => {
    it('throws if create was not called first', () => {
      assert.throws(() => new util.Singleton(MyClass).get());
    });

    it('returns the same value returned by create function', () => {
      const singleton = new util.Singleton(MyClass);
      const createResult = singleton.create(logger, {});
      const getResult = singleton.get();
      assert.strictEqual(getResult, createResult);
    });

    it('does not return a stale value', () => {
      const singleton = new util.Singleton(MyClass);
      singleton.create(logger, {});
      const createResult = singleton.create(logger, { forceNewAgent_: true });
      const getResult = singleton.get();
      assert.strictEqual(getResult, createResult);
    });
  });
});

describe('util.truncate', function() {
  it('should truncate objects larger than size', function() {
    assert.strictEqual(util.truncate('abcdefghijklmno', 5), 'ab...');
  });

  it('should not truncate objects smaller than size', function() {
    assert.strictEqual(util.truncate('abcdefghijklmno', 50), 'abcdefghijklmno');
  });

  it('should handle unicode characters', function() {
    var longName = Array(120).join('☃');
    assert.strictEqual(util.truncate(longName, Constants.TRACE_SERVICE_SPAN_NAME_LIMIT),
      Array(42).join('☃') + '...');
  });
});

describe('util.packageNameFromPath', function() {
  it('should work for standard packages', function() {
    var p = path.join('.',
               'appengine-sails',
               'node_modules',
               'testmodule',
               'index.js');
    assert.equal(util.packageNameFromPath(p),
      'testmodule');
  });

  it('should work for namespaced packages', function() {
    var p = path.join('.',
               'appengine-sails',
               'node_modules',
               '@google',
               'cloud-trace',
               'index.js');
    assert.equal(util.packageNameFromPath(p),
      path.join('@google','cloud-trace'));
  });
});

describe('util.findModuleVersion', function() {
  it('should correctly find package.json for userspace packages', function() {
    var pjson = require('../../package.json');
    var modulePath = util.findModulePath('glob', module);
    assert(semver.satisfies(util.findModuleVersion(modulePath, Module._load),
        pjson.devDependencies.glob));
  });

  it('should not break for core packages', function() {
    var modulePath = util.findModulePath('http', module);
    assert.equal(util.findModuleVersion(modulePath, Module._load), process.version);
  });

  it('should work with namespaces', function() {
    var modulePath = util.findModulePath('@google-cloud/common', module);
    var truePackage =
      require('../../node_modules/@google-cloud/common/package.json');
    assert.equal(util.findModuleVersion(modulePath, Module._load), truePackage.version);
  });
});

describe('util.parseContextFromHeader', function() {
  describe('valid inputs', function() {
    it('should return expected values: 123456/667;o=1', function() {
      var result = notNull(util.parseContextFromHeader(
        '123456/667;o=1'));
      assert.strictEqual(result.traceId, '123456');
      assert.strictEqual(result.spanId, '667');
      assert.strictEqual(result.options, 1);
    });

    it('should return expected values:' +
        '123456/123456123456123456123456123456123456;o=1', function() {
      var result = notNull(util.parseContextFromHeader(
        '123456/123456123456123456123456123456123456;o=1'));
      assert.strictEqual(result.traceId, '123456');
      assert.strictEqual(result.spanId, '123456123456123456123456123456123456');
      assert.strictEqual(result.options, 1);
    });

    it('should return expected values: 123456/667', function() {
      var result = notNull(util.parseContextFromHeader(
        '123456/667'));
      assert.strictEqual(result.traceId, '123456');
      assert.strictEqual(result.spanId, '667');
      assert.strictEqual(result.options, undefined);
    });
  });

  describe('invalid inputs', function() {
    var inputs = [
      '',
      null,
      undefined,
      '123456',
      '123456;o=1',
      'o=1;123456',
      '123;456;o=1',
      '123/o=1;456',
      '123/abc/o=1'
    ];
    inputs.forEach(function(s: any) {
      it('should reject ' + s, function() {
        var result = util.parseContextFromHeader(s);
        assert.ok(!result);
      });
    });
  });
});

describe('util.generateTraceContext', function() {
  var inputs = [
    {
      traceId: '123456',
      spanId: '667',
      options: 1
    },
    {
      traceId: '123456',
      spanId: '667',
      options: undefined
    }
  ];

  inputs.forEach(function(s) {
    it('returns well-formatted trace context for ' + inspect(s), function() {
      var context = util.generateTraceContext(s);
      var parsed = util.parseContextFromHeader(context);
      assert.deepEqual(parsed, s);
    });
  });

  it('returns an empty string if passed a falsy value', function() {
    var context = util.generateTraceContext(null as any);
    assert.equal(context, '');
  });
});

export default {};
