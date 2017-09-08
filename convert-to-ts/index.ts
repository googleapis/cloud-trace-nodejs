import * as del from 'del';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as path from 'path';
import * as glob from 'glob';
import * as mkdirp from 'mkdirp';

const traceDir = `${__dirname}/..`;
const outDir = '.';

const files: string[] = Array.prototype.concat.apply([], [
  'src/*.js',
  'src/plugins/*.js',
  'test/*.js',
  'test/plugins/*.js',
  'index.js',
  'config.js'
].map(g => glob.sync(g, {
  cwd: traceDir
})));

files.forEach((file) => {
  const lines = fs.readFileSync(`${traceDir}/${file}`, 'utf8')
    .split('\n')
    .map(line => {
      return line.replace(/require\(['"]([a-z0-9_./-]+).js['"]\)/, 'require(\'$1\'/*.js*/)')
    });
  const output = lines.concat(['export default {};', '']).join('\n');
  mkdirp.sync(path.dirname(`${traceDir}/${outDir}/${file}`));
  fs.writeFileSync(`${traceDir}/${outDir}/${file.replace(/\.js$/, '.ts')}`, output, 'utf8')
  del.sync(`${traceDir}/${file}`, { force: true });
});
