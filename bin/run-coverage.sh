#!/bin/bash

istanbul cover $(npm bin)/_mocha --dir ./coverage/0 -- test test/hooks --timeout 4000 --R spec
count=1
for test in test/standalone/test-*.js ;
do
  istanbul cover $(npm bin)/_mocha --dir ./coverage/$count -- ${test} --timeout 4000 --R spec
  (( count++ ))
done
istanbul report lcovonly

cat ./coverage/lcov.info | ./node_modules/coveralls/bin/coveralls.js

rm -rf ./coverage

