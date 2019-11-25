// Copyright 2015 Google LLC
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

// TODO(kjin): Once tests are fully converted, undercase the name of this
// variable.
/** Constant values. */
// tslint:disable-next-line:variable-name
export const Constants = {
  /** The metadata key under which trace context is stored as a binary value. */
  TRACE_CONTEXT_GRPC_METADATA_NAME: 'grpc-trace-bin',

  /** Header that carries trace context across Google infrastructure. */
  TRACE_CONTEXT_HEADER_NAME: 'x-cloud-trace-context',

  /** Header that is used to identify outgoing http made by the agent. */
  TRACE_AGENT_REQUEST_HEADER: 'x-cloud-trace-agent-request',

  /** Bitmask to determine whether trace is enabled in trace options. */
  TRACE_OPTIONS_TRACE_ENABLED: 1 << 0,

  /**
   * Maximum size of a span name in bytes.
   * See: cloud.google.com/trace/api/reference/rest/v1/projects.traces for
   * limits.
   */
  TRACE_SERVICE_SPAN_NAME_LIMIT: 127,

  /** Maximum size of a label key in bytes. */
  TRACE_SERVICE_LABEL_KEY_LIMIT: 127,

  /** Maximum size of a label value in bytes. */
  TRACE_SERVICE_LABEL_VALUE_LIMIT: 16 * 1024 - 1,
};

/**
 * An enumeration of the possible "types" of spans.
 */
export enum SpanType {
  /**
   * This span object was created in circumstances where it is impossible to
   * determine the associated request, and does not represent a real trace span.
   * Getting a span object of this type should be considered an error.
   */
  UNCORRELATED = 'UNCORRELATED',

  /**
   * This span object was created by a disabled Trace Agent, either explicitly
   * or because a project ID couldn't be determined.
   */
  DISABLED = 'DISABLED',

  /**
   * This span object represents an unsampled request, and will not be
   * published.
   * Getting a span object of this type should not be considered an error.
   */
  UNSAMPLED = 'UNSAMPLED',

  /**
   * This span object was created by StackdriverTracer#runInRootSpan, and
   * represents an incoming request.
   */
  ROOT = 'ROOT',

  /**
   * This span object was created by StackdriverTracer#createChildSpan, and
   * represents an outgoing RPC on behalf of an incoming request.
   */
  CHILD = 'CHILD',
}
