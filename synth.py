# Copyright 2018 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import synthtool as s
import synthtool.gcp as gcp
import logging

logging.basicConfig(level=logging.DEBUG)
common_templates = gcp.CommonTemplates()
templates = common_templates.node_library()
# Don't use .nycrc for code coverage (see "Fix Code Coverage")
s.copy(templates, excludes=['.nycrc'])

### SUPPORT DATABASE PLUGINS ###
# Database plugins require that an instance of that database is running at a
# known address. On Unix we spin up Docker containers to do so, while on Windows
# we disable plugin integration tests, as there is no known procedure for doing
# something equivalent.

s.replace('.kokoro/test.bat', r'(call npm install \|\| goto :error)',
r"""
@rem Plugin integration tests on Windows are skipped, because there is no known
@rem procedure to start up database docker containers for the Kokoro Windows CI.
set TRACE_TEST_EXCLUDE_INTEGRATION=1

\1""")

s.replace('.kokoro/trampoline.sh', r'(python3 "\$\{KOKORO_GFILE_DIR\}/trampoline_v1\.py")',
r"""# From bin/docker-trace.sh
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

\1""")

### FIX CODE COVERAGE ###
# The Trace Agent has a custom script for generating code coverage (including
# custom nyc CLI params in lieu of .nycrc), which is necessary because its tests
# are not run in the same process (due to its monkeypatching nature).
# (It's possible that in the future, we adopt .nycrc, but only as a base
# configuration, as we need to specify a different reporting directory for each
# test.)

s.replace('.kokoro/test.sh', 'npm test',
r"""
# Initialize test fixtures for plugin tests.
npm run init-test-fixtures
# Run unit tests, reporting coverage individually for each test file.
# Despite this, the codecov script _should_ be able to report coverage for the
# whole project all at once.
npm run script run-unit-tests-with-coverage""")
