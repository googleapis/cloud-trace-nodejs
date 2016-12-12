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

var assert = require('assert');
var util = require('../src/util.js');
var path = require('path');

var o = {
  a: 5,
  b: 'hi',
  c: function() {},
  d: {
    e: {
      f: null,
      g: undefined,
      h: [1, 2]
    }
  }
};

describe('util.stringifyPrefix', function() {
  it('should truncate objects larger than size', function() {
    assert.equal(util.stringifyPrefix(o, 15),
      '{a:5,b:hi,c:...');
  });

  it('should not truncate objects smaller than size', function() {
    assert.equal(util.stringifyPrefix(o, 150),
      '{a:5,b:hi,c:[Function],d:{e:{f:null,g:undefined,h:{0:1,1:2}}}}');
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
