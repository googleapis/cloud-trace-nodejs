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
var http = require('http');

var common = require('./plugins/common'/*.js*/);

describe('test-default-ignore-ah-health', function() {
  var agent;
  var express;
  before(function() {
    agent = require('..').start({
      projectId: '0',
      samplingRate: 0
    });
    express = require('./plugins/fixtures/express4');
  });

  it('should ignore /_ah/health traces by default', function(done) {
    var app = express();
    app.get('/_ah/health', function (req, res) {
      res.send('🏥');
    });
    var server = app.listen(9042, function() {
      http.get({port: 9042, path: '/_ah/health'}, function(res) {
        var result = '';
        res.on('data', function(data) { result += data; });
        res.on('end', function() {
          assert.equal(result, '🏥');
          assert.equal(common.getTraces().length, 0);
          server.close();
          done();
        });
      });
    });
  });
});

export default {};
