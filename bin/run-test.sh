#!/bin/bash

jshint . || exit 1
istanbul test $(npm bin)/_mocha -- test test/hooks --timeout 4000 --R spec || exit 1
for test in test/standalone/test-*.js ;
do
  istanbul test $(npm bin)/_mocha -- ${test} --timeout 4000 --R spec || exit 1
done
node test/non-interference/http-e2e.js || exit 1
node test/non-interference/express-e2e.js || exit 1
node test/non-interference/restify-e2e.js || exit 1
