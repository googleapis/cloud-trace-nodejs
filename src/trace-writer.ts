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
import {AxiosError} from 'axios';
import * as gcpMetadata from 'gcp-metadata';
import {OutgoingHttpHeaders} from 'http';
import * as os from 'os';
import * as r from 'request';  // Only for type declarations.
import {teenyRequest} from 'teeny-request';

import {Constants} from './constants';
import {Logger} from './logger';
import {SpanKind, Trace} from './trace';
import {TraceLabels} from './trace-labels';
import {Singleton} from './util';

const pjson = require('../../package.json');

// TODO(kjin): This value should be exported from @g-c/c.
const NO_PROJECT_ID_TOKEN = '{{projectId}}';

const onUncaughtExceptionValues = ['ignore', 'flush', 'flushAndExit'];

const headers: OutgoingHttpHeaders = {};
headers[Constants.TRACE_AGENT_REQUEST_HEADER] = 1;

/* A list of scopes needed to operate with the trace API */
const SCOPES: string[] = ['https://www.googleapis.com/auth/trace.append'];

export interface TraceWriterConfig extends common.GoogleAuthOptions {
  projectId?: string;
  onUncaughtException: string;
  bufferSize: number;
  flushDelaySeconds: number;
  stackTraceLimit: number;
  maximumLabelValueSize: number;
  serviceContext: {service?: string; version?: string; minorVersion?: string;};
}

export interface LabelObject {
  [key: string]: string;
}

/**
 * A class representing a service that publishes traces in the background.
 */
