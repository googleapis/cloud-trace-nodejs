# Changelog

## [7.1.2](https://github.com/googleapis/cloud-trace-nodejs/compare/v7.1.1...v7.1.2) (2022-09-08)


### Bug Fixes

* **deps:** Update dependency uuid to v9 ([#1475](https://github.com/googleapis/cloud-trace-nodejs/issues/1475)) ([d77f2e1](https://github.com/googleapis/cloud-trace-nodejs/commit/d77f2e1cecdf0ab4b4568894a254b8699b81ab80))

## [7.1.1](https://github.com/googleapis/cloud-trace-nodejs/compare/v7.1.0...v7.1.1) (2022-08-29)


### Bug Fixes

* **pg:** Return patched promise instead of original ([#1470](https://github.com/googleapis/cloud-trace-nodejs/issues/1470)) ([e79407e](https://github.com/googleapis/cloud-trace-nodejs/commit/e79407e2eae08ac26aa67058b1b2c9db278f2735))
* **redis:** Apply instrumentation only for Redis <4.0 ([b75f5d8](https://github.com/googleapis/cloud-trace-nodejs/commit/b75f5d81e9454ea90ea5b9c5c7576f809a88ff60))
* remove pip install statements ([#1546](https://github.com/googleapis/cloud-trace-nodejs/issues/1546)) ([#1468](https://github.com/googleapis/cloud-trace-nodejs/issues/1468)) ([fbcc88c](https://github.com/googleapis/cloud-trace-nodejs/commit/fbcc88c017d9a368e800bb070f33ff52cf4f0b99))
* Remove unused type arg ([#1467](https://github.com/googleapis/cloud-trace-nodejs/issues/1467)) ([ed422ed](https://github.com/googleapis/cloud-trace-nodejs/commit/ed422edac3de50551eadb791bc993356345d1647))

## [7.1.0](https://github.com/googleapis/cloud-trace-nodejs/compare/v7.0.0...v7.1.0) (2022-08-10)


### Features

* **mysql:** update MySQL wrapper to propagate fields. ([#1412](https://github.com/googleapis/cloud-trace-nodejs/issues/1412)) ([1b92362](https://github.com/googleapis/cloud-trace-nodejs/commit/1b92362d9a9b42aca338cb12fe2d6658744c9211))

## [7.0.0](https://github.com/googleapis/cloud-trace-nodejs/compare/v6.0.0...v7.0.0) (2022-08-10)


### ⚠ BREAKING CHANGES

* update library to use Node 12 (#1442)
* drop support for node.js 8.x (#1239)
* When initialized with `clsMechanism: 'none'`, calling `Tracer#createChildSpan` will potentially result in a warning, as these spans are considered to be uncorrelated. To ensure that warnings do not occur, disable any plugins that patch modules that create outgoing RPCs (gRPC, HTTP client and database calls). (Use of the custom span API `Tracer#createChildSpan` is not recommended in this configuration -- use `RootSpan#createChildSpan` instead.)
* This change modifies/removes APIs that assume a particular format for trace context headers; in other words, any place where the user would deal with a stringified trace context, they would now deal with a TraceContext object instead. This affects three APIs: `getResponseTraceContext` (input/output has changed from string to TraceContext), `createRootSpan` (input RootSpanOptions now accepts a TraceContext instead of a string in the traceContext field), and `Span#getTraceContext` (output has changed from string to TraceContext).
* contextHeaderBehavior and ignoreContextHeader now act independently of one another. The former controls how a sampling decision is made based on incoming context header, and the latter controls whether trace context is propagated to the current request.
* upgrade engines field to >=8.10.0 (#1011)
* `TraceAgent` has been renamed to `Tracer`. In plugins, `Patch` has been renamed `Monkeypatch`, and `Patch` is now `Monkeypatch|Intercept` (this is a rename of `Instrumentation`). There are no user-visible JS changes.
* The change in distributed trace context propagation across gRPC is not backwards-compatible. In other words, distributed tracing will not work between two Node instances communicating using gRPC with v2 and v3 of the Trace Agent, respectively.
* This commit drops support for Node 4 and 9.

### Features

* add config.disableUntracedModulesWarn ([#1070](https://github.com/googleapis/cloud-trace-nodejs/issues/1070)) ([f688e33](https://github.com/googleapis/cloud-trace-nodejs/commit/f688e333a81885f3add315662d5f9812d9eac816))
* add contextHeaderBehavior option ([#900](https://github.com/googleapis/cloud-trace-nodejs/issues/900)) ([199cb42](https://github.com/googleapis/cloud-trace-nodejs/commit/199cb42804899fa8d76d6cdcab283b1543f74267))
* add getProjectId and getCurrentRootSpan ([#782](https://github.com/googleapis/cloud-trace-nodejs/issues/782)) ([f7ae770](https://github.com/googleapis/cloud-trace-nodejs/commit/f7ae770b34be183f401588f035470d6d3d99068d))
* add ignoreMethods option ([#920](https://github.com/googleapis/cloud-trace-nodejs/issues/920)) ([67ddb8f](https://github.com/googleapis/cloud-trace-nodejs/commit/67ddb8f126a107a6751a191af280cef3ffe8af3e))
* add options to set the cls mechanism to async-hooks or async-listener ([#741](https://github.com/googleapis/cloud-trace-nodejs/issues/741)) ([f34aac5](https://github.com/googleapis/cloud-trace-nodejs/commit/f34aac5ba693e7de17c176155960dd6fb08eaa48))
* add rootSpan.createChildSpan and change none CLS semantics ([#731](https://github.com/googleapis/cloud-trace-nodejs/issues/731)) ([d0009ff](https://github.com/googleapis/cloud-trace-nodejs/commit/d0009ff5ea6ad9f84977ce6e3d1c8a0e2c195994))
* add rootSpanNameOverride option ([#826](https://github.com/googleapis/cloud-trace-nodejs/issues/826)) ([a03e7b2](https://github.com/googleapis/cloud-trace-nodejs/commit/a03e7b2f7f73c8187045912bee9fb4980e95ac39))
* add singular cls option ([#748](https://github.com/googleapis/cloud-trace-nodejs/issues/748)) ([000643f](https://github.com/googleapis/cloud-trace-nodejs/commit/000643fe21ec071ee3387f46fb602e2e396cb412))
* allow "disabling" cls, and relax requirements for creating root spans ([#728](https://github.com/googleapis/cloud-trace-nodejs/issues/728)) ([5d000e9](https://github.com/googleapis/cloud-trace-nodejs/commit/5d000e95e2e4132eefb09bb9e80c14fe04a92eaf))
* allow timestamps to be passed to endSpan ([#747](https://github.com/googleapis/cloud-trace-nodejs/issues/747)) ([319642a](https://github.com/googleapis/cloud-trace-nodejs/commit/319642abf51dffbbc5354c6743545065cc7449c2))
* allow users to specify a trace policy impl ([#1027](https://github.com/googleapis/cloud-trace-nodejs/issues/1027)) ([b37aa3d](https://github.com/googleapis/cloud-trace-nodejs/commit/b37aa3ddbebd0e051ba0fed3c92118c58456bee8))
* downgrade soft/hard span limit logs to warn level ([#1269](https://github.com/googleapis/cloud-trace-nodejs/issues/1269)) ([3f55458](https://github.com/googleapis/cloud-trace-nodejs/commit/3f5545845a8b1cb7f7e720d37ca2a95cf3410895))
* emit an error log on potential memory leak scenario ([#870](https://github.com/googleapis/cloud-trace-nodejs/issues/870)) ([0072e5f](https://github.com/googleapis/cloud-trace-nodejs/commit/0072e5f42c27bbf0f882d41d0b7d94a53a847ed7))
* expand version range for pg to 7.x ([#701](https://github.com/googleapis/cloud-trace-nodejs/issues/701)) ([c8c5bfc](https://github.com/googleapis/cloud-trace-nodejs/commit/c8c5bfc6168649cba65ca32cf53a524d38dac521))
* hapi 17 tracing support ([#710](https://github.com/googleapis/cloud-trace-nodejs/issues/710)) ([028032f](https://github.com/googleapis/cloud-trace-nodejs/commit/028032f94512debe125e69de17e45e0294a6cc47))
* implement (de)serialization of binary trace context ([#812](https://github.com/googleapis/cloud-trace-nodejs/issues/812)) ([f96c827](https://github.com/googleapis/cloud-trace-nodejs/commit/f96c82709481a9c93efe6e30c7df2f8077f1c597))
* move ts target to es2018 from es2016 ([#1280](https://github.com/googleapis/cloud-trace-nodejs/issues/1280)) ([b33df71](https://github.com/googleapis/cloud-trace-nodejs/commit/b33df71fe686ca9c859010e7c5a5589dd67e9631))
* rename TraceAgent/TraceApi to Tracer ([#815](https://github.com/googleapis/cloud-trace-nodejs/issues/815)) ([dde86d3](https://github.com/googleapis/cloud-trace-nodejs/commit/dde86d34b2ff2152081fe461b9edb86b432a5f2a))
* support @hapi/hapi ([#1108](https://github.com/googleapis/cloud-trace-nodejs/issues/1108)) ([d545e93](https://github.com/googleapis/cloud-trace-nodejs/commit/d545e93ce857b74e26e8195a6ef4d1cb1ba10275))
* support child spans with tail latencies ([#913](https://github.com/googleapis/cloud-trace-nodejs/issues/913)) ([d1de959](https://github.com/googleapis/cloud-trace-nodejs/commit/d1de959405e91b8a6bc0d55f93b1ad7d6bb90e73))
* support context propagation in bluebird ([#872](https://github.com/googleapis/cloud-trace-nodejs/issues/872)) ([29bb15c](https://github.com/googleapis/cloud-trace-nodejs/commit/29bb15c7f6cb2a2e0e24ccb8ea39581f06be6420))
* support knex 0.16 ([#940](https://github.com/googleapis/cloud-trace-nodejs/issues/940)) ([0b404a1](https://github.com/googleapis/cloud-trace-nodejs/commit/0b404a1e8c9f61f096c2a787899601a0a652517b))
* support mongodb-core@3 ([#760](https://github.com/googleapis/cloud-trace-nodejs/issues/760)) ([d227b6d](https://github.com/googleapis/cloud-trace-nodejs/commit/d227b6da3e444c87a98e159cfbc86409a6857753))
* support restify 8 ([#1250](https://github.com/googleapis/cloud-trace-nodejs/issues/1250)) ([f52fa4d](https://github.com/googleapis/cloud-trace-nodejs/commit/f52fa4daac833cd9e1242789cb6837641b798cb9))
* support restify@7 ([#917](https://github.com/googleapis/cloud-trace-nodejs/issues/917)) ([4b74f5a](https://github.com/googleapis/cloud-trace-nodejs/commit/4b74f5a617e8fa61a2abc261813ecdd5c2054a3a))
* support tracing for untranspiled async/await in Node 8+ ([#775](https://github.com/googleapis/cloud-trace-nodejs/issues/775)) ([30d0529](https://github.com/googleapis/cloud-trace-nodejs/commit/30d0529f4e0d1e1d3c4d433b969b5423650acee2))
* support user-specified context header propagation ([#1029](https://github.com/googleapis/cloud-trace-nodejs/issues/1029)) ([28ecb16](https://github.com/googleapis/cloud-trace-nodejs/commit/28ecb16876380001a6cf24ebdc38bb36976baec2))
* use small HTTP dependency ([#858](https://github.com/googleapis/cloud-trace-nodejs/issues/858)) ([210dc3f](https://github.com/googleapis/cloud-trace-nodejs/commit/210dc3fdce0aa2e161d82de7e3b470850a04596e))
* use source-map-support wrapCallSite to apply source maps to call stacks ([#1015](https://github.com/googleapis/cloud-trace-nodejs/issues/1015)) ([c558455](https://github.com/googleapis/cloud-trace-nodejs/commit/c558455cc90fbf8fe944f1f31cec8d4c343bef32))
* use well-known format for propagating trace context thru grpc ([#814](https://github.com/googleapis/cloud-trace-nodejs/issues/814)) ([63b13ca](https://github.com/googleapis/cloud-trace-nodejs/commit/63b13cac84ab97fb828b2cefcb3e4096a0fd0b4c))


### Bug Fixes

* add build/src/cls in output files ([#736](https://github.com/googleapis/cloud-trace-nodejs/issues/736)) ([49a900a](https://github.com/googleapis/cloud-trace-nodejs/commit/49a900afa6ed7d8019b6819b9ca82846a11a4926))
* add log level to logger prefix ([#875](https://github.com/googleapis/cloud-trace-nodejs/issues/875)) ([c19850d](https://github.com/googleapis/cloud-trace-nodejs/commit/c19850d11437ca24b34b6c919147371e72b46a69))
* add support for pg 7 changes ([#702](https://github.com/googleapis/cloud-trace-nodejs/issues/702)) ([f070636](https://github.com/googleapis/cloud-trace-nodejs/commit/f070636eb4ed9adb3f59c55e354913915f495f1e))
* adjust async_hooks cls behavior ([#734](https://github.com/googleapis/cloud-trace-nodejs/issues/734)) ([79ab435](https://github.com/googleapis/cloud-trace-nodejs/commit/79ab435a980d8e23b56887191fc310e1cd0a6313))
* allow non-objects for plugins to disable automatic tracing ([#720](https://github.com/googleapis/cloud-trace-nodejs/issues/720)) ([068260c](https://github.com/googleapis/cloud-trace-nodejs/commit/068260c59550a63cfcf2c7fb6db2868b67f5f441))
* allow sampling rate to be less than 1 ([#896](https://github.com/googleapis/cloud-trace-nodejs/issues/896)) ([5220f9b](https://github.com/googleapis/cloud-trace-nodejs/commit/5220f9be8a24e84121170b910bcda9860e79d5d3))
* always assign a trace ID to each request ([#1033](https://github.com/googleapis/cloud-trace-nodejs/issues/1033)) ([6b427ab](https://github.com/googleapis/cloud-trace-nodejs/commit/6b427abc5b11ded5c29b7f6ce21257d4ad59f5aa))
* apache license URL ([#468](https://github.com/googleapis/cloud-trace-nodejs/issues/468)) ([#1232](https://github.com/googleapis/cloud-trace-nodejs/issues/1232)) ([ac7e886](https://github.com/googleapis/cloud-trace-nodejs/commit/ac7e886c178ca9c34502e9baa9eb190d23104347))
* avoid memory leaks due to undisposed promise resources ([#885](https://github.com/googleapis/cloud-trace-nodejs/issues/885)) ([8454389](https://github.com/googleapis/cloud-trace-nodejs/commit/8454389beaf763162eb11947d501d75af4462009))
* **build:** migrate to using main branch ([#1373](https://github.com/googleapis/cloud-trace-nodejs/issues/1373)) ([f065f97](https://github.com/googleapis/cloud-trace-nodejs/commit/f065f97259da372ca53abca0d06df6a8cc5cd146))
* class-ify cls implementations ([#708](https://github.com/googleapis/cloud-trace-nodejs/issues/708)) ([132db9b](https://github.com/googleapis/cloud-trace-nodejs/commit/132db9b058c47603e7edc3254b7b6ef3a9122b36))
* copy credentials in internal config ([#1052](https://github.com/googleapis/cloud-trace-nodejs/issues/1052)) ([8930df3](https://github.com/googleapis/cloud-trace-nodejs/commit/8930df36201d05425cd89a64c3824dbbcad34faa))
* delete cache as it is not working anyways ([#864](https://github.com/googleapis/cloud-trace-nodejs/issues/864)) ([13f617a](https://github.com/googleapis/cloud-trace-nodejs/commit/13f617a9b696cf376b6595a3b77930c6eb7845be))
* **deps:** TypeScript 3.7.0 causes breaking change in typings ([#1163](https://github.com/googleapis/cloud-trace-nodejs/issues/1163)) ([6448c94](https://github.com/googleapis/cloud-trace-nodejs/commit/6448c941389a054c8615c442c66e072976719f35))
* **deps:** update dependency @google-cloud/common to ^0.23.0 ([#834](https://github.com/googleapis/cloud-trace-nodejs/issues/834)) ([ee350a2](https://github.com/googleapis/cloud-trace-nodejs/commit/ee350a283fb2e0b8fd3568aeaf95aa98c63de4f4))
* **deps:** update dependency @google-cloud/common to ^0.26.0 ([#892](https://github.com/googleapis/cloud-trace-nodejs/issues/892)) ([8c6a614](https://github.com/googleapis/cloud-trace-nodejs/commit/8c6a61486bc07fd7797b88c9f3368ddf20f923c2))
* **deps:** update dependency @google-cloud/common to ^0.27.0 ([#925](https://github.com/googleapis/cloud-trace-nodejs/issues/925)) ([10bb78b](https://github.com/googleapis/cloud-trace-nodejs/commit/10bb78b8daacb7c2d8f3dbd53933e3953b6f80a7))
* **deps:** update dependency @google-cloud/common to ^0.28.0 ([#941](https://github.com/googleapis/cloud-trace-nodejs/issues/941)) ([96863e7](https://github.com/googleapis/cloud-trace-nodejs/commit/96863e70ae2777168156f68505eddb46d002fcad))
* **deps:** update dependency @google-cloud/common to ^0.29.0 ([#947](https://github.com/googleapis/cloud-trace-nodejs/issues/947)) ([bc98aa3](https://github.com/googleapis/cloud-trace-nodejs/commit/bc98aa3416bf7d7ed6cac3f79fbe94f58a53d21d))
* **deps:** update dependency @google-cloud/common to ^0.30.0 ([#961](https://github.com/googleapis/cloud-trace-nodejs/issues/961)) ([2335934](https://github.com/googleapis/cloud-trace-nodejs/commit/23359346a7e70ab04196391b1c66219952523469))
* **deps:** update dependency @google-cloud/common to ^0.31.0 ([#963](https://github.com/googleapis/cloud-trace-nodejs/issues/963)) ([7b84349](https://github.com/googleapis/cloud-trace-nodejs/commit/7b843498743d515d10f96a49c2ce5cc36adbc294))
* **deps:** update dependency @google-cloud/common to ^0.32.0 ([#993](https://github.com/googleapis/cloud-trace-nodejs/issues/993)) ([670ac64](https://github.com/googleapis/cloud-trace-nodejs/commit/670ac64e30008b1a2dc3b211659c7c707c7a47a1))
* **deps:** update dependency @google-cloud/common to v1 ([#1023](https://github.com/googleapis/cloud-trace-nodejs/issues/1023)) ([244633e](https://github.com/googleapis/cloud-trace-nodejs/commit/244633ebf08a5fcde6d26470275c3d92d8fe1cee))
* **deps:** update dependency @google-cloud/common to v2 ([#1038](https://github.com/googleapis/cloud-trace-nodejs/issues/1038)) ([23a990a](https://github.com/googleapis/cloud-trace-nodejs/commit/23a990a7205d20e2a4b2e4b84bc9b8da6ddd31b2))
* **deps:** update dependency @google-cloud/common to v3 ([#1225](https://github.com/googleapis/cloud-trace-nodejs/issues/1225)) ([3609201](https://github.com/googleapis/cloud-trace-nodejs/commit/3609201994e3dd1d718cbcd236a9588c839ef2cb))
* **deps:** update dependency @google-cloud/common to v4 ([#1448](https://github.com/googleapis/cloud-trace-nodejs/issues/1448)) ([6f33c17](https://github.com/googleapis/cloud-trace-nodejs/commit/6f33c179534ed533999f36660e95402088ff1310))
* **deps:** update dependency @google-cloud/datastore to v2 ([#893](https://github.com/googleapis/cloud-trace-nodejs/issues/893)) ([a0a741d](https://github.com/googleapis/cloud-trace-nodejs/commit/a0a741dc17bc031caec205f1123ad25a180ff8ec))
* **deps:** update dependency @google-cloud/datastore to v3 ([#951](https://github.com/googleapis/cloud-trace-nodejs/issues/951)) ([a821462](https://github.com/googleapis/cloud-trace-nodejs/commit/a82146212a9f9294e8dae3f84ac03d8bbde130b8))
* **deps:** update dependency @google-cloud/datastore to v4 ([#1028](https://github.com/googleapis/cloud-trace-nodejs/issues/1028)) ([c63bb14](https://github.com/googleapis/cloud-trace-nodejs/commit/c63bb14722fc78889d643b30292ddc9a398c1fa9))
* **deps:** update dependency @opencensus/propagation-stackdriver to v0.0.13 ([#1030](https://github.com/googleapis/cloud-trace-nodejs/issues/1030)) ([4c79b4f](https://github.com/googleapis/cloud-trace-nodejs/commit/4c79b4f10e45ecb6dae32352f2312a0cedd2b5db))
* **deps:** update dependency @opencensus/propagation-stackdriver to v0.0.14 ([#1045](https://github.com/googleapis/cloud-trace-nodejs/issues/1045)) ([08a1dd6](https://github.com/googleapis/cloud-trace-nodejs/commit/08a1dd65431d8e692b8cab8869f772af57e9f7c1))
* **deps:** update dependency @opencensus/propagation-stackdriver to v0.0.16 ([#1079](https://github.com/googleapis/cloud-trace-nodejs/issues/1079)) ([e48dc54](https://github.com/googleapis/cloud-trace-nodejs/commit/e48dc5464dcbfbf36bb428f958373d3d7a7db39b))
* **deps:** update dependency @opencensus/propagation-stackdriver to v0.0.17 ([#1112](https://github.com/googleapis/cloud-trace-nodejs/issues/1112)) ([5636738](https://github.com/googleapis/cloud-trace-nodejs/commit/56367381d290a2546fbb4c2e85ce39c35dbd7541))
* **deps:** update dependency @opencensus/propagation-stackdriver to v0.0.18 ([#1140](https://github.com/googleapis/cloud-trace-nodejs/issues/1140)) ([8d39dd2](https://github.com/googleapis/cloud-trace-nodejs/commit/8d39dd2c89d97154a508f5f329fc576301da6b86))
* **deps:** update dependency @opencensus/propagation-stackdriver to v0.0.19 ([#1158](https://github.com/googleapis/cloud-trace-nodejs/issues/1158)) ([76b2162](https://github.com/googleapis/cloud-trace-nodejs/commit/76b21628e0d8e22e669112de632bf60d32cee4b4))
* **deps:** update dependency @opencensus/propagation-stackdriver to v0.0.20 ([#1199](https://github.com/googleapis/cloud-trace-nodejs/issues/1199)) ([4752aec](https://github.com/googleapis/cloud-trace-nodejs/commit/4752aec57bd988286176d5898f45d206b9885a41))
* **deps:** update dependency @opencensus/propagation-stackdriver to v0.0.21 ([#1227](https://github.com/googleapis/cloud-trace-nodejs/issues/1227)) ([4cd9088](https://github.com/googleapis/cloud-trace-nodejs/commit/4cd9088a48bfc94f514331a99cb14e90c01b3b4d))
* **deps:** update dependency @opencensus/propagation-stackdriver to v0.0.22 ([#1277](https://github.com/googleapis/cloud-trace-nodejs/issues/1277)) ([82725a2](https://github.com/googleapis/cloud-trace-nodejs/commit/82725a2ec161dda5d571e0fb615980f7bde63adf))
* **deps:** update dependency @opencensus/propagation-stackdriver to v0.1.0 ([#1368](https://github.com/googleapis/cloud-trace-nodejs/issues/1368)) ([29a0fba](https://github.com/googleapis/cloud-trace-nodejs/commit/29a0fbad13e4bd34f1ec6e6d14f9108a80b8ace2))
* **deps:** update dependency builtin-modules to v3 ([#810](https://github.com/googleapis/cloud-trace-nodejs/issues/810)) ([1fbbbf9](https://github.com/googleapis/cloud-trace-nodejs/commit/1fbbbf9e2bb7e7922386038ca8ae2443ae91359d))
* **deps:** update dependency gcp-metadata to ^0.7.0 ([#807](https://github.com/googleapis/cloud-trace-nodejs/issues/807)) ([94b8e3b](https://github.com/googleapis/cloud-trace-nodejs/commit/94b8e3b48ac9400b0bba16e4e6af8b3870997203))
* **deps:** update dependency gcp-metadata to ^0.9.0 ([#897](https://github.com/googleapis/cloud-trace-nodejs/issues/897)) ([b56926a](https://github.com/googleapis/cloud-trace-nodejs/commit/b56926a6498cdca3d97e8873cf93ddd0b61ae757))
* **deps:** update dependency gcp-metadata to v1 ([#975](https://github.com/googleapis/cloud-trace-nodejs/issues/975)) ([ea9cb4b](https://github.com/googleapis/cloud-trace-nodejs/commit/ea9cb4b9bd7552648f1cdf47a855ffc5c669485e))
* **deps:** update dependency gcp-metadata to v2 ([#1022](https://github.com/googleapis/cloud-trace-nodejs/issues/1022)) ([9d3b9e5](https://github.com/googleapis/cloud-trace-nodejs/commit/9d3b9e522a6ca766ae2aa391d26feb64fd6058f9))
* **deps:** update dependency gcp-metadata to v3 ([#1115](https://github.com/googleapis/cloud-trace-nodejs/issues/1115)) ([94c6dae](https://github.com/googleapis/cloud-trace-nodejs/commit/94c6dae4832b5e69b68392e835ebd2965cbd5f87))
* **deps:** update dependency gcp-metadata to v4 ([#1219](https://github.com/googleapis/cloud-trace-nodejs/issues/1219)) ([caf67be](https://github.com/googleapis/cloud-trace-nodejs/commit/caf67be26a5b02ebf6d7d3884cef75a2101a2052))
* **deps:** update dependency gcp-metadata to v5 ([#1446](https://github.com/googleapis/cloud-trace-nodejs/issues/1446)) ([2f264d0](https://github.com/googleapis/cloud-trace-nodejs/commit/2f264d08e888db57fba0411b93500f8c952055e5))
* **deps:** update dependency google-auth-library to v7 ([#1335](https://github.com/googleapis/cloud-trace-nodejs/issues/1335)) ([4fc7c7c](https://github.com/googleapis/cloud-trace-nodejs/commit/4fc7c7c54b78f09d961b33e02e449567325bf475))
* **deps:** update dependency google-auto-auth to ^0.10.0 ([#808](https://github.com/googleapis/cloud-trace-nodejs/issues/808)) ([93b7235](https://github.com/googleapis/cloud-trace-nodejs/commit/93b7235a8d59da11bc2a15971de19c64131af733))
* **deps:** update dependency got to v10 ([#1162](https://github.com/googleapis/cloud-trace-nodejs/issues/1162)) ([432404d](https://github.com/googleapis/cloud-trace-nodejs/commit/432404df86b9b4dbf570a8d6b870725978445654))
* **deps:** update dependency got to v11 ([#1248](https://github.com/googleapis/cloud-trace-nodejs/issues/1248)) ([03ff0f4](https://github.com/googleapis/cloud-trace-nodejs/commit/03ff0f45f4b74d803645f7d20338bff2116f17c3))
* **deps:** update dependency got to v8 ([#811](https://github.com/googleapis/cloud-trace-nodejs/issues/811)) ([fd138fc](https://github.com/googleapis/cloud-trace-nodejs/commit/fd138fc323c4533a185701367e254d3e82d7c248))
* **deps:** update dependency hard-rejection to v2 ([#985](https://github.com/googleapis/cloud-trace-nodejs/issues/985)) ([5900847](https://github.com/googleapis/cloud-trace-nodejs/commit/590084794248a4b2b2ebce0ad5582362edcab49a))
* **deps:** update dependency require-in-the-middle to v4 ([#984](https://github.com/googleapis/cloud-trace-nodejs/issues/984)) ([8abf8c8](https://github.com/googleapis/cloud-trace-nodejs/commit/8abf8c81150111388b9131787dfc065dc7145175))
* **deps:** update dependency require-in-the-middle to v5 ([#1099](https://github.com/googleapis/cloud-trace-nodejs/issues/1099)) ([1d49cb6](https://github.com/googleapis/cloud-trace-nodejs/commit/1d49cb69ce8da69a22d7912f1263f2a96de50387))
* **deps:** update dependency semver to v6 ([fae65bd](https://github.com/googleapis/cloud-trace-nodejs/commit/fae65bd86d3444f2e50254a7f3fe55a55460af8d))
* **deps:** update dependency semver to v7 ([#1168](https://github.com/googleapis/cloud-trace-nodejs/issues/1168)) ([b5811b5](https://github.com/googleapis/cloud-trace-nodejs/commit/b5811b567652def1fbf397a8fc776d96a4876a19))
* **deps:** update dependency uuid to v7 ([#1200](https://github.com/googleapis/cloud-trace-nodejs/issues/1200)) ([129aead](https://github.com/googleapis/cloud-trace-nodejs/commit/129aead7cbbd301ae446a05a77d9a34266897742))
* **deps:** update dependency uuid to v8 ([#1255](https://github.com/googleapis/cloud-trace-nodejs/issues/1255)) ([ad02efb](https://github.com/googleapis/cloud-trace-nodejs/commit/ad02efb24fc439e8d2f0b76fa1398b9e9699bf04))
* **deps:** use the latest extend ([#1096](https://github.com/googleapis/cloud-trace-nodejs/issues/1096)) ([abc4b4e](https://github.com/googleapis/cloud-trace-nodejs/commit/abc4b4e8a4a0f4bbf5e79e8f7bf05eabe7044c56))
* **docs:** add jsdoc-region-tag plugin ([#1151](https://github.com/googleapis/cloud-trace-nodejs/issues/1151)) ([ee19cb9](https://github.com/googleapis/cloud-trace-nodejs/commit/ee19cb9d973e50ef770a23c49e13e80d947dfa6e))
* **docs:** remove reference doc anchor ([#1109](https://github.com/googleapis/cloud-trace-nodejs/issues/1109)) ([801e495](https://github.com/googleapis/cloud-trace-nodejs/commit/801e49586a9e5c937659775a0d3fd99aa836098c))
* **docs:** standardize README and add repo metadata ([#1095](https://github.com/googleapis/cloud-trace-nodejs/issues/1095)) ([c24faa3](https://github.com/googleapis/cloud-trace-nodejs/commit/c24faa3ac6762b3256e238ada08eff701a036277))
* don't let trace context injection throw ([#989](https://github.com/googleapis/cloud-trace-nodejs/issues/989)) ([50421a5](https://github.com/googleapis/cloud-trace-nodejs/commit/50421a5ad9ee8cb49e629dc7a9a8caddee959401))
* enable tracing on original client method names ([#874](https://github.com/googleapis/cloud-trace-nodejs/issues/874)) ([497c760](https://github.com/googleapis/cloud-trace-nodejs/commit/497c760b732aa64eccf4e8ece4f4d1d84e8e5dfb))
* end child spans correctly in pg ([#930](https://github.com/googleapis/cloud-trace-nodejs/issues/930)) ([1a20b7c](https://github.com/googleapis/cloud-trace-nodejs/commit/1a20b7c91e67ec8fb4ff10d0094885fe838bad1d))
* fix https tracing breakage in node <9 and rewrite http tests ([#717](https://github.com/googleapis/cloud-trace-nodejs/issues/717)) ([a3ea16d](https://github.com/googleapis/cloud-trace-nodejs/commit/a3ea16dc06c91f66afaa58a12434f46e61d84399))
* fix log messages and ignore falsey env vars ([#724](https://github.com/googleapis/cloud-trace-nodejs/issues/724)) ([d0337fa](https://github.com/googleapis/cloud-trace-nodejs/commit/d0337fa7b06648d4612a847407f47c320b7bcd9e))
* fix tracing not working in mongoose 3.3+ ([#1134](https://github.com/googleapis/cloud-trace-nodejs/issues/1134)) ([fe7e925](https://github.com/googleapis/cloud-trace-nodejs/commit/fe7e92599842ab738393caf67fdfec31ab952ec5))
* fixup for node 8.11.2 ([#755](https://github.com/googleapis/cloud-trace-nodejs/issues/755)) ([807d4ad](https://github.com/googleapis/cloud-trace-nodejs/commit/807d4ad33f97a265b55de7cb25c2ca85a1e19ae9))
* force http and https clients to be patched ([#1084](https://github.com/googleapis/cloud-trace-nodejs/issues/1084)) ([3ac0b90](https://github.com/googleapis/cloud-trace-nodejs/commit/3ac0b90442804cff6fcf21fa2a6731cc38a66030))
* handle Node 10 style http requests ([#1233](https://github.com/googleapis/cloud-trace-nodejs/issues/1233)) ([511b21c](https://github.com/googleapis/cloud-trace-nodejs/commit/511b21c8563d56aff7cfdb9d14a53032d6e8fb8f))
* handle pg 7.16.0+ undefined Result#fields ([#1179](https://github.com/googleapis/cloud-trace-nodejs/issues/1179)) ([21dbb0d](https://github.com/googleapis/cloud-trace-nodejs/commit/21dbb0d12566c94eabb4aee6e8a3b874f255d74a))
* improve logs from the trace writer ([#800](https://github.com/googleapis/cloud-trace-nodejs/issues/800)) ([4ac6ded](https://github.com/googleapis/cloud-trace-nodejs/commit/4ac6dedbf4ffdc9c856126ebb90ce72830746343))
* include more type definitions ([#841](https://github.com/googleapis/cloud-trace-nodejs/issues/841)) ([eb98fa1](https://github.com/googleapis/cloud-trace-nodejs/commit/eb98fa18e41039444f52a088d674f25d281677b4))
* inject context http headers early if expect header exists ([#766](https://github.com/googleapis/cloud-trace-nodejs/issues/766)) ([bc877a5](https://github.com/googleapis/cloud-trace-nodejs/commit/bc877a534593d9a658597ca2292aa08ae8ca6d39))
* make no option flags behave the same as o=1 ([#910](https://github.com/googleapis/cloud-trace-nodejs/issues/910)) ([67379f8](https://github.com/googleapis/cloud-trace-nodejs/commit/67379f8c3418417d7c4f1901475b7b06d45571a6))
* output `'noPluginName'` in trace-api log messages where pluginName is undefined ([#958](https://github.com/googleapis/cloud-trace-nodejs/issues/958)) ([6793b09](https://github.com/googleapis/cloud-trace-nodejs/commit/6793b0993b6edeafbc9af9f4112b072b54943295))
* **package:** update @google-cloud/common to version 0.20.3 ([#796](https://github.com/googleapis/cloud-trace-nodejs/issues/796)) ([fa8f4a4](https://github.com/googleapis/cloud-trace-nodejs/commit/fa8f4a45272cd68eb89ca1fcb6d964771dc210ea)), closes [#773](https://github.com/googleapis/cloud-trace-nodejs/issues/773)
* Prevent filtered traces from biasing the sample rate ([#1018](https://github.com/googleapis/cloud-trace-nodejs/issues/1018)) ([1832473](https://github.com/googleapis/cloud-trace-nodejs/commit/18324736faba2657cec44d1ed23136e5c03ff065))
* restore context when a function run with a given context throws ([#727](https://github.com/googleapis/cloud-trace-nodejs/issues/727)) ([edb8135](https://github.com/googleapis/cloud-trace-nodejs/commit/edb8135a7960815e8b112aae3a2c3c34e9b3d812))
* sample app TypeError ([#1257](https://github.com/googleapis/cloud-trace-nodejs/issues/1257)) ([1ac424e](https://github.com/googleapis/cloud-trace-nodejs/commit/1ac424efbc66a2057ed6290e1d98c2fe1731c76e))
* support tracing awaited mongoose queries ([#1007](https://github.com/googleapis/cloud-trace-nodejs/issues/1007)) ([deb2a44](https://github.com/googleapis/cloud-trace-nodejs/commit/deb2a44195b0c6d37fd2216e4c27811e031c08f6))
* swap log levels for two log points ([#882](https://github.com/googleapis/cloud-trace-nodejs/issues/882)) ([e73af2b](https://github.com/googleapis/cloud-trace-nodejs/commit/e73af2b1eda38faeda50c83f815847d163cdb369))
* **tests:** Hex value assertion was used on decimal string ([#1271](https://github.com/googleapis/cloud-trace-nodejs/issues/1271)) ([5def451](https://github.com/googleapis/cloud-trace-nodejs/commit/5def4511b81ef80ed8f9e0e40fd872c08cc8bb51))
* treat instanceId metadata as a number ([#713](https://github.com/googleapis/cloud-trace-nodejs/issues/713)) ([1434d5d](https://github.com/googleapis/cloud-trace-nodejs/commit/1434d5db7a0abf8406c8cbc2bf6ae66d1b519d0e))
* typeo in nodejs .gitattribute ([#1290](https://github.com/googleapis/cloud-trace-nodejs/issues/1290)) ([24deca8](https://github.com/googleapis/cloud-trace-nodejs/commit/24deca8e39df2507db3e2283ff540aceb54a6c89))
* unpin @types/node and account for new http.request signatures ([#1120](https://github.com/googleapis/cloud-trace-nodejs/issues/1120)) ([bd9863b](https://github.com/googleapis/cloud-trace-nodejs/commit/bd9863b7702abc90c5000571790ee23fe0d9ed7c))
* update @google-cloud/common dependency to 0.25.3 ([#871](https://github.com/googleapis/cloud-trace-nodejs/issues/871)) ([23a0616](https://github.com/googleapis/cloud-trace-nodejs/commit/23a0616d0cd66489bbb68477ef89f2130b7dea59))
* Update README partials to mention how to use import ([#1400](https://github.com/googleapis/cloud-trace-nodejs/issues/1400)) ([da8741b](https://github.com/googleapis/cloud-trace-nodejs/commit/da8741b5168f8134d523fdcf7c83f1627bc4caf6))
* update teeny-request dep ([#928](https://github.com/googleapis/cloud-trace-nodejs/issues/928)) ([1d7c4dc](https://github.com/googleapis/cloud-trace-nodejs/commit/1d7c4dcf9e6b1500555eff5d2f1bac36d8e6f158))
* update to @google-cloud/common@0.19 ([#772](https://github.com/googleapis/cloud-trace-nodejs/issues/772)) ([3f3f667](https://github.com/googleapis/cloud-trace-nodejs/commit/3f3f667952853258413143300ccce4d95ba943e1))
* use req.ip in express and koa plugin ([#944](https://github.com/googleapis/cloud-trace-nodejs/issues/944)) ([126bc75](https://github.com/googleapis/cloud-trace-nodejs/commit/126bc757606ec964090d9749c5f8c03e251ffb5c))
* warn if tracing might not work instead of err ([#1068](https://github.com/googleapis/cloud-trace-nodejs/issues/1068)) ([8bdd946](https://github.com/googleapis/cloud-trace-nodejs/commit/8bdd9469dc80a2f43938e4769f9cf577d3a04b05))
* wrap gRPC server async handlers ([#954](https://github.com/googleapis/cloud-trace-nodejs/issues/954)) ([8b8bd94](https://github.com/googleapis/cloud-trace-nodejs/commit/8b8bd9419e6c40c6bf155d361e2c74c5c4d3481f))


### Performance Improvements

* **deps:** avoid semver where possible ([#1309](https://github.com/googleapis/cloud-trace-nodejs/issues/1309)) ([4c05cae](https://github.com/googleapis/cloud-trace-nodejs/commit/4c05caeb3910657b3eb413da61aac03cb321bd7b))


### Miscellaneous Chores

* drop support for node 4 and 9 ([#780](https://github.com/googleapis/cloud-trace-nodejs/issues/780)) ([e4cfb1b](https://github.com/googleapis/cloud-trace-nodejs/commit/e4cfb1bc5fb9c7529f24cf58e2dfcd2923728d68))


### Build System

* drop support for node.js 8.x ([#1239](https://github.com/googleapis/cloud-trace-nodejs/issues/1239)) ([e357efc](https://github.com/googleapis/cloud-trace-nodejs/commit/e357efcb87e4b69332a7e7c354d8ee84c3298d10))
* update library to use Node 12 ([#1442](https://github.com/googleapis/cloud-trace-nodejs/issues/1442)) ([a5fd508](https://github.com/googleapis/cloud-trace-nodejs/commit/a5fd50830af74da261e05b478302d1e5fde1b556))
* upgrade engines field to >=8.10.0 ([#1011](https://github.com/googleapis/cloud-trace-nodejs/issues/1011)) ([98f95e3](https://github.com/googleapis/cloud-trace-nodejs/commit/98f95e343282519ee7130fe5bc9e9f8318284318))

## [6.0.0](https://github.com/googleapis/cloud-trace-nodejs/compare/v5.1.6...v6.0.0) (2022-06-20)


### ⚠ BREAKING CHANGES

* update library to use Node 12 (#1442)

### Bug Fixes

* **deps:** update dependency gcp-metadata to v5 ([#1446](https://github.com/googleapis/cloud-trace-nodejs/issues/1446)) ([2f264d0](https://github.com/googleapis/cloud-trace-nodejs/commit/2f264d08e888db57fba0411b93500f8c952055e5))


### Build System

* update library to use Node 12 ([#1442](https://github.com/googleapis/cloud-trace-nodejs/issues/1442)) ([a5fd508](https://github.com/googleapis/cloud-trace-nodejs/commit/a5fd50830af74da261e05b478302d1e5fde1b556))

### [5.1.6](https://www.github.com/googleapis/cloud-trace-nodejs/compare/v5.1.5...v5.1.6) (2021-11-16)


### Bug Fixes

* Update README partials to mention how to use import ([#1400](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1400)) ([da8741b](https://www.github.com/googleapis/cloud-trace-nodejs/commit/da8741b5168f8134d523fdcf7c83f1627bc4caf6))

### [5.1.5](https://www.github.com/googleapis/cloud-trace-nodejs/compare/v5.1.4...v5.1.5) (2021-08-19)


### Bug Fixes

* **deps:** update dependency @opencensus/propagation-stackdriver to v0.1.0 ([#1368](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1368)) ([29a0fba](https://www.github.com/googleapis/cloud-trace-nodejs/commit/29a0fbad13e4bd34f1ec6e6d14f9108a80b8ace2))

### [5.1.4](https://www.github.com/googleapis/cloud-trace-nodejs/compare/v5.1.3...v5.1.4) (2021-08-19)


### Bug Fixes

* **build:** migrate to using main branch ([#1373](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1373)) ([f065f97](https://www.github.com/googleapis/cloud-trace-nodejs/commit/f065f97259da372ca53abca0d06df6a8cc5cd146))

### [5.1.3](https://www.github.com/googleapis/cloud-trace-nodejs/compare/v5.1.2...v5.1.3) (2021-02-09)


### Bug Fixes

* **deps:** update dependency google-auth-library to v7 ([#1335](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1335)) ([4fc7c7c](https://www.github.com/googleapis/cloud-trace-nodejs/commit/4fc7c7c54b78f09d961b33e02e449567325bf475))

### [5.1.2](https://www.github.com/googleapis/cloud-trace-nodejs/compare/v5.1.1...v5.1.2) (2021-02-04)


### Performance Improvements

* **deps:** avoid semver where possible ([#1309](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1309)) ([4c05cae](https://www.github.com/googleapis/cloud-trace-nodejs/commit/4c05caeb3910657b3eb413da61aac03cb321bd7b))

### [5.1.1](https://www.github.com/googleapis/cloud-trace-nodejs/compare/v5.1.0...v5.1.1) (2020-09-12)


### Bug Fixes

* typeo in nodejs .gitattribute ([#1290](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1290)) ([24deca8](https://www.github.com/googleapis/cloud-trace-nodejs/commit/24deca8e39df2507db3e2283ff540aceb54a6c89))

## [5.1.0](https://www.github.com/googleapis/cloud-trace-nodejs/compare/v5.0.0...v5.1.0) (2020-06-11)


### Features

* move ts target to es2018 from es2016 ([#1280](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1280)) ([b33df71](https://www.github.com/googleapis/cloud-trace-nodejs/commit/b33df71fe686ca9c859010e7c5a5589dd67e9631))


### Bug Fixes

* **deps:** update dependency @opencensus/propagation-stackdriver to v0.0.22 ([#1277](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1277)) ([82725a2](https://www.github.com/googleapis/cloud-trace-nodejs/commit/82725a2ec161dda5d571e0fb615980f7bde63adf))

## [5.0.0](https://www.github.com/googleapis/cloud-trace-nodejs/compare/v4.2.5...v5.0.0) (2020-06-04)


### ⚠ BREAKING CHANGES

* drop support for node.js 8.x (#1239)

### Features

* downgrade soft/hard span limit logs to warn level ([#1269](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1269)) ([3f55458](https://www.github.com/googleapis/cloud-trace-nodejs/commit/3f5545845a8b1cb7f7e720d37ca2a95cf3410895))
* support restify 8 ([#1250](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1250)) ([f52fa4d](https://www.github.com/googleapis/cloud-trace-nodejs/commit/f52fa4daac833cd9e1242789cb6837641b798cb9))


### Bug Fixes

* **deps:** update dependency @google-cloud/common to v3 ([#1225](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1225)) ([3609201](https://www.github.com/googleapis/cloud-trace-nodejs/commit/3609201994e3dd1d718cbcd236a9588c839ef2cb))
* **deps:** update dependency @opencensus/propagation-stackdriver to v0.0.20 ([#1199](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1199)) ([4752aec](https://www.github.com/googleapis/cloud-trace-nodejs/commit/4752aec57bd988286176d5898f45d206b9885a41))
* **deps:** update dependency @opencensus/propagation-stackdriver to v0.0.21 ([#1227](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1227)) ([4cd9088](https://www.github.com/googleapis/cloud-trace-nodejs/commit/4cd9088a48bfc94f514331a99cb14e90c01b3b4d))
* **deps:** update dependency gcp-metadata to v4 ([#1219](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1219)) ([caf67be](https://www.github.com/googleapis/cloud-trace-nodejs/commit/caf67be26a5b02ebf6d7d3884cef75a2101a2052))
* apache license URL ([#468](https://www.github.com/googleapis/cloud-trace-nodejs/issues/468)) ([#1232](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1232)) ([ac7e886](https://www.github.com/googleapis/cloud-trace-nodejs/commit/ac7e886c178ca9c34502e9baa9eb190d23104347))
* **deps:** update dependency got to v11 ([#1248](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1248)) ([03ff0f4](https://www.github.com/googleapis/cloud-trace-nodejs/commit/03ff0f45f4b74d803645f7d20338bff2116f17c3))
* **deps:** update dependency uuid to v7 ([#1200](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1200)) ([129aead](https://www.github.com/googleapis/cloud-trace-nodejs/commit/129aead7cbbd301ae446a05a77d9a34266897742))
* **deps:** update dependency uuid to v8 ([#1255](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1255)) ([ad02efb](https://www.github.com/googleapis/cloud-trace-nodejs/commit/ad02efb24fc439e8d2f0b76fa1398b9e9699bf04))
* **tests:** Hex value assertion was used on decimal string ([#1271](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1271)) ([5def451](https://www.github.com/googleapis/cloud-trace-nodejs/commit/5def4511b81ef80ed8f9e0e40fd872c08cc8bb51))
* handle Node 10 style http requests ([#1233](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1233)) ([511b21c](https://www.github.com/googleapis/cloud-trace-nodejs/commit/511b21c8563d56aff7cfdb9d14a53032d6e8fb8f))
* sample app TypeError ([#1257](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1257)) ([1ac424e](https://www.github.com/googleapis/cloud-trace-nodejs/commit/1ac424efbc66a2057ed6290e1d98c2fe1731c76e)), closes [#1246](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1246)


### Build System

* drop support for node.js 8.x ([#1239](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1239)) ([e357efc](https://www.github.com/googleapis/cloud-trace-nodejs/commit/e357efcb87e4b69332a7e7c354d8ee84c3298d10))

### [4.2.5](https://www.github.com/googleapis/cloud-trace-nodejs/compare/v4.2.4...v4.2.5) (2020-01-06)


### Bug Fixes

* **deps:** update dependency semver to v7 ([#1168](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1168)) ([b5811b5](https://www.github.com/googleapis/cloud-trace-nodejs/commit/b5811b567652def1fbf397a8fc776d96a4876a19))
* handle pg 7.16.0+ undefined Result#fields ([#1179](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1179)) ([21dbb0d](https://www.github.com/googleapis/cloud-trace-nodejs/commit/21dbb0d12566c94eabb4aee6e8a3b874f255d74a))

### [4.2.4](https://www.github.com/googleapis/cloud-trace-nodejs/compare/v4.2.3...v4.2.4) (2019-12-06)


### Bug Fixes

* **deps:** TypeScript 3.7.0 causes breaking change in typings ([#1163](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1163)) ([6448c94](https://www.github.com/googleapis/cloud-trace-nodejs/commit/6448c941389a054c8615c442c66e072976719f35))
* **deps:** update dependency @opencensus/propagation-stackdriver to v0.0.19 ([#1158](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1158)) ([76b2162](https://www.github.com/googleapis/cloud-trace-nodejs/commit/76b21628e0d8e22e669112de632bf60d32cee4b4))
* **deps:** update dependency got to v10 ([#1162](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1162)) ([432404d](https://www.github.com/googleapis/cloud-trace-nodejs/commit/432404df86b9b4dbf570a8d6b870725978445654))
* **docs:** add jsdoc-region-tag plugin ([#1151](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1151)) ([ee19cb9](https://www.github.com/googleapis/cloud-trace-nodejs/commit/ee19cb9d973e50ef770a23c49e13e80d947dfa6e))

### [4.2.3](https://www.github.com/googleapis/cloud-trace-nodejs/compare/v4.2.2...v4.2.3) (2019-11-11)


### Bug Fixes

* **deps:** update dependency source-map-support to v0.5.16 ([#1148](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1148)) ([3947e5b](https://www.github.com/googleapis/cloud-trace-nodejs/commit/3947e5b))

### [4.2.2](https://www.github.com/googleapis/cloud-trace-nodejs/compare/v4.2.1...v4.2.2) (2019-10-10)


### Bug Fixes

* fix tracing not working in mongoose 3.3+ ([#1134](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1134)) ([fe7e925](https://www.github.com/googleapis/cloud-trace-nodejs/commit/fe7e925))
* **deps:** update dependency @opencensus/propagation-stackdriver to v0.0.18 ([#1140](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1140)) ([8d39dd2](https://www.github.com/googleapis/cloud-trace-nodejs/commit/8d39dd2))

### [4.2.1](https://www.github.com/googleapis/cloud-trace-nodejs/compare/v4.2.0...v4.2.1) (2019-10-02)


### Bug Fixes

* **deps:** update dependency gcp-metadata to v3 ([#1115](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1115)) ([94c6dae](https://www.github.com/googleapis/cloud-trace-nodejs/commit/94c6dae))
* unpin @types/node and account for new http.request signatures ([#1120](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1120)) ([bd9863b](https://www.github.com/googleapis/cloud-trace-nodejs/commit/bd9863b))

## [4.2.0](https://www.github.com/googleapis/cloud-trace-nodejs/compare/v4.1.1...v4.2.0) (2019-09-09)


### Bug Fixes

* **deps:** update dependency @opencensus/propagation-stackdriver to v0.0.17 ([#1112](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1112)) ([5636738](https://www.github.com/googleapis/cloud-trace-nodejs/commit/5636738))
* **deps:** update dependency require-in-the-middle to v5 ([#1099](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1099)) ([1d49cb6](https://www.github.com/googleapis/cloud-trace-nodejs/commit/1d49cb6))
* **deps:** use the latest extend ([#1096](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1096)) ([abc4b4e](https://www.github.com/googleapis/cloud-trace-nodejs/commit/abc4b4e))
* **docs:** remove reference doc anchor ([#1109](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1109)) ([801e495](https://www.github.com/googleapis/cloud-trace-nodejs/commit/801e495))


### Features

* support @hapi/hapi ([#1108](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1108)) ([d545e93](https://www.github.com/googleapis/cloud-trace-nodejs/commit/d545e93))

### [4.1.1](https://www.github.com/googleapis/cloud-trace-nodejs/compare/v4.1.0...v4.1.1) (2019-08-05)


### Bug Fixes

* **deps:** update dependency @opencensus/propagation-stackdriver to v0.0.16 ([#1079](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1079)) ([e48dc54](https://www.github.com/googleapis/cloud-trace-nodejs/commit/e48dc54))
* **docs:** standardize README and add repo metadata ([#1095](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1095)) ([c24faa3](https://www.github.com/googleapis/cloud-trace-nodejs/commit/c24faa3))
* force http and https clients to be patched ([#1084](https://www.github.com/googleapis/cloud-trace-nodejs/issues/1084)) ([3ac0b90](https://www.github.com/googleapis/cloud-trace-nodejs/commit/3ac0b90))
