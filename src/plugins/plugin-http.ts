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

import * as httpModule from 'http';
import {Agent, ClientRequest, ClientRequestArgs, request} from 'http';
import * as httpsModule from 'https';
import * as shimmer from 'shimmer';
import {URL, UrlWithStringQuery} from 'url';

import {Plugin, Tracer} from '../plugin-types';

type HttpModule = typeof httpModule;
type HttpsModule = typeof httpsModule;
type RequestFunction = typeof request;

const ERR_HTTP_HEADERS_SENT = 'ERR_HTTP_HEADERS_SENT';
const ERR_HTTP_HEADERS_SENT_MSG = "Can't set headers after they are sent.";

// URL is used for type checking, but doesn't exist in Node <7.
// This function works around that.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isURL = (value: any): value is URL => value instanceof URL;

function getSpanName(options: ClientRequestArgs | URL) {
  // c.f. _http_client.js ClientRequest constructor
  return options.hostname || options.host || 'localhost';
}

/**
 * Returns whether the Expect header is on the given options object.
 * Assumes only that the header key is either capitalized, lowercase, or
 * all-caps for simplicity purposes.
 * @param options Options for http.request.
 */
function hasExpectHeader(options: ClientRequestArgs | URL): boolean {
  return !!(
    (options as ClientRequestArgs).headers &&
    ((options as ClientRequestArgs).headers!.Expect ||
      (options as ClientRequestArgs).headers!.expect ||
      (options as ClientRequestArgs).headers!.EXPECT)
  );
}

