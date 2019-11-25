// Copyright 2019 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as mongooseTypes from 'mongoose';
import { PluginTypes } from '..';

const plugin: PluginTypes.Plugin = [
  {
    versions: '4 - 5',
    file: 'lib/query.js',
    intercept: (Query: typeof mongooseTypes.Query, api) => {
      // Assume that the context desired at Query execution time should be the
      // context where the Query object was constructed. In most (if not all)
      // Mongoose read APIs, both of these appear to happen as part of the same
      // API call.
      return new Proxy(Query, {
        apply(target, thisArg, args) {
          // result is expected to be undefined.
          const result = target.apply(thisArg, args);
          thisArg.exec = api.wrap(thisArg.exec);
          return result;
        }
      });
    }
  }
];

export = plugin;
