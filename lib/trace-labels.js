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

// TODO(ofrobots): replace this file with the protobuf
// c.f. trace/proto/span_details.proto

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
 * Export TraceLabels.
 */
module.exports = TraceLabels;
