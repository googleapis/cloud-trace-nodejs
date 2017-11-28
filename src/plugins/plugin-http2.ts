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

import {EventEmitter} from 'events';
import * as shimmer from 'shimmer';
import {URL} from 'url';

import {TraceAgent} from '../plugin-types';

// We're monkey-patching the 'http2' module and can't import http2. Declare
// minimal types that we need here.
declare namespace http2 {
  export interface Headers { [key: string]: {}; }
  export interface RequestOptions {}
  export class Http2Session extends EventEmitter {}
  export type Http2SessionRequestFunction =
      (this: Http2Session, headers: Headers, options?: RequestOptions) =>
          ClientHttp2Stream;

  export class Http2Stream extends EventEmitter {}
  export class ClientHttp2Stream extends Http2Stream {}

  export interface ConnectOptions {}
  export function connect(
      authority: string|URL, options?: ConnectOptions,
      listener?: Function): Http2Session;
  export type ConnectFunction = typeof connect;
}

function getSpanName(authority: string|URL): string {
  if (typeof authority === 'string') {
    authority = new URL(authority);
  }
  return authority.hostname;
}

function extractUrl(authority: string|URL, headers: http2.Headers): string {
  if (typeof authority === 'string') {
    authority = new URL(authority);
  }
  const path = headers[':path'] || '/';
  return `${authority.origin}${path}`;
}

function isTraceAgentRequest(headers: http2.Headers, api: TraceAgent): boolean {
  return !!headers[api.constants.TRACE_AGENT_REQUEST_HEADER];
}

function makeRequestTrace(
    request: http2.Http2SessionRequestFunction, authority: string|URL,
    api: TraceAgent): http2.Http2SessionRequestFunction {
  return function(
             this: http2.Http2Session,
             headers: http2.Headers): http2.ClientHttp2Stream {
    // Don't trace ourselves lest we get into infinite loops.
    // Note: this would not be a problem if we guarantee buffering of trace api
    // calls. If there is no buffering then each trace is an http call which
    // will get a trace which will be an http call.
    //
    // TraceWriter uses http1 so this check is not needed at the moment. But
    // add the check anyway for the potential migration to http2 in the
    // future.
    if (isTraceAgentRequest(headers, api)) {
      return request.apply(this, arguments);
    }

    const requestLifecycleSpan =
        api.createChildSpan({name: getSpanName(authority)});
    if (!requestLifecycleSpan) {
      return request.apply(this, arguments);
    }
    // Node sets the :method pseudo-header to GET if not set by client.
    requestLifecycleSpan.addLabel(
        api.labels.HTTP_METHOD_LABEL_KEY, headers[':method'] || 'GET');
    requestLifecycleSpan.addLabel(
        api.labels.HTTP_URL_LABEL_KEY, extractUrl(authority, headers));
    headers[api.constants.TRACE_CONTEXT_HEADER_NAME] =
        requestLifecycleSpan.getTraceContext();
    const stream = request.apply(this, arguments);
    api.wrapEmitter(stream);

    let numBytes = 0;
    let listenerAttached = false;
    // Streams returned by Http2Session#request are yielded in paused mode.
    // Attaching a 'data' listener to the stream will switch it to flowing
    // mode which could cause the stream to drain before the calling
    // framework has a chance to attach their own listeners. To avoid this,
    // we attach our listener lazily. This approach to tracking data size
    // will not observe data read by explicitly calling `read` on the
    // request. We expect this to be very uncommon as it is not mentioned in
    // any of the official documentation.
    shimmer.wrap(
        stream, 'on',
        function(
            this: http2.ClientHttp2Stream,
            on: (this: EventEmitter, eventName: {}, listener: Function) =>
                EventEmitter) {
          return function(
              this: http2.ClientHttp2Stream, eventName: {}, cb: Function) {
            if (eventName === 'data' && !listenerAttached) {
              listenerAttached = true;
              on.call(this, 'data', (chunk: Buffer|string) => {
                numBytes += chunk.length;
              });
            }
            return on.apply(this, arguments);
          };
        });
    stream
        .on('response',
            (headers: http2.Headers) => {
              requestLifecycleSpan.addLabel(
                  api.labels.HTTP_RESPONSE_CODE_LABEL_KEY, headers[':status']);
            })
        .on('end',
            () => {
              requestLifecycleSpan.addLabel(
                  api.labels.HTTP_RESPONSE_SIZE_LABEL_KEY, numBytes);
              requestLifecycleSpan.endSpan();
            })
        .on('error', (err: Error) => {
          if (err) {
            requestLifecycleSpan.addLabel(
                api.labels.ERROR_DETAILS_NAME, err.name);
            requestLifecycleSpan.addLabel(
                api.labels.ERROR_DETAILS_MESSAGE, err.message);
          }
          requestLifecycleSpan.endSpan();
        });
    return stream;
  };
}

function patchHttp2Session(
    session: http2.Http2Session, authority: string|URL, api: TraceAgent): void {
  api.wrapEmitter(session);
  shimmer.wrap(
      session, 'request',
      (request: http2.Http2SessionRequestFunction) =>
          makeRequestTrace(request, authority, api));
}

function patchHttp2(h2: NodeJS.Module, api: TraceAgent): void {
  shimmer.wrap(
      h2, 'connect',
      (connect: http2.ConnectFunction): http2.ConnectFunction => {
        return function(this: NodeJS.Module, authority, options, listener) {
          const session = connect.apply(this, arguments);
          patchHttp2Session(session, authority, api);
          return session;
        };
      });
}

function unpatchHttp2(h2: NodeJS.Module) {
  shimmer.unwrap(h2, 'connect');
}

module.exports = [
  {
    file: 'http2',
    patch: patchHttp2,
    unpatch: unpatchHttp2,
  },
];
