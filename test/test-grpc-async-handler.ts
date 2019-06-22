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

import * as protoLoader from '@grpc/proto-loader';
import * as grpcModule from 'grpc';

import {Tester, TesterClient} from './test-grpc-proto';
import * as traceTestModule from './trace';
import {describeInterop} from './utils';

type Grpc = typeof grpcModule;

const PORT = 50051;

describeInterop<Grpc>('grpc', fixture => {
  let grpc: Grpc;
  let testerService: protoLoader.ServiceDefinition;

  before(async () => {
    traceTestModule.setPluginLoaderForTest();
    traceTestModule.setCLSForTest();
    traceTestModule.start();
    grpc = fixture.require();
    const proto = await protoLoader.load(
      `${__dirname}/fixtures/test-grpc.proto`
    );
    testerService = proto['nodetest.Tester'] as protoLoader.ServiceDefinition;
  });

  afterEach(() => {
    traceTestModule.clearTraceData();
  });

  after(() => {
    traceTestModule.setPluginLoaderForTest(traceTestModule.TestPluginLoader);
    traceTestModule.setCLSForTest(traceTestModule.TestCLS);
  });

  describe('Server', () => {
    let server: grpcModule.Server;
    let client: TesterClient;

    before(() => {
      server = new grpc.Server();
      server.addService<Tester>(testerService, {
        testUnary: async (call, callback) => {
          callback(null, {n: 0});
        },
        testClientStream: async (call, callback) => {
          callback(null, {n: 0});
        },
        testServerStream: async call => {
          call.write({n: 0});
          call.end();
        },
        testBidiStream: async call => {
          call.write({n: 0});
          call.end();
        },
      });
      server.bind(`localhost:${PORT}`, grpc.ServerCredentials.createInsecure());
      server.start();

      // TesterClient is a class.
      // tslint:disable-next-line:variable-name
      const TesterClient = grpc.makeGenericClientConstructor(
        testerService,
        'Tester',
        {}
      );
      client = new TesterClient(
        `localhost:${PORT}`,
        grpc.credentials.createInsecure()
      ) as TesterClient;
    });

    after(() => {
      server.forceShutdown();
    });

    it('should work with async unary call handlers', async () => {
      const tracer = traceTestModule.get();
      await tracer.runInRootSpan({name: 'client-outer'}, async span => {
        await new Promise((resolve, reject) =>
          client.TestUnary({n: 0}, (err, res) =>
            err ? reject(err) : resolve()
          )
        );
        span.endSpan();
      });
      // Verify that a server trace was written.
      // This function does the assertion underneath the covers.
      traceTestModule.getOneSpan(
        span =>
          span.name === 'grpc:/nodetest.Tester/TestUnary' &&
          span.kind === 'RPC_SERVER'
      );
    });

    it('should work with async client streaming handlers', async () => {
      const tracer = traceTestModule.get();
      await tracer.runInRootSpan({name: 'client-outer'}, async span => {
        await new Promise((resolve, reject) =>
          client
            .TestClientStream((err, res) => (err ? reject(err) : resolve()))
            .end()
        );
        span.endSpan();
      });
      // Verify that a server trace was written.
      // This function does the assertion underneath the covers.
      traceTestModule.getOneSpan(
        span =>
          span.name === 'grpc:/nodetest.Tester/TestClientStream' &&
          span.kind === 'RPC_SERVER'
      );
    });

    it('should work with async server streaming handlers', async () => {
      const tracer = traceTestModule.get();
      await tracer.runInRootSpan({name: 'client-outer'}, async span => {
        await new Promise((resolve, reject) =>
          client
            .TestServerStream({n: 0})
            .on('error', reject)
            .on('data', () => {})
            .on('end', resolve)
        );
        span.endSpan();
      });
      // Verify that a server trace was written.
      // This function does the assertion underneath the covers.
      traceTestModule.getOneSpan(
        span =>
          span.name === 'grpc:/nodetest.Tester/TestServerStream' &&
          span.kind === 'RPC_SERVER'
      );
    });

    it('should work with async bidi streaming handlers', async () => {
      const tracer = traceTestModule.get();
      await tracer.runInRootSpan({name: 'client-outer'}, async span => {
        await new Promise((resolve, reject) =>
          client
            .TestBidiStream()
            .on('error', reject)
            .on('data', () => {})
            .on('end', resolve)
        );
        span.endSpan();
      });
      // Verify that a server trace was written.
      // This function does the assertion underneath the covers.
      traceTestModule.getOneSpan(
        span =>
          span.name === 'grpc:/nodetest.Tester/TestBidiStream' &&
          span.kind === 'RPC_SERVER'
      );
    });
  });
});
