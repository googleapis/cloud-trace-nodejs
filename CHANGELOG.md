# Node.js Agent for Google Cloud Trace ChangeLog

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
