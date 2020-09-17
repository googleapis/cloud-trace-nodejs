# Changelog

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
