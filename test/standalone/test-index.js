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

if (!process.env.GCLOUD_PROJECT_NUM) {
  console.log('The GCLOUD_PROJECT_NUM environment variable must be set.');
  process.exit(1);
}

var assert = require('assert');
var agent = require('../..');

describe('index.js', function() {

  it('should be harmless to stop before a start', function() {
    agent.stop();
    agent.stop();
    agent.stop();
  });

  it('should complain when config.projectId is not a string', function() {
    agent.start({projectId: 0, enabled: true, logLevel: 0});
    assert.strictEqual(agent.isActive(), false);
    agent.start({projectId: 1001, enabled: true, logLevel: 0});
    assert.strictEqual(agent.isActive(), false);
  });

  function wrapTest(nodule, property) {
    agent.stop(); // harmless to stop before a start.
    assert(!nodule[property].__unwrap,
      property + ' already wrapped before start');
    agent.start();
    assert(nodule[property].__unwrap,
      property + ' should get wrapped on start');
    agent.stop();
    assert(!nodule[property].__unwrap,
      property + ' should get unwrapped on stop');
    agent.start();
    assert(nodule[property].__unwrap,
      property + ' should get wrapped on start');
    agent.stop();
    assert(!nodule[property].__unwrap,
      property + ' should get unwrapped on stop');
  }

  it('should wrap/unwrap module._load on start/stop', function() {
    wrapTest(require('module'), '_load');
  });

  it('should wrap/unwrap http on start/stop', function() {
    agent.start(); // agent needs to be started before the first require.
    var http = require('http');
    wrapTest(http, 'request');
    agent.stop();
  });

  it('should wrap/unwrap express on start/stop', function() {
    agent.start();
    var express = require('express');
    wrapTest(express.application, 'lazyrouter');
    agent.stop();
  });

  it('should wrap/unwrap hapi on start/stop', function() {
    agent.start();
    var hapi = require('hapi');
    wrapTest(hapi.Server.prototype, 'connection');
    agent.stop();
  });

  it('should wrap/unwrap mongodb-core on start/stop', function() {
    agent.start();
    var mongo = require('mongodb-core');
    wrapTest(mongo.Server.prototype, 'command');
    wrapTest(mongo.Server.prototype, 'insert');
    wrapTest(mongo.Server.prototype, 'update');
    wrapTest(mongo.Server.prototype, 'remove');
    wrapTest(mongo.Cursor.prototype, 'next');
    agent.stop();
  });

  it('should wrap/unwrap redis on start/stop', function() {
    agent.start();
    var redis = require('redis');
    wrapTest(redis.RedisClient.prototype, 'send_command');
    wrapTest(redis, 'createClient');
    agent.stop();
  });

  it('should wrap/unwrap restify on start/stop', function() {
    agent.start();
    var restify = require('restify');
    wrapTest(restify, 'createServer');
    agent.stop();
  });

  it('should have equivalent enabled and disabled structure', function() {
    agent.start();
    assert.equal(typeof agent, 'object');
    assert.equal(typeof agent.startSpan, 'function');
    assert.equal(typeof agent.setTransactionName, 'function');
    assert.equal(typeof agent.addTransactionLabel, 'function');
    agent.stop();
    assert.equal(typeof agent, 'object');
    assert.equal(typeof agent.startSpan, 'function');
    assert.equal(typeof agent.setTransactionName, 'function');
    assert.equal(typeof agent.addTransactionLabel, 'function');
  });

});
