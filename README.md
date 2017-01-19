# Stackdriver Trace for Node.js

[![NPM Version][npm-image]][npm-url]
[![Build Status][travis-image]][travis-url]
[![Test Coverage][coveralls-image]][coveralls-url]
[![Dependency Status][david-image]][david-url]
[![devDependency Status][david-dev-image]][david-dev-url]
[![Known Vulnerabilities][snyk-image]][snyk-url]

> *This module is experimental, and should be used by early adopters. This module uses APIs that may be undocumented and subject to change without notice.*

This module provides Stackdriver Trace support for Node.js applications. [Stackdriver Trace](https://cloud.google.com/cloud-trace/) is a feature of [Google Cloud Platform](https://cloud.google.com/) that collects latency data (traces) from your applications and displays it in near real-time in the [Google Cloud Console][cloud-console].

![Stackdriver Trace Overview](doc/images/cloud-trace-overview-page.png)

## Prerequisites

1. Your application will need to be using Node.js version 0.12 or greater.
1. You will need a project in the [Google Developers Console][cloud-console]. Your application can run anywhere, but the trace data is associated with a particular project.
1. [Enable the Trace API](https://console.cloud.google.com/flows/enableapi?apiid=cloudtrace) for your project.

## Installation

1. Install with [`npm`](https://www.npmjs.com) or add to your [`package.json`](https://docs.npmjs.com/files/package.json#dependencies).

        npm install --save @google/cloud-trace

2. Set the GCLOUD_PROJECT environment variable. You can find your Project ID in the [Google Cloud Developers Console][cloud-console], or by running the command `gcloud projects list`. You can ensure this environment variable is set at startup time by placing it in your startup script in `package.json`:

        "scripts": {
          "start": "GCLOUD_PROJECT=<YOUR_PROJECT_ID> node server.js",
        },

3. Include and start the library *as the very first action in your application*:

        require('@google/cloud-trace').start();

  If you use `--require` in your start up command, make sure that the trace agent is --required first.

4. If you are running your application locally, or on a machine where you are using the [Google Cloud SDK][gcloud-sdk], make sure to log in with the application default credentials:

        gcloud beta auth application-default login

If you are running somewhere other than the Google Cloud Platform, see [running elsewhere](#running-elsewhere).

## Configuration

See [the default configuration](config.js) for a list of possible configuration options. These options can be passed to the agent through the object argument to the start command shown above:

        require('@google/cloud-trace').start({samplingRate: 500});

Alternatively, you can provide configuration through a config file. This can be useful if you want to load our module using `--require` on the command line instead of editing your main script. You can start by copying the default config file and modifying it to suit your needs. The `GCLOUD_DIAGNOSTICS_CONFIG` environment variable should point to your configuration file.

## Running on Google Cloud Platform

There are three different services that can host Node.js application to Google Cloud Platform.

### Google App Engine flexible environment

If you are using [Google App Engine flexible environment](https://cloud.google.com/appengine/docs/flexible/), you do not have to do any additional configuration.

### Google Compute Engine

Your VM instances need to be created with the `https://www.googleapis.com/auth/trace.append` scope if created via the [gcloud](https://cloud.google.com/sdk) CLI or the Google Cloud Platform API, or with the 'Allow API access' checkbox selected if created via the [console][cloud-console] (see screenshot).

![GCE API](doc/images/gce.png?raw=true)

If you already have VMs that were created without API access and do not wish to recreate it, you can follow the instructions for using a service account under [running elsewhere](#running-elsewhere).

### Google Container Engine

Container Engine nodes need to also be created with the `https://www.googleapis.com/auth/trace.append` scope, which is configurable during cluster creation. Alternatively, you can follow the instructions for using a service account under [running elsewhere](#running-elsewhere). It's recommended that you store the service account credentials as [Kubernetes Secret](http://kubernetes.io/v1.1/docs/user-guide/secrets.html).

## Running elsewhere

If your application is running outside of Google Cloud Platform, such as locally, on-premise, or on another cloud provider, you can still use Stackdriver Trace.

1. You will need to specify your project ID when starting the trace agent.

        GCLOUD_PROJECT=particular-future-12345 node myapp.js

2. You need to provide service account credentials to your application. The recommended way is via [Application Default Credentials][app-default-credentials].

  1. [Create a new JSON service account key][service-account].
  2. Copy the key somewhere your application can access it. Be sure not to expose the key publicly.
  3. Set the environment variable `GOOGLE_APPLICATION_CREDENTIALS` to the full path to the key. The trace agent will automatically look for this environment variable.

If you are running your application on a development machine or test environment where you are using the [`gcloud` command line tools][gcloud-sdk], and are logged using `gcloud beta auth application-default login`, you already have sufficient credentials, and a service account key is not required.
  
Alternatively, you may set the `keyFilename` or `credentials` configuration field to the full path or contents to the key file, respectively. Setting either of these fields will override either setting `GOOGLE_APPLICATION_CREDENTIALS` or logging in using `gcloud`. (See the [default configuration](config.js) for more details.)

## Viewing your traces

Run your application and start sending some requests towards your application. In about 30 seconds or so, you should see trace data gathered in the [STACKDRIVER -> Traces -> Trace List](https://console.cloud.google.com/traces/overview) in the console:

![Trace List](doc/images/tracelist.png?raw=true)

This is the trace list that shows a sampling of the incoming requests your application is receiving. You can click on a URI to drill down into the details. This will show you the RPCs made by your application and their associated latency:

![Trace View](doc/images/traceview.png?raw=true)

## What gets traced

The trace agent can do automatic tracing of HTTP requests when using these frameworks:
* [express](https://www.npmjs.com/package/express) version 4
* [hapi](https://www.npmjs.com/package/hapi) versions 8 - 16
* [restify](https://www.npmjs.com/package/restify) versions 3 - 4 (experimental)

The agent will also automatic trace of the following kinds of RPCs:
* Outbound HTTP requests
* [MongoDB-core](https://www.npmjs.com/package/mongodb-core) version 1
* [Mongoose](https://www.npmjs.com/package/mongoose) version 4
* [Redis](https://www.npmjs.com/package/redis) versions 0.12 - 2
* [MySQL](https://www.npmjs.com/package/mysql) version ^2.9

You can use the [Custom Tracing API](#custom-tracing-api) to trace other processes in your application.

We are working on expanding the types of frameworks and services we can do automatic tracing for. We are also interested in hearing your feedback on what other frameworks, or versions, you would like to see supported. This would help us prioritize support going forward. If you want support for a particular framework or RPC, please file a bug or +1 an existing bug.

## Advanced trace configuration

The trace agent can be configured by passing a configurations object to the agent `start` method. This configuration option accepts all values in the [default configuration](config.js).

One configuration option of note is `enhancedDatabaseReporting`. Setting this option to `true` will cause database operations for redis and MongoDB to record query summaries and results as labels on reported trace spans.

## Disabling the trace agent

The trace agent can be turned off by either setting the `GCLOUD_TRACE_DISABLE` environment variable or specifying `enabled: false` in your configuration file.

## Trace batching and sampling

The aggregation of trace spans before publishing can be configured using the `flushDelaySeconds` and `bufferSize` [options](config.js). The spans recorded for each incoming requests are placed in a buffer after the request has completed. Spans will be published to the UI in batch when the spans from `bufferSize` requests have been queued in the buffer or after `flushDelaySeconds` have passed since the last publish, whichever comes first.

The trace configuration additionally exposes the `samplingRate` option which sets an upper bound on the number of traced requests captured per second. Some Google Cloud environments may override this sampling policy.

## Custom Tracing API

The custom tracing API can be used to add custom spans to trace. A *span* is a particular unit of work within a trace, such as an RPC request. Spans may be nested; the outermost span is called a *root span*, even if there are no nested child spans. Root spans typically correspond to incoming requests, while *child spans* typically correspond to outgoing requests, or other work that is triggered in response to incoming requests.

For any of the web frameworks listed above (`express`, `hapi`, and `restify`), a root span is automatically started whenever an incoming request is received (in other words, all middleware already runs within a root span). If you wish to record a span outside of any of these frameworks, any traced code must run within a root span that you create yourself.

The API is exposed by the `agent` returned by a call to `start`:

```javascript
  var agent = require('@google/cloud-trace').start();
```

For child spans, you can either use the `startSpan` and `endSpan` API, or use the `runInSpan` function that uses a callback-style. For root spans, you must use `runInRootSpan`.

### Start & end

To start a new child span, use `agent.startSpan`. Each span requires a name, and you can optionally specify labels.

```javascript
  var span = agent.startSpan('name', {label: 'value'});
```

Once your work is complete, you can end a child span with `agent.endSpan`. You can again optionally associate labels with the span:

```javascript
  agent.endSpan(span, {label2: 'value'});
```

Note that the labels parameter must be an object. Other types (e.g. string) will be silently ignored.

### Run in span

`agent.runInSpan` takes a function to execute inside a custom child span with the given name. The function may be synchronous or asynchronous. If it is asynchronous, it must accept a 'endSpan' function as an argument that should be called once the asynchronous work has completed.

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

### Run in root span

`agent.runInRootSpan` behaves similarly to `agent.runInSpan`, except that the function is run within a root span.

```javascript
  agent.runInRootSpan('name', {label: 'value'}, function() {
    // You can record child spans in here
    doSynchronousWork();
  });
  agent.runInRootSpan('name', {label: 'value'}, function(endSpan) {
    // You can record child spans in here
    doAsyncWork(function(result) {
      processResult(result);
      endSpan({label2: 'value'});
    });
  });
```

### Changing trace properties

It is possible to rename and add labels to current trace. This can be used to give it a more meaningful name or add additional metadata.

By default we use the name of the express (or hapi/restify) route as the transaction name, but it can be changed using `agent.setTransactionName`:

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

[cloud-console]: https://console.cloud.google.com
[gcloud-sdk]: https://cloud.google.com/sdk/gcloud/
[app-default-credentials]: https://developers.google.com/identity/protocols/application-default-credentials
[service-account]: https://console.developers.google.com/apis/credentials/serviceaccountkey
[npm-image]: https://badge.fury.io/js/%40google%2Fcloud-trace.svg
[npm-url]: https://npmjs.org/package/@google/cloud-trace
[travis-image]: https://travis-ci.org/GoogleCloudPlatform/cloud-trace-nodejs.svg?branch=master
[travis-url]: https://travis-ci.org/GoogleCloudPlatform/cloud-trace-nodejs
[coveralls-image]: https://coveralls.io/repos/GoogleCloudPlatform/cloud-trace-nodejs/badge.svg?branch=master&service=github
[coveralls-url]: https://coveralls.io/github/GoogleCloudPlatform/cloud-trace-nodejs?branch=master
[david-image]: https://david-dm.org/GoogleCloudPlatform/cloud-trace-nodejs.svg
[david-url]: https://david-dm.org/GoogleCloudPlatform/cloud-trace-nodejs
[david-dev-image]: https://david-dm.org/GoogleCloudPlatform/cloud-trace-nodejs/dev-status.svg
[david-dev-url]: https://david-dm.org/GoogleCloudPlatform/cloud-trace-nodejs?type=dev
[snyk-image]: https://snyk.io/test/github/GoogleCloudPlatform/cloud-trace-nodejs/badge.svg
[snyk-url]: https://snyk.io/test/github/GoogleCloudPlatform/cloud-trace-nodejs
