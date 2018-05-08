# Contributing Guide

The Stackdriver Trace Agent is written in TypeScript. This means that when testing local changes to the Trace Agent, you will need to run `npm run compile` to invoke the TypeScript compiler to compile your changes to JavaScript.

The command `npm test` tests code the same way that our CI will test it. This is a convenience command for a number of steps, which can run separately if needed:

- `npm run check` checks the code for linting/formatting issues.
- `npm run compile` compiles the code, checking for type errors.
- `npm run init-test-fixtures` initializes the test fixtures, some of which are packages to be installed. (See [`plugin-fixtures.json`](test/fixtures/plugin-fixtures.json) for the list of fixtures.)
- `npm run unit-test` runs unit and integration tests.
- `npm run license-check` checks that licenses for dependencies are compatible with Google's guidelines.

There are a couple of environmental variables to note:

- Setting `GCLOUD_TRACE_NEW_CONTEXT` (to any string) activates `async_hooks`-based tracing on Node 8+. On versions of Node where `async_hooks` is available, tests should pass whether this variable is set or not.
- Setting `TRACE_TEST_EXCLUDE_INTEGRATION` (to any string) disables plugin tests when the command `npm run unit-test` is run. This is recommended for changes that do not affect plugins.
  - Some integration tests depend on locally running database services. On Unix, you can use `./bin/docker-trace.sh start` to start these services.

# How to become a contributor and submit your own code

## Contributor License Agreements

We'd love to accept your patches! Before we can take them, we have to jump a couple of legal hurdles.

Please fill out either the individual or corporate Contributor License Agreement (CLA).

  * If you are an individual writing original source code and you're sure you own the intellectual property, then you'll need to sign an [individual CLA](http://code.google.com/legal/individual-cla-v1.0.html).
  * If you work for a company that wants to allow you to contribute your work, then you'll need to sign a [corporate CLA](http://code.google.com/legal/corporate-cla-v1.0.html).

Follow either of the two links above to access the appropriate CLA and instructions for how to sign and return it. Once we receive it, we'll be able to accept your pull requests.

## Contributing A Patch

1. Submit an issue describing your proposed change to the repo in question.
1. The repo owner will respond to your issue promptly.
1. If your proposed change is accepted, and you haven't already done so, sign a Contributor License Agreement (see details above).
1. Fork the desired repo, develop and test your code changes.
1. Submit a pull request.
