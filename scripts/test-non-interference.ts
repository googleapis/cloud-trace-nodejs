import { forkP, globP } from './utils';

export default async function() {
  // TODO(kjin): Re-enable non-interference tests when we can be sure their
  // doesn't get in the way.
  console.log('Not running non-interference tests.');
  // const files = await globP('./test/non-interference/*.js');
  // for (const file of files) {
  //   await forkP(file);
  // }
}
