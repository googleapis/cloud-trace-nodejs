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

import * as common from '@google-cloud/common';
import * as gcpMetadata from 'gcp-metadata';
import {OutgoingHttpHeaders} from 'http';
import * as util from 'util';

import {Constants} from './constants';
import {SpanKind, Trace} from './trace';
import {TraceLabels} from './trace-labels';

const pjson = require('../../package.json');

const onUncaughtExceptionValues = ['ignore', 'flush', 'flushAndExit'];

const headers: OutgoingHttpHeaders = {};
headers[Constants.TRACE_AGENT_REQUEST_HEADER] = 1;

/* A list of scopes needed to operate with the trace API */
const SCOPES: string[] = ['https://www.googleapis.com/auth/trace.append'];

export interface TraceWriterConfig extends common.ServiceAuthenticationConfig {
  projectId?: string;
  onUncaughtException: string;
  bufferSize: number;
  flushDelaySeconds: number;
  stackTraceLimit: number;
  maximumLabelValueSize: number;
  serviceContext: {service?: string; version?: string; minorVersion?: string;};
}

export interface LabelObject { [key: string]: string; }

/**
 * A class representing a service that publishes traces in the background.
 */
export class TraceWriter extends common.Service {
  // TODO(kjin): Make public members private (they're public for testing)
  private logger: common.Logger;
  private config: TraceWriterConfig;
  /** Stringified traces to be published */
  buffer: string[];
  /** Default labels to be attached to written spans */
  defaultLabels: LabelObject;
  /** Reference to global unhandled exception handler */
  private unhandledException?: () => void;
  /** Whether the trace writer is active */
  isActive: boolean;

  /**
   * Constructs a new TraceWriter instance.
   * @param logger The Trace Agent's logger object.
   * @param config A config object containing information about
   *   authorization credentials.
   * @constructor
   */
  constructor(logger: common.Logger, config: TraceWriterConfig) {
    super(
        {
          packageJson: pjson,
          projectIdRequired: false,
          baseUrl: 'https://cloudtrace.googleapis.com/v1',
          scopes: SCOPES
        },
        config);

    this.logger = logger;
    this.config = config;
    this.buffer = [];
    this.defaultLabels = {};

    this.isActive = true;

    if (onUncaughtExceptionValues.indexOf(config.onUncaughtException) === -1) {
      logger.error(
          'The value of onUncaughtException ' + config.onUncaughtException +
              ' should be one of ',
          onUncaughtExceptionValues);
      // TODO(kjin): Either log an error or throw one, but not both
      throw new Error('Invalid value for onUncaughtException configuration.');
    }
    const onUncaughtException = config.onUncaughtException;
    if (onUncaughtException !== 'ignore') {
      this.unhandledException = () => {
        this.flushBuffer();
        if (onUncaughtException === 'flushAndExit') {
          setTimeout(() => {
            process.exit(1);
          }, 2000);
        }
      };
      process.on('uncaughtException', this.unhandledException);
    }
  }

  stop(): void {
    this.isActive = false;
  }

  initialize(cb: (err?: Error) => void): void {
    // Ensure that cb is called only once.
    let pendingOperations = 2;

    // Schedule periodic flushing of the buffer, but only if we are able to get
    // the project number (potentially from the network.)
    this.getProjectId((err: Error|null, project?: string) => {
      if (err) {
        this.logger.error(
            'Unable to acquire the project number from metadata ' +
            'service. Please provide a valid project number as an env. ' +
            'variable, or through config.projectId passed to start(). ' + err);
        cb(err);
      } else {
        this.config.projectId = project;
        this.scheduleFlush();
        if (--pendingOperations === 0) {
          cb();
        }
      }
    });

    this.getHostname((hostname) => {
      this.getInstanceId((instanceId) => {
        const labels: LabelObject = {};
        labels[TraceLabels.AGENT_DATA] =
            'node ' + pjson.name + ' v' + pjson.version;
        labels[TraceLabels.GCE_HOSTNAME] = hostname;
        if (instanceId) {
          labels[TraceLabels.GCE_INSTANCE_ID] = instanceId;
        }
        const moduleName = this.config.serviceContext.service || hostname;
        labels[TraceLabels.GAE_MODULE_NAME] = moduleName;

        const moduleVersion = this.config.serviceContext.version;
        if (moduleVersion) {
          labels[TraceLabels.GAE_MODULE_VERSION] = moduleVersion;
          const minorVersion = this.config.serviceContext.minorVersion;
          if (minorVersion) {
            let versionLabel = '';
            if (moduleName !== 'default') {
              versionLabel = moduleName + ':';
            }
            versionLabel += moduleVersion + '.' + minorVersion;
            labels[TraceLabels.GAE_VERSION] = versionLabel;
          }
        }
        Object.freeze(labels);
        this.defaultLabels = labels;
        if (--pendingOperations === 0) {
          cb();
        }
      });
    });
  }

  getConfig(): TraceWriterConfig {
    return this.config;
  }

  getHostname(cb: (hostname: string) => void) {
    gcpMetadata.instance(
        {property: 'hostname', headers}, (err, response, hostname) => {
          if (err && err.code !== 'ENOTFOUND') {
            // We are running on GCP.
            this.logger.warn('Unable to retrieve GCE hostname.', err);
          }
          cb(hostname || require('os').hostname());
        });
  }

