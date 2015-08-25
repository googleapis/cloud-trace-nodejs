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
var express = require('express');

var server;

describe('test-trace-express', function() {
  afterEach(function() {
    common.cleanTraces();
    server.close();
  });

  it('should accurately measure get time, get', function(done) {
    var app = express();
    app.get('/', function (req, res) {
      setTimeout(function() {
        res.send(common.serverRes);
      }, common.serverWait);
    });
    server = app.listen(common.serverPort, function() {
      common.doRequest('GET', done, expressPredicate);
    });
  });

  it('should accurately measure get time, route', function(done) {
    var app = express();
    app.route('/').all(function(req, res, next) {
      setTimeout(function() {
        next();
      }, common.serverWait);
    }).get(function(req,res,next) {
      res.send(common.serverRes);
      next();
    });
    server = app.listen(common.serverPort, function() {
      common.doRequest('GET', done, expressPredicate);
    });
  });

  it('should accurately measure get time, post', function(done) {
    var app = express();
    app.post('/', function (req, res) {
      setTimeout(function() {
        res.send(common.serverRes);
      }, common.serverWait);
    });
    server = app.listen(common.serverPort, function() {
      common.doRequest('POST', done, expressPredicate);
    });
  });

  it('should accurately measure get time, put', function(done) {
    var app = express();
    app.put('/', function (req, res) {
      setTimeout(function() {
        res.send(common.serverRes);
      }, common.serverWait);
    });
    server = app.listen(common.serverPort, function() {
      common.doRequest('PUT', done, expressPredicate);
    });
  });

  it('should accurately measure get time, param', function(done) {
    var app = express();
    app.param('id', function(req, res, next) {
      setTimeout(function() {
        next();
      }, common.serverWait / 2);
    });
    app.get('/:id', function (req, res) {
      setTimeout(function() {
        res.send(common.serverRes);
      }, common.serverWait / 2);
    });
    server = app.listen(common.serverPort, function() {
      common.doRequest('GET', done, expressParamPredicate, '/:id');
    });
  });

  it('should accurately measure get time, middleware', function(done) {
    var app = express();
    app.use(function(req, res, next) {
      setTimeout(function() {
        next();
      }, common.serverWait / 2);
    });
    app.get('/', function (req, res) {
      setTimeout(function() {
        res.send(common.serverRes);
      }, common.serverWait / 2);
    });
    server = app.listen(common.serverPort, function() {
      common.doRequest('GET', done, expressPredicate);
    });
  });

  it('should accurately measure get time, middleware only', function(done) {
    var app = express();
    app.use(function(req, res, next) {
      setTimeout(function() {
        res.send(common.serverRes);
        next();
      }, common.serverWait);
    });
    server = app.listen(common.serverPort, function() {
      common.doRequest('GET', done, expressPredicate);
    });
  });
});

function expressPredicate(span) {
  return span.name === '/';
}

function expressParamPredicate(span) {
  return span.name === '/:id';
}
