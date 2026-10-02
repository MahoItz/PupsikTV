import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist/pages');
if (!output.startsWith(root + sep))
  throw new Error('Build output outside project');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
// An allowlist keeps server source, environment files and tooling out of Pages.
for (const name of await readdir(root)) {
  if (name.endsWith('.html'))
    await cp(resolve(root, name), resolve(output, name));
}
for (const name of ['script', 'style', 'images', 'fonts', 'Music', 'Video']) {
  await cp(resolve(root, name), resolve(output, name), { recursive: true });
}
await writeFile(resolve(output, '.nojekyll'), '');
console.log('Built client-only GitHub Pages artifact in dist/pages.');
