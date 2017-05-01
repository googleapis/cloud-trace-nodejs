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

./bin/install-test-fixtures.sh

# Get test/coverage command
counter=0
function run {
  C="$(npm bin)/istanbul test"
  if [ "$cover" ]; then
    C="$(npm bin)/istanbul cover --dir ./coverage/${counter}"
    ((counter++))
  fi
  ($C "$(npm bin)/_mocha" -- $* --timeout 4000 --R spec) || exit 1
}

# Run test/coverage
for test in test/test-*.js test/plugins/*.js ;
do
# not v0.12 or not koa = not (v0.12 and koa)
  if [[ ! $(node --version) =~ v0\.12\..* || ! "${test}" =~ .*trace\-(koa|google\-gax)\.js ]]
  then
    run "${test}"
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

if [ -z "${TRAVIS_PULL_REQUEST}" ] || [ "${TRAVIS_PULL_REQUEST}" = "false" ]
then
  if [ -z "${GCLOUD_PROJECT}" ]; then
    echo "============================================================"
    echo "Unable to run system  tests. Provide valid project id"
    echo "via GCLOUD_PROJECT and ensure auth credentials are available"
    echo "============================================================"
    exit 1
  else
    npm run system-test
  fi
fi