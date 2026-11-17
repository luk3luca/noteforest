/**
 * Install the freshly built app into /Applications, replacing a previous copy.
 * The app bundle carries the build's signature (none in v1: local unsigned).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
if (!existsSync(dist)) {
  console.error('No dist/ build. Run `npm run dist` first.');
  process.exit(1);
}
const appSource = readdirSync(dist)
  .map((name) => join(dist, name, 'NoteForest.app'))
  .find((path) => existsSync(path) && statSync(path).isDirectory());
if (appSource === undefined) {
  console.error('No NoteForest.app found under dist/. Run `npm run dist` first.');
  process.exit(1);
}
try {
  execFileSync('pgrep', ['-x', 'NoteForest'], { stdio: 'ignore' });
  console.error('NoteForest is running. Quit it, then run this again.');
  process.exit(1);
} catch {
  // not running
}
const target = '/Applications/NoteForest.app';
rmSync(target, { recursive: true, force: true });
execFileSync('ditto', [appSource, target], { stdio: 'inherit' });
console.log(`installed ${target}`);
