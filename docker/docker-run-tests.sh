#!/bin/bash

# Copyright 2017 Google Inc. All Rights Reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#       http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.

REQUESTED_NODE_VERSION=${1}

BASE=docker
DOCKER_COMPOSE_FILE=${BASE}/docker-compose.yml
DOCKER_FILE=${BASE}/Dockerfile
NODE_VERSION_FILE=${BASE}/node-version-used.txt

if [ -z $(command -v docker-compose) ]; then
  echo "docker-compose must be installed to run this script but was not found."
  exit 1
fi

if [ ! -f ${DOCKER_COMPOSE_FILE} ]; then
  echo "ERROR: File '${DOCKER_COMPOSE_FILE}' does not exist."
  echo ""
  echo "NOTE: This script must be invoked from the project's root directory."
  exit 1
fi

if [ -z "${REQUESTED_NODE_VERSION}" ]; then
  REQUESTED_NODE_VERSION=latest
fi

PREV_NODE_VERSION=$(cat ${NODE_VERSION_FILE} 2> /dev/null)
echo ${REQUESTED_NODE_VERSION} > ${NODE_VERSION_FILE}

NODE_INSTALL_COMMAND=""
if [ "${REQUESTED_NODE_VERSION}" != "latest" ]; then
  NODE_INSTALL_COMMAND="RUN install_node ${REQUESTED_NODE_VERSION}"
fi

cat << EOF > ${DOCKER_FILE}
FROM gcr.io/google_appengine/nodejs

RUN apt-get update -y && \
    apt-get install --no-install-recommends -y -q g++-4.8 netcat

${NODE_INSTALL_COMMAND}

ENV GCLOUD_PROJECT 0
ENV CXX g++-4.8
ENV NODE_ENV development
ENV TERM xterm

WORKDIR /workspace

ENTRYPOINT ./docker/wait-and-run.sh
EOF

# If the tests are run with a Node version different from the previous
# time the tests were run, delete the plugin fixtures and rebuild the
# Docker image.  This is needed because some of the fixtures depend on
# the Node version.
if [ ! -f "${NODE_VERSION_FILE}" ] || [ "${PREV_NODE_VERSION}" != "${REQUESTED_NODE_VERSION}" ]; then
  echo "The tests are being run on a new Node.js version or for the first time:"
  echo "Clearing the text/plugin/fixtures"
  find test/plugins/fixtures -name node_modules -exec rm -Rf {} \; 2> /dev/null
  echo "Rebuilding the Docker image that runs the tests"
  docker-compose --file ${DOCKER_COMPOSE_FILE} build --force-rm trace-agent-tests
else
  echo "Reusing existing Docker image"
fi

docker-compose --file ${DOCKER_COMPOSE_FILE} up --abort-on-container-exit
