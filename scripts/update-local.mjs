/**
 * Check for a newer release tag, then (with --yes) pull, rebuild and reinstall.
 *
 * No daemon and no background network: run it when you want to update.
 * A tag is a release; `main` alone is not.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' });
const capture = (cmd, args) =>
  execFileSync(cmd, args, { cwd: root, encoding: 'utf8' }).trim();

const current = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
run('git', ['fetch', '--tags', '--quiet']);
let latest = '';
try {
  latest = capture('git', ['tag', '--sort=-v:refname']).split('\n')[0]?.replace(/^v/, '') ?? '';
} catch {
  latest = '';
}
if (latest === '' || latest === current) {
  console.log(`NoteForest ${current} is up to date.`);
  process.exit(0);
}
console.log(`NoteForest ${current} → ${latest} is available.`);
if (!process.argv.includes('--yes')) {
  console.log('Run `npm run update:local -- --yes` to pull, rebuild and install.');
  process.exit(0);
}
run('git', ['pull', '--ff-only']);
run('npm', ['install']);
run('npm', ['run', 'dist']);
run('npm', ['run', 'install:local']);
console.log(`updated to ${latest}.`);
