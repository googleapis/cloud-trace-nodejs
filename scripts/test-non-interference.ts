import { forkP, globP } from './utils';

export default async function() {
  const files = await globP('./test/non-interference/*.js');
  for (const file of files) {
    await forkP(file);
  }
}
