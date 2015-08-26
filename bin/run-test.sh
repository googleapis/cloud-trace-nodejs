#!/bin/bash

jshint . || exit 1
istanbul test $(npm bin)/_mocha -- test test/hooks --timeout 4000 --R spec || exit 1
for test in test/standalone/test-*.js ;
do
  istanbul test $(npm bin)/_mocha -- ${test} --timeout 4000 --R spec || exit 1
done
