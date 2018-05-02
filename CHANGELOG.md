# Node.js Agent for Google Cloud Trace Changelog

## 2018-05-02, Version 2.8.1 (Beta), @kjin

This version adds missing source files in 2.8.0.

### Commits

* [[`49a900afa6`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/49a900afa6)] - **fix**: add build/src/cls in output files (#736) (Kelvin Jin) [#736](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/736)

## 2018-05-02, Version 2.8.0 (Beta), @kjin

This version adds a new configuration option, as well as minor changes to the custom span API.

### Notable Changes

#### Configuration

  * A new configuration option `config.clsMechanism` is available, which can be used to disable automatic trace context propagation across asynchronous boundaries. This options should be considered advanced usage, and is intended to be used in conjunction with the custom span API with all automatic tracing plugins disabled.
  * A potential issue was fixed where the value of `config.projectId` isn't used if the environment variable `GCLOUD_PROJECT` is set to an empty string.

#### Custom Span API

  * A new function `createChildSpan` has been added to `SpanData` objects passed to the user with `runInRootSpan` (the type of which is now `RootSpanData`). Under normal circumstances, creating a root span using `myRootSpan.createChildSpan` should be identical to `traceApi.createChildSpan` when `myRootSpan` is automatically detected from CLS to be the current root span. This API was added to facilitate creating child spans when the current root span can no longer be auto-detected from CLS because the user disabled CLS through `config.clsMechanism`.
  * When a function passed to `traceApi.runInRootSpan` or `traceApi.wrap` throws, the trace context will correctly be reset to its original value before the function was run.

### Commits

* [[`d0009ff5ea`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/d0009ff5ea)] - **feat**: add rootSpan.createChildSpan and change none CLS semantics (#731) (Kelvin Jin) [#731](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/731)
* [[`6e46ed1772`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/6e46ed1772)] - **chore**: start running ci for node 10 (#729) (Kelvin Jin) [#729](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/729)
* [[`5d000e95e2`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/5d000e95e2)] - **feat**: allow "disabling" cls, and relax requirements for creating root spans (#728) (Kelvin Jin) [#728](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/728)
* [[`edb8135a79`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/edb8135a79)] - **fix**: restore context when a function run with a given context throws (#727) (Kelvin Jin) [#727](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/727)
* [[`132db9b058`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/132db9b058)] - **fix**: class-ify cls implementations (#708) (Kelvin Jin) [#708](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/708)
* [[`395a0c7b2e`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/395a0c7b2e)] - chore(package): update ts-node to version 6.0.0 (#726) (greenkeeper[bot]) [#726](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/726)
* [[`d0337fa7b0`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/d0337fa7b0)] - **fix**: fix log messages and ignore falsey env vars (#724) (Kelvin Jin) [#724](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/724)
* [[`e5a4d765d2`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/e5a4d765d2)] - **test**: fix system test (#723) (Kelvin Jin) [#723](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/723)

## 2018-04-10, Version 2.7.2 (Beta), @kjin

This version adds support for completely disabling plugins by passing a non-object value (`false` recommended to convey intent) for `config.plugins`.

### Commits

* [[`068260c595`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/068260c595)] - **fix**: allow non-objects for plugins to disable automatic tracing (#720) (Kelvin Jin) [#720](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/720)

## 2018-04-05, Version 2.7.1 (Beta), @kjin

This version fixes an issue with tracing HTTPS client requests in Node <=8 that was introduced in 2.6.0.

### Commits

* [[`a3ea16dc06`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/a3ea16dc06)] - **fix**: fix https tracing breakage in node \<9 and rewrite http tests (#717) (Kelvin Jin) [#717](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/717)

## 2018-04-03, Version 2.7.0 (Beta), @kjin

This version introduces support for tracing Hapi 17.

### Commits

* [[`028032f945`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/028032f945)] - **feat**: hapi 17 tracing support (#710) (Kelvin Jin) [#710](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/710)
* [[`b64661184b`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/b64661184b)] - **build**: add script to fetch plugin types (#711) (Kelvin Jin) [#711](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/711)

## 2018-04-02, Version 2.6.1 (Beta), @kjin

This version fixes an issue where invalid trace labels were added when the Trace Agent auto-discovers GCP metadata from within a GCP instance.

### Commits

* [[`1434d5db7a`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/1434d5db7a)] - **fix**: treat instanceId metadata as a number (#713) (Kelvin Jin) [#713](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/713)

## 2018-03-30, Version 2.6.0 (Beta), @kjin

This version introduces non-null spans, a new plugin loading mechanism, revised log messages and changes to `pg` tracing support (now including version 7).

### Notable Changes

#### Non-Null Spans

`SpanData` objects passed by `traceApi.runInRootSpan` and returned by `traceApi.createChildSpan` are _guaranteed_ to be non-null, whereas they previously could be null if either (1) they weren't created because of tracing policy decisions (an __untraced__ span) or (2) an attempt to create the span was made in a place where it was impossible to determine on behalf of which incoming request they were tracing (an __uncorrelated__ span). In other words:

```js
const traceApi = require('@google-cloud/trace-agent').start();
traceApi.runInRootSpan({ name: 'my-custom-span' }, (rootSpan) => {
  if (!rootSpan) {
    // This code path will no longer execute.
  }
  const childSpan = traceApi.createChildSpan({ name: 'my-custom-smaller-span' });
  if (!childSpan) {
    // This code path will no longer execute.
  }
  // ...
});
```

Instead, "phantom" `SpanData` will be returned, which expose an identical, but non-functional API to that of a "real" `SpanData` object. The purpose of this change is to alleviate the burden of having branching code paths based on whether your code was being traced or not -- you may now assume that functions such as `addLabel` and `endSpan` are _always_ on the given `SpanData` object.

If you _must_ execute a separate code path based on whether your code is being traced or not, you may now use `traceApi.isRealSpan`:

```js
const traceApi = require('@google-cloud/trace-agent').start();
traceApi.runInRootSpan({ name: 'my-custom-span' }, (rootSpan) => {
  if (!traceApi.isRealSpan(rootSpan)) {
    // Some code that should be executed because this request is not being traced.
  }
  const childSpan = traceApi.createChildSpan({ name: 'my-custom-smaller-span' });
  if (!traceApi.isRealSpan(childSpan)) {
    // Alternatively, you may directly check whether a span is untraced or uncorrelated.
    if (childSpan.type === traceApi.spanTypes.UNCORRELATED) {
      // Some code that should be executed because we lost context.
    } else if (childSpan.type === traceApi.spanTypes.UNTRACED) {
      // Some code that should be executed because the request was not sampled
      // (or otherwise disallowed by the tracing policy).
    }
  }
  // ...
});
```

This affects both plugins and the custom tracing API. All built-in tracing plugins have been changed correspondingly.

#### Log Messages

All logging output has been revised for consistency, and now include class/function names, as well as parameters in `[square brackets]`.

#### Plugin Loader

The plugin loading mechanism has been completely re-written. There should be no observable changes (please file an [issue](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/issues) if you encounter one.) The re-write fixes an issue where plugins can't patch modules with circular dependencies correctly ([#618](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/issues/618)).

#### Tracing `pg`

We now support tracing for `pg` versions 6 - 7.

For consistency between tracing version 6 and 7, span labels in `pg` (when `config.enhancedDatabaseReporting` is enabled) now contain pre-processed query values rather than post-processed values.

### Commits

* [[`53d2b9684f`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/53d2b9684f)] - **doc**: update README.md (#706) (Kelvin Jin) [#706](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/706)
* [[`f070636eb4`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/f070636eb4)] - **fix**: add support for pg 7 changes (#702) (Kelvin Jin) [#702](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/702)
* [[`c13a3bf207`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/c13a3bf207)] - **test**: privatize forceNewAgent_ (#705) (Kelvin Jin) [#705](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/705)
* [[`87de955b00`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/87de955b00)] - **test**: rewrite google-gax test and remove datastore test (#703) (Kelvin Jin) [#703](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/703)
* [[`5e3375b58c`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/5e3375b58c)] - chore(package): update ts-node to version 5.0.1 (#673) (greenkeeper[bot]) [#673](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/673)
* [[`0807fae7ea`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/0807fae7ea)] - chore(package): update @types/is to version 0.0.19 (#704) (greenkeeper[bot]) [#704](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/704)
* [[`c8c5bfc616`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/c8c5bfc616)] - **feat**: expand version range for pg to 7.x (#701) (Matt Oakes) [#701](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/701)
* [[`4d3d54e5db`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/4d3d54e5db)] - **fix**: rewrite all log messages (#700) (Kelvin Jin) [#700](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/700)
* [[`1fb53a7d68`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/1fb53a7d68)] - chore(package): update @types/mocha to version 5.0.0 (#698) (greenkeeper[bot]) [#698](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/698)
* [[`fb344d665c`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/fb344d665c)] - fix(package): update gcp-metadata to version 0.6.3 (#672) (Kelvin Jin) [#672](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/672)
* [[`1604c48a52`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/1604c48a52)] - **fix**: rewrite plugin loader (#686) (Kelvin Jin) [#686](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/686)
* [[`dca5cc0103`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/dca5cc0103)] - **test**: fixup issue stemming from testing http2 on node 9.9 (#699) (Kelvin Jin) [#699](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/699)
* [[`770ab0840a`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/770ab0840a)] - **test**: don't use exec to test preloaded modules (#696) (Kelvin Jin) [#696](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/696)
* [[`5338a9377e`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/5338a9377e)] - **refactor**: externalize singleton accessors from trace writer (#694) (Kelvin Jin) [#694](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/694)
* [[`9d56e846a8`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/9d56e846a8)] - fix(package): update @google-cloud/common to version 0.16.2 (#692) (greenkeeper[bot]) [#692](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/692)
* [[`49b2118ab8`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/49b2118ab8)] - **feat**: ensure spans are non-null (#680) (Kelvin Jin) [#680](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/680)
* [[`6b8a82b2e9`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/6b8a82b2e9)] - **test**: stop testing plugin functionality on appveyor (#693) (Kelvin Jin) [#693](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/693)
* [[`a35d115e2c`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/a35d115e2c)] - **chore**: upgrade typescript to 2.7 (#687) (Kelvin Jin) [#687](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/687)
* [[`d43c28e0a3`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/d43c28e0a3)] - chore(package): update js-green-licenses to version 0.5.0 (#685) (greenkeeper[bot]) [#685](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/685)
* [[`ea9279af40`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/ea9279af40)] - **chore**: update @types/shimmer definitions (#681) (Kelvin Jin) [#681](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/681)
* [[`d3cc125e8d`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/d3cc125e8d)] - **refactor**: move stack frame creation to utils (#678) (Kelvin Jin) [#678](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/678)
* [[`c8e2439863`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/c8e2439863)] - **test**: replace web framework tracing tests (#658) (Kelvin Jin) [#658](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/658)

## 2018-02-23, Version 2.5.0 (Beta), @kjin

This version changes how span IDs are generated, and extends traced gRPC versions.

### Notable Changes

* [[`ca92e9fb0e`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/ca92e9fb0e)] - **feat**: expand grpc supported versions to \<2 (#668) (Kelvin Jin) [#668](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/668)
* [[`a212d706cd`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/a212d706cd)] - **fix**: change span ID to use random bytes (#654) (Dave Raffensperger) [#654](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/654)

### Commits

* [[`53614e4455`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/53614e4455)] - chore(package): update mocha to version 5.0.0 (#653) (greenkeeper[bot]) [#653](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/653)
* [[`ca92e9fb0e`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/ca92e9fb0e)] - **feat**: expand grpc supported versions to \<2 (#668) (Kelvin Jin) [#668](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/668)
* [[`72b493de02`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/72b493de02)] - **doc**: update broken references to source files (#663) (Kelvin Jin)
* [[`54dd734064`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/54dd734064)] - **fix**: add web framework plugin types and script to fetch types (#621) (Kelvin Jin) [#621](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/621)
* [[`a212d706cd`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/a212d706cd)] - **fix**: change span ID to use random bytes (#654) (Dave Raffensperger) [#654](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/654)
* [[`b52cde1751`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/b52cde1751)] - **chore**: enable circleci cron and cover src/**/*.ts files only (#651) (Kelvin Jin) [#651](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/651)
* [[`b811387b6c`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/b811387b6c)] - **doc**: add details about running tests locally in CONTRIBUTING.md (#655) (Kelvin Jin) [#655](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/655)
* [[`74b9291abc`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/74b9291abc)] - chore(package): update js-green-licenses to version 0.4.0 (#652) (greenkeeper[bot])
* [[`6ef8cda919`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/6ef8cda919)] - **chore**: copy cached packages in appveyor (#642) (Kelvin Jin) [#642](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/642)
* [[`0a3697934d`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/0a3697934d)] - **refactor**: types for http (#649) (Kelvin Jin) [#649](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/649)
* [[`74b0724091`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/74b0724091)] - **chore**: add npm publish job to circle ci (#647) (Kelvin Jin) [#647](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/647)

## 2018-01-12, Version 2.4.1 (Beta), @kjin

This change adds a patch to reduce the overhead introduced by the Trace Agent for outgoing HTTP requests.

### Notable Changes

* [[`182c0cbc6f`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/182c0cbc6f)] - **refactor**: use setHeader to set trace context header (#643) (Kelvin Jin) [#643](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/643)

### Commits

* [[`dbeae04f51`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/dbeae04f51)] - **fix**: fix a failing http2 test in Node 9.4.0 (#648) (Jinwoo Lee)
* [[`182c0cbc6f`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/182c0cbc6f)] - **refactor**: use setHeader to set trace context header (#643) (Kelvin Jin) [#643](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/643)
* [[`202d4cb5b7`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/202d4cb5b7)] - chore(package): update js-green-licenses to version 0.3.1 (#641) (greenkeeper[bot])
* [[`4c036eaa3a`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/4c036eaa3a)] - chore(package): update @types/node to version 9.3.0 (greenkeeper[bot])
* [[`4003286152`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/4003286152)] - **chore**: Update `@google-cloud/common` types (#628) (Dominic Kramer) [#628](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/628)
* [[`c275079956`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/c275079956)] - **chore**: Update LICENSE (#635) (chenyumic)
* [[`ea3b26e7fe`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/ea3b26e7fe)] - **build**: transition to circle 2 and cache test fixtures in CI (#634) (Kelvin Jin) [#634](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/634)
* [[`61f620d7e7`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/61f620d7e7)] - **chore**: license check in posttest (#636) (Jinwoo Lee)

## 2018-01-04, Version 2.4.0 (Beta), @kjin

This change adds tracing support for HTTP/2 requests (client-side only) and the `mysql2` module, along with a number of bug fixes.

### Notable Changes

* [[`2e25b4e4ab`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/2e25b4e4ab)] - **feat**: support http2 client side (#616) (Jinwoo Lee)
* [[`b6bd7c24b9`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/b6bd7c24b9)] - Port mysql plugin to support mysql2 (#607) (Julien Vincent)

### Commits

* [[`50a13000e0`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/50a13000e0)] - chore(package): update google-auto-auth to version 0.9.0 (#627) (greenkeeper[bot])
* [[`63ca1432de`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/63ca1432de)] - **fix**: avoid adding child spans to closed root (#631) (Ali Ijaz Sheikh)
* [[`3b1cd24e5d`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/3b1cd24e5d)] - **fix**: extend supported gRPC version range to 1.8 (#630) (Kelvin Jin)
* [[`9866d292a5`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/9866d292a5)] - **fix**: upgrade semver to 5.4 (#624) (Kelvin Jin)
* [[`5700cda2b3`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/5700cda2b3)] - **fix**: use new node error constructor type definitions (#625) (Kelvin Jin)
* [[`aabf69c1ab`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/aabf69c1ab)] - chore(package): update ts-node to version 4.0.0 (#623) (greenkeeper[bot])
* [[`f1ca3a39e1`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/f1ca3a39e1)] - **fix**: use shimmer to wrap event emitters in async_hooks-based cls (#619) (Kelvin Jin) [#619](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/619)
* [[`2e25b4e4ab`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/2e25b4e4ab)] - **feat**: support http2 client side (#616) (Jinwoo Lee)
* [[`b6bd7c24b9`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/b6bd7c24b9)] - Port mysql plugin to support mysql2 (#607) (Julien Vincent)
* [[`582ed5081a`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/582ed5081a)] - **fix**: wrong test/assertion in test-trace-http (#615) (Jinwoo Lee)
* [[`2807a10e8f`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/2807a10e8f)] - **fix**: add projectId to config type definitions (#609) (Kelvin Jin) [#609](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/609)
* [[`38d4673e43`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/38d4673e43)] - **fix**: listenerAttached should be set to true (#613) (Jinwoo Lee)
* [[`a4129f32cb`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/a4129f32cb)] - **fix**: remove docker containers on `docker-trace.sh stop` (#611) (Jinwoo Lee)
* [[`036476d2b5`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/036476d2b5)] - **chore**: update with latest packages (#610) (Jinwoo Lee)
* [[`84cd4771af`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/84cd4771af)] - **fix**: options.port is supposed to be a number (#608) (Jinwoo Lee)
* [[`10ed0edb74`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/10ed0edb74)] - **refactor**: move index.ts and config.ts into src (#599) (Kelvin Jin) [#599](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/599)

## 2017-11-14, Version 2.3.3 (Beta), @kjin

This change removes a spurious warning message that was introduced in the fix for HTTPS tracing in 2.3.2. There should be no other observable changes.

### Commits

* [[`a6b56bbbe7`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/a6b56bbbe7)] - **fix**: actually prevent useless warning when loading https plugin (#597) (Kelvin Jin) [#597](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/597)
* [[`7edc320089`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/7edc320089)] - **fix**: prevent useless warning when loading https plugin (#596) (Kelvin Jin) [#596](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/596)

## 2017-11-13, Version 2.3.2 (Beta), @kjin

**bug fixes**

* Fixed HTTPS tracing in Node 8.9.0 and 9.0.0+ (#589)
* Fixed trace context not being propagated for Koa (#593)

### Commits

* [[`b9e6a3bc24`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/b9e6a3bc24)] - **fix**: propagate context in koa tracing (#594) (Kelvin Jin) [#594](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/594)
* [[`4170f8967a`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/4170f8967a)] - **src**: patch https in Node 8.9 and 9.0 (#591) (Kelvin Jin) [#591](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/591)
* [[`58925af30e`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/58925af30e)] - **chore**: update dependencies to enable greenkeeper (#584) (greenkeeper[bot]) [#584](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/584)
* [[`84a5f7d94c`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/84a5f7d94c)] - **style**: upgrade to gts@0.5 (#592) (Kelvin Jin) [#592](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/592)
* [[`523ab22d74`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/523ab22d74)] - **chore**: upgrade gcp-metadata to 0.4 (#590) (Kelvin Jin) [#590](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/590)

## 2017-10-31, Version 2.3.1 (Beta), @kjin

This change fixes a potential issue with tracing gRPC 1.7.

### Commits

* [[`609d0cc161`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/609d0cc161)] - **chore**: bump typescript dependency to 2.6 and disable https test on node \>=8.9 (#588) (Kelvin Jin) [#588](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/588)
* [[`3e30d28086`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/3e30d28086)] - **fix**: extend supported gRPC version range to 1.7 (#586) (Kelvin Jin)

## 2017-10-20, Version 2.3.0 (Beta), @kjin

### Notable Changes

* The Trace Agent module is now written in TypeScript (save for plugins), and ships with type definitions. This on its own is not expected to produce any API changes. However, any code that reaches into internal files within the Trace Agent will likely break.
* Support for tracing restify 5 and 6 has been added.
* The `continuation-local-storage` dependency version has been bumped to 3.2.0.

### Commits

* [[`ac23fc47a1`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/ac23fc47a1)] - **docs**: mention GCLOUD_TRACE_NEW_CONTEXT (#580) (Kelvin Jin) [#580](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/580)
* [[`26d6f59236`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/26d6f59236)] - **test**: cleanups and ensure module installs correctly (#578) (Kelvin Jin) [#578](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/578)
* [[`e732e67727`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/e732e67727)] - **style**: start lint/format for src files (#576) (Kelvin Jin) [#576](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/576)
* [[`cf3ada06b4`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/cf3ada06b4)] - **feat**: expand restify supported version range to include v5, v6 (#577) (Kelvin Jin) [#577](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/577)
* [[`18547974df`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/18547974df)] - **docs**: update config.ts (#575) (Kelvin Jin)
* [[`e18697be83`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/e18697be83)] - **refactor**: ts conversion of index.ts (#569) (Kelvin Jin) [#569](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/569)
* [[`b43259f4cb`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/b43259f4cb)] - **chore**: update cls dependency version (#573) (Ali Ijaz Sheikh)
* [[`4785f4708c`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/4785f4708c)] - **refactor**: bump @types/node (#570) (Kelvin Jin) [#570](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/570)
* [[`212f45fd2c`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/212f45fd2c)] - **refactor**: ts conversion of plugin loader (#568) (Kelvin Jin) [#568](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/568)
* [[`7af102e521`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/7af102e521)] - **refactor**: ts conversion of trace-agent (#567) (Kelvin Jin) [#567](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/567)
* [[`50ad81155a`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/50ad81155a)] - **refactor**: ts conversion of tracing-policy and cls (#559) (Kelvin Jin) [#559](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/559)
* [[`20e69f23d3`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/20e69f23d3)] - **style**: change constants/trace labels to consts from namespaces; remove JSDoc types (#564) (Kelvin Jin) [#564](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/564)
* [[`b44e36c52f`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/b44e36c52f)] - **refactor**: ts conversion of config, trace-writer, span-data (#560) (Kelvin Jin) [#560](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/560)
* [[`d6231275bf`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/d6231275bf)] - Update dependencies (#563) (Matthew Loring) [#563](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/563)
* [[`0d73bffd7c`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/0d73bffd7c)] - **refactor**: ts conversion of util (#562) (Kelvin Jin)
* [[`7cdeb615ac`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/7cdeb615ac)] - **refactor**: ts conversion of trace and span-data (#561) (Kelvin Jin)
* [[`7a614c5a9b`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/7a614c5a9b)] - **refactor**: ts conversion of trace-labels and constants (#558) (Kelvin Jin) [#558](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/558)
* [[`ce34e55632`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/ce34e55632)] - **refactor**: rename files to .ts and add ts-based build commands (#554) (Kelvin Jin)

## 2017-09-12, Version 2.2.0 (Beta), @matthewloring

### Notable changes

**features**

  * [[`0e15b6c95d`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/0e15b6c95d)] - **feat**: Async hooks based context tracking (#538) (Matthew Loring) [#538](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/538)
  * [[`debc49331c`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/debc49331c)] - **feat**: add public API for root span id (#542) (Ali Ijaz Sheikh) 
  * [[`4496d3d6f0`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/4496d3d6f0)] - **feat**: Add GCLOUD_TRACE_CONFIG env config (#539) (Oleg Shalygin)

### Commits

* [[`6f9614a810`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/6f9614a810)] - **test**: restore Function#length property in wrapped mocha test functions when using continuation-local-storage with node 8 (#553) (Kelvin Jin) [#553](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/553)
* [[`e744614e6a`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/e744614e6a)] - **chore**: delete performance scripts (#551) (Kelvin Jin) [#551](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/551)
* [[`68ec8d5e5f`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/68ec8d5e5f)] - Trace API function for trace writer project ID (#548) (Dave Raffensperger) [#548](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/548)
* [[`843e7280da`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/843e7280da)] - **docs**: rewrite gce guide (#549) (Kelvin Jin) [#549](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/549)
* [[`715f8cfb84`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/715f8cfb84)] - **chore**: get rid of commitlint (#543) (Ali Ijaz Sheikh) 
* [[`471902a438`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/471902a438)] - **fix**: Account for auth spans in system test (#547) (Matthew Loring) [#547](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/547)
* [[`0e15b6c95d`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/0e15b6c95d)] - **feat**: Async hooks based context tracking (#538) (Matthew Loring) [#538](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/538)
* [[`debc49331c`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/debc49331c)] - **feat**: add public API for root span id (#542) (Ali Ijaz Sheikh) 
* [[`a1012058bf`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/a1012058bf)] - Avoid throwing on malformed version in package json (#546) (Matthew Loring) [#546](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/546)
* [[`696cb8d6e4`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/696cb8d6e4)] - Fix http-e2e for node 8.4.0 (#541) (Matthew Loring) [#541](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/541)
* [[`4496d3d6f0`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/4496d3d6f0)] - **feat**: Add GCLOUD_TRACE_CONFIG env config (#539) (Oleg Shalygin)

## 2017-08-01, Version 2.1.3 (Beta), @kjin

### Bug Fixes

* add explicit active flag in trace agent ([#533](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/issues/533)) ([b01f4b2](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/b01f4b2))
* don't warn about trace loading before itself on windows ([#534](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/issues/534)) ([7e1cc34](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/7e1cc34))

## 2017-07-19, Version 2.1.2 (Beta), @kjin

This version fixes a bug introduced in 2.1.1 where module top-level functions would return `null` if the Trace Agent was not first started in enabled mode.

### Commits

* [[`9f013f1a55`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/9f013f1a55)] - **fix**: start/get returns null when disabled in 2.1.1 (#528) (Kelvin Jin) [#528](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/528)

## 2017-07-17, Version 2.1.1 (Beta), @ofrobots

This module is now in Beta.

### Commits

* [[`17555e2071`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/17555e2071)] - beta (#524) (Ali Ijaz Sheikh) [#524](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/524)
* [[`e6671790c1`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/e6671790c1)] - Deduplicate internal code (#511) (Kelvin Jin) [#511](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/511)
* [[`eaab39ac1e`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/eaab39ac1e)] - **test**: omit agent argument from all test-common helper functions (#518) (Kelvin Jin) [#518](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/518)
* [[`ca72dd7f44`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/ca72dd7f44)] - warn when creating a child of a closed span (#520) (Ali Ijaz Sheikh)
* [[`be0b006b35`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/be0b006b35)] - make TraceWriter a singleton (#517) (Kelvin Jin) [#517](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/517)
* [[`eb0a11be23`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/eb0a11be23)] - increase severity of module order log message (#519) (Ali Ijaz Sheikh)
* [[`300dc4fc34`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/300dc4fc34)] - Fix document source link (#514) (Oleg Shalygin) [#514](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/514)
* [[`8561232a04`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/8561232a04)] - Fix typos (#513) (Oleg Shalygin) [#513](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/513)
* [[`a9e46cb1c8`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/a9e46cb1c8)] - Update datastore test to use datastore module (#509) (Matthew Loring) [#509](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/509)

## 2017-06-12, Version 2.1.0 (Experimental), @matthewloring

### Notable changes

**bug fixes**

  * [[`a8da1eb821`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/a8da1eb821)] - hapi/koa: End span when request is aborted (#479) (Kelvin Jin) [#479](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/479)

**new plugins**

  * [[`dd7bc9b1ff`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/dd7bc9b1ff)] - Support Knex (#468) (Dominic Kramer) [#468](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/468)

## Commits

* [[`89c1a9769c`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/89c1a9769c)] - Fix trace api docs (#507) (Matthew Loring) [#507](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/507)
* [[`04e0ed027a`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/04e0ed027a)] - fix patching of res.end (#506) (Ali Ijaz Sheikh) 
* [[`13b4b9e893`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/13b4b9e893)] - Roll back to old version of got (#504) (Matthew Loring) [#504](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/504)
* [[`92cab1b888`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/92cab1b888)] - **docs**: Elaborate on GKE Scopes + Syntax Highlighting (#501) (Kelvin Jin) 
* [[`8eb502b471`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/8eb502b471)] - Node 8 support (#499) (Ali Ijaz Sheikh) 
* [[`9f83a24182`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/9f83a24182)] - update devDependencies (#500) (Ali Ijaz Sheikh) 
* [[`0b89d78723`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/0b89d78723)] - fix credentials on system-test (#497) (Ali Ijaz Sheikh) 
* [[`7c0b35c0f9`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/7c0b35c0f9)] - Update config.js (#496) (Vikram) [#496](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/496)
* [[`7fafa05cbb`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/7fafa05cbb)] - run system test locally (#490) (Ali Ijaz Sheikh) 
* [[`5746f63b86`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/5746f63b86)] - system-tests to use custom env. vars. (#494) (Ali Ijaz Sheikh) 
* [[`98b9ba7187`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/98b9ba7187)] - Unit tests should not depend on the environment (#493) (Ali Ijaz Sheikh) 
* [[`dd7bc9b1ff`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/dd7bc9b1ff)] - Support Knex (#468) (Dominic Kramer) [#468](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/468)
* [[`f8b74e6ec0`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/f8b74e6ec0)] - Fix typos in configuration comments (#491) (Oleg Shalygin) [#491](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/491)
* [[`350efc867d`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/350efc867d)] - Add a system-test (#489) (Ali Ijaz Sheikh) 
* [[`a8da1eb821`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/a8da1eb821)] - hapi/koa: End span when request is aborted (#479) (Kelvin Jin) [#479](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/479)
* [[`8b9acd07ce`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/8b9acd07ce)] - Add encrypted service account key for system tests (#488) (Matthew Loring) 
* [[`c242d8bfbc`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/c242d8bfbc)] - Add test notifications to travis (#485) (Matthew Loring) [#485](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/485)

## 2017-05-15, Version 2.0.0 (Experimental), @matthewloring

### Notable changes

This release drops support for versions of Node.js <4.

**Semver Major**

  * [[`b533f671f0`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/b533f671f0)] - Update deps, drop support for 0.12 (#478) (Matthew Loring) [#478](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/478)

**UI**

  * [[`8812b7a96e`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/8812b7a96e)] - Update trace label names (#467) (Matthew Loring) [#467](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/467)

## Commits

* [[`3a0fb1c133`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/3a0fb1c133)] - Regression test for #481 (#483) (Matthew Loring) [#483](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/483)
* [[`3f90b20e0d`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/3f90b20e0d)] - **http**: return response object for chaining #481 (#482) (vmarchaud) [#482](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/482)
* [[`1495eae896`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/1495eae896)] - Fix module-internal requires not being intercepted (#480) (Kelvin Jin) [#480](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/480)
* [[`b533f671f0`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/b533f671f0)] - Update deps, drop support for 0.12 (#478) (Matthew Loring) [#478](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/478)
* [[`5080bfc306`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/5080bfc306)] - Add yarn.lock file (#476) (Matthew Loring) [#476](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/476)
* [[`2500aba504`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/2500aba504)] - pass valid TestRequest message in grpc test (#474) (Ali Ijaz Sheikh) 
* [[`89d87797ff`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/89d87797ff)] - drop dependency on dummy counter module (#472) (Ali Ijaz Sheikh) 
* [[`8812b7a96e`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/8812b7a96e)] - Update trace label names (#467) (Matthew Loring) [#467](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/467)

## 2017-04-18, Version 1.1.0 (Experimental), @matthewloring

### Notable changes

**new plugins**

  * [[`9af1726ed1`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/9af1726ed1)] - Support for generic-pool 2 and 3 (#435) (Dominic Kramer) [#435](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/435)
  * [[`9dfde43b6b`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/9dfde43b6b)] - Koa 2.x support (#464) (Matthew Loring) [#464](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/464)

## Commits

* [[`42de95aaa2`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/42de95aaa2)] - Set response trace context based on that of incoming requests (#463) (Kelvin Jin) [#463](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/463)
* [[`9af1726ed1`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/9af1726ed1)] - Support for generic-pool 2 and 3 (#435) (Dominic Kramer) [#435](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/435)
* [[`5c55835eb9`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/5c55835eb9)] - Add tests that context is propagated by child frameworks (#466) (Matthew Loring) [#466](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/466)
* [[`9dfde43b6b`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/9dfde43b6b)] - Koa 2.x support (#464) (Matthew Loring) [#464](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/464)
* [[`54e077990d`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/54e077990d)] - Increase timeout to reduce flakiness (#465) (Matthew Loring) [#465](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/465)
* [[`1d22c9d764`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/1d22c9d764)] - Remove gax patching (#462) (Matthew Loring) [#462](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/462)
* [[`8cffd41396`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/8cffd41396)] - Now `.DS_Store` files are ignored (#460) (Dominic Kramer) [#460](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/460)
* [[`b60d142fb9`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/b60d142fb9)] - Clean noisy output of `install-test-fixtures.sh` (#461) (Dominic Kramer) [#461](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/461)
* [[`1391192472`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/1391192472)] - Allow Manual Test Fixture Management (#459) (Dominic Kramer) [#459](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/459)

## 2017-03-31, Version 1.0.4 (Experimental), @kjin

### Commits

* [[`43ede69323`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/43ede69323)] - Add serviceContext option (#457) (Kelvin Jin) [#457](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/457)

## 2017-03-24, Version 1.0.3 (Experimental), @kjin

### Commits

* [[`0e71269b5b`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/0e71269b5b)] - Include the correct dummy package (#452) (Kelvin Jin) [#452](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/452)

## 2017-03-24, Version 1.0.2 (Experimental), @kjin

### Commits

* [[`39e1c517e4`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/39e1c517e4)] - Track download counts with non-namespaced dependency (#449) (Kelvin Jin) [#449](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/449)
* [[`c200674954`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/c200674954)] - Stop running google-gax unit test on v0.12 (#450) (Kelvin Jin) [#450](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/450)
* [[`733f33c3c2`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/733f33c3c2)] - Assign url field in Connect and Koa (#448) (Kelvin Jin) [#448](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/448)
* [[`c108b35d49`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/c108b35d49)] - Add url field to hapi middleware options (#447) (Ethan Rubio) [#447](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/447)

## 2017-03-15, Version 1.0.1 (Experimental), @kjin

### Notable changes

**bug fixes**

  * [[`ca4b67bd44`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/ca4b67bd44)] - Ensure http response streams are paused (#438) (Matthew Loring) [#438](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/438)

**new plugins**

  * [[`1ab25b2804`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/1ab25b2804)] - Experimental postgres plugin (#402) (Matthew Loring) [#402](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/402)
  * [[`dc41a8b3ab`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/dc41a8b3ab)] - Context propagation for google-gax (#404) (Matthew Loring) [#404](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/404)

**redis**

  * [[`72ab6775ce`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/72ab6775ce)] - Support redis 2.7 (#439) (Kelvin Jin) [#439](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/439)

**grpc**

  * [[`71cd5c3178`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/71cd5c3178)] - Distributed tracing support in gRPC (#436) (Kelvin Jin) [#436](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/436)

### Commits

* [[`ca4b67bd44`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/ca4b67bd44)] - Ensure http response streams are paused (#438) (Matthew Loring) [#438](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/438)
* [[`72ab6775ce`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/72ab6775ce)] - Support redis 2.7 (#439) (Kelvin Jin) [#439](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/439)
* [[`71cd5c3178`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/71cd5c3178)] - Distributed tracing support in gRPC (#436) (Kelvin Jin) [#436](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/436)
* [[`1ab25b2804`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/1ab25b2804)] - Experimental postgres plugin (#402) (Matthew Loring) [#402](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/402)
* [[`dc41a8b3ab`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/dc41a8b3ab)] - Context propagation for google-gax (#404) (Matthew Loring) [#404](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/404)

## 2017-03-01, Version 1.0.0 (Experimental), @matthewloring

This version does not include any changes since 1.0.0-rc1. It is the first publish to the new module name: @google-cloud/trace-agent.

## 2017-02-28, Version 1.0.0-rc1 (Experimental), @matthewloring

### Notable changes

This version introduces a full redesigned API for creating [custom trace spans](doc/trace-api.md) as well as an API
for writing [custom plugins](doc/plugin-guide.md) to instrument modules so tracing information can be reported. Please
check out our docs section for a full description of the changes. While this is a semver major change, we expect
it will only affect users of the custom span api.

In addition to API changes, this release includes the following semver major behavior changes:

 - The `databaseResultReportingSize` configuration option has been replaced by the `maximumLabelValueSize` configuration option which applies to all label values (instead of just database results).
 - This module now uses the same authentication code as [google-cloud-node](https://github.com/GoogleCloudPlatform/google-cloud-node) API libraries. This changes the precedence of accepting auth credentials via config.credentials vs. config.keyFileName vs. the environment variable GOOGLE_APPLICATION_CREDENTIALS.

### Commits

* [[`a7ff674833`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/a7ff674833)] - fix doc links (#430) (Kelvin Jin) [#430](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/430)
* [[`c1773f4d4f`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/c1773f4d4f)] - Plugin loader throws for plugins with glaring issues (#428) (Kelvin Jin) [#428](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/428)
* [[`d030be1f16`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/d030be1f16)] - Trace API and Plugin Developer Docs (#427) (Kelvin Jin) [#427](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/427)
* [[`2a374fdbc1`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/2a374fdbc1)] - Added Plugin API docs (#362) (Kelvin Jin) [#362](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/362)
* [[`c68c22f8fe`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/c68c22f8fe)] - Test log level correction (#424) (Matthew Loring) [#424](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/424)
* [[`e74b60afda`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/e74b60afda)] - Remove version lower bound check (#423) (Matthew Loring) [#423](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/423)
* [[`f17bd67e37`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/f17bd67e37)] - Improve redis code coverage (#422) (Matthew Loring) [#422](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/422)
* [[`1ea81a5032`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/1ea81a5032)] - Test for throw on invalid value for onUncaughtException (#425) (Matthew Loring) [#425](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/425)
* [[`c3435fff3c`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/c3435fff3c)] - Look for new app engine env vars during configuration (#421) (Matthew Loring) [#421](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/421)
* [[`2617526bd2`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/2617526bd2)] - Remove trace property from config (#420) (Matthew Loring) [#420](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/420)
* [[`bfa1d4e28f`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/bfa1d4e28f)] - Disambiguate context loss from sampling when creating child spans (#416) (Matthew Loring) [#416](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/416)
* [[`97f87908b9`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/97f87908b9)] - Make TraceWriter a Service object (#417) (Ali Ijaz Sheikh) [#417](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/417)
* [[`39331429e4`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/39331429e4)] - Small test changes (#419) (Kelvin Jin) [#419](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/419)
* [[`eacfa15317`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/eacfa15317)] - New configuration for globally controlled label value sizes (#415) (Matthew Loring) [#415](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/415)
* [[`9032aeaaba`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/9032aeaaba)] - Plugins with falsey paths don't get loaded (#418) (Kelvin Jin) [#418](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/418)
* [[`035d1cc9e9`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/035d1cc9e9)] - Make trace interface uniform between module exports and plugins (#411) (Kelvin Jin) [#411](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/411)
* [[`0772ee0508`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/0772ee0508)] - Fix merging of nest configuration objects (#414) (Matthew Loring) [#414](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/414)
* [[`f5662e0372`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/f5662e0372)] - cleanup todos (#395) (Matthew Loring) [#395](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/395)
* [[`a8a6e58ce3`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/a8a6e58ce3)] - Remove old hooks mechanism (#410) (Matthew Loring) [#410](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/410)
* [[`aebb3a5601`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/aebb3a5601)] - Expand test-index.js (#409) (Matthew Loring) [#409](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/409)
* [[`08095ae687`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/08095ae687)] - Clean up trace writer error messages (#412) (Matthew Loring) [#412](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/412)
* [[`2cca378d3e`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/2cca378d3e)] - simplify interop-mongo-express (#401) (Matthew Loring) [#401](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/401)
* [[`f9a4b7ba50`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/f9a4b7ba50)] - Simplifications in test/common (#408) (Matthew Loring) [#408](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/408)
* [[`33f90fc53c`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/33f90fc53c)] - Starting testing on Circle-CI (#407) (Ali Ijaz Sheikh) 
* [[`f641802cf2`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/f641802cf2)] - Refactor public api to match plugin api (#393) (Matthew Loring) [#393](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/393)
* [[`58b3dd4a4c`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/58b3dd4a4c)] - Instrument multiple versions of the same module (#397) (Matthew Loring) [#397](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/397)
* [[`6f05b156d3`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/6f05b156d3)] - Consolidate usage of `agent.private_()` (#406) (Dominic Kramer) [#406](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/406)
* [[`60ef26a698`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/60ef26a698)] - Correct broken test (#396) (Matthew Loring) [#396](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/396)
* [[`ecb3ccb218`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/ecb3ccb218)] - Reduce dependence on setTimeout timing in testing (#405) (Matthew Loring) 
* [[`8553d02a3d`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/8553d02a3d)] - Add docker start/stop script for DB unit tests (#385) (Kelvin Jin) 
* [[`749821958c`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/749821958c)] - Add database result summarization to plugins (#400) (Matthew Loring) [#400](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/400)
* [[`6a307d143d`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/6a307d143d)] - Add stack trace to service network errors (#394) (Matthew Loring) [#394](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/394)
* [[`91e1ccef72`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/91e1ccef72)] - Fix restify non-interference tests (#403) (Matthew Loring) [#403](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/403)
* [[`da804af08d`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/da804af08d)] - Add Express Trace Plugin (#363) (Kelvin Jin) [#363](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/363)
* [[`ff67bef00e`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/ff67bef00e)] - Fix for external unit test failures (#388) (Kelvin Jin) [#388](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/388)
* [[`f30bd330ba`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/f30bd330ba)] - Add gRPC Plugin (#390) (Kelvin Jin) [#390](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/390)
* [[`533d28af5a`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/533d28af5a)] - Use closures instead of bind in plugins (#391) (Dominic Kramer) [#391](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/391)
* [[`0874b1a23b`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/0874b1a23b)] - Add http plugin (#370) (Cristian Cavalli) 
* [[`8e30d88abe`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/8e30d88abe)] - Bugfix for creating root spans through plugin API (#389) (Kelvin Jin) [#389](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/389)
* [[`4c2f330e8d`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/4c2f330e8d)] - Support hapi tracing through the plugin API (#379) (Dominic Kramer) [#379](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/379)
* [[`4dc20bf5f3`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/4dc20bf5f3)] - Support mysql tracing through the plugin API (#376) (Dominic Kramer) [#376](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/376)
* [[`bb926acf1c`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/bb926acf1c)] - Support redis tracing through the plugin API (#377) (Dominic Kramer) [#377](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/377)
* [[`4e20f685d3`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/4e20f685d3)] - Support Connect tracing through the plugin API (#381) (Dominic Kramer) [#381](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/381)
* [[`5c5e3e2e70`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/5c5e3e2e70)] - Support mongodb-core tracing through the plugin API (#384) (Dominic Kramer) [#384](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/384)
* [[`0eb389668b`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/0eb389668b)] - Support Koa tracing through the plugin API (#380) (Dominic Kramer) [#380](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/380)
* [[`837b892471`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/837b892471)] - Support restify tracing through the plugin API (#374) (Ali Ijaz Sheikh) 
* [[`1cc616b37e`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/1cc616b37e)] - Remove agent.stop() (#378) (Kelvin Jin) [#378](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/378)
* [[`1e109d2c90`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/1e109d2c90)] - Plugin API: Interface change (#386) (Kelvin Jin) [#386](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/386)
* [[`9743556fed`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/9743556fed)] - Plugin API: Added module unpatching and updated tests correspondingly (#383) (Kelvin Jin) [#383](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/383)
* [[`9011c8aca3`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/9011c8aca3)] - Plugin API: Loading Improvements (#372) (Kelvin Jin) [#372](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/372)
* [[`b41e921f18`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/b41e921f18)] - Remove agent isRunning/trace isActive (#368) (Matthew Loring) [#368](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/368)
* [[`ad18074227`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/ad18074227)] - Run all tests stand alone (#369) (Matthew Loring) [#369](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/369)
* [[`8d34ed46f6`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/8d34ed46f6)] - Plugin API: Add createChildSpan (#373) (Kelvin Jin) [#373](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/373)
* [[`b17394d5f1`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/b17394d5f1)] - Plugin API: Additional comments, logging, handling no namespace (#366) (Kelvin Jin) 
* [[`c999103951`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/c999103951)] - Remove the trace constructor and rename startAgent (#367) (Dominic Kramer) [#367](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/367)

## 2017-01-19, Version 0.6.1 (Experimental), @matthewloring

### Commits

* [[`8b05415dc5`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/8b05415dc5)] - ignore labels unless it is an object (#352) (Ali Ijaz Sheikh) 

## 2017-01-13, Version 0.6.0 (Experimental), @matthewloring

### Notable changes

**bug fixes**:

  * [[`94e5dad453`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/94e5dad453)] - Limit span names/labels to service limits (#345) (Matthew Loring) [#345](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/345)
  * [[`d31798c9d7`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/d31798c9d7)] - Display contents of label values of object type (#346) (Matthew Loring) [#346](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/346)

**configuration**:

  * [[`8e46d5f8ed`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/8e46d5f8ed)] - Remove unncessary environment variables (#331) (Matthew Loring) [#331](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/331)

**hapi**:

  * [[`b89dda8f1b`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/b89dda8f1b)] - Support for hapi 16 (#325) (Matthew Loring) [#325](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/325)

### Commits

* [[`94e5dad453`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/94e5dad453)] - Limit span names/labels to service limits (#345) (Matthew Loring) [#345](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/345)
* [[`d31798c9d7`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/d31798c9d7)] - Display contents of label values of object type (#346) (Matthew Loring) [#346](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/346)
* [[`ca84959c28`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/ca84959c28)] - Ensure agent is always set for mysql/grpc (#343) (Matthew Loring) [#343](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/343)
* [[`4e6670363c`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/4e6670363c)] - Address system dependence of sed in tests (#339) (Dominic Kramer) [#339](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/339)
* [[`8aed09d156`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/8aed09d156)] - Removed dependency on cloud-diagnostics-common (#338) (Kelvin Jin) [#338](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/338)
* [[`f5401db6bb`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/f5401db6bb)] - Add `coverage` to `.gitignore` (#336) (Dominic Kramer) [#336](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/336)
* [[`60cf051967`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/60cf051967)] - Specify package name in version string (#335) (Matthew Loring) [#335](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/335)
* [[`8e46d5f8ed`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/8e46d5f8ed)] - Remove unncessary environment variables (#331) (Matthew Loring) [#331](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/331)
* [[`422c9508ee`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/422c9508ee)] - Rename the `lib` directory to `src` (#333) (Dominic Kramer) [#333](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/333)
* [[`04b3b31023`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/04b3b31023)] - Add AUTHORS file (#332) (Matthew Loring) [#332](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/332)
* [[`aa5da46bf8`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/aa5da46bf8)] - Fix typo in `parseContextFromHeader` comment (#329) (Adri Van Houdt) 
* [[`398f46c33f`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/398f46c33f)] - hapi versions in README.md were out of sync (#328) (Ali Ijaz Sheikh) 
* [[`00a9ec7b07`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/00a9ec7b07)] - Fix some typos in the README (#323) (Dominic Kramer) 
* [[`b89dda8f1b`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/b89dda8f1b)] - Support for hapi 16 (#325) (Matthew Loring) [#325](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/325)
* [[`598366f194`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/598366f194)] - Add badges + update dependencies (#324) (Matthew Loring) [#324](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/324)
* [[`63e7aae593`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/63e7aae593)] - Begin testing against v7 on travis (#322) (Matthew Loring) [#322](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/322)

## 2016-11-11, Version 0.5.10 (Experimental), @matthewloring

### Commits

* [[`43b79b9e1c`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/43b79b9e1c)] - Remove query parameters from span names (#320) (Matthew Loring) [#320](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/320)

## 2016-10-31, Version 0.5.9 (Experimental), @matthewloring

### Notable changes

**configuration**:

  * [[`f72983f4c3`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/f72983f4c3)] - Implemented reading keyFile/credentials field from config object (#315) (Kelvin Jin)

### Commits

* [[`372f81a1a6`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/372f81a1a6)] - Stackdriver is lower case d (#318) (Steren) 
* [[`f72983f4c3`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/f72983f4c3)] - Implemented reading keyFile/credentials field from config object (#315) (Kelvin Jin) 
* [[`a1650a414c`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/a1650a414c)] - fix(docs): fix typo in installation docs (#313) (Michael Prentice) [#313](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/313)
* [[`47b35d4bcc`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/47b35d4bcc)] - Correct mysql supported version and update framework support list (#310) (Matthew Loring) [#310](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/310)

## 2016-10-03, Version 0.5.8 (Experimental), @matthewloring

### Notable changes

**grpc**:

  * [[`e76203e56c`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/e76203e56c)] - Implement gRPC Server Tracing (#301) (Kelvin Jin) [#301](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/301)

### Commits

* [[`566309edcc`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/566309edcc)] - Change connect trace URL prefix and add tests for connect hook (#309) (Kelvin Jin) [#309](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/309)
* [[`7acc4f60fc`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/7acc4f60fc)] - Update diagnostics common (#307) (Matthew Loring) [#307](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/307)
* [[`4b8e43a023`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/4b8e43a023)] - Intercept connect module (#305) (June Rhodes) [#305](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/305)
* [[`1f2fc792e4`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/1f2fc792e4)] - Added Custom Root Spans (#302) (Kelvin Jin) [#302](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/302)
* [[`e76203e56c`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/e76203e56c)] - Implement gRPC Server Tracing (#301) (Kelvin Jin) [#301](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/301)
* [[`b9e4848c14`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/b9e4848c14)] - Document using just the trace.append scope (Zach Bjornson) 
* [[`baa5116cf3`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/baa5116cf3)] - Clarify use of application-default credentials (#300) (Matthew Loring) [#300](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/300)
* [[`8c7f244faa`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/8c7f244faa)] - Document ignoreContextHeader configuration (#296) (Matthew Loring) [#296](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/296)
* [[`f321ee9aa0`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/f321ee9aa0)] - Allow ignoring the requests Context header (#295) (Jerry Jalava)

## 2016-08-29, Version 0.5.7 (Experimental), @matthewloring

### Commits

* [[`c52210857c`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/c52210857c)] - Support for hapi v15 (#293) (Matthew Loring) 

## 2016-08-26, Version 0.5.6 (Experimental), @matthewloring

### Notable changes

**hapi**:

  * [[`aba443202d`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/aba443202d)] - Support for hapi 14 (#284) (Matthew Loring) [#284](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/284)

### Commits

* [[`a71f578b58`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/a71f578b58)] - Add test fixture for grpc 1.0 (#290) (Matthew Loring) 
* [[`e0512f9cc5`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/e0512f9cc5)] - Add trace context to traced http responses (#288) (Matthew Loring) [#288](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/288)
* [[`ff44b7fddc`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/ff44b7fddc)] - Update mocha and timekeeper (#287) (Matthew Loring) 
* [[`b2dc2131dc`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/b2dc2131dc)] - Fix typo in readme (#286) (Matthew Loring) 
* [[`aba443202d`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/aba443202d)] - Support for hapi 14 (#284) (Matthew Loring) [#284](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/284)
* [[`e59beb8f30`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/e59beb8f30)] - Fix mongoose promise deprecation (#285) (Matthew Loring) [#285](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/pull/285)

## 2016-07-18, Version 0.5.5 (Experimental), @matthewloring

### Notable changes

**grpc**:
  * [[`4d2bce161c`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/4d2bce161c)] - Add support for pre-release grpc v1.1.0 (#281) (misterpoe) 
  * [[`43272b3fdc`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/43272b3fdc)] - Add service name to gRPC span name (#278) (misterpoe) 

**mongodb**:
  * [[`6994b459fa`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/6994b459fa)] - Add testing for mongodb-core (rskang)

### Commits

* [[`4d2bce161c`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/4d2bce161c)] - Add support for pre-release grpc v1.1.0 (#281) (misterpoe) 
* [[`ee5fe02e2b`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/ee5fe02e2b)] - Add windows testing for gRPC (#280) (misterpoe) 
* [[`6994b459fa`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/6994b459fa)] - Add testing for mongodb-core (rskang) 
* [[`abece5e15e`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/abece5e15e)] - Rename test-trace-mongodb.js to test-trace-mongoose.js (rskang) 
* [[`589e99edef`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/589e99edef)] - Test gRPC for gCloud (#277) (misterpoe) 
* [[`43272b3fdc`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/43272b3fdc)] - Add service name to gRPC span name (#278) (misterpoe) 
* [[`1efdfbd766`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/1efdfbd766)] - Add time to test-index to reduce flake (#274) (Matthew Loring) 
* [[`7d536baf5b`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/7d536baf5b)] - Add time to tracewriter timeout test to reduce flake (#275) (Matthew Loring) 
* [[`c699820893`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/c699820893)] - Fix http test: test-http-same-map.js (#273) (Matthew Loring)

## 2016-07-02, Version 0.5.4 (Experimental), @matthewloring

### Notable changes

**grpc**:
  * [[`f37618623a`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/f37618623a)] - Support enhanced database reporting for gRPC (#270) (misterpoe) 
  * [[`693b6ae565`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/693b6ae565)] - Support for gRPC time tracing (#267) (misterpoe) 

### Commits

* [[`f37618623a`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/f37618623a)] - Support enhanced database reporting for gRPC (#270) (misterpoe) 
* [[`82969d6d6d`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/82969d6d6d)] - Change callback lookup to not depend on gRPC version (#271) (misterpoe) 
* [[`b15a705cea`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/b15a705cea)] - Add gRPC context propagation tests for streaming APIs (#269) (misterpoe) 
* [[`6e81d88e75`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/6e81d88e75)] - Add test fixture for gRPC 0.15 (#268) (misterpoe) 
* [[`693b6ae565`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/693b6ae565)] - Support for gRPC time tracing (#267) (misterpoe) 
* [[`239890b0c6`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/239890b0c6)] - update the description for onUncaughtException (#266) (Ali Ijaz Sheikh) 

## 2016-06-14, Version 0.5.3 (Experimental), @matthewloring

### Notable changes

**grpc**:
  * [[`069e76c55b`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/069e76c55b)] - Add support for pre-release grpc v0.15 (Matt Loring) 

**redis**:
  * [[`0af3c57915`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/0af3c57915)] - Add support for redis 2.6 (Matt Loring) 

### Commits

* [[`afc2ed1690`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/afc2ed1690)] - Set outgoing trace enabled header always (Matt Loring) 
* [[`069e76c55b`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/069e76c55b)] - Add support for pre-release grpc v0.15 (Matt Loring) 
* [[`370f19c898`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/370f19c898)] - Increase time bound for appveyor slowdown (Matt Loring) 
* [[`8155cc9600`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/8155cc9600)] - Add testing for hiredis 0.5 (Matt Loring) 
* [[`311998352b`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/311998352b)] - Specify disabling options in README (Matt Loring) 
* [[`0af3c57915`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/0af3c57915)] - Add support for redis 2.6 (Matt Loring) 

## 2016-05-30, Version 0.5.2 (Experimental), @matthewloring

### Notable changes

**grpc**:
  * [[`9f796a5a58`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/9f796a5a58)] - Add support for grpc 0.14 context propagation (Matt Loring) 

### Commits

* [[`9f796a5a58`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/9f796a5a58)] - Add support for grpc 0.14 context propagation (Matt Loring) 
* [[`c220566cbc`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/c220566cbc)] - include app default cred login to installation steps in readme (Justin Beckwith) 
* [[`544e8073a5`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/544e8073a5)] - Set up windows CI (Matt Loring) 
* [[`e331cddadd`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/e331cddadd)] - Fix module regex for windows (Matt Loring) 
* [[`2167b16941`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/2167b16941)] - modulesLoadedBeforeTrace check incorrect (Michael Diarmid) 
* [[`1f52b8feba`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/1f52b8feba)] - Add nodejs 6 to travis runs (Matt Loring) 
* [[`bb75ba33dc`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/bb75ba33dc)] - Document service account keys (Matt Loring) 

## 2016-04-25, Version 0.5.1 (Experimental), @matthewloring

### Commits

* [[`11d12083dc`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/11d12083dc)] - Pin diagnostics common version (Matt Loring) 
* [[`36ad0ac8fb`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/36ad0ac8fb)] - Remove log of uncaughtException config (Matt Loring)

## 2016-04-18, Version 0.5.0 (Experimental), @matthewloring

### Notable changes

**configuration**:
  * [[`f2e65a2298`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/f2e65a2298)] - GCLOUD_PROJECT instead of GCLOUD_PROJECT_NUM (Matt Loring) 
  * [[`4903c64452`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/4903c64452)] - Attempt to publish traces on unhandled exception (Matt Loring) 
  * [[`6dc11f2c03`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/6dc11f2c03)] - Remove trace span functions from stack traces (Matt Loring) 

**sampling**:
  * [[`6856141e2a`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/6856141e2a)] - Enforce sampling policy regardless of headers (Matt Loring)

### Commits

* [[`77f1c198ca`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/77f1c198ca)] - Fix exception handler config to use ignore (Matt Loring) 
* [[`751807a878`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/751807a878)] - Eliminate failing http test (Matt Loring)
* [[`f2e65a2298`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/f2e65a2298)] - GCLOUD_PROJECT instead of GCLOUD_PROJECT_NUM (Matt Loring) 
* [[`4903c64452`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/4903c64452)] - Attempt to publish traces on unhandled exception (Matt Loring) 
* [[`ec924812c2`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/ec924812c2)] - Updated StackDriver and Flexible Env documentation (Matt Loring) 
* [[`6856141e2a`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/6856141e2a)] - Enforce sampling policy regardless of headers (Matt Loring) 
* [[`6dc11f2c03`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/6dc11f2c03)] - Remove trace span functions from stack traces (Matt Loring) 
* [[`e6474b8240`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/e6474b8240)] - Update dev dependencies (Matt Loring) 
* [[`f1e5b72731`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/f1e5b72731)] - Update readme screenshots (Matt Loring) 
* [[`cf94ceefd5`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/cf94ceefd5)] - Remove console.log from grpc (Matt Loring) 

## 2016-04-06, Version 0.4.0 (Experimental), @matthewloring

### Notable changes

**hapi**:
  * [[`45fb0ca23c`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/45fb0ca23c)] - Support for hapi 12 + 13 (Matt Loring) 
  * [[`71e735517a`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/71e735517a)] - Support for hapi 11 (Matt Loring) 
  * [[`2d0f1032fd`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/2d0f1032fd)] - Support for hapi 9 + 10 (Matt Loring) 

**sampling**:
  * [[`ba7f988151`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/ba7f988151)] - Respect incoming trace enabled options (Matt Loring) 

**redis**:
  * [[`b36c3bbf9d`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/b36c3bbf9d)] - Support for redis 2.4 (Matt Loring)

### Commits

* [[`042ba91536`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/042ba91536)] - Update supported framework versions in readme (Matt Loring) 
* [[`c657485b96`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/c657485b96)] - Experimental support for grpc tracing (Matt Loring) 
* [[`fba412148f`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/fba412148f)] - Document sampling and publishing behavior (Matt Loring) 
* [[`dfaa806755`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/dfaa806755)] - Move hapi-plugin-mysql to test fixtures (Matt Loring) 
* [[`039a64ea9b`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/039a64ea9b)] - Patch mysql connection pool (Matt Loring) 
* [[`45fb0ca23c`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/45fb0ca23c)] - Support for hapi 12 + 13 (Matt Loring) 
* [[`71e735517a`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/71e735517a)] - Support for hapi 11 (Matt Loring) 
* [[`2d0f1032fd`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/2d0f1032fd)] - Support for hapi 9 + 10 (Matt Loring) 
* [[`26cc2780e6`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/26cc2780e6)] - README clarification (Matt Loring) 
* [[`ba7f988151`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/ba7f988151)] - Respect incoming trace enabled options (Matt Loring) 
* [[`9f1bdea9aa`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/9f1bdea9aa)] - Treat spanIds as strings to avoid integer overflow (Matt Loring) 
* [[`58445faa5a`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/58445faa5a)] - Logging improvements for first error logging (Matt Loring) 
* [[`76f2ae77b8`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/76f2ae77b8)] - Update coveralls/istanbul and other dev dependencies (Matt Loring) 
* [[`9746b40158`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/9746b40158)] - Update docs to configure credentials with gcloud (Matt Loring) 
* [[`6ced33ebb8`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/6ced33ebb8)] - Warn when calling start multiple times (Matt Loring) 
* [[`0817cc8fda`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/0817cc8fda)] - Add testing for errors thrown by express (Matt Loring) 
* [[`fecb2f0d32`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/fecb2f0d32)] - Remove failing http test on 4.x/0.12 (Matt Loring) 
* [[`3dba5725b0`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/3dba5725b0)] - Handle headers as lowercase (Matt Loring) 
* [[`261b3fd403`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/261b3fd403)] - Update jshintignore (Matt Loring) 
* [[`7a61849f54`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/7a61849f54)] - Handle remaining todos in code (Matt Loring) 
* [[`67f6c67621`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/67f6c67621)] - Cleanup todos (Matt Loring) 
* [[`903cec6611`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/903cec6611)] - Warn about modules loaded before trace agent (Matt Loring) 
* [[`8c63bae5a3`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/8c63bae5a3)] - Warn about preloaded modules loaded before trace (Matt Loring) 
* [[`3e150a6f7a`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/3e150a6f7a)] - Change config format to support multiple agents (Matt Loring) 
* [[`a160e167e4`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/a160e167e4)] - Support relative config file paths from cwd (Matt Loring) 
* [[`e27630f92b`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/e27630f92b)] - Update README.md (Brad Abrams) 
* [[`a11676d9f8`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/a11676d9f8)] - Updated logging in a few places (Matt Loring) 
* [[`2c493b378d`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/2c493b378d)] - Tracing hooks for koa (Matt Loring) 
* [[`b36c3bbf9d`](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/commit/b36c3bbf9d)] - Support for redis 2.4 (Matt Loring)
