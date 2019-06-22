/**
 * Copyright 2015 Google Inc. All Rights Reserved.
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

// Data model for Stackdriver Trace API
// https://cloud.google.com/trace/docs/reference/v1/rest/v1/projects.traces

export enum SpanKind {
  SPAN_KIND_UNSPECIFIED = 'SPAN_KIND_UNSPECIFIED',
  RPC_SERVER = 'RPC_SERVER',
  RPC_CLIENT = 'RPC_CLIENT',
}

export interface TraceSpan {
  labels: {[key: string]: string};
  startTime: string;
  endTime: string;
  kind: SpanKind;
  name: string;
  spanId: string;
  parentSpanId?: string;
}

export interface Trace {
  projectId: string;
  traceId: string;
  spans: TraceSpan[];
}
