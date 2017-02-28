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

A `TraceApi` instance provides functions that facilitate the following:

- Creating trace spans and add labels to them.
- Getting information about how the trace agent was configured in the current application.
- Parsing and serializing trace contexts to support distributed tracing between microservices.
- Binding callbacks and event emitters in order to propagate trace contexts across asynchronous boundaries.

In addition to the above, `TraceApi` also provides a number of well-known label keys and constants through its `labels` and `constants` fields respectively.

#### Trace Spans

These functions provide the capability to create trace spans, add labels to them, and close them.

* `TraceApi#api.runInRootSpan(options, fn)`
  * `options`: [`TraceOptions`](#trace-span-options)
  * `fn`: `function(?Span): any`
  * Returns `any` (return value of `fn`)
  * Attempts to create a root span and runs the given callback, passing it a `Span` object if the root span was successfuly created. Otherwise, the given function is run with `null` as an argument. This may be for one of two reasons:
    * The trace policy, as specified by the user-given configuration, disallows a root span from being created under the current circumstances.
    * The trace agent is disabled, either because it wasn't started at all, started in disabled mode, or encountered an initialization error.
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
  * A serialized trace context. If the module being traced is a web framework, the plugin that patches this module should attempt to extract this from an incoming request header and set this field; omitting this field may cause trace spans that correspond to a single request across several services in a distributed environment (e.g. microservices) to appear disassociated with one another. See also [Cross-Service Trace Contexts](#cross-service-trace-contexts).
* `url`: `string`
  * Optional for root spans, ignored for child spans
  * The URL of the incoming request. This only applies if the module being traced is a web framework. This field will also be compared against the trace agent's URL filtering policy to check whether a span should be created.
* `skipFrames`: `number`
  * Optional; defaults to `0`
  * Trace spans include the call stack at the moment of creation as part of the information gathered. The call stack may include undesirable frames such as frames within the plugin itself. This field specifies the number of stack frames to skip when writing the call stack to the trace span. Frames within the trace agent implementation are automatically skipped.

#### Trace Agent Configuration

* `TraceApi#enhancedDatabaseReportingEnabled()`
  * Returns `boolean`
  * Returns whether the trace agent was started with an enhanced level of reporting. See the [configuration][config-js] object definition for more details.

#### Cross-Service Trace Contexts

The Trace Agent can propagate trace context across multiple services. This associates multiple spans that correspond to a single incoming request with each other, and is particularly useful in tracing requests in a microservices-based web application. (For more information, see the [Dapper][dapper-paper] paper describing the distributed tracing system.)

Trace context is sent and received using the [`'x-cloud-trace-context'`][stackdriver-trace-faq] field in HTTP request headers. Built-in plugins automatically read from and write to this field, so for application developers, no additional work is necessary.

##### Obtaining Trace Context in Incoming Requests

Plugins that trace incoming HTTP requests (in other words, web frameworks) should support cross-service tracing by reading serialized trace context from the `'x-cloud-trace-context'` header, and supplying it as the [`traceContext` option](#trace-span-options) when creating a new root span. The trace agent will automatically deserialize the trace context and associate any new spans with it.

The string `'x-cloud-trace-context'` is provided as `TraceApi#constants.TRACE_CONTEXT_HEADER_NAME`.

##### Sending Trace Context in Outgoing Requests

Use the following function to obtain the current serialized trace context. The built-in plugin for `http` and `https` does this automatically.

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

The trace agent is driven by a set of plugins that describe how to patch a module to generate trace spans when that module is used. We provide plugins for some well-known modules (see [What gets traced](#what-gets-traced)), and provide a means for developers to create their own.

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

[stackdriver-trace-faq]: https://cloud.google.com/trace/docs/faq
[stackdriver-trace-span]: https://cloud.google.com/trace/api/reference/rest/v1/projects.traces#TraceSpan
[dapper-paper]: https://research.google.com/pubs/pub36356.html
[shimmer]: https://github.com/othiym23/shimmer
[builtin-plugins]: https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/tree/master/src/plugins
