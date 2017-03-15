# Node.js Agent for Google Cloud Trace ChangeLog

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
