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

import {AddressInfo} from 'net';

import * as fs from 'fs';
import * as path from 'path';
import {Express4} from './express';
import * as httpModule from 'http';
import * as httpsModule from 'https';

/**
 * A modification of the Express4 test server that uses HTTPS instead.
 */
export class Express4Secure extends Express4 {
  static key = fs.readFileSync(
    path.join(__dirname, '..', 'fixtures', 'key.pem')
  );
  static cert = fs.readFileSync(
    path.join(__dirname, '..', 'fixtures', 'cert.pem')
  );
  private https: typeof httpsModule;

  constructor() {
    super();
    this.https = require('https');
  }

  listen(port: number): number {
    // The types of (http|https).Server are not compatible, but we don't
    // access any properties that aren't present on both in the test.
    this.server = (this.https.createServer(
      {key: Express4Secure.key, cert: Express4Secure.cert},
      this.app
    ) as {}) as httpModule.Server;
    this.server.listen(port);
    return (this.server.address() as AddressInfo).port;
  }

  shutdown() {
    this.server!.close();
  }
}
