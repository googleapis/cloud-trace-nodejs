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
 * Produces an object summarization of limited size. This summarization
 * does not adhere to the JSON spec so it cannot be reparsed even if
 * the entire object fits inside the desired size.
 *
 * @param {Object} o The object to be summarized.
 * @param {number} n Max length of the summary.
 */
function stringifyPrefix(o, n) {
  var buf = new Buffer(n);
  var pos = 0;
  var worklist = [];
  function pushObject(o) {
    var keys = Object.keys(o);
    for (var i = Math.min(keys.length - 1, Math.floor(n/4)); i >= 0; i--) {
      worklist.push((i === keys.length - 1) ? '}' : ',');
      worklist.push(o[keys[i]]);
      worklist.push(':');
      worklist.push(keys[i]);
    }
    worklist.push('{');
  }
  worklist.push(o);
  while (worklist.length > 0) {
    var elem = worklist.pop();
    if (elem && typeof elem === 'object') {
      pushObject(elem);
    } else {
      var val;
      if (typeof elem === 'function') {
        val = '[Function]';
      } else if (typeof elem === 'string') {
        val = elem;
      } else {
        // Undefined, Null, Boolean, Number, Symbol
        val = String(elem);
      }
      pos += buf.write(val, pos);
      if (buf.length === pos) {
        buf.write('...', pos - 3);
        break;
      }
    }
  }
  return buf.toString('utf8', 0, pos);
}

module.exports = {
  stringifyPrefix: stringifyPrefix
};
