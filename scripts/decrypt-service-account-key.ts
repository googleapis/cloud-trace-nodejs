import { createDecipheriv } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';

export default async function() {
  const {
    encrypted_18363a01ae87_key: key,
    encrypted_18363a01ae87_iv: iv,
  } = process.env;

  if (!key || !iv) {
    throw new Error('Environment insufficient for decrypting service account key');
  }
  
  const path = 'node-team-test-d0b0be11c23d.json';

  const decipher = createDecipheriv(
    'aes-256-cbc',
    Buffer.from(key, 'hex'),
    Buffer.from(iv, 'hex')
  );

  const readStream = createReadStream(`${path}.enc`);
  const writeStream = createWriteStream(path);

  await new Promise((resolve, reject) => {
    readStream
      .on('error', reject)
      .pipe(decipher)
      .on('error', reject)
      .pipe(writeStream)
      .on('error', reject)
      .on('end', resolve);
  });
}
