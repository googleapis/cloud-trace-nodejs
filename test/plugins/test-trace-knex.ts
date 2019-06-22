/**
 * Copyright 2017 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as assert from 'assert';
import * as knexTypes from 'knex';

import {Tracer} from '../../src/plugin-types';
import {TraceLabels} from '../../src/trace-labels';
import * as traceTestModule from '../trace';
import {describeInterop, hasContext, wait} from '../utils';

const TABLE_NAME = 't';

const obj = {
  k: 1,
  v: 'obj',
};

describeInterop<typeof knexTypes>('knex', fixture => {
  const {version, parsedVersion} = fixture;

  let knex: knexTypes;
  let tracer: Tracer;

  before(() => {
    traceTestModule.setCLSForTest();
    traceTestModule.setPluginLoaderForTest();
    tracer = traceTestModule.start({enhancedDatabaseReporting: true});
    knex = fixture.require()({
      client: 'mysql',
      connection: require('../mysql-config'),
    });
    // For local test runs -- drop the table if it exists
    return knex.schema.dropTable(TABLE_NAME).catch(() => {});
  });

  after(() => {
    knex.destroy();
    traceTestModule.setCLSForTest(traceTestModule.TestCLS);
    traceTestModule.setPluginLoaderForTest(traceTestModule.TestPluginLoader);
  });

  beforeEach(() => {
    return knex.schema
      .createTable(TABLE_NAME, table => {
        table.integer('k');
        table.string('v', 10);
      })
      .then(result => {
        assert.ok(result);
        return knex
          .insert(obj)
          .into(TABLE_NAME)
          .then(result => {
            assert.ok(result);
            traceTestModule.clearTraceData();
          });
      });
  });

  afterEach(() => {
    return knex.schema.dropTable(TABLE_NAME).then(result => {
      assert.ok(result);
      traceTestModule.clearTraceData();
    });
  });

  it('should perform basic operations using ' + version, () => {
    return tracer.runInRootSpan({name: 'outer'}, rootSpan => {
      return knex(TABLE_NAME)
        .select()
        .then(res => {
          rootSpan.endSpan();
          assert(res);
          assert.strictEqual(res.length, 1);
          assert.strictEqual(res[0].k, 1);
          assert.strictEqual(res[0].v, 'obj');
          const spans = traceTestModule.getSpans(span => {
            return span.name === 'mysql-query';
          });
          if (parsedVersion.minor === 11) {
            assert.strictEqual(spans.length, 2);
            assert.strictEqual(spans[0].labels.sql, 'SELECT 1');
            assert.strictEqual(spans[1].labels.sql, 'select * from `t`');
          } else {
            assert.strictEqual(spans.length, 1);
            assert.strictEqual(spans[0].labels.sql, 'select * from `t`');
          }
        });
    });
  });

  it('should propagate context using ' + version, () => {
    return tracer.runInRootSpan({name: 'outer'}, rootSpan => {
      return knex
        .select()
        .from(TABLE_NAME)
        .then(res => {
          assert.ok(hasContext());
          rootSpan.endSpan();
        });
    });
  });

  it('should remove trace frames from stack using ' + version, () => {
    return tracer.runInRootSpan({name: 'outer'}, rootSpan => {
      return knex
        .select()
        .from(TABLE_NAME)
        .then(res => {
          rootSpan.endSpan();
          const spans = traceTestModule.getSpans(span => {
            return span.name === 'mysql-query';
          });
          const labels = spans[0].labels;
          const stackTrace = JSON.parse(
            labels[TraceLabels.STACK_TRACE_DETAILS_KEY]
          );
          // Ensure that our patch is on top of the stack
          assert(
            stackTrace.stack_frame[0].method_name.indexOf(
              'createQuery_trace'
            ) !== -1
          );
        });
    });
  });

  it('should work with events using ' + version, () => {
    return tracer.runInRootSpan({name: 'outer'}, rootSpan => {
      return knex
        .select()
        .from(TABLE_NAME)
        .on('query-response', (response, obj, builder) => {
          const row = response[0];
          assert.ok(row);
          assert.strictEqual(row.k, 1);
          assert.strictEqual(row.v, 'obj');
        })
        .on('query-error', (err, obj) => {
          assert.ifError(err);
        })
        .then(res => {
          rootSpan.endSpan();
          const spans = traceTestModule.getSpans(span => {
            return span.name === 'mysql-query';
          });
          if (parsedVersion.minor === 11) {
            assert.strictEqual(spans.length, 2);
            assert.strictEqual(spans[0].labels.sql, 'SELECT 1');
            assert.strictEqual(spans[1].labels.sql, 'select * from `t`');
          } else {
            assert.strictEqual(spans.length, 1);
            assert.strictEqual(spans[0].labels.sql, 'select * from `t`');
          }
        });
    });
  });

  it('should work without events or callback using ' + version, () => {
    return tracer.runInRootSpan({name: 'outer'}, rootSpan => {
      return knex
        .select()
        .from(TABLE_NAME)
        .then(async result => {
          await wait(50);
          rootSpan.endSpan();
          const spans = traceTestModule.getSpans(span => {
            return span.name === 'mysql-query';
          });
          if (parsedVersion.minor === 11) {
            assert.strictEqual(spans.length, 2);
            assert.strictEqual(spans[0].labels.sql, 'SELECT 1');
            assert.strictEqual(spans[1].labels.sql, 'select * from `t`');
          } else {
            assert.strictEqual(spans.length, 1);
            assert.strictEqual(spans[0].labels.sql, 'select * from `t`');
          }
        });
    });
  });

  it('should perform basic transaction using ' + version, () => {
    const obj2 = {k: 2, v: 'obj2'};
    return tracer.runInRootSpan({name: 'outer'}, rootSpan => {
      return knex
        .transaction(trx => {
          knex
            .insert(obj2)
            .into(TABLE_NAME)
            .transacting(trx)
            .then(res => {
              return trx
                .select()
                .from(TABLE_NAME)
                .then(res => {
                  assert.strictEqual(res.length, 2);
                  assert.strictEqual(res[0].k, 1);
                  assert.strictEqual(res[0].v, 'obj');
                  assert.strictEqual(res[1].k, 2);
                  assert.strictEqual(res[1].v, 'obj2');
                })
                .catch(err => {
                  assert.ifError(err);
                });
            })
            .then(() => {
              trx.rollback(new Error('Rolling back'));
            })
            .catch(err => {
              assert.ifError(err);
            });
        })
        .catch(err => {
          assert.ok(err);
          assert.strictEqual(err.message, 'Rolling back');
          return knex
            .select()
            .from(TABLE_NAME)
            .then(res => {
              rootSpan.endSpan();
              assert.strictEqual(res.length, 1);
              assert.strictEqual(res[0].k, 1);
              assert.strictEqual(res[0].v, 'obj');
              const spans = traceTestModule.getSpans(span => {
                return span.name === 'mysql-query';
              });
              let expectedCmds;
              if (parsedVersion.minor === 10 || parsedVersion.minor >= 12) {
                expectedCmds = [
                  /^BEGIN/,
                  'insert into `t` (`k`, `v`) values (?, ?)',
                  'select * from `t`',
                  /^ROLLBACK/,
                  'select * from `t`',
                ];
              } /*if (parsedVersion.minor === 11)*/ else {
                expectedCmds = [
                  'SELECT 1',
                  'BEGIN;',
                  'insert into `t` (`k`, `v`) values (?, ?)',
                  'select * from `t`',
                  'ROLLBACK;',
                  'SELECT 1',
                  'select * from `t`',
                ];
              }
              assert.strictEqual(expectedCmds.length, spans.length);
              for (let i = 0; i < spans.length; i++) {
                if (expectedCmds[i] instanceof RegExp) {
                  assert.ok(!!spans[i].labels.sql.match(expectedCmds[i]));
                } else {
                  assert.strictEqual(spans[i].labels.sql, expectedCmds[i]);
                }
              }
            });
        });
    });
  });
});
