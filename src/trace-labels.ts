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

/**
 * Well-known trace span label values.
 */
export namespace TraceLabels {
  /**
   * @type {string} The well-known label for http status code.
   */
  export const HTTP_RESPONSE_CODE_LABEL_KEY = '/http/status_code';

  /**
   * @type {string} The well-known label for http request url.
   */
  export const HTTP_URL_LABEL_KEY = '/http/url';

  /**
   * @type {string} The well-known label for http method.
   */
  export const HTTP_METHOD_LABEL_KEY = '/http/method';

  /**
   * @type {string} The well-known label for http response size.
   */
  export const HTTP_RESPONSE_SIZE_LABEL_KEY = '/http/response/size';

  /**
   * @type {string} The well-known label for stack-traces
   */
  export const STACK_TRACE_DETAILS_KEY = '/stacktrace';

  /**
   * @type {string} The well-known label for network error name.
   */
  export const ERROR_DETAILS_NAME = '/error/name';

  /**
   * @type {string} The well-known label for network error message.
   */
  export const ERROR_DETAILS_MESSAGE = '/error/message';

  /**
   * @type {string} The well-known label for the app version on AppEngine.
   */
  export const GAE_VERSION = 'g.co/gae/app/version';

  /**
   * @type {string} The well-known label for the module name on AppEngine.
   */
  export const GAE_MODULE_NAME = 'g.co/gae/app/module';

  /**
   * @type {string} The well-known label for the module version on AppEngine.
   */
  export const GAE_MODULE_VERSION = 'g.co/gae/app/module_version';

  /**
   * @type {string} The label for GCE instance id. This is not a label
   *   recognized by the trace API.
   */
  export const GCE_INSTANCE_ID = 'g.co/gce/instanceid';

  /**
   * @type {string} The label for GCE hostname. This is not a label
   *   recognized by the trace API.
   */
  export const GCE_HOSTNAME = 'g.co/gce/hostname';

  /**
   * @type {string} The label for http request source ip. This is not a
   *   label recognized by the trace API.
   */
  export const HTTP_SOURCE_IP = '/http/source/ip';

  /**
   * @type {string} The well-known label for agent metadata.
   *   Values should have the form "<name> <version>".
   */
  export const AGENT_DATA = '/agent';
};


/**
 * Export TraceLabels.
 */
module.exports = TraceLabels;

export default {};
