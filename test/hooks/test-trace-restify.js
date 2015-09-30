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

var common = require('./common.js');
var restify = require('./fixtures/restify3');

var server;

describe('test-trace-restify', function() {
  afterEach(function() {
    common.cleanTraces();
    server.close();
  });

  it('should accurately measure get time, get', function(done) {
    server = restify.createServer();
    server.get('/', function (req, res, next) {
      setTimeout(function() {
        res.writeHead(200, {
          'Content-Type': 'text/plain'
        });
        res.write(common.serverRes);
        res.end();
        return next();
      }, common.serverWait);
    });
    server.listen(common.serverPort, function(){
      common.doRequest('GET', done, restifyPredicate);
    });
  });

  it('should accurately measure get time, post', function(done) {
    server = restify.createServer();
    server.post('/', function (req, res, next) {
      setTimeout(function() {
        res.writeHead(200, {
          'Content-Type': 'text/plain'
        });
        res.write(common.serverRes);
        res.end();
        return next();
      }, common.serverWait);
    });
    server.listen(common.serverPort, function(){
      common.doRequest('POST', done, restifyPredicate);
    });
  });

  it('should accurately measure get time, multiple handlers', function(done) {
    server = restify.createServer();
    server.get('/', function (req, res, next) {
      setTimeout(function() {
        return next();
      }, common.serverWait / 2);
    }, function (req, res, next) {
      setTimeout(function() {
        res.writeHead(200, {
          'Content-Type': 'text/plain'
        });
        res.write(common.serverRes);
        res.end();
        return next();
      }, common.serverWait / 2);
    });
    server.listen(common.serverPort, function(){
      common.doRequest('GET', done, restifyPredicate);
    });
  });

  it('should accurately measure get time, regex path', function(done) {
    server = restify.createServer();
    server.get(/\/([^&=?]*)/, function (req, res, next) {
      setTimeout(function() {
        res.writeHead(200, {
          'Content-Type': 'text/plain'
        });
        res.write(common.serverRes);
        res.end();
        return next();
      }, common.serverWait);
    });
    server.listen(common.serverPort, function(){
      common.doRequest('GET', done, restifyPredicate);
    });
  });

  it('should accurately measure get time, use and get', function(done) {
    server = restify.createServer();
    server.use(function (req, res, next) {
      setTimeout(function() {
        return next();
      }, common.serverWait / 2);
    });
    server.get('/', function (req, res, next) {
      setTimeout(function() {
        res.writeHead(200, {
          'Content-Type': 'text/plain'
        });
        res.write(common.serverRes);
        res.end();
        return next();
      }, common.serverWait / 2);
    });
    server.listen(common.serverPort, function(){
      common.doRequest('GET', done, restifyPredicate);
    });
  });
});

function restifyPredicate(span) {
  return span.name === '/';
}
