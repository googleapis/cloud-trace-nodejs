/**
 * Copyright 2019 Google Inc. All Rights Reserved.
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
import * as mongooseTypes from 'mongoose';

import * as traceTestModule from '../trace';
import {describeInterop} from '../utils';

describeInterop<typeof mongooseTypes>('mongoose', fixture => {
  let mongoose: typeof mongooseTypes;
  // Simple will be treated as a class constructor.
  // tslint:disable-next-line:variable-name
  let Simple: mongooseTypes.Model<mongooseTypes.Document>;

  /**
   * Common logic used in multiple tests -- inserts an object into the database.
   * @param doc
   */
  async function insertTestData(doc: {f1: string; f2: boolean; f3: number}) {
    const data = new Simple(doc);
    const tracer = traceTestModule.get();
    await tracer.runInRootSpan({name: 'insert-test-data'}, async span => {
      assert.ok(tracer.isRealSpan(span));
      await data.save();
      span.endSpan();
    });
  }

  before(async () => {
    traceTestModule.setCLSForTest();
    traceTestModule.setPluginLoaderForTest();
    traceTestModule.start();
    mongoose = fixture.require();
    await mongoose.connect('mongodb://localhost:27017/testdb');

    const {Schema} = mongoose;
    const simpleSchema = new Schema({f1: String, f2: Boolean, f3: Number});
    Simple = mongoose.model('Simple', simpleSchema);
  });

  after(async () => {
    traceTestModule.setCLSForTest(traceTestModule.TestCLS);
    traceTestModule.setPluginLoaderForTest(traceTestModule.TestPluginLoader);
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  });

  afterEach(() => {
    traceTestModule.clearTraceData();
  });

  it('Traces creates with async/await', async () => {
    await insertTestData({f1: 'val', f2: false, f3: 1729});
    const trace = traceTestModule.getOneTrace(trace =>
      trace.spans.some(span => span.name === 'insert-test-data')
    );
    assert.strictEqual(trace.spans.length, 2);
    assert.strictEqual(trace.spans[1].name, 'mongo-insert');
  });

  it('Traces queries with async/await', async () => {
    await insertTestData({f1: 'sim', f2: false, f3: 1729});
    const tracer = traceTestModule.get();
    await tracer.runInRootSpan({name: 'query-test-data'}, async span => {
      assert.ok(tracer.isRealSpan(span));
      await Simple.findOne({f1: 'sim'});
      span.endSpan();
    });
    const trace = traceTestModule.getOneTrace(trace =>
      trace.spans.some(span => span.name === 'query-test-data')
    );
    assert.strictEqual(trace.spans.length, 2);
    assert.strictEqual(trace.spans[1].name, 'mongo-cursor');
  });
});
