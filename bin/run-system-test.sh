#!/usr/bin/env bash

set -e

# TODO(ofrobots): This actually doesn't work yet
if [ "${TRAVIS_PULL_REQUEST}" = "false" ]; then
  openssl aes-256-cbc -K $encrypted_e9782ba88cb0_key \
    -iv $encrypted_e9782ba88cb0_iv \
    -in node-team-debug-test-dfc747dacb5b.json.enc \
    -out node-team-debug-test-dfc747dacb5b.json -d
fi

mocha --no-timeout system-test/*.js