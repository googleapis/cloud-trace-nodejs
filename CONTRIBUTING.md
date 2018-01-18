# Building and Running Tests Locally

To ensure that the Trace Agent works cross-platform, we use TypeScript build scripts located in the [`scripts`](scripts) directory. The entry point to these scripts is [`index.ts`](scripts/index.ts). The usage of this file is `ts-node -p ./scripts ./scripts/index.ts [command1] [...moreCommands]` (assuming that you are running in the repository root directory.)

The list of possible build commands is enumerated as `case` statements in `index.ts`, in addition to `npm-*` commands. See [`index.ts`](scripts/index.ts) for more details.

`npm run script` is an alias for `ts-node -p ./scripts ./scripts/index.ts`.

For example, to compile all scripts and then initialize test fixtures, the command to use would be one of:

```bash
# Option 1
ts-node -p ./scripts ./scripts/index.ts npm-compile-all init-test-fixtures

# Option 2
npm run script npm-compile-all init-test-fixtures

# Option 3
npm run compile-all
npm run script init-test-fixtures
```

They are equivalent.

## Unit Tests

The minimum list of commands needed to run unit tests are:

```bash
npm install
export GCLOUD_TRACE_NEW_CONTEXT=1 # This is required. See cloud-trace-nodejs #650
npm run compile
npm run init-test-fixtures
npm test # Or "npm run script run-unit-tests"
```

A convenient one-liner for this (after `npm install`) is:

```bash
npm install
GCLOUD_TRACE_NEW_CONTEXT=1 npm run script npm-compile-all init-test-fixtures run-unit-tests
```

### Why `init-test-fixtures`

The Trace Agent unit tests rely on installing traced modules fixed at distinct version ranges. See [`plugin-fixtures.json`](test/fixtures/plugin-fixtures.json) for the list of fixtures.

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
