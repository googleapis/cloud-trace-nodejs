#!/usr/bin/env bash

# Usage: -c to report coverage

while true; do
  case $1 in
    -c)
      cover=1
      ;;

    *)
      break
  esac

  shift
done

# Lint
jshint . || exit 1

# Install framework deps
for dir in test/hooks/fixtures/*/ ;
do
  echo -en "travis_fold:start:npm_install_${dir}\\r" | tr / _
  echo "npm install in ${dir}"
  (cd "${dir}"; npm install) || exit 1
  echo -en "travis_fold:end:npm_install_${dir}\\r" | tr / _
done

# Get test/coverage command
counter=0
test_cmd=""
test_suffix="--timeout 4000 --R spec"
function gen_test_cmd {
  test_cmd="$(npm bin)/istanbul test"
  if [ "$cover" ]; then
    test_cmd="$(npm bin)/istanbul cover --dir ./coverage/${counter}"
    ((counter++))
  fi
  test_cmd="$test_cmd $(npm bin)/_mocha --"
}

# Run unit test suite
gen_test_cmd
($test_cmd test test/hooks/test-hooks-index.js \
    test/hooks/test-hooks-interop-mongo-express.js \
    test/hooks/test-trace-grpc.js test/hooks/test-trace-hapi.js \
    test/hooks/test-trace-http.js test/hooks/test-trace-mongodb.js \
    test/hooks/test-trace-redis.js $test_suffix) || exit 1

# Run instrumentation tests
gen_test_cmd
tav express "4.14.0" $test_cmd test/hooks/test-trace-express.js $test_suffix || exit 1
gen_test_cmd
tav mysql "2.11.1" $test_cmd test/hooks/test-trace-mysql.js $test_suffix || exit 1
gen_test_cmd
tav restify "3.0.3 || 4.1.1" $test_cmd test/hooks/test-trace-restify $test_suffix || exit 1

# Run standalone tests
for test in test/standalone/test-*.js ;
do
  if [[ ! $(node --version) =~ v0\.12\..* || ! "${test}" =~ .*trace\-koa\.js ]]
  then
    gen_test_cmd
    ($test_cmd "${test}" $test_suffix) || exit 1
  fi
done

# Conditionally publish coverage
if [ "$cover" ]; then
  istanbul report lcovonly
  ./node_modules/coveralls/bin/coveralls.js < ./coverage/lcov.info
  rm -rf ./coverage
fi

# Run non-interference tests
node test/non-interference/http-e2e.js || exit 1
node test/non-interference/express-e2e.js || exit 1
node test/non-interference/restify-e2e.js || exit 1
