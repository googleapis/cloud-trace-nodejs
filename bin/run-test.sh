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
function run {
  C="$(npm bin)/istanbul test"
  if [ "$cover" ]; then
    C="$(npm bin)/istanbul cover --dir ./coverage/${counter}"
    ((counter++))
  fi
  ($C "$(npm bin)/_mocha" -- $* --timeout 4000 --R spec) || exit 1
}

# Run test/coverage
run test/test-constants.js
run test/test-span-data.js
run test/test-trace-agent.js
run test/test-trace-policy.js
run test/test-trace-span.js
run test/test-trace.js
run test/test-util.js

run test/hooks/common.js
run test/hooks/test-hooks-index.js
run test/hooks/test-hooks-interop-mongo-express.js
run test/hooks/test-trace-connect.js
run test/hooks/test-trace-express.js
run test/hooks/test-trace-grpc.js
run test/hooks/test-trace-hapi.js
run test/hooks/test-trace-http.js
run test/hooks/test-trace-mongodb.js
run test/hooks/test-trace-mongoose.js
run test/hooks/test-trace-mysql.js
run test/hooks/test-trace-redis.js
run test/hooks/test-trace-restify.js

for test in test/standalone/test-*.js ;
do
  if [[ ! $(node --version) =~ v0\.12\..* || ! "${test}" =~ .*trace\-koa\.js ]]
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
node test/non-interference/express-e2e.js || exit 1
node test/non-interference/restify-e2e.js || exit 1
