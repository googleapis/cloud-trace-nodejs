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
// This is imported only for types. Generated .js file should NOT load 'http2'.
// `http2` must be used only in type annotations, not in expressions.
import * as http2 from 'http2';
import * as shimmer from 'shimmer';
import {URL} from 'url';

import {Tracer} from '../plugin-types';

type Http2Module = typeof http2;

// type of ClientHttp2Session#request()
type Http2SessionRequestFunction = (
  this: http2.ClientHttp2Session,
  headers?: http2.OutgoingHttpHeaders,
  options?: http2.ClientSessionRequestOptions
) => http2.ClientHttp2Stream;

function getSpanName(authority: string | URL): string {
  if (typeof authority === 'string') {
    authority = new URL(authority);
  }
  return authority.hostname;
}

function extractMethodName(headers?: http2.OutgoingHttpHeaders): string {
  if (headers && headers[':method']) {
    return headers[':method'] as string;
  }
  return 'GET';
}

function extractPath(headers?: http2.OutgoingHttpHeaders): string {
  if (headers && headers[':path']) {
    return headers[':path'] as string;
  }
  return '/';
}

function extractUrl(
  authority: string | URL,
  headers?: http2.OutgoingHttpHeaders
): string {
  if (typeof authority === 'string') {
    authority = new URL(authority);
  }
  return `${authority.origin}${extractPath(headers)}`;
}

function isTraceAgentRequest(
  headers: http2.OutgoingHttpHeaders | undefined,
  api: Tracer
): boolean {
  return !!headers && !!headers[api.constants.TRACE_AGENT_REQUEST_HEADER];
}

function makeRequestTrace(
  request: Http2SessionRequestFunction,
  authority: string | URL,
  api: Tracer
): Http2SessionRequestFunction {
  return function(
    this: http2.Http2Session,
    headers?: http2.OutgoingHttpHeaders
  ): http2.ClientHttp2Stream {
    // Create new headers so that the object passed in by the client is not
    // modified.
    const newHeaders: http2.OutgoingHttpHeaders = Object.assign(
      {},
      headers || {}
    );

    // Don't trace ourselves lest we get into infinite loops.
    // Note: this would not be a problem if we guarantee buffering of trace api
    // calls. If there is no buffering then each trace is an http call which
    // will get a trace which will be an http call.
    //
    // TraceWriter uses http1 so this check is not needed at the moment. But
    // add the check anyway for the potential migration to http2 in the
    // future.
    if (isTraceAgentRequest(newHeaders, api)) {
      return request.apply(this, arguments);
    }

    const requestLifecycleSpan = api.createChildSpan({
      name: getSpanName(authority),
    });
    if (!api.isRealSpan(requestLifecycleSpan)) {
      return request.apply(this, arguments);
    }
    // Node sets the :method pseudo-header to GET if not set by client.
    requestLifecycleSpan.addLabel(
      api.labels.HTTP_METHOD_LABEL_KEY,
      extractMethodName(newHeaders)
    );
    requestLifecycleSpan.addLabel(
      api.labels.HTTP_URL_LABEL_KEY,
      extractUrl(authority, newHeaders)
    );
    api.propagation.inject(
      (k, v) => (newHeaders[k] = v),
      requestLifecycleSpan.getTraceContext()
    );
    const stream: http2.ClientHttp2Stream = request.call(
      this,
      newHeaders,
      ...Array.prototype.slice.call(arguments, 1)
    );
    api.wrapEmitter(stream);

    let numBytes = 0;
    let listenerAttached = false;
    stream
      .on('response', headers => {
        requestLifecycleSpan.addLabel(
          api.labels.HTTP_RESPONSE_CODE_LABEL_KEY,
          headers[':status']
        );
      })
      .on('end', () => {
        requestLifecycleSpan.addLabel(
          api.labels.HTTP_RESPONSE_SIZE_LABEL_KEY,
          numBytes
        );
        requestLifecycleSpan.endSpan();
      })
      .on('error', (err: Error) => {
        if (err) {
          requestLifecycleSpan.addLabel(
            api.labels.ERROR_DETAILS_NAME,
            err.name
          );
          requestLifecycleSpan.addLabel(
            api.labels.ERROR_DETAILS_MESSAGE,
            err.message
          );
        }
        requestLifecycleSpan.endSpan();
      });
    // Streams returned by Http2Session#request are yielded in paused mode.
    // Attaching a 'data' listener to the stream will switch it to flowing
    // mode which could cause the stream to drain before the calling
    // framework has a chance to attach their own listeners. To avoid this,
    // we attach our listener lazily. This approach to tracking data size
    // will not observe data read by explicitly calling `read` on the
    // request. We expect this to be very uncommon as it is not mentioned in
    // any of the official documentation.
    shimmer.wrap(stream, 'on', on => {
      return function(
        this: http2.ClientHttp2Stream,
        eventName: {},
        cb: Function
      ) {
        if (eventName === 'data' && !listenerAttached) {
          listenerAttached = true;
          on.call(this, 'data', (chunk: Buffer | string) => {
            numBytes += chunk.length;
          });
        }
        return on.apply(this, arguments);
      };
    });
    return stream;
  };
}

function patchHttp2Session(
  session: http2.ClientHttp2Session,
  authority: string | URL,
  api: Tracer
): void {
  api.wrapEmitter(session);
  shimmer.wrap(session, 'request', request =>
    makeRequestTrace(request, authority, api)
  );
}

function patchHttp2(h2: Http2Module, api: Tracer): void {
  shimmer.wrap(
    h2,
    'connect',
    connect =>
      function(this: Http2Module, authority: string | URL) {
        const session: http2.ClientHttp2Session = connect.apply(
          this,
          arguments
        );
        patchHttp2Session(session, authority, api);
        return session;
      }
  );
}

function unpatchHttp2(h2: Http2Module) {
  shimmer.unwrap(h2, 'connect');
}

module.exports = [
  {
    file: 'http2',
    patch: patchHttp2,
    unpatch: unpatchHttp2,
  },
];
