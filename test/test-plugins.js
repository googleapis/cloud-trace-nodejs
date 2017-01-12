'use strict';
var Mocha = require('mocha');
var assert = require('assert');

var config = {
  enhancedDatabaseReporting: true,
  samplingRate: 0,
  plugins: {
    'express': __dirname + '/fixtures/plugin-express.js'
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
});