  getInstanceId(cb: (instanceId?: string) => void) {
    gcpMetadata.instance(
        {property: 'id', headers}, (err, response, instanceId) => {
          if (err && err.code !== 'ENOTFOUND') {
            // We are running on GCP.
            this.logger.warn('Unable to retrieve GCE instance id.', err);
          }
          instanceId ? cb(instanceId) : cb();
        });
  }

  /**
   * Returns the project ID if it has been cached and attempts to load
   * it from the enviroment or network otherwise.
   */
  getProjectId(callback: (err: Error|null, projectId?: string) => void) {
    if (this.config.projectId) {
      callback(null, this.config.projectId);
      return;
    }

    gcpMetadata.project(
        {property: 'project-id', headers}, (err, response, projectId) => {
          if (response && response.statusCode !== 200) {
            if (response.statusCode === 503) {
              err = new Error(
                  'Metadata service responded with a 503 status ' +
                  'code. This may be due to a temporary server error; please try ' +
                  'again later.');
            } else {
              err = new Error(
                  'Metadata service responded with the following ' +
                  'status code: ' + response.statusCode);
            }
          }
          if (err || !projectId) {
            // We shouldn't observe a falsey projectId if there's no error
            err = err || new Error('Project ID missing.');
            callback(err);
            return;
          }
          this.logger.info('Acquired ProjectId from metadata: ' + projectId);
          this.config.projectId = projectId;
          callback(null, projectId);
        });
  }

  /**
   * Ensures that all sub spans of the provided Trace object are
   * closed and then queues the span data to be published.
   *
   * @param trace The trace to be queued.
   */
  writeSpan(trace: Trace) {
    for (const span of trace.spans) {
      if (span.endTime === '') {
        span.endTime = (new Date()).toISOString();
      }
    }

    trace.spans.forEach(spanData => {
      if (spanData.kind === SpanKind.RPC_SERVER) {
        // Copy properties from the default labels.
        Object.assign(spanData.labels, this.defaultLabels);
      }
    });
    this.queueTrace(trace);
  }

  /**
   * Buffers the provided trace to be published.
   *
   * @private
   * @param trace The trace to be queued.
   */
  queueTrace(trace: Trace) {
    this.getProjectId((err, projectId?) => {
      if (err || !projectId) {
        this.logger.info('No project number, dropping trace.');
        return;  // if we even reach this point, disabling traces is already
                 // imminent.
      }

      trace.projectId = projectId;
      this.buffer.push(JSON.stringify(trace));
      this.logger.debug('queued trace. new size:', this.buffer.length);

      // Publish soon if the buffer is getting big
      if (this.buffer.length >= this.config.bufferSize) {
        this.logger.info('Flushing: trace buffer full');
        setImmediate(() => this.flushBuffer());
      }
    });
  }

  /**
   * Flushes the buffer of traces at a regular interval
   * controlled by the flushDelay property of this
   * TraceWriter's config.
   * @private
   */
  scheduleFlush() {
    this.logger.info('Flushing: performing periodic flush');
    this.flushBuffer();

    // Do it again after delay
    if (this.isActive) {
      // 'global.setTimeout' avoids TS2339 on this line.
      // It helps disambiguate the Node runtime setTimeout function from
      // WindowOrWorkerGlobalScope.setTimeout, which returns an integer.
      global
          .setTimeout(
              this.scheduleFlush.bind(this),
              this.config.flushDelaySeconds * 1000)
          .unref();
    }
  }

  /**
   * Serializes the buffered traces to be published asynchronously.
   * @private
   */
  flushBuffer() {
    if (this.buffer.length === 0) {
      return;
    }

    // Privatize and clear the buffer.
    const buffer = this.buffer;
    this.buffer = [];
    this.logger.debug('Flushing traces', buffer);
    this.publish(`{"traces":[${buffer.join()}]}`);
  }

  /**
   * Publishes flushed traces to the network.
   * @private
   * @param json The stringified json representation of the queued traces.
   */
  publish(json: string) {
    const uri = `https://cloudtrace.googleapis.com/v1/projects/${
        this.config.projectId}/traces`;

    const options = {method: 'PATCH', uri, body: json, headers};
    this.logger.debug('TraceWriter: publishing to ' + uri);
    this.request(options, (err, body?, response?) => {
      if (err) {
        this.logger.error(
            'TraceWriter: error: ',
            ((response && response.statusCode) || '') + '\n' + err.stack);
      } else {
        this.logger.info(
            'TraceWriter: published. statusCode: ' + response.statusCode);
      }
    });
  }
}

export type TraceWriterSingletonConfig = TraceWriterConfig&{
  forceNewAgent_: boolean;
};

// Singleton
let singleton: TraceWriter;

export const traceWriter = {
  create(
      logger: common.Logger, config: TraceWriterSingletonConfig,
      cb?: (err?: Error) => void): TraceWriter {
    if (!cb) {
      // tslint:disable-next-line:no-empty
      cb = () => {};
    }
    if (!singleton || config.forceNewAgent_) {
      singleton = new TraceWriter(logger, config);
      singleton.initialize(cb);
    }
    return singleton;
  },

  get(): TraceWriter {
    if (!singleton) {
      throw new Error('TraceWriter singleton was not initialized.');
    }
    return singleton;
  }
};
