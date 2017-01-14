'use strict';
var Mocha = require('mocha');
var assert = require('assert');

var config = {
  enhancedDatabaseReporting: true,
  samplingRate: 0,
  plugins: {
    'express': __dirname + '/fixtures/plugin-express.js',
    'mongodb-core': __dirname + '/fixtures/plugin-mongodb-core.js'
  }
};
require('..').start(config).private_();

describe('trace agent plugin interface', function() {
  it('should make an express plugin capable of running correctly', function(done) {
    var express = require(__dirname + '/hooks/fixtures/express4');
    assert(express._plugin_patched);
    var mocha = new Mocha();
    mocha.addFile('test/hooks/test-trace-express.js');
    // Run tests used for express hook and make sure there are no failures
    mocha.run(function(numFailures) {
      assert(numFailures === 0);
      done();
    });
  });

  it('should make a mongodb plugin capable of running correctly', function(done) {
    this.timeout(4000);
    var mongodb1 = require(__dirname + '/hooks/fixtures/mongodb-core1');
    var mongodb2 = require(__dirname + '/hooks/fixtures/mongodb-core2');
    assert(mongodb1._plugin_patched);
    assert(mongodb2._plugin_patched);
    var mocha = new Mocha();
    mocha.addFile('test/hooks/test-trace-mongodb.js');
    // Run tests used for express hook and make sure there are no failures
    mocha.run(function(numFailures) {
      assert(numFailures === 0);
      done();
    });
  });

  it('should allow client and server plugins to work together', function(done) {
    require(__dirname + '/hooks/fixtures/mongoose4');
    var express = require(__dirname + '/hooks/fixtures/express4');
    assert(express._plugin_patched);
    var mocha = new Mocha();
    mocha.addFile('test/hooks/test-hooks-interop-mongo-express.js');
    // Run tests used for express hook and make sure there are no failures
    mocha.run(function(numFailures) {
      assert(numFailures === 0);
      done();
    });
  });
});
