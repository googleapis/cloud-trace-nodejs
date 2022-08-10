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

import {FORCE_NEW} from '../../src/util';
import * as assert from 'assert';
import * as common from './common';
import * as semver from 'semver';
import {describe, it, before, after} from 'mocha';

describe('generic-pool2', () => {
  const ROOT_SPAN = 'root-span';
  const CHILD_SPAN_1 = 'child-span-1';
  const CHILD_SPAN_2 = 'child-span-2';

  let api;
  let genericPool;
  before(() => {
    api = require('../../..').start({
      projectId: '0',
      samplingRate: 0,
      [FORCE_NEW]: true,
    });
    genericPool = require('./fixtures/generic-pool2');
  });

  after(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (common as any).cleanTraces();
  });

  it('preserves context', done => {
    const config = {
      name: 'generic-pool2 test',
      create: function (callback) {
        callback(() => {
          const childSpan = api.createChildSpan({name: CHILD_SPAN_2});
          assert.ok(childSpan);
          childSpan.endSpan();
        });
      },
      destroy: function () {},
    };

    const pool = new genericPool.Pool(config);
    api.runInRootSpan({name: ROOT_SPAN}, span => {
      pool.acquire((err, fn) => {
        assert.ifError(err);
        const childSpan = api.createChildSpan({name: CHILD_SPAN_1});
        assert.ok(childSpan);
        fn();
        childSpan.endSpan();
        span.endSpan();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const spans = (common as any).getTraces(api)[0].spans;
        assert.ok(spans);
        assert.strictEqual(spans.length, 3);
        assert.strictEqual(spans[0].name, ROOT_SPAN);
        assert.strictEqual(spans[1].name, CHILD_SPAN_1);
        assert.strictEqual(spans[2].name, CHILD_SPAN_2);

        done();
      });
    });
  });
});

describe('generic-pool3', () => {
  let agent;
  let genericPool;
  if (semver.satisfies(process.version, '<4')) {
    console.log(
      'Skipping testing generic-pool@3 on Node.js version ' +
        process.version +
        ' that predates version 4.'
    );
    return;
  }

  before(() => {
    agent = require('../../..').start({
      projectId: '0',
      samplingRate: 0,
      [FORCE_NEW]: true,
    });
    genericPool = require('./fixtures/generic-pool3');
  });

  after(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (common as any).cleanTraces();
  });

  it('preserves context', () => {
    const ROOT_SPAN = 'root-span';
    const CHILD_SPAN_1 = 'child-span-1';
    const CHILD_SPAN_2 = 'child-span-2';
    const CHILD_SPAN_3 = 'child-span-3';

    const factory = {
      create: function () {
        return new Promise(resolve => {
          resolve(input => {
            assert.strictEqual(input, 'SomeInput');
            const childSpan = agent.createChildSpan({name: CHILD_SPAN_2});
            assert.ok(childSpan);
            childSpan.endSpan();
          });
        });
      },

      destroy: function () {
        return new Promise<void>(resolve => {
          resolve();
        });
      },
    };

    const opts = {
      max: 1,
      min: 1,
    };

    const pool = genericPool.createPool(factory, opts);

    let promise;
    agent.runInRootSpan({name: ROOT_SPAN}, rootSpan => {
      promise = pool
        .acquire()
        .then(fn => {
          const childSpan = agent.createChildSpan({name: CHILD_SPAN_1});
          assert.ok(childSpan);
          fn('SomeInput');
          childSpan.endSpan();
        })
        .then(() => {
          const childSpan = agent.createChildSpan({name: CHILD_SPAN_3});
          assert.ok(childSpan);
          childSpan.endSpan();
          rootSpan.endSpan();

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const spans = (common as any).getTraces()[0].spans;
          assert.ok(spans);
          assert.strictEqual(spans.length, 4);
          assert.strictEqual(spans[0].name, ROOT_SPAN);
          assert.strictEqual(spans[1].name, CHILD_SPAN_1);
          assert.strictEqual(spans[2].name, CHILD_SPAN_2);
          assert.strictEqual(spans[3].name, CHILD_SPAN_3);
        });
    });

    return promise;
  });
});

export default {};
