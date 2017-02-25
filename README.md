# Stackdriver Trace for Node.js

[![NPM Version][npm-image]][npm-url]
[![Build Status][travis-image]][travis-url]
[![Test Coverage][coveralls-image]][coveralls-url]
[![Dependency Status][david-image]][david-url]
[![devDependency Status][david-dev-image]][david-dev-url]
[![Known Vulnerabilities][snyk-image]][snyk-url]

> *This module is experimental, and should be used by early adopters. This module uses APIs that may be undocumented and subject to change without notice.*

This module provides Stackdriver Trace support for Node.js applications. [Stackdriver Trace](https://cloud.google.com/cloud-trace/) is a feature of [Google Cloud Platform](https://cloud.google.com/) that collects latency data (traces) from your applications and displays it in near real-time in the [Google Cloud Console][cloud-console].

![Stackdriver Trace Overview](doc/images/cloud-trace-overview-page.png)

## Prerequisites

1. Your application will need to be using Node.js version 0.12 or greater.
1. You will need a project in the [Google Developers Console][cloud-console]. Your application can run anywhere, but the trace data is associated with a particular project.
1. [Enable the Trace API](https://console.cloud.google.com/flows/enableapi?apiid=cloudtrace) for your project.

## Installation

1. Install with [`npm`](https://www.npmjs.com) or add to your [`package.json`](https://docs.npmjs.com/files/package.json#dependencies).

        npm install --save @google/cloud-trace

2. Set the GCLOUD_PROJECT environment variable. You can find your Project ID in the [Google Cloud Developers Console][cloud-console], or by running the command `gcloud projects list`. You can ensure this environment variable is set at startup time by placing it in your startup script in `package.json`:

        "scripts": {
          "start": "GCLOUD_PROJECT=<YOUR_PROJECT_ID> node server.js",
        },

3. Include and start the library *as the very first action in your application*:

        var agent = require('@google/cloud-trace').start();

  If you use `--require` in your start up command, make sure that the trace agent is --required first.

4. If you are running your application locally, or on a machine where you are using the [Google Cloud SDK][gcloud-sdk], make sure to log in with the application default credentials:

        gcloud beta auth application-default login

If you are running somewhere other than the Google Cloud Platform, see [running elsewhere](#running-elsewhere).

## Configuration

See [the default configuration](config.js) for a list of possible configuration options. These options can be passed to the agent through the object argument to the start command shown above:

        require('@google/cloud-trace').start({samplingRate: 500});

Alternatively, you can provide configuration through a config file. This can be useful if you want to load our module using `--require` on the command line instead of editing your main script. You can start by copying the default config file and modifying it to suit your needs. The `GCLOUD_DIAGNOSTICS_CONFIG` environment variable should point to your configuration file.

## Running on Google Cloud Platform

There are three different services that can host Node.js application to Google Cloud Platform.

### Google App Engine flexible environment

If you are using [Google App Engine flexible environment](https://cloud.google.com/appengine/docs/flexible/), you do not have to do any additional configuration.

### Google Compute Engine

Your VM instances need to be created with the `https://www.googleapis.com/auth/trace.append` scope if created via the [gcloud](https://cloud.google.com/sdk) CLI or the Google Cloud Platform API, or with the 'Allow API access' checkbox selected if created via the [console][cloud-console] (see screenshot).

![GCE API](doc/images/gce.png?raw=true)

If you already have VMs that were created without API access and do not wish to recreate it, you can follow the instructions for using a service account under [running elsewhere](#running-elsewhere).

### Google Container Engine

Container Engine nodes need to also be created with the `https://www.googleapis.com/auth/trace.append` scope, which is configurable during cluster creation. Alternatively, you can follow the instructions for using a service account under [running elsewhere](#running-elsewhere). It's recommended that you store the service account credentials as [Kubernetes Secret](http://kubernetes.io/v1.1/docs/user-guide/secrets.html).

## Running elsewhere

If your application is running outside of Google Cloud Platform, such as locally, on-premise, or on another cloud provider, you can still use Stackdriver Trace.

1. You will need to specify your project ID when starting the trace agent.

        GCLOUD_PROJECT=particular-future-12345 node myapp.js

2. You need to provide service account credentials to your application. The recommended way is via [Application Default Credentials][app-default-credentials].

  1. [Create a new JSON service account key][service-account].
  2. Copy the key somewhere your application can access it. Be sure not to expose the key publicly.
  3. Set the environment variable `GOOGLE_APPLICATION_CREDENTIALS` to the full path to the key. The trace agent will automatically look for this environment variable.

If you are running your application on a development machine or test environment where you are using the [`gcloud` command line tools][gcloud-sdk], and are logged using `gcloud beta auth application-default login`, you already have sufficient credentials, and a service account key is not required.
  
Alternatively, you may set the `keyFilename` or `credentials` configuration field to the full path or contents to the key file, respectively. Setting either of these fields will override either setting `GOOGLE_APPLICATION_CREDENTIALS` or logging in using `gcloud`. (See the [default configuration](config.js) for more details.)

## Viewing your traces

Run your application and start sending some requests towards your application. In about 30 seconds or so, you should see trace data gathered in the [STACKDRIVER -> Traces -> Trace List](https://console.cloud.google.com/traces/overview) in the console:

![Trace List](doc/images/tracelist.png?raw=true)

This is the trace list that shows a sampling of the incoming requests your application is receiving. You can click on a URI to drill down into the details. This will show you the RPCs made by your application and their associated latency:

![Trace View](doc/images/traceview.png?raw=true)

## What gets traced

The trace agent can do automatic tracing of HTTP requests when using these frameworks:
* [express](https://www.npmjs.com/package/express) version 4
* [hapi](https://www.npmjs.com/package/hapi) versions 8 - 16
* [restify](https://www.npmjs.com/package/restify) versions 3 - 4 (experimental)

The agent will also automatic trace of the following kinds of RPCs:
* Outbound HTTP requests
* [MongoDB-core](https://www.npmjs.com/package/mongodb-core) version 1
* [Mongoose](https://www.npmjs.com/package/mongoose) version 4
* [Redis](https://www.npmjs.com/package/redis) versions 0.12 - 2
* [MySQL](https://www.npmjs.com/package/mysql) version ^2.9

You can use the [Custom Tracing API](#custom-tracing-api) to trace other processes in your application.

We are working on expanding the types of frameworks and services we can do automatic tracing for. We are also interested in hearing your feedback on what other frameworks, or versions, you would like to see supported. This would help us prioritize support going forward. If you want support for a particular framework or RPC, please file a bug or +1 an existing bug.

## Advanced trace configuration

The trace agent can be configured by passing a configurations object to the agent `start` method. This configuration option accepts all values in the [default configuration](config.js).

One configuration option of note is `enhancedDatabaseReporting`. Setting this option to `true` will cause database operations for redis and MongoDB to record query summaries and results as labels on reported trace spans.

## Disabling the trace agent

The trace agent can be turned off by either setting the `GCLOUD_TRACE_DISABLE` environment variable or specifying `enabled: false` in your configuration file.

## Trace batching and sampling

The aggregation of trace spans before publishing can be configured using the `flushDelaySeconds` and `bufferSize` [options](config.js). The spans recorded for each incoming requests are placed in a buffer after the request has completed. Spans will be published to the UI in batch when the spans from `bufferSize` requests have been queued in the buffer or after `flushDelaySeconds` have passed since the last publish, whichever comes first.

The trace configuration additionally exposes the `samplingRate` option which sets an upper bound on the number of traced requests captured per second. Some Google Cloud environments may override this sampling policy.

## Custom Tracing API

The custom tracing API can be used to add custom spans to trace. A *span* is a particular unit of work within a trace, such as an RPC request. Spans may be nested; the outermost span is called a *root span*, even if there are no nested child spans. Root spans typically correspond to incoming requests, while *child spans* typically correspond to outgoing requests, or other work that is triggered in response to incoming requests.

For any of the web frameworks listed above (`express`, `hapi`, `koa` and `restify`), a root span is automatically started whenever an incoming request is received (in other words, all middleware already runs within a root span). If you wish to record a span outside of any of these frameworks, any traced code must run within a root span that you create yourself.

### Accessing the API

Calling the `start` function returns an instance of `TraceApi`, which provides an interface for tracing:

```javascript
  var traceApi = require('@google/cloud-trace').start();
```

It can also be retrieved by subsequent calls to `get` elsewhere:

```javascript
  // after start() is called
  var traceApi = require('@google/cloud-trace').get();
```

The object returned by both of these calls is guaranteed to have the surface described below, even if the agent is disabled.

### The `TraceApi` Object

A `TraceApi` instance, in short, provides functions that facilitate the following:

- Creating trace spans and add labels to them.
- Getting information about how the trace agent was configured in the current application.
- Parsing and serializing trace contexts to support distributed tracing between microservices.
- Binding callbacks and event emitters in order to propagate trace contexts across asynchronous boundaries.

In addition to the above, `TraceApi` also provides a number of well-known label keys and constants through its `labels` and `constants` fields respectively.

#### Trace Spans

These functions provide the capability to create trace spans, add labels to them, and close them. `transaction` and `childSpan` are instances of `Transaction` and `ChildSpan`, respectively.

* `TraceApi#api.runInRootSpan(options, fn)`
  * `options`: [`TraceOptions`](#trace-span-options)
  * `fn`: `function(?Span): any`
  * Returns `any`
  * Attempts to create a root span, run the given callback, and pass it a `Span` object if the root span was successfuly created. Otherwise, the given function is run with `null` as an argument. This may be for one of two reasons:
    * The trace policy, as specified by the user-given configuration, disallows a root span from being created under the current circumstances.
    * The trace agent is disabled, either because it wasn't started at all, started in disabled mode, or started in an environment where the GCP project ID could not be obtained.
* `TraceApi#createChildSpan(options)`
  * `options`: [`TraceOptions`](#trace-span-options)
  * Returns `?Span`
  * Attempts to create a child span, and returns a `Span` object if this is successful. Otherwise, it returns `null`. This may be for one of several reasons:
    * A root span wasn't created beforehand because an earlier call to `runInRootSpan` didn't generate one.
    * A root span wasn't created beforehand because `runInRootSpan` was not called at all. This likely indicates a programmer error, because child spans should always be nested within a root span.
    * A root span was created beforehand, but context was lost between then and now. This may also be a programmer error, because child spans should always be created within the context of a root span. See [`Context Propagation`](#context-propagation) for details on properly propagating root span context.
* `Span#addLabel(key, value)`
  * `key`: `string`
  * `value`: `any`
  * Add a label to the span associated with the calling object. If the value is not a string, it will be stringified with `util.inspect`.
  * **Note:** Keys and values may be truncated according to the user's configuration and limits set on the Stackdriver Trace API. Keys must be less than 128 bytes, while values must be less than 16 kilobytes, as specified in the [Stackdriver Trace docs][stackdriver-trace-span]. The user may specify a smaller limit on value size through the `maximumLabelValueSize` configuration field.
* `Span#endSpan()`
  * Ends the span associated with the calling object. This function should only be called once.

##### Trace Span Options

Some functions above accept a `TraceOptions` object, which has the following fields:

* `name`: `string`
  * Required
  * The name that should be given to the newly created span.
* `traceContext`: `string`
  * Optional for root spans, ignored for child spans
  * A serialized trace context. If the module being traced is a web framework,
    the plugin that patches this module should attempt to extract this from an
    incoming request header and set this field; omitting this field may cause
    trace spans that correspond to a single request across several services in a
    distributed environment (e.g. microservices) to appear disassociated with
    one another.
    See also [Cross-Service Trace Contexts](#cross-service-trace-contexts).
* `url`: `string`
  * Optional for root spans, ignored for child spans
  * The URL of the incoming request. This only applies if the module being
    traced is a web framework. If given, a label will automatically be created
    for the new span for the url (under the key `url`). This field will also be
    compared against the trace agent's URL filtering policy to check whether a
    span should be created.
  * Plugin developers should favor populating this field over using
    `Span#addLabel` to add the `url`, as adding the url here bypasses user-set
    label limits.
* `skipFrames`: `number`
  * Optional; defaults to `0`
  * Trace spans include the call stack at the moment of creation as part of the
    information gathered. The call stack may include undesirable frames such as
    frames within the plugin itself. This field specifies the number of stack
    frames to skip when writing the call stack to the trace span. Frames within
    the trace agent implementation are automatically skipped.

#### Trace Agent Configuration

* `TraceApi#enhancedDatabaseReportingEnabled()`
  * Returns `boolean`
  * Returns whether the trace agent was started with an enhanced level of reporting. See the [configuration][config-js] object definition for more details.

#### Cross-Service Trace Contexts

The Trace Agent supports distributed tracing, so that in supported web frameworks, incoming requests that are known to come from other services that are also integrated with Stackdriver Trace (through the ['x-cloud-trace-context'][stackdriver-trace-faq] field in request headers) should build spans that are aware of the information serialized in this field, known as the trace context. (For more information, see the [Dapper][dapper-paper] paper describing the distributed tracing system.)

It is up to plugin developers to extract serialized trace context from incoming requests and propagate it in outgoing requests. The Plugin API accepts the serialized trace context as an [option](#trace-span-options) when creating new trace spans.

The string `'x-cloud-trace-context'` is provided as `api.constants.TRACE_CONTEXT_HEADER_NAME`.

* `Span#getTraceContext()`
  * Returns `string`
  * Gets the trace context serialized as a string.

#### Context Propagation

These functions help provide context propagation for root spans. Context should be propagated anywhere control is yielded to the user; this is either through a callback or an emitter. This will enable child spans to be associated with the correct root span.

* `api.bind(fn)`
  * `fn`: `function`
  * Returns `function` (same signature as `fn`)
  * Binds the given function to the current context.

* `api.bindEmitter(emitter)`
  * `emitter`: `EventEmitter`
  * Binds any event handlers subsequently attached to the given event emitter to the current context.

## Plugin Developer Guide

The trace agent is driven by a set of plugins that describe how to patch a module to generate trace spans when that module is used. We provide plugins for some well-known modules such as `express`, `mongodb`, and `http`, and provide a means for developers to create their own.

A plugin consists of a set of *patch objects*. A patch object gives information about how a file in a module should be patched in order to create trace spans.

Each patch object can contain the following fields:

* `file`: The path to the file whose exports should be patched, relative to the root of the module. You can specify an empty string, or omit this field entirely, to specify the export of the module itself.
* `versions`: A `semver` expression which will be used to control whether the specified file will be patched based on the module version; the patch will only be applied if the loaded module version satisfies this expression. This might be useful if your plugin only works on some versions of a module, or if you are patching internal mechanisms that are specific to a certain range of versions. If omitted, all versions of the module will be patched.
* `patch`: A function describing how the module exports for a given file should be patched. It will be passed two arguments: the object exported from the file, and an instance of `TraceApi`.
* `intercept`: A function describing how the module exports for a file should be replaced with a new object. It accepts the same arguments as `patch`, but unlike `patch`, it should return the object that will be treated as the replacement value for `module.exports` (hence the name `intercept`).
* `unpatch`: A function describing how the module exports for a given file should be unpatched. This should generally mirror the logic in `patch`; for example, if `patch` wraps a method, `unpatch` should unwrap it.

If `patch` is supplied, then `unpatch` will be called if the agent must be disabled for any reason. This does not hold true for `intercept`: instead, the module exports for the original file will automatically be set to its original, unintercepted value.

In addition, `patch` and `intercept` have overlapping functionality.

For these reasons, plugins should not implement `patch` and/or `unpatch` alongside `intercept`. We strongly encourage plugin developers to implement patching and unpatching methods, using `intercept` only when needed.

A plugin simply exports a list of patch objects.

For example, here's what a plugin for `express` might export:

```js
// Patches express 3.x/4.x.
// Only the patch function corresponding to the version of express will be
// called.

function patchModuleRoot4x(expressModule, traceApi) {
  // Patch expressModule using the traceApi object here.
  // expressModule is the object retrieved with require('express').
  // traceApi exposes methods to facilitate tracing, and is documented in detail
  // in the "Custom Tracing API" section above.
  // 
}

function patchModuleRoot3x(expressModule, traceApi) {
  // ...
}

module.exports = [
  { file: '', versions: '4.x', patch: patchModuleRoot4x },
  { file: '', versions: '3.x', patch: patchModuleRoot3x }
];
```

In most cases, it should be sufficient to patch just the root (public exports) of the module, in which case the `file` field can set to `''` or omitted. Based on how the module being patched is implemented, however, it may be necessary to patch other parts of the module as well.

We recommend using [`shimmer`][shimmer] to modify function properties on objects.

Please refer to the [built-in plugins][builtin-plugins] for more comprehensive examples.

## Contributing changes

* See [CONTRIBUTING.md](CONTRIBUTING.md)

## Licensing

* See [LICENSE](LICENSE)

[cloud-console]: https://console.cloud.google.com
[gcloud-sdk]: https://cloud.google.com/sdk/gcloud/
[app-default-credentials]: https://developers.google.com/identity/protocols/application-default-credentials
[service-account]: https://console.developers.google.com/apis/credentials/serviceaccountkey
[stackdriver-trace-faq]: https://cloud.google.com/trace/docs/faq
[stackdriver-trace-span]: https://cloud.google.com/trace/api/reference/rest/v1/projects.traces#TraceSpan
[dapper-paper]: https://research.google.com/pubs/pub36356.html
[shimmer]: https://github.com/othiym23/shimmer
[builtin-plugins]: https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/tree/master/src/plugins
[npm-image]: https://badge.fury.io/js/%40google%2Fcloud-trace.svg
[npm-url]: https://npmjs.org/package/@google/cloud-trace
[travis-image]: https://travis-ci.org/GoogleCloudPlatform/cloud-trace-nodejs.svg?branch=master
[travis-url]: https://travis-ci.org/GoogleCloudPlatform/cloud-trace-nodejs
[coveralls-image]: https://coveralls.io/repos/GoogleCloudPlatform/cloud-trace-nodejs/badge.svg?branch=master&service=github
[coveralls-url]: https://coveralls.io/github/GoogleCloudPlatform/cloud-trace-nodejs?branch=master
[david-image]: https://david-dm.org/GoogleCloudPlatform/cloud-trace-nodejs.svg
[david-url]: https://david-dm.org/GoogleCloudPlatform/cloud-trace-nodejs
[david-dev-image]: https://david-dm.org/GoogleCloudPlatform/cloud-trace-nodejs/dev-status.svg
[david-dev-url]: https://david-dm.org/GoogleCloudPlatform/cloud-trace-nodejs?type=dev
[snyk-image]: https://snyk.io/test/github/GoogleCloudPlatform/cloud-trace-nodejs/badge.svg
[snyk-url]: https://snyk.io/test/github/GoogleCloudPlatform/cloud-trace-nodejs
