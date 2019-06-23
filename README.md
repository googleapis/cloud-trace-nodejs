# Stackdriver Trace Agent for Node.js

[![NPM Version][npm-image]][npm-url]
[![Build Status][circle-image]][circle-url]
[![Test Coverage][codecov-image]][codecov-url]
[![Dependency Status][david-image]][david-url]
[![devDependency Status][david-dev-image]][david-dev-url]
[![Known Vulnerabilities][snyk-image]][snyk-url]

> **Beta**. *This is a Beta release of the Stackdriver Trace agent for Node.js. These libraries might be changed in backward-incompatible ways and are not subject to any SLA or deprecation policy.*

This module provides automatic tracing for Node.js applications with Stackdriver Trace. [Stackdriver Trace](https://cloud.google.com/cloud-trace/) is a feature of [Google Cloud Platform](https://cloud.google.com/) that collects latency data (traces) from your applications and displays it in near real-time in the [Google Cloud Console][cloud-console].

<img src="https://raw.githubusercontent.com/googleapis/cloud-trace-nodejs/master/doc/images/cloud-trace-overview-page.png" alt="Stackdriver Trace Overview" />

## Usage

The Trace Agent supports Node 8+.

> **Note**: Using the Trace Agent requires a Google Cloud Project with the [Stackdriver Trace API enabled](https://console.cloud.google.com/flows/enableapi?apiid=cloudtrace) and associated credentials. These values are auto-detected if the application is running on Google Cloud Platform. If your application is not running on GCP, you will need to specify the project ID and credentials either through the configuration object, or with environment variables. See [Setting Up Stackdriver Trace for Node.js][setting-up-stackdriver-trace] for more details.

> **Note**: The Trace Agent does not currently work out-of-the-box with Google Cloud Functions (or Firebase Cloud Functions). See [#725](https://github.com/googleapis/cloud-trace-nodejs/issues/725) for a tracking issue and details on how to work around this.

Simply require and start the Trace Agent as the first module in your application:

```js
require('@google-cloud/trace-agent').start();
// ...
```

Optionally, you can pass a [configuration object](https://github.com/googleapis/cloud-trace-nodejs/blob/master/src/config.ts) to the `start()` function as follows:

<!-- TODO(kjin): Generate documentation from the public interface of the Trace Agent, and link it here. -->

```js
require('@google-cloud/trace-agent').start({
  samplingRate: 5, // sample 5 traces per second, or at most 1 every 200 milliseconds.
  ignoreUrls: [ /^\/ignore-me/ ] // ignore the "/ignore-me" endpoint.
  ignoreMethods: [ 'options' ] // ignore requests with OPTIONS method (case-insensitive).
});
// ...
```

The object returned by `start()` may be used to create [custom trace spans](#custom-tracing-api):

```js
const tracer = require('@google-cloud/trace-agent').start();
// ...

app.get('/', async () => {
  const customSpan = tracer.createChildSpan({name: 'my-custom-span'});
  await doSomething();
  customSpan.endSpan();
  // ...
});
```

## What gets traced

The trace agent can do automatic tracing of the following web frameworks:
* [express](https://www.npmjs.com/package/express) (version 4)
* [gRPC](https://www.npmjs.com/package/grpc) server (version ^1.1)
* [hapi](https://www.npmjs.com/package/hapi) (versions 8 - 16)
* [koa](https://www.npmjs.com/package/koa) (version 1)
* [restify](https://www.npmjs.com/package/restify) (versions 3 - 7)

The agent will also automatically trace RPCs from the following modules:
* Outbound HTTP requests through `http`, `https`, and `http2` core modules
* [grpc](https://www.npmjs.com/package/grpc) client (version ^1.1)
* [mongodb-core](https://www.npmjs.com/package/mongodb-core) (version 1 - 3)
* [mongoose](https://www.npmjs.com/package/mongoose) (version 4 - 5)
* [mysql](https://www.npmjs.com/package/mysql) (version ^2.9)
* [mysql2](https://www.npmjs.com/package/mysql2) (version 1)
* [pg](https://www.npmjs.com/package/pg) (versions 6 - 7)
* [redis](https://www.npmjs.com/package/redis) (versions 0.12 - 2)

You can use the [Custom Tracing API](#custom-tracing-api) to trace other modules in your application.

To request automatic tracing support for a module not on this list, please [file an issue](https://github.com/googleapis/cloud-trace-nodejs/issues). Alternatively, you can [write a plugin yourself](https://github.com/googleapis/cloud-trace-nodejs/blob/master/doc/plugin-guide.md).

### Tracing Additional Modules

To load an additional plugin, specify it in the agent's configuration:

```js
  require('@google-cloud/trace-agent').start({
    plugins: {
      // You may use a package name or absolute path to the file.
      'my-module': '@google-cloud/trace-agent-plugin-my-module',
      'another-module': path.join(__dirname, 'path/to/my-custom-plugins/plugin-another-module.js')
    }
  });
```

This list of plugins will be merged with the list of built-in plugins, which will be loaded by the plugin loader. Each plugin is only loaded when the module that it patches is loaded; in other words, there is no computational overhead for listing plugins for unused modules.

## Custom Tracing API

The custom tracing API can be used to create custom trace spans. A *span* is a particular unit of work within a trace, such as an RPC request. Spans may be nested; the outermost span is called a *root span*, even if there are no nested child spans. Root spans typically correspond to incoming requests, while *child spans* typically correspond to outgoing requests, or other work that is triggered in response to incoming requests. This means that root spans shouldn't be created in a context where a root span already exists; a child span is more suitable here. Instead, root spans should be created to track work that happens outside of the request lifecycle entirely, such as periodically scheduled work. To illustrate:

```js
const tracer = require('@google-cloud/trace-agent').start();
// ...

app.get('/', (req, res) => {
  // We are in an automatically created root span corresponding to a request's
  // lifecycle. Here, we can manually create and use a child span to track the
  // time it takes to open a file.
  const readFileSpan = tracer.createChildSpan({ name: 'fs.readFile' });
  fs.readFile('/some/file', 'utf8', (err, data) => {
    readFileSpan.endSpan();
    res.send(data);
  });
});

// For any significant work done _outside_ of the request lifecycle, use
// runInRootSpan.
tracer.runInRootSpan({ name: 'init' }, rootSpan => {
  // ...
  // Be sure to call rootSpan.endSpan().
});
```

For any of the web frameworks for which we provide [built-in plugins](#what-gets-traced), a root span is automatically started whenever an incoming request is received (in other words, all middleware already runs within a root span). If you wish to record a span outside of any of these frameworks, any traced code must run within a root span that you create yourself.

### Accessing the API

Calling the `start` function returns an instance of `Tracer`, which provides an interface for tracing:

```js
const tracer = require('@google-cloud/trace-agent').start();
```

It can also be retrieved by subsequent calls to `get` elsewhere:

```js
// after start() is called
const tracer = require('@google-cloud/trace-agent').get();
```

A `Tracer` object is guaranteed to be returned by both of these calls, even if the agent is disabled.

A fully detailed overview of the `Tracer` object is available [here](https://github.com/googleapis/cloud-trace-nodejs/blob/master/doc/trace-api.md).

## How does automatic tracing work?

The Trace Agent automatically patches well-known modules to insert calls to functions that start, label, and end spans to measure latency of RPCs (such as mysql, redis, etc.) and incoming requests (such as express, hapi, etc.). As each RPC is typically performed on behalf of an incoming request, we must make sure that this association is accurately reflected in span data. To provide a uniform, generalized way of keeping track of which RPC belongs to which incoming request, we rely on [`async_hooks`][async-hooks] to keep track of the "trace context" across asynchronous boundaries.

`async_hooks` works well in most cases. However, it does have some limitations that can prevent us from being able to properly propagate trace context:

* It is possible that a module does its own queuing of callback functions – effectively merging asynchronous execution contexts. For example, one may write an http request buffering library that queues requests and then performs them in a batch in one shot. In such a case, when all the callbacks fire, they will execute in the context which flushed the queue instead of the context which added the callbacks to the queue. This problem is called the pooling problem or the [user-space queuing problem][queuing-problem], and is a fundamental limitation of JavaScript. If your application uses such code, you will notice that RPCs from many requests are showing up under a single trace, or that certain portions of your outbound RPCs do not get traced. In such cases we try to work around the problem through monkey patching, or by working with the library authors to fix the code to properly propagate context. However, finding problematic code is not always trivial.
* The `async_hooks` API has [issues tracking context](https://github.com/nodejs/node/issues/26064) around `await`-ed "thenables" (rather than real promises). Requests originating from the body of a `then` implementation in such a user-space "thenable" may not get traced. This is largely an unconventional case but is present in the `knex` module, which monkeypatches the Bluebird Promise's prototype to make database calls. __If you are using `knex` (esp. the `raw` function), see [#946](https://github.com/googleapis/cloud-trace-nodejs/issues/946) for more details on whether you are affected, as well as a suggested workaround.__

### Tracing bundled or webpacked server code.

*unsupported*

The Trace Agent does not support bundled server code, so bundlers like webpack or @zeit/ncc will not work.

## Contributing

Contributions welcome! See the [Contributing Guide](https://github.com/googleapis/cloud-trace-nodejs/blob/master/CONTRIBUTING.md).

## License

Apache Version 2.0

See [LICENSE](https://github.com/googleapis/cloud-trace-nodejs/blob/master/LICENSE)

[async-hooks]: https://nodejs.org/api/async_hooks.html
[cloud-console]: https://console.cloud.google.com
[codecov-image]: https://codecov.io/gh/googleapis/cloud-trace-nodejs/branch/master/graph/badge.svg
[codecov-url]: https://codecov.io/gh/googleapis/cloud-trace-nodejs
[david-dev-image]: https://david-dm.org/googleapis/cloud-trace-nodejs/dev-status.svg
[david-dev-url]: https://david-dm.org/googleapis/cloud-trace-nodejs?type=dev
[david-image]: https://david-dm.org/googleapis/cloud-trace-nodejs.svg
[david-url]: https://david-dm.org/googleapis/cloud-trace-nodejs
[npm-image]: https://badge.fury.io/js/%40google-cloud%2Ftrace-agent.svg
[npm-url]: https://npmjs.org/package/@google-cloud/trace-agent
[queuing-problem]: https://github.com/groundwater/nodejs-symposiums/tree/master/2016-02-26-Errors/Round1/UserModeQueuing
[setting-up-stackdriver-trace]: https://cloud.google.com/trace/docs/setup/nodejs
[snyk-image]: https://snyk.io/test/github/googleapis/cloud-trace-nodejs/badge.svg
[snyk-url]: https://snyk.io/test/github/googleapis/cloud-trace-nodejs
[circle-image]: https://circleci.com/gh/googleapis/cloud-trace-nodejs.svg?style=svg
[circle-url]: https://circleci.com/gh/googleapis/cloud-trace-nodejs
