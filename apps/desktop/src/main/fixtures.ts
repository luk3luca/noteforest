import { app } from 'electron';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { basename, extname, resolve, sep } from 'node:path';
import type { FixtureSummary, LoadedFixture } from '../shared/api.js';
import type { NoteDocument } from '@noteforest/layout';

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

export function findWorkspaceRoot(): string {
  const env = process.env['NOTEFOREST_ROOT'];
  if (env) return resolve(env);
  let current = resolve(app.getAppPath());
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(resolve(current, 'fixtures', 'golden-eigenvalues.json'))) return current;
    const parent = resolve(current, '..');
    if (parent === current) break;
    current = parent;
  }
  return resolve(app.getAppPath(), '..', '..');
}

export function resolveFixturesDir(): string {
  const env = process.env['NOTEFOREST_FIXTURES'];
  if (env) return resolve(env);
  return resolve(findWorkspaceRoot(), 'fixtures');
}

function safeFixturePath(file: string): string {
  if (basename(file) !== file || !file.endsWith('.json')) {
    throw new Error(`Invalid fixture name: ${file}`);
  }
  return resolve(resolveFixturesDir(), file);
}

export async function listFixtures(): Promise<FixtureSummary[]> {
  const dir = resolveFixturesDir();
  const files = (await readdir(dir)).filter((file) => file.endsWith('.json')).sort();
  const summaries: FixtureSummary[] = [];
  for (const file of files) {
    try {
      const raw = await readFile(resolve(dir, file), 'utf8');
      const document = JSON.parse(raw) as NoteDocument;
      summaries.push({
        file,
        id: document.id,
        title: document.title,
        blockCount: Object.keys(document.blocks ?? {}).length,
        chapterCount: document.chapters?.length ?? 0,
        bytes: Buffer.byteLength(raw),
      });
    } catch {
      // A malformed fixture is omitted from the picker; loadFixture reports it.
    }
  }
  return summaries;
}

export async function loadFixture(file: string): Promise<LoadedFixture> {
  const path = safeFixturePath(file);
  const document = JSON.parse(await readFile(path, 'utf8')) as NoteDocument;
  const assets: Record<string, string> = {};
  const fixturesDir = resolveFixturesDir();
  for (const [assetId, asset] of Object.entries(document.assets ?? {})) {
    if (!asset.path) continue;
    const assetPath = resolve(fixturesDir, asset.path);
    if (!assetPath.startsWith(fixturesDir + sep)) continue;
    try {
      const bytes = await readFile(assetPath);
      const mime = MIME[extname(assetPath).toLowerCase()] ?? 'application/octet-stream';
      assets[assetId] = `data:${mime};base64,${bytes.toString('base64')}`;
    } catch {
      // Missing assets stay absent; the renderer shows a labeled placeholder.
    }
  }
  return { file, document, assets };
}
