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

var assert = require('assert');
var common = require('./plugins/common'/*.js*/);
var inspect = require('util').inspect;
var Module = require('module');
var semver = require('semver');
var path = require('path');

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
      var result = common.notNull(util.parseContextFromHeader(
        '123456/667;o=1'));
      assert.strictEqual(result.traceId, '123456');
      assert.strictEqual(result.spanId, '667');
      assert.strictEqual(result.options, 1);
    });

    it('should return expected values:' +
        '123456/123456123456123456123456123456123456;o=1', function() {
      var result = common.notNull(util.parseContextFromHeader(
        '123456/123456123456123456123456123456123456;o=1'));
      assert.strictEqual(result.traceId, '123456');
      assert.strictEqual(result.spanId, '123456123456123456123456123456123456');
      assert.strictEqual(result.options, 1);
    });

    it('should return expected values: 123456/667', function() {
      var result = common.notNull(util.parseContextFromHeader(
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
