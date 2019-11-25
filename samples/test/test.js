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

'use strict';

const execa = require('execa');

describe('trace samples', () => {

  it('should run the quickstart', done => {
    // select a random port between 49152 and 65535
    const PORT = Math.floor((Math.random() * (65535-49152))) + 49152;
    const proc = execa('node', ['app.js'], {
      env: {
        PORT
      }
    });
    proc.stdout.on('data', message => {
      // Listen to stdout and look for messages.  If we get a `Press CTRL+...`
      // assume the process started.  Wait a second to make sure there
      // is no stderr output signifying something may have gone wrong.
      message = message.toString('utf8');
      if (/Press Ctrl/.test(message)) {
        setTimeout(() => {
          proc.kill();
          done();
        }, 1000);
      }
    })
    proc.stderr.on('data', message => {
      // if anything comes through stderr, assume a bug
      done(new Error(message.toString('utf8')));
    });
  });

});