export class TraceWriter extends common.Service {
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
   * @param config A config object containing information about
   *   authorization credentials.
   * @param logger The Trace Agent's logger object.
   * @constructor
   */
  constructor(
      private readonly config: TraceWriterConfig,
      private readonly logger: Logger) {
    super(
        {
          requestModule: teenyRequest as typeof r,
          packageJson: pjson,
          projectIdRequired: false,
          baseUrl: 'https://cloudtrace.googleapis.com/v1',
          scopes: SCOPES
        },
        config);

    this.logger = logger;
    this.buffer = [];
    this.defaultLabels = {};

    this.isActive = true;

    if (onUncaughtExceptionValues.indexOf(config.onUncaughtException) === -1) {
      logger.error(
          `TraceWriter#constructor: The value of config.onUncaughtException [${
              config.onUncaughtException}] should be one of [${
              onUncaughtExceptionValues.join(', ')}].`,
      );
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

  getConfig(): TraceWriterConfig {
    return this.config;
  }

  async initialize(): Promise<void> {
    // Schedule periodic flushing of the buffer, but only if we are able to get
    // the project number (potentially from the network.)
    const getProjectIdAndScheduleFlush = async () => {
      try {
        await this.getProjectId();
      } catch (err) {
        this.logger.error(
            'TraceWriter#initialize: Unable to acquire the project number',
            'automatically from the GCP metadata service. Please provide a',
            'valid project ID as environmental variable GCLOUD_PROJECT, or',
            `as config.projectId passed to start. Original error: ${err}`);
        throw err;
      }
      this.scheduleFlush();
    };
    // getProjectIdAndScheduleFlush has no return value, so no need to capture
    // it on the left-hand side.
    const [hostname, instanceId] = await Promise.all([
      this.getHostname(), this.getInstanceId(), getProjectIdAndScheduleFlush()
    ]);
    const addDefaultLabel = (key: string, value: string|number) => {
      this.defaultLabels[key] = `${value}`;
    };
    this.defaultLabels = {};
    addDefaultLabel(
        TraceLabels.AGENT_DATA, `node ${pjson.name} v${pjson.version}`);
    addDefaultLabel(TraceLabels.GCE_HOSTNAME, hostname);
    if (instanceId) {
      addDefaultLabel(TraceLabels.GCE_INSTANCE_ID, instanceId);
    }
    const moduleName = this.config.serviceContext.service || hostname;
    addDefaultLabel(TraceLabels.GAE_MODULE_NAME, moduleName);

    const moduleVersion = this.config.serviceContext.version;
    if (moduleVersion) {
      addDefaultLabel(TraceLabels.GAE_MODULE_VERSION, moduleVersion);
      const minorVersion = this.config.serviceContext.minorVersion;
      if (minorVersion) {
        let versionLabel = '';
        if (moduleName !== 'default') {
          versionLabel = moduleName + ':';
        }
        versionLabel += moduleVersion + '.' + minorVersion;
        addDefaultLabel(TraceLabels.GAE_VERSION, versionLabel);
      }
    }
    Object.freeze(this.defaultLabels);
  }

  private async getHostname(): Promise<string> {
    try {
      return await gcpMetadata.instance({property: 'hostname', headers});
    } catch (err) {
      if (err.code !== 'ENOTFOUND') {
        // We are running on GCP.
        this.logger.warn(
            'TraceWriter#getHostname: Encountered an error while',
            'retrieving GCE hostname from the GCP metadata service',
            `(metadata.google.internal): ${err}`);
      }
      return os.hostname();
    }
  }

  private async getInstanceId(): Promise<number|null> {
    try {
      return await gcpMetadata.instance({property: 'id', headers});
    } catch (err) {
      if (err.code !== 'ENOTFOUND') {
        // We are running on GCP.
        this.logger.warn(
            'TraceWriter#getInstanceId: Encountered an error while',
            'retrieving GCE instance ID from the GCP metadata service',
            `(metadata.google.internal): ${err}`);
      }
      return null;
    }
  }

  getProjectId() {
    // super.getProjectId writes to projectId, but doesn't check it first
    // before going through the flow of obtaining it. So we add that logic
    // first.
    if (this.projectId !== NO_PROJECT_ID_TOKEN) {
      return Promise.resolve(this.projectId);
    }
    return super.getProjectId();
  }

  /**
   * Ensures that all sub spans of the provided Trace object are
   * closed and then queues the span data to be published.
   *
   * @param trace The trace to be queued.
   */
  writeTrace(trace: Trace) {
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

    const afterProjectId = (projectId: string) => {
      trace.projectId = projectId;
      this.buffer.push(JSON.stringify(trace));
      this.logger.info(
          `TraceWriter#writeTrace: buffer.size = ${this.buffer.length}`);

      // Publish soon if the buffer is getting big
      if (this.buffer.length >= this.config.bufferSize) {
        this.logger.info(
            'TraceWriter#writeTrace: Trace buffer full, flushing.');
        setImmediate(() => this.flushBuffer());
      }
    };

    // TODO(kjin): We should always be following the 'else' path.
    // Any test that doesn't mock the Trace Writer will assume that traces get
    // buffered synchronously. We need to refactor those tests to remove that
    // assumption before we can make this fix.
    if (this.projectId !== NO_PROJECT_ID_TOKEN) {
      afterProjectId(this.projectId);
    } else {
      this.getProjectId().then(afterProjectId, (err: Error) => {
        // Because failing to get a project ID means that the trace agent will
        // get disabled, there is a very small window for this code path to be
        // taken. For this reason we don't do anything more complex than just
        // notifying that we are dropping the current trace.
        this.logger.info(
            'TraceWriter#queueTrace: No project ID, dropping trace.');
      });
    }
  }

  /**
   * Flushes the buffer of traces at a regular interval controlled by the
   * flushDelay property of this TraceWriter's config.
   */
  private scheduleFlush() {
    this.logger.info('TraceWriter#scheduleFlush: Performing periodic flush.');
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
   */
  private flushBuffer() {
    if (this.buffer.length === 0) {
      return;
    }

    // Privatize and clear the buffer.
    const buffer = this.buffer;
    this.buffer = [];
    this.logger.debug('TraceWriter#flushBuffer: Flushing traces', buffer);
    this.publish(`{"traces":[${buffer.join()}]}`);
  }

  /**
   * Publishes flushed traces to the network.
   * @param json The stringified json representation of the queued traces.
   */
  protected publish(json: string) {
    const hostname = 'cloudtrace.googleapis.com';
    const uri = `https://${hostname}/v1/projects/${this.projectId}/traces`;
    const options = {method: 'PATCH', uri, body: json, headers};
    this.logger.info('TraceWriter#publish: Publishing to ' + uri);
    this.request(options, (err, body?, response?) => {
      const statusCode = response && response.statusCode;
      if (err) {
        this.logger.error(`TraceWriter#publish: Received error ${
            statusCode ? `with status code ${statusCode}` :
                         ''} while publishing traces to ${hostname}: ${err}`);
      } else {
        this.logger.info(
            `TraceWriter#publish: Published w/ status code: ${statusCode}`);
      }
    });
  }
}

export const traceWriter = new Singleton(TraceWriter);
