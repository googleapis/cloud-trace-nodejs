// Copyright 2017 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Prereqs:
// Start docker daemon
//   ex) docker -d
// Run a redis image binding the redis port
//   ex) docker run -p 6379:6379 -d redis
import * as assert from 'assert';
import {describe, it, before, after} from 'mocha';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const common = require('./common' /*.js*/);

describe('multiple instrumentations of the same module', () => {
  let clientv0;
  let clientv2;

  before(() => {
    require('../../..').start({
      projectId: '0',
      enhancedDatabaseReporting: true,
      samplingRate: 0,
    });
    clientv0 = require('./fixtures/redis0.12').createClient();
    clientv0.on('error', err => {
      assert(false, 'redisv0 error ' + err);
    });
    clientv2 = require('./fixtures/redis2.x').createClient();
    clientv2.on('error', err => {
      assert(false, 'redisv2 error ' + err);
    });
  });

  after(done => {
    clientv0.quit(() => {
      clientv2.quit(() => {
        done();
      });
    });
  });

  it('should record spans', done => {
    common.runInTransaction(endTransaction => {
      clientv0.get('v0', () => {
        clientv2.get('v2', () => {
          endTransaction();
          const spans = common.getMatchingSpans(
            redisPredicate.bind(null, 'redis-get')
          );
          assert.strictEqual(spans.length, 2);
          assert.strictEqual(spans[0].labels.arguments, '["v0"]');
          assert.strictEqual(spans[0].labels.command, 'get');
          assert.strictEqual(spans[1].labels.arguments, '["v2"]');
          assert.strictEqual(spans[1].labels.command, 'get');
          done();
        });
      });
    });
  });
});

function redisPredicate(id, span) {
  return span.name.length >= id.length && span.name.substr(0, id.length) === id;
}

export default {};
