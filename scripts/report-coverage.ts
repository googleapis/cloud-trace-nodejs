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

import {BUILD_DIRECTORY, nodule, forkP} from './utils';
import * as path from 'path';

export async function reportCoverage() {
  await forkP(
    nodule('.bin/codecov'),
    [`--root=${path.resolve(BUILD_DIRECTORY, '..')}`],
    {
      cwd: BUILD_DIRECTORY,
    }
  );
}
