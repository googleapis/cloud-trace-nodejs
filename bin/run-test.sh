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
for test in test/non-interference/*-e2e.js ;
do
  node ${test} || exit 1
done

# When running locally, or on non-PR builds on travis, run the system tests.
if [[ (-z "${CIRCLECI}" && -z "${APPVEYOR}" && -z "${TRAVIS_PULL_REQUEST}") || \
      "${TRAVIS_PULL_REQUEST}" = "false" ]]; then
  # Decrypt the service account key on Travis builds on push.
  if [ "${TRAVIS_PULL_REQUEST}" = "false" ]; then
    openssl aes-256-cbc -K $encrypted_18363a01ae87_key \
      -iv $encrypted_18363a01ae87_iv \
      -in node-team-test-d0b0be11c23d.json.enc \
      -out node-team-test-d0b0be11c23d.json -d
  fi

  npm run system-test
fi
