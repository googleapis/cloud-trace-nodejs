#!/bin/bash

jshint . || exit 1
istanbul test ./node_modules/.bin/_mocha -- test --timeout 4000 --R spec || exit 1
for test in test/hooks/test-*.js ;
do
  istanbul test ./node_modules/.bin/_mocha -- ${test} --timeout 4000 --R spec || exit 1
done
