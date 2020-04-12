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

import {createCipheriv, createDecipheriv, randomBytes} from 'crypto';
import {createReadStream, createWriteStream} from 'fs';

export interface KeyAndIV {
  key: string;
  iv: string;
}

export async function encryptCredentials(filename: string): Promise<KeyAndIV> {
  const key = randomBytes(32).toString('hex');
  const iv = randomBytes(16).toString('hex');

  const decipher = createCipheriv(
    'aes-256-cbc',
    Buffer.from(key, 'hex'),
    Buffer.from(iv, 'hex')
  );

  const readStream = createReadStream(filename);
  const writeStream = createWriteStream(`${filename}.enc`);

  await new Promise((resolve, reject) => {
    readStream
      .on('error', reject)
      .pipe(decipher)
      .on('error', reject)
      .pipe(writeStream)
      .on('error', reject)
      .on('finish', resolve);
  });
  return {key, iv};
}

export async function decryptCredentials(
  {key, iv}: KeyAndIV,
  filename: string
) {
  const decipher = createDecipheriv(
    'aes-256-cbc',
    Buffer.from(key, 'hex'),
    Buffer.from(iv, 'hex')
  );

  const readStream = createReadStream(`${filename}.enc`);
  const writeStream = createWriteStream(filename);

  await new Promise((resolve, reject) => {
    readStream
      .on('error', reject)
      .pipe(decipher)
      .on('error', reject)
      .pipe(writeStream)
      .on('error', reject)
      .on('finish', resolve);
  });
}
