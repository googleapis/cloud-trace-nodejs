# Google Cloud Trace for Node.js

[![NPM Version][npm-image]][npm-url]
[![Build Status][travis-image]][travis-url]
[![Test Coverage][coveralls-image]][coveralls-url]
[![Dependency Status][david-image]][david-url]
[![devDependency Status][david-dev-image]][david-dev-url]

> *This module is experimental, and should be used by early adopters. This module uses APIs there may be undocumented and may be subject to change without notice.*

This module provides Cloud Trace support for Node.js applications. [Google Cloud Trace](https://cloud.google.com/cloud-trace/) is a feature of [Google Cloud Platform](https://cloud.google.com/) that collects latency data (traces) from your applications and displays it in near real-time in the [Google Cloud Console](https://console.cloud.google.com/?_ga=1.258049870.576536942.1443543237).

![Cloud Trace Overview](doc/images/cloud-trace-overview-page.png)

## Prerequisites

1. Your application will need to be using Node.js version 0.12 or greater.
1. You will need a project in the [Google Developers Console](https://console.cloud.google.com/project?_ga=1.258049870.576536942.1443543237). Your application can run anywhere, but the trace data is associated with a particular project.
1. [Enable the Trace API](https://console.cloud.google.com/flows/enableapi?apiid=cloudtrace) for your project.

## Installation

1. Install with [`npm`](https://www.npmjs.com) or add to your [`package.json`](https://docs.npmjs.com/files/package.json#dependencies).

        npm install --save @google/cloud-trace

2. Include and start the library at the *top of the main script of your application*. It's important that Cloud Trace is the first thing executed so that it can accurately gather data:

        require('@google/cloud-trace').start({projectId: 'your-project-id'});

Your project ID is visible in the [Google Cloud Console Console](https://console.cloud.google.com/project?_ga=1.258049870.576536942.1443543237), it may be something like `particular-future-12345`. If your application is [running on Google Cloud Platform](running-on-google-cloud-platform), you don't need to specify the project ID.

## Configuration

See [the default configuration](config.js) for a list of possible configuration options. These options can be passed to the agent through the object argument to the start command shown above:

         require('@google/cloud-trace').start({projectId: 'your-project-id', samplingRate: 500});

Alternatively, you can provide configuration through a config file. This can be useful if you want to load our module using `--require` on the command line instead of editing your main script. You can start by copying the default config file and modifying it to suit your needs. The `GCLOUD_DIAGNOSTICS_CONFIG` environment variable should point to your configuration file.

## Running on Google Cloud Platform

There are three different services that can host Node.js application to Google Cloud Platform.

### Google App Engine Managed VMs

If you are using [Google App Engine Managed VMs](https://cloud.google.com/appengine/docs/managed-vms/), you do not have to do any additional configuration.

### Google Compute Engine

Your VM instances need to be created with `cloud-platform` scope if created via [gcloud](https://cloud.google.com/sdk) or the 'Allow API access' checkbox selected if created via the [console](https://console.cloud.google.com) (see screenshot).

![GCE API](doc/images/gce.png?raw=true)

If you already have VMs that were created without API access and do not wish to recreate it, you can follow the instructions for using a service account under [running elsewhere](#running-elsewhere).

### Google Container Engine

Container Engine nodes need to also be created with the `cloud-platform` scope, which is configurable during cluster creation. Alternatively, you can follow the instructions for using a service account under [running elsewhere](#running-elsewhere). It's recommended that you store the service account credentials as [Kubernetes Secret](http://kubernetes.io/v1.1/docs/user-guide/secrets.html).

## Running elsewhere

If your application is running outside of Google Cloud Platform, such as locally, on-premise, or on another cloud provider, you can still use Cloud Trace.

1. You will need to specify your project ID when starting the trace agent.

        require('@google/cloud-trace').start({projectId: 'your-project-id'});

2. You will need to provide service account credentials to your application. The recommended way is via [Application Default Credentials](https://developers.google.com/identity/protocols/application-default-credentials). These can be provisioned by executing the following command:

        gcloud beta auth application-default login

## Viewing your traces

Run your application and start sending some requests towards your application. In about 30 seconds or so, you should see trace data gathered in the [Operations -> Traces view](https://console.cloud.google.com/traces/overview) in the console:

![Trace List](doc/images/tracelist.png?raw=true)

This is the trace list that shows a sampling of the incoming requests your application is receiving. You can click on a URI to drill down into the details. This will show you the RPCs made by your application and their associated latency:

![Trace View](doc/images/traceview.png?raw=true)

Note: When you open on up the traces view under the monitoring header, you may see a warning saying traces are disabled (shown below). This refers to traces gathered by the app server responsible for hosting your application. These traces are gathered independently of the traces generated by our agent and carry less semantic information about the behavior of your application. We recommend you DO NOT click Enable trace at this time.

![Trace Warning](doc/images/butterbar.png?raw=true)

## What gets traced

The trace agent can do automatic tracing of HTTP requests when using these frameworks:
* express v4+
* restify v3+ (experimental)
* hapi v8 (experimental)

The agent will also automatic trace of the following kinds of RPCs:
* Outbound HTTP requests
* MongoDB v2+
* Redis v0.12+ (experimental)

You can use the [Custom Tracing API](#custom-tracing-api) to trace other processes in your application.

We are working on expanding the types of frameworks and services we can do automatic tracing for. We are also interested in hearing your feedback on what other frameworks, or versions, you would like to see supported. This would help us prioritize support going forward. If you want support for a particular framework or RPC, please file a bug or +1 an existing bug.

## Advanced trace configuration

The trace agent can be configured by passing a configurations object to the agent `start` method. This configuration option accepts all values in the [default configuration](config.js).

One configuration option of note is `enhancedDatabaseReporting`. Setting this option to `true` will cause database operations for redis and MongoDB to record query summaries and results as labels on reported trace spans.

## Trace batching and sampling

The aggregation of trace spans before publishing can be configured using the `flushDelaySeconds` and `bufferSize` [options](config.js). The spans recorded for each incoming requests are placed in a buffer after the request has completed. Spans will be published to the UI in batch when the spans from `bufferSize` requests have been queued in the buffer or after `flushDelaySeconds` have passed since the last publish, whichever comes first.

The trace configuration additionally exposes the `samplingRate` option which sets an upper bound on the number of traced requests captured per second. Some Google Cloud environments may override this sampling policy.

## Custom Tracing API

The custom tracing API can be used to add custom spans to trace. A *span* is a particular unit of work within a trace, such as an RPC request. Currently, you can only use the custom tracing API inside the following web frameworks: `express`, `hapi`, `restify`.

The API is exposed by the `agent` returned when starting Cloud Trace:

```javascript
  var agent = require('@google/cloud-trace').start();
```

You can either use the `startSpan` and `endSpan` API, or use the `runInSpan` function that uses a callback-style.

### Start & end

To start a new span, use `agent.startSpan`. Each span requires a name, and you can optionally specify labels.

```javascript
  var span = agent.startSpan('name', {label: 'value'});
```

Once your work is complete, you can end the span with `agent.endSpan`. You can again optionally associate labels with the span:

```javascript
  agent.endSpan(span, {label2: 'value'});
```

### Run in span

`agent.runInSpan` takes a function to execute inside a custom span with the given name. The function may be synchronous or asynchronous. If it is asynchronous, it must accept a 'endSpan' function as an argument that should be called once the asynchronous work has completed.

```javascript
  agent.runInSpan('name', {label: 'value'}, function() {
    doSynchronousWork();
  });

  agent.runInSpan('name', {label: 'value'}, function(endSpan) {
    doAsyncWork(function(result) {
      processResult(result);
      endSpan({label2: 'value'});
    });
  });
```

### Changing trace properties

It is possible to rename and add labels to current trace. This can be use to give it a more meaningful name or add additional metata.

By default we use the name of the express (or hapi/restify) route as the transaction name, but it can be change using `agent.setTransactionName`:

```javascript
  agent.setTransactionName('new name');
```

You can add additional labels using `agent.addTransactionLabel`:

```javascript
  agent.addTransactionLabel('label', 'value');
```

## Contributing changes

* See [CONTRIBUTING.md](CONTRIBUTING.md)

## Licensing

* See [LICENSE](LICENSE)


[npm-image]: https://badge.fury.io/js/%40google%2Fcloud-trace.svg
[npm-url]: https://npmjs.org/package/@google/cloud-trace
[travis-image]: https://travis-ci.org/GoogleCloudPlatform/cloud-trace-nodejs.svg?branch=master
[travis-url]: https://travis-ci.org/GoogleCloudPlatform/cloud-trace-nodejs
[coveralls-image]: https://coveralls.io/repos/GoogleCloudPlatform/cloud-trace-nodejs/badge.svg?branch=master&service=github
[coveralls-url]: https://coveralls.io/github/GoogleCloudPlatform/cloud-trace-nodejs?branch=master
[david-image]: https://david-dm.org/GoogleCloudPlatform/cloud-trace-nodejs.svg
[david-url]: https://david-dm.org/GoogleCloudPlatform/cloud-trace-nodejs
[david-dev-image]: https://david-dm.org/GoogleCloudPlatform/cloud-trace-nodejs/dev-status.svg
[david-dev-url]: https://david-dm.org/GoogleCloudPlatform/cloud-trace-nodejs#info=devDependencies
