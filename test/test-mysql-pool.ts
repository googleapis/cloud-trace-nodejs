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

var common = require('./plugins/common'/*.js*/);
var assert = require('assert');
var http = require('http');
var semver = require('semver');

// hapi 13 and hapi-plugin-mysql uses const
if (semver.satisfies(process.version, '>=4')) {
  describe('test-trace-mysql', function() {
    var agent;
    var Hapi;
    before(function() {
      agent = require('..').start({
        projectId: '0',
        samplingRate: 0,
        enhancedDatabaseReporting: true
      });
      Hapi = require('./plugins/fixtures/hapi13');
    });

    it('should work with connection pool access', function(done) {
      var server = new Hapi.Server();
      server.connection({ port: common.serverPort });
      server.register({
        register: require('./plugins/fixtures/hapi-plugin-mysql3'),
        options: require('./mysql-config'/*.js*/)
      }, function (err) {
        assert(!err);
        server.route({ 
          method: 'GET', 
          path: '/', 
          handler: function (request, reply) {
            request.app.db.query('SELECT * FROM t', function(err, res) {
              return reply(common.serverRes);
            }); 
          } 
        });
        server.start(function(err) {
          assert(!err);
          http.get({port: common.serverPort}, function(res) {
            var result = '';
            res.on('data', function(data) { result += data; });
            res.on('end', function() {
              var spans = common.getMatchingSpans(function (span) {
                return span.name === 'mysql-query';
              });
              assert.equal(spans.length, 1);
              assert.equal(spans[0].labels.sql, 'SELECT * FROM t');
              done();
            });
          });
        });
      });
    });
  });
}

export default {};
