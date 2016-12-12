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
function TraceLabels() {
}


/**
 * @type {string} The well-known label for http status code.
 */
TraceLabels.HTTP_RESPONSE_CODE_LABEL_KEY =
    'trace.cloud.google.com/http/status_code';


/**
 * @type {string} The well-known label for http request url.
 */
TraceLabels.HTTP_URL_LABEL_KEY = 'trace.cloud.google.com/http/url';


/**
 * @type {string} The well-known label for http method.
 */
TraceLabels.HTTP_METHOD_LABEL_KEY = 'trace.cloud.google.com/http/method';

/**
 * @type {string} The well-known label for http response size.
 */
TraceLabels.HTTP_RESPONSE_SIZE_LABEL_KEY = 'trace.cloud.google.com/http/response/size';

/**
 * @type {string} The well-known label for stack-traces
 */
TraceLabels.STACK_TRACE_DETAILS_KEY = 'trace.cloud.google.com/stacktrace';

/**
 * @type {string} The well-known label for network error name.
 */
TraceLabels.ERROR_DETAILS_NAME = 'trace.cloud.google.com/error/name';

/**
 * @type {string} The well-known label for network error message.
 */
TraceLabels.ERROR_DETAILS_MESSAGE = 'trace.cloud.google.com/error/message';

/**
 * @type {string} The well-known label for the app version on AppEngine.
 */
TraceLabels.GAE_VERSION = 'trace.cloud.google.com/gae/app/version';

/**
 * @type {string} The well-known label for the module name on AppEngine.
 */
TraceLabels.GAE_MODULE_NAME = 'trace.cloud.google.com/gae/app/module';

/**
 * @type {string} The well-known label for the module version on AppEngine.
 */
TraceLabels.GAE_MODULE_VERSION = 'trace.cloud.google.com/gae/app/module_version';

/**
 * @type {string} The label for GCE instance id. This is not a label
 *   recognized by the trace API.
 */
TraceLabels.GCE_INSTANCE_ID = 'trace.cloud.google.com/gce/instanceid';

/**
 * @type {string} The label for GCE hostname. This is not a label
 *   recognized by the trace API.
 */
TraceLabels.GCE_HOSTNAME = 'trace.cloud.google.com/gce/hostname';

/**
 * @type {string} The label for http request source ip. This is not a
 *   label recognized by the trace API.
 */
TraceLabels.HTTP_SOURCE_IP = 'trace.cloud.google.com/http/source/ip';

/**
 * @type {string} The well-known label for agent metadata.
 *   Values should have the form "<name> <version>".
 */
TraceLabels.AGENT_DATA = 'trace.cloud.google.com/agent';


/**
 * Export TraceLabels.
 */
module.exports = TraceLabels;
