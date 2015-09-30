#!/bin/bash

jshint . || exit 1
for dir in test/hooks/fixtures/*/ ;
do
  echo -en "travis_fold:start:npm_install_${dir}\\r" | tr / _
  echo "npm install in ${dir}"
  cd ${dir} && npm install && cd -
  echo -en "travis_fold:end:npm_install_${dir}\\r" | tr / _
done
istanbul test $(npm bin)/_mocha -- test test/hooks --timeout 4000 --R spec || exit 1
for test in test/standalone/test-*.js ;
do
  istanbul test $(npm bin)/_mocha -- ${test} --timeout 4000 --R spec || exit 1
done
node test/non-interference/http-e2e.js || exit 1
node test/non-interference/express-e2e.js || exit 1
node test/non-interference/restify-e2e.js || exit 1
