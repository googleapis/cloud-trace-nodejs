# Plugin Developer Guide

The trace agent is driven by a set of plugins that describe how to patch a module to generate trace spans when that module is used. We provide plugins for some well-known modules (see [What gets traced](../README.md#what-gets-traced)), and provide a means for developers to create their own.

A plugin consists of a set of *patch objects*. A patch object gives information about how a file in a module should be patched in order to create trace spans.

Each patch object can contain the following fields:

* `file`: The path to the file whose exports should be patched, relative to the root of the module. You can specify an empty string, or omit this field entirely, to specify the export of the module itself.
* `versions`: A `semver` expression which will be used to control whether the specified file will be patched based on the module version; the patch will only be applied if the loaded module version satisfies this expression. This might be useful if your plugin only works on some versions of a module, or if you are patching internal mechanisms that are specific to a certain range of versions. If omitted, all versions of the module will be patched.
* `patch`: A function describing how the module exports for a given file should be patched. It will be passed two arguments: the object exported from the file, and an instance of [`TraceApi`](./trace-api.md).
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
  // traceApi exposes methods to facilitate tracing, and is the same as the
  // object returned by a call to require('@google/cloud-trace').start().
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

[shimmer]: https://github.com/othiym23/shimmer
[builtin-plugins]: https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/tree/master/src/plugins
