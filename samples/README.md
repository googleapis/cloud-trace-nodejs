# Stackdriver Trace for Node.js Sample Application

This sample demonstrates using [Stackdriver Trace][trace] with Node.js.

> Node 8+ is required for this sample.

* [Setup](#setup)
* [Running locally](#running-locally)
* [Deploying to App Engine](#deploying-to-app-engine)
* [Viewing Traces](#viewing-traces)

## Setup

Before you can run or deploy the sample, you need to do the following:

1.  Refer to the [this README file][readme] for instructions on
    running and deploying.
1.  Install dependencies:

        npm install

## Running locally

    npm start

## Deploying to App Engine

Ensure that you have an up-to-date `gcloud` (run `gcloud components update`), and then:

    npm run deploy

## Viewing Traces

Use the [Stackdriver Trace dashboard](https://console.cloud.google.com/traces/traces) to inspect recorded traces.

[trace]: https://cloud.google.com/trace/
[readme]: https://github.com/GoogleCloudPlatform/nodejs-docs-samples/blob/master/appengine/README.md
