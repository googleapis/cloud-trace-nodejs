/**
 * Copyright 2015 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

var path = require('path');

// Default configuration
module.exports = {
    // Log levels: 0-disabled,1-error,2-warn,3-info,4-debug
    logLevel: 1,

    enabled: true,

    // If true, information about query parameters and results will be
    // attached to spans representing database operations.
    enhancedDatabaseReporting: false,

    // The maximum number of characters reported on a label value. This
    // cannot exceed 16383, the maximum value accepted by the service.
    maximumLabelValueSize: 512,

    // A list of trace plugins to load. Each field's key in this object is the
    // name of the module to trace, and its value is the require-friendly path
    // to the plugin.
    // By default, all of the following plugins are loaded.
    // Specifying a different object for this field in the configuration passed
    // to the method that starts the trace agent will cause that object to be
    // merged with this one.
    // To disable a plugin in this list, you may override its path with a falsy
    // value. Disabling any of the default plugins may cause unwanted behavior,
    // so use caution.
    plugins: {
      'connect': path.join(__dirname, 'src/plugins/plugin-connect.js'),
      'express': path.join(__dirname, 'src/plugins/plugin-express.js'),
      'generic-pool': path.join(__dirname, 'src/plugins/plugin-generic-pool.js'),
      'grpc': path.join(__dirname, 'src/plugins/plugin-grpc.js'),
      'hapi': path.join(__dirname, 'src/plugins/plugin-hapi.js'),
      'http': path.join(__dirname, 'src/plugins/plugin-http.js'),
      'knex': path.join(__dirname, 'src/plugins/plugin-knex.js'),
      'koa': path.join(__dirname, 'src/plugins/plugin-koa.js'),
      'mongodb-core': path.join(__dirname, 'src/plugins/plugin-mongodb-core.js'),
      'mysql': path.join(__dirname, 'src/plugins/plugin-mysql.js'),
      'pg': path.join(__dirname, 'src/plugins/plugin-pg.js'),
      'redis': path.join(__dirname, 'src/plugins/plugin-redis.js'),
      'restify': path.join(__dirname, 'src/plugins/plugin-restify.js')
    },

    // @type {number} max number of frames to include on traces (0 disables)
    stackTraceLimit: 10,

    // We buffer the captured traces for `flushDelaySeconds` before publishing
    // to the trace API; unless the buffer fills up before then.
    // See `bufferSize`.
    flushDelaySeconds: 30,

    // If paths are present in this array, then these paths will be ignored before
    // `samplingRate` based decisions are made. Paths must include a leading
    // forward slash and be of the form:
    //   /componentOne/componentTwo/...
    // Paths can additionally be classified by regex in which case any path matching
    // any provided regex will be ignored.
    // We ignore the health checker probes (/_ah/health) by default.
    ignoreUrls: [ '/_ah/health' ],

    // An upper bound on the number of traces to gather each second. If set to 0,
    // sampling is disabled and all traces are recorded. Sampling rates greater
    // than 1000 are not supported and will result in at most 1000 samples per
    // second. Some Google Cloud environments may further limit this rate.
    samplingRate: 10,

    // The number of transactions we buffer before we publish to the trace
    // API, unless we hit `flushDelaySeconds` first.
    bufferSize: 1000,

    // Specifies the behavior of the trace agent in the case of an uncaught exception.
    // Possible values are:
    //   `ignore`: Take no action. Note that the process may terminate before all the
    //            traces currently buffered have been flushed to the network.
    //   `flush`: Handle the uncaught exception and attempt to publish the traces to
    //            the API. Note that if you have other uncaught exception handlers in your
    //            application, they may chose to terminate the process before the
    //            buffer has been flushed to the network. Also note that if you have no
    //            other terminating uncaught exception handlers in your application, the
    //            error will get swallowed and the application will keep on running. You
    //            should use this option if you have other uncaught exception handlers
    //            that you want to be responsible for terminating the application.
    //   `flushAndExit`: Handle the uncaught exception, make a best effort attempt to
    //            publish the traces to the API, and then terminate the application after
    //            a delay. Note that presence of other uncaught exception handlers may
    //            chose to terminate the application before the buffer has been flushed to
    //            the network.
    onUncaughtException: 'ignore',

    // EXPERIMENTAL:
    // Allows to ignore the requests X-Cloud-Trace-Context -header if set. Setting this
    // to true will cause traces generated by this module to appear separately from other
    // distributed work done by other services on behalf of the same incoming request. Setting
    // this will also cause sampling decisions made by other distributed components to be
    // ignored. This is useful for aggregating traces generated by different cloud platform
    // projects.
    ignoreContextHeader: false,

    // The contents of a key file. If this field is set, its contents will be
    // used for authentication instead of your application default credentials.
    credentials: null,

    // A path to a key file relative to the current working directory. If this
    // field is set, the contents of the pointed file will be used for
    // authentication instead of your application default credentials.
    // If credentials is also set, the value of keyFilename will be ignored.
    keyFilename: null,

    // For testing purposes only.
    // Used by unit tests to force loading of a new agent if one exists already.
    forceNewAgent_: false,

    // Specifies the service context with which traces from this application
    // will be associated. This may be useful in filtering traces originating
    // from a specific service within a project. These fields will automatically
    // be set through environment variables on Google App Engine.
    serviceContext: {
      service: null,
      version: null,
      minorVersion: null
    }
};

export default {};
