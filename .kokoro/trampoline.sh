#!/bin/bash
# Copyright 2017 Google Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

set -eo pipefail

# Always run the cleanup script, regardless of the success of bouncing into
# the container.
function cleanup() {
    chmod +x ${KOKORO_GFILE_DIR}/trampoline_cleanup.sh
    ${KOKORO_GFILE_DIR}/trampoline_cleanup.sh
    echo "cleanup";
}
trap cleanup EXIT

# From bin/docker-trace.sh
# Start up database docker containers for plugin integration tests.
docker run --name trace-test-mongo -p 127.0.0.1:27017:27017 -d mongo
docker run --name trace-test-redis -p 127.0.0.1:6379:6379 -d redis
docker run --name trace-test-mysql -p 127.0.0.1:3306:3306\
  -e MYSQL_ROOT_PASSWORD='Password12!'\
  -e MYSQL_DATABASE=test\
  -d mysql:5
docker run --name trace-test-postgres -p 127.0.0.1:5432:5432\
  -e POSTGRES_USER=postgres\
  -e POSTGRES_PASSWORD='Password12!'\
  -e POSTGRES_DB=test\
  -d postgres

python3 "${KOKORO_GFILE_DIR}/trampoline_v1.py"
