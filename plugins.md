# Trace Plugin API Developer Guide

**Note: The Trace Plugin API is experimental and is subject to change without notice.**

The trace agent is driven by a set of plugins that describe how to patch a
module to generate trace spans when that module is used. We provide plugins for
some well-known modules such as express, mongodb, and http, and provide a plugin
API for developers to create their own.

## Outline

A plugin consists of a set of *patch objects*. A patch object gives information
about how a file in a module should be patched in order to create trace spans.

Each patch object should contain the following fields:

* `file`: The path to the file whose exports should be patched, relative to the
  root of the module. You can specify an empty string, or omit this field
  entirely, to specify the export of the module itself.
* `versions`: A `semver` expression which will be used to control whether the
  specified file will be patched based on the module version; the patch will
  only be applied if the loaded module version satisfies this expression. This
  might be useful if your plugin only works on some versions of a module, or if
  you are patching internal mechanisms that are specific to a certain range of
  versions.
* `patch`: A function describing how the given file should be patched. It will
  be passed two arguments: the object exported from the file, and an object that
  exposes functions for creating spans and propagating context (see
  [What the API provides](#what-the-api-provides) for more details).

A plugin simply exports a list of patch objects.

For example, here's what a plugin for `express` might export:

```js
// express 4.x

function patchModuleRoot(expressModule, api) {
  // ...
}

module.exports = [
  { file: '', versions: '4.x', patch: patchModuleRoot }
];
```

In most cases, it should be sufficient to patch just the root (public exports)
of the module, in which case the `file` field can set to `''` or omitted. Based
on how the module being patched is implemented, however, it may be necessary to
patch other parts of the module as well.

### Enabling plugins in the Trace Agent

Developers wishing to trace their applications may specify, in the
[configuration][config-js] object passed to the trace agent, a `plugins` field
with a key-value pair (module name, path to plugin). For
example, to patch just `express` with a plugin at `./plugins/plugin-express.js`:

```js
require('@google-cloud/trace-agent').start({
  plugins: {
    express: path.join(__dirname, 'plugins/express.js')
  }
})
```

At this time, the path to the plugin may either be a module name or an absolute
path to the plugin.

## What the API provides

The `api` object, in short, provides functions that facilitate the following:

- Creating trace spans and add labels to them.
- Getting information about how the trace agent was configured in the
  current application.
- Parsing and serializing trace contexts for the sake of propagating them over
  the network.
- Binding callbacks and event emitters in order to propagate trace contexts
  across asynchronous boundaries.

In addition to the above, the `api` object also provides a number of well-known
label keys and constants through `api.labels` and `api.constants` respectively.

### Trace Spans

These functions provide the capability to create trace spans, add labels to
them, and close them. `transaction` and `childSpan` are instances of
`Transaction` and `ChildSpan`, respectively.

#### `api.createTransaction(options)`
* `options`: [`TraceOptions`](#trace-span-options)
* Returns `Transaction`

Creates and returns a new `Transaction` object. A `Transaction` object
represents a root-level trace span, and exposes functions for adding labels,
ending the span, and serializing the current trace context. Note that the
underlying root span is started when this function is called.

This function consults the trace agent's tracing policy to determine whether a
trace span should actually be started or not. If the tracing policy prohibits
a new span to be created under the current circumstances, this function will
return `null` instead.

#### `api.getTransaction()`
* Returns `Transaction`

Returns a Transaction object that corresponds to a root span started earlier
in the same context, or `null` if one doesn't exist.

#### `api.runInRootSpan(options, fn)`
* `options`: [`TraceOptions`](#trace-span-options)
* `fn`: `function(Transaction): any`
* Returns `any`

Runs the given function in a root span corresponding to an incoming request,
passing it the result of calling `api.createTransaction(options)`. The provided
function should accept a nullable `Transaction` object. If `null` is provided,
the function should proceed as if nothing is being traced.

#### `transaction.runInChildSpan(options, fn)`
* `options`: [`TraceOptions`](#trace-span-options)
* `fn`: `function(ChildSpan): any`
* Returns `any`

Runs the given function in a child span corresponding to an incoming request.
The provided function is guaranteed to be called with a `ChildSpan` object,
which represents a child span.

#### `transaction.addLabel(key, value) | childSpan.addLabel(key, value)`
* `key`: `string`
* `value`: `any`

Add a label to the span associated with the calling object.

#### `transaction.endSpan() | childSpan.endSpan()`

Ends the span associated with the calling object. This function should only be
called once.

#### `api.runInChildSpan(options, fn)`
* `options`: [`TraceOptions`](#trace-span-options)
* `fn`: `function(ChildSpan): any`
* Returns `any`

A shortcut for calling `api.getTransaction()` followed by
`transaction.runInChildSpan(options, fn)`. Note that while this function accepts
the same arguments as `transaction.runInChildSpan`, the function being passed in
should handle being passed `null` as a parameter. This will be the case if
`api.getTransaction` returns `null`.

#### Trace Span Options

Some functions above accept a `TraceOptions` object, which has the following
fields:

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
    traced is a web framework. If given, this field will be compared against the
    trace agent's URL filtering policy to check whether a span should be
    created.
* `skipFrames`: `number`
  * Optional; defaults to `0`
  * Trace spans include the call stack at the moment of creation as part of the
    information gathered. The call stack may include undesirable frames such as
    frames within the plugin itself. This field specifies the number of stack
    frames to skip when writing the call stack to the trace span. Frames within
    the trace agent implementation are automatically skipped.

### Trace Agent Configuration

#### `api.enhancedReportingEnabled()`
* Returns `boolean`

Returns a boolean value describing whether the trace agent was started with
an enhanced level of reporting. See the [configuration][config-js] object
definition for more details.

### Cross-Service Trace Contexts

The Trace Agent supports distributed tracing, so that in supported web
frameworks, incoming requests that are known to come from other services that
are also integrated with Stackdriver Trace (through the
['x-cloud-trace-context'][stackdriver-trace-faq]
field in request headers) should build spans that are aware of the information
serialized in this field, known as the trace context. (For more information,
see the [Dapper][dapper-paper] paper describing the distributed tracing system.)

It is up to plugin developers to extract serialized trace context from incoming
requests and propagate it in outgoing requests. The Plugin API accepts the
serialized trace context as an [option](#trace-span-options) when creating new
trace spans.

The string `'x-cloud-trace-context'` is provided as
`api.constants.TRACE_CONTEXT_HEADER_NAME`.

#### `transaction.getTraceContext()` | `childSpan.getTraceContext()`
* Returns `string`

Gets the trace context serialized as a string.

### Context Propagation

#### `api.bind(fn)`
* `fn`: `function`
* Returns `function` (same signature as `fn`)

Binds the given function to the current context.

#### `api.bindEmitter(emitter)`
* `emitter`: `EventEmitter`

Binds the given event emitter to the current context.

[config-js]: https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/blob/master/config.js
[stackdriver-trace-faq]: https://cloud.google.com/trace/docs/faq
[dapper-paper]: https://research.google.com/pubs/pub36356.html
