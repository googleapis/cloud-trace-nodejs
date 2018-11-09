# Stackdriver Trace for Node.js Sample Application

This sample demonstrates using [Stackdriver Trace][trace] with Node.js.

* [Setup](#setup)
* [Running locally](#running-locally)
* [Deploying to App Engine](#deploying-to-app-engine)

## Setup

Before you can run or deploy the sample, you need to do the following:

1.  Refer to the [this README file][readme] for instructions on
    running and deploying.
1.  Install dependencies:

    With `npm`:

        npm install

    or with `yarn`:

        yarn install

## Running locally

With `npm`:

    npm start

or with `yarn`:

    yarn start

## Deploying to App Engine

With `npm`:

    npm run deploy

or with `yarn`:

    yarn run deploy

Use the [Stackdriver Trace dashboard](https://console.cloud.google.com/traces/traces) to inspect recorded traces.

[trace]: https://cloud.google.com/trace/
[readme]: https://github.com/GoogleCloudPlatform/nodejs-docs-samples/blob/master/appengine/README.md
