# Node.js Agent for Google Cloud Trace ChangeLog

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
