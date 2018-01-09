import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';

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
  return { key, iv };
}

export async function decryptCredentials({ key, iv }: KeyAndIV, filename: string) {
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
