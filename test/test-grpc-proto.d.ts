// Copyright 2019 Google LLC
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

import { handleUnaryCall, handleClientStreamingCall, handleServerStreamingCall, handleBidiStreamingCall, Client, requestCallback, ClientUnaryCall, ClientWritableStream, ClientReadableStream, ClientDuplexStream } from 'grpc';

export type TestRequest = { n: number };
export type TestResponse = { n: number };
export type Tester = {
  TestUnary?: handleUnaryCall<TestRequest, TestResponse>;
  TestClientStream?: handleClientStreamingCall<TestRequest, TestResponse>;
  TestServerStream?: handleServerStreamingCall<TestRequest, TestResponse>;
  TestBidiStream?: handleBidiStreamingCall<TestRequest, TestResponse>;
  testUnary?: handleUnaryCall<TestRequest, TestResponse>;
  testClientStream?: handleClientStreamingCall<TestRequest, TestResponse>;
  testServerStream?: handleServerStreamingCall<TestRequest, TestResponse>;
  testBidiStream?: handleBidiStreamingCall<TestRequest, TestResponse>;
};

// Incomplete definition for Tester client. Overloads and lowercase aliases are
// not included for now, as they're not used anywhere.
export type TesterClient = Client & {
  TestUnary: (arg: TestRequest, cb: requestCallback<TestResponse>) => ClientUnaryCall;
  TestClientStream: (cb: requestCallback<TestResponse>) => ClientWritableStream<TestRequest>;
  TestServerStream: (arg: TestRequest) => ClientReadableStream<TestResponse>;
  TestBidiStream: () => ClientDuplexStream<TestRequest, TestResponse>;
};
