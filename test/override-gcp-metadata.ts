// Copyright 2017 Google LLC
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

// Monkeypatch gcp-metadata to not ask for retries at all.

import * as rax from 'retry-axios';
import * as shimmer from 'shimmer';
import { AxiosRequestConfig } from 'axios';

shimmer.wrap(rax, 'attach', attach => {
  return (arg) => {
    if (arg) {
      shimmer.wrap(arg, 'request', request => {
        return (config: AxiosRequestConfig) => {
          delete config['raxConfig'];
          return request(config);
        }
      });
    }
    return attach(arg);
  }
});
