[//]: # "This README.md file is auto-generated, all changes to this file will be lost."
[//]: # "To regenerate it, use `python -m synthtool`."
<img src="https://avatars2.githubusercontent.com/u/2810941?v=3&s=96" alt="Google Cloud Platform logo" title="Google Cloud Platform" align="right" height="96" width="96"/>

# [Stackdriver Trace: Node.js Client](https://github.com/googleapis/cloud-trace-nodejs)

[![release level](https://img.shields.io/badge/release%20level-beta-yellow.svg?style=flat)](https://cloud.google.com/terms/launch-stages)
[![npm version](https://img.shields.io/npm/v/@google-cloud/trace-agent.svg)](https://www.npmjs.org/package/@google-cloud/trace-agent)
[![codecov](https://img.shields.io/codecov/c/github/googleapis/cloud-trace-nodejs/master.svg?style=flat)](https://codecov.io/gh/googleapis/cloud-trace-nodejs)




Node.js Support for StackDriver Trace


A comprehensive list of changes in each version may be found in
[the CHANGELOG](https://github.com/googleapis/cloud-trace-nodejs/blob/master/CHANGELOG.md).

* [Stackdriver Trace Node.js Client API Reference][client-docs]
* [Stackdriver Trace Documentation][product-docs]
* [github.com/googleapis/cloud-trace-nodejs](https://github.com/googleapis/cloud-trace-nodejs)

Read more about the client libraries for Cloud APIs, including the older
Google APIs Client Libraries, in [Client Libraries Explained][explained].

[explained]: https://cloud.google.com/apis/docs/client-libraries-explained

**Table of contents:**


* [Quickstart](#quickstart)
  * [Before you begin](#before-you-begin)
  * [Installing the client library](#installing-the-client-library)

* [Samples](#samples)
* [Versioning](#versioning)
* [Contributing](#contributing)
* [License](#license)

## Quickstart

### Before you begin

1.  [Select or create a Cloud Platform project][projects].
1.  [Enable the Stackdriver Trace API][enable_api].
1.  [Set up authentication with a service account][auth] so you can access the
    API from your local workstation.

### Installing the client library

```bash
npm install @google-cloud/trace-agent
```


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
* [hapi](https://www.npmjs.com/package/hapi) (versions 8 - 19)
* [koa](https://www.npmjs.com/package/koa) (version 1 - 2)
* [restify](https://www.npmjs.com/package/restify) (versions 3 - 8)

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

[async-hooks]: https://nodejs.org/api/async_hooks.html
[cloud-console]: https://console.cloud.google.com
[codecov-image]: https://codecov.io/gh/googleapis/cloud-trace-nodejs/branch/master/graph/badge.svg
[codecov-url]: https://codecov.io/gh/googleapis/cloud-trace-nodejs
[queuing-problem]: https://github.com/groundwater/nodejs-symposiums/tree/master/2016-02-26-Errors/Round1/UserModeQueuing
[setting-up-stackdriver-trace]: https://cloud.google.com/trace/docs/setup/nodejs


## Samples

Samples are in the [`samples/`](https://github.com/googleapis/cloud-trace-nodejs/tree/master/samples) directory. The samples' `README.md`
has instructions for running the samples.

| Sample                      | Source Code                       | Try it |
| --------------------------- | --------------------------------- | ------ |
| App | [source code](https://github.com/googleapis/cloud-trace-nodejs/blob/master/samples/app.js) | [![Open in Cloud Shell][shell_img]](https://console.cloud.google.com/cloudshell/open?git_repo=https://github.com/googleapis/cloud-trace-nodejs&page=editor&open_in_editor=samples/app.js,samples/README.md) |
| Snippets | [source code](https://github.com/googleapis/cloud-trace-nodejs/blob/master/samples/snippets.js) | [![Open in Cloud Shell][shell_img]](https://console.cloud.google.com/cloudshell/open?git_repo=https://github.com/googleapis/cloud-trace-nodejs&page=editor&open_in_editor=samples/snippets.js,samples/README.md) |



The [Stackdriver Trace Node.js Client API Reference][client-docs] documentation
also contains samples.

## Supported Node.js Versions

Our client libraries follow the [Node.js release schedule](https://nodejs.org/en/about/releases/).
Libraries are compatible with all current _active_ and _maintenance_ versions of
Node.js.

Client libraries targetting some end-of-life versions of Node.js are available, and
can be installed via npm [dist-tags](https://docs.npmjs.com/cli/dist-tag).
The dist-tags follow the naming convention `legacy-(version)`.

_Legacy Node.js versions are supported as a best effort:_

* Legacy versions will not be tested in continuous integration.
* Some security patches may not be able to be backported.
* Dependencies will not be kept up-to-date, and features will not be backported.

#### Legacy tags available

* `legacy-8`: install client libraries from this dist-tag for versions
  compatible with Node.js 8.

## Versioning

This library follows [Semantic Versioning](http://semver.org/).



This library is considered to be in **beta**. This means it is expected to be
mostly stable while we work toward a general availability release; however,
complete stability is not guaranteed. We will address issues and requests
against beta libraries with a high priority.




More Information: [Google Cloud Platform Launch Stages][launch_stages]

[launch_stages]: https://cloud.google.com/terms/launch-stages

## Contributing

Contributions welcome! See the [Contributing Guide](https://github.com/googleapis/cloud-trace-nodejs/blob/master/CONTRIBUTING.md).

Please note that this `README.md`, the `samples/README.md`,
and a variety of configuration files in this repository (including `.nycrc` and `tsconfig.json`)
are generated from a central template. To edit one of these files, make an edit
to its template in this
[directory](https://github.com/googleapis/synthtool/tree/master/synthtool/gcp/templates/node_library).

## License

Apache Version 2.0

See [LICENSE](https://github.com/googleapis/cloud-trace-nodejs/blob/master/LICENSE)

[client-docs]: https://googleapis.dev/nodejs/trace/latest/
[product-docs]: https://cloud.google.com/trace
[shell_img]: https://gstatic.com/cloudssh/images/open-btn.png
[projects]: https://console.cloud.google.com/project
[billing]: https://support.google.com/cloud/answer/6293499#enable-billing
[enable_api]: https://console.cloud.google.com/flows/enableapi?apiid=cloudtrace.googleapis.com
[auth]: https://cloud.google.com/docs/authentication/getting-started