function extractUrl(
  options: ClientRequestArgs | URL,
  fallbackProtocol: string
) {
  let path;
  if (isURL(options)) {
    // pathname only exists on a URL object.
    path = options.pathname || '/';
  } else {
    const agent = options._defaultAgent as Agent & {protocol?: string};
    if (agent) {
      fallbackProtocol = agent.protocol || fallbackProtocol;
    }
    // path only exists on a ClientRequestArgs object.
    path = options.path || '/';
  }
  const protocol = options.protocol || fallbackProtocol;
  const host = options.hostname || options.host || 'localhost';
  const portString = options.port ? ':' + options.port : '';

  // In theory we should use url.format here. However, that is
  // broken. See: https://github.com/joyent/node/issues/9117 and
  // https://github.com/nodejs/io.js/pull/893
  // Let's do things the same way _http_client does it.
  return `${protocol}//${host}${portString}${path}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isTraceAgentRequest(options: httpModule.RequestOptions, api: Tracer) {
  return (
    options &&
    options.headers &&
    !!options.headers[api.constants.TRACE_AGENT_REQUEST_HEADER]
  );
}

/**
 * Transform a url to a request options.
 *
 * From: https://github.com/nodejs/node/blob/v12.16.2/lib/internal/url.js#L1271-L1290
 */
function urlToOptions(url: URL): httpModule.RequestOptions {
  const options: httpModule.RequestOptions | UrlWithStringQuery = {
    protocol: url.protocol,
    hostname:
      typeof url.hostname === 'string' && url.hostname.startsWith('[')
        ? url.hostname.slice(1, -1)
        : url.hostname,
    hash: url.hash,
    search: url.search,
    pathname: url.pathname,
    path: `${url.pathname || ''}${url.search || ''}`,
    href: url.href,
  };
  if (url.port !== '') {
    options.port = Number(url.port);
  }
  if (url.username || url.password) {
    options.auth = `${url.username}:${url.password}`;
  }
  return options;
}

function makeRequestTrace(
  protocol: string,
  request: RequestFunction,
  api: Tracer
): RequestFunction {
  // On Node 8+ we use the following function to patch both request and get.
  // Here `request` may also happen to be `get`.
  return function requestTrace(
    this: never,
    url: httpModule.RequestOptions | string | URL,
    options?:
      | httpModule.RequestOptions
      | ((res: httpModule.IncomingMessage) => void),
    callback?: (res: httpModule.IncomingMessage) => void
  ): ClientRequest {
    let urlString: string | undefined;
    if (!url) {
      // These are error conditions; defer to http.request and don't trace.
      // eslint-disable-next-line prefer-rest-params
      return request.apply(this, arguments);
    } else if (typeof url === 'string') {
      // save the value of uri so we don't have to reconstruct it later
      urlString = url;
      url = urlToOptions(new URL(url));
    } else if (url instanceof URL) {
      url = urlToOptions(url);
    }
    if (typeof options === 'function') {
      callback = options;
      options = url;
    } else {
      options = Object.assign({}, url, options);
    }

    // Don't trace ourselves lest we get into infinite loops
    // Note: this would not be a problem if we guarantee buffering
    // of trace api calls. If there is no buffering then each trace is
    // an http call which will get a trace which will be an http call
    if (isTraceAgentRequest(options, api)) {
      // eslint-disable-next-line prefer-rest-params
      return request.apply(this, arguments);
    }

    const span = api.createChildSpan({name: getSpanName(options)});
    if (!api.isRealSpan(span)) {
      // eslint-disable-next-line prefer-rest-params
      return request.apply(this, arguments);
    }

    if (!urlString) {
      urlString = extractUrl(options, protocol);
    }

    const method = (options as ClientRequestArgs).method || 'GET';
    span.addLabel(api.labels.HTTP_METHOD_LABEL_KEY, method);
    span.addLabel(api.labels.HTTP_URL_LABEL_KEY, urlString);

    // If outgoing request headers contain the "Expect" header, the returned
    // ClientRequest will throw an error if any new headers are added. For this
    // reason, only in this scenario, we opt to clone the options object to
    // inject the trace context header instead of using ClientRequest#setHeader.
    // (We don't do this generally because cloning the options object is an
    // expensive operation.)
    // See https://github.com/googleapis/cloud-trace-nodejs/pull/766 for a full
    // explanation.
    let traceHeaderPreinjected = false;
    if (hasExpectHeader(options)) {
      traceHeaderPreinjected = true;
      // "Clone" the options object -- but don't deep-clone anything except for
      // headers.
      options = Object.assign({}, options) as ClientRequestArgs;
      options.headers = Object.assign({}, options.headers);
      const headers = options.headers;
      // Inject the trace context header.
      api.propagation.inject((key, value) => {
        headers[key] = value;
      }, span.getTraceContext());
    }

    const req = request(options, res => {
      api.wrapEmitter(res);
      let numBytes = 0;
      let listenerAttached = false;
      // Responses returned by http#request are yielded in paused mode.
      // Attaching a 'data' listener to the request will switch the stream to
      // flowing mode which could cause the request to drain before the calling
      // framework has a chance to attach their own listeners. To avoid this, we
      // attach our listener lazily. This approach to tracking data size will
      // not observe data read by explicitly calling `read` on the request. We
      // expect this to be very uncommon as it is not mentioned in any of the
      // official documentation.
      shimmer.wrap(res, 'on', on => {
        return function on_trace(this: {}, eventName: string) {
          if (eventName === 'data' && !listenerAttached) {
            listenerAttached = true;
            on.call(this, 'data', (chunk: string | Buffer) => {
              numBytes += chunk.length;
            });
          }
          // eslint-disable-next-line prefer-rest-params
          return on.apply(this, arguments);
        };
      });
      res.on('end', () => {
        span.addLabel(api.labels.HTTP_RESPONSE_SIZE_LABEL_KEY, numBytes);
        span.addLabel(api.labels.HTTP_RESPONSE_CODE_LABEL_KEY, res.statusCode);
        span.endSpan();
      });
      if (callback) {
        return callback(res);
      }
    });
    api.wrapEmitter(req);
    req.on('error', error => {
      span.addLabel(api.labels.ERROR_DETAILS_NAME, error.name);
      span.addLabel(api.labels.ERROR_DETAILS_MESSAGE, error.message);
      span.endSpan();
    });
    // Inject the trace context header, but only if it wasn't already injected
    // earlier.
    if (!traceHeaderPreinjected) {
      api.propagation.inject((key, value) => {
        try {
          req.setHeader(key, value);
        } catch (e) {
          if (
            (e as NodeJS.ErrnoException).code === ERR_HTTP_HEADERS_SENT ||
            (e as NodeJS.ErrnoException).message === ERR_HTTP_HEADERS_SENT_MSG
          ) {
            // Swallow the error.
            // This would happen in the pathological case where the Expect
            // header exists but is not detected by hasExpectHeader.
          } else {
            throw e;
          }
        }
      }, span.getTraceContext());
    }
    return req;
  };
}

function patchHttp(http: HttpModule, api: Tracer) {
  shimmer.wrap(http, 'request', request => {
    return makeRequestTrace('http:', request, api);
  });

  // http.get in Node 8 calls the private copy of request rather than the one
  // we have patched on module.export, so patch get as well.
  shimmer.wrap(http, 'get', (): typeof http.get => {
    // Re-implement http.get. This needs to be done (instead of using
    // makeRequestTrace to patch it) because we need to set the trace
    // context header before the returned ClientRequest is ended.
    // The Node.js docs state that the only differences between request and
    // get are that (1) get defaults to the HTTP GET method and (2) the
    // returned request object is ended immediately.
    // The former is already true (at least in supported Node versions up to
    // v9), so we simply follow the latter.
    // Ref:
    // https://nodejs.org/dist/latest/docs/api/http.html#http_http_get_options_callback
    return function getTrace(this: never) {
      // eslint-disable-next-line prefer-rest-params
      const req = http.request.apply(this, arguments);
      req.end();
      return req;
    };
  });
}

// https.get depends on Node http internals in 8.9.0 and 9+ instead of the
// public http module.
function patchHttps(https: HttpsModule, api: Tracer) {
  shimmer.wrap(https, 'request', request => {
    return makeRequestTrace('https:', request, api);
  });
  shimmer.wrap(https, 'get', () => {
    return function getTrace(this: never) {
      // eslint-disable-next-line prefer-rest-params
      const req = https.request.apply(this, arguments);
      req.end();
      return req;
    };
  });
}

function unpatchHttp(http: HttpModule) {
  shimmer.unwrap(http, 'request');
  shimmer.unwrap(http, 'get');
}

function unpatchHttps(https: HttpsModule) {
  shimmer.unwrap(https, 'request');
  shimmer.unwrap(https, 'get');
}

const plugin: Plugin = [
  {
    file: 'http',
    patch: patchHttp,
    unpatch: unpatchHttp,
  },
  {
    file: 'https',
    versions: '<8.9.0 || ^8.9.1',
    // require http if it wasn't patched yet, because the https client uses
    // the public 'http' module.
    patch: () => require('http'),
  },
  {
    file: 'https',
    versions: '=8.9.0 || >=9.0.0',
    patch: patchHttps,
    unpatch: unpatchHttps,
  },
];
export = plugin;
