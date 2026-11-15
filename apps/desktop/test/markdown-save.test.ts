import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  markdownHash,
  readMarkdownFile,
  saveMarkdownFile,
} from '../src/main/markdown-file';
import {
  markdownBackupPaths,
  readMarkdownBackup,
} from '../src/main/markdown-backup';
import {
  MAX_MARKDOWN_BYTES,
  markdownFingerprintChanged,
} from '../src/shared/markdown';

const roots: string[] = [];

async function fixture(source = '# Notes\n\nOriginal body.\n'): Promise<{
  root: string;
  support: string;
  file: string;
}> {
  const root = await mkdtemp(join(tmpdir(), 'noteforest-markdown-save-'));
  roots.push(root);
  const support = join(root, 'support');
  const file = join(root, 'notes.md');
  await writeFile(file, source);
  return { root, support, file };
}

async function open(file: string) {
  const result = await readMarkdownFile(file);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('fixture did not open');
  return result.file;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Markdown fingerprint', () => {
  it('detects a size, hash, or mtime change', () => {
    const base = { mtimeMs: 10, size: 4, hash: 'abcd' };
    expect(markdownFingerprintChanged(base, { ...base })).toBe(false);
    expect(markdownFingerprintChanged(base, { ...base, size: 5 })).toBe(true);
    expect(markdownFingerprintChanged(base, { ...base, hash: 'efgh' })).toBe(true);
    expect(markdownFingerprintChanged(base, { ...base, mtimeMs: 11 })).toBe(true);
  });
});

describe('Markdown large-file guard', () => {
  it('does not read or parse a file above the 2 MB cap; it opens read-only', async () => {
    const bytes = MAX_MARKDOWN_BYTES + 4096;
    const { support, file } = await fixture(`# Big\n\n${'x'.repeat(bytes)}\n`);
    const result = await readMarkdownFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.readOnly).toBe(true);
    expect(result.file.tooLarge).toBe(true);
    expect(result.file.readOnlyReason).toContain('2 MB');
    // Above the cap the body is never read: no parse, no freeze, no base.
    expect(result.file.markdown).toBe('');
    expect(result.file.base).toBeNull();
    const save = await saveMarkdownFile(
      {
        path: file,
        markdown: '# rewritten\n',
        base: null,
      },
      { appSupportDir: support },
    );
    expect(save.ok).toBe(false);
    if (!save.ok) expect(save.code).toBe('read-only');
    expect((await stat(file)).size).toBeGreaterThan(MAX_MARKDOWN_BYTES);
  });
});

describe('Markdown atomic save', () => {
  it('writes UTF-8 atomically with one app-support previous copy (no .md.bak)', async () => {
    const previous = '# İstanbul\n\nCafé — naïve 🗒\n';
    const { root, support, file } = await fixture(previous);
    const source = await open(file);
    const next = '# Saved\n\nUnicode ✓ and **bold**.\n';
    const result = await saveMarkdownFile(
      {
        path: source.path,
        markdown: next,
        base: source.base,
      },
      { appSupportDir: support, savedAt: '2026-11-15T10:00:00.000Z' },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unchanged).toBe(false);
    expect(await readFile(source.path, 'utf8')).toBe(next);
    expect(result.base.hash).toBe(markdownHash(Buffer.from(next, 'utf8')));
    expect(result.base.size).toBe(Buffer.byteLength(next, 'utf8'));

    // The vault never gets a `.md.bak`.
    await expect(readFile(`${source.path}.bak`, 'utf8')).rejects.toThrow();

    // One previous copy in app support, with its metadata.
    const paths = markdownBackupPaths(support, source.path);
    expect(await readFile(paths.previous, 'utf8')).toBe(previous);
    const meta = JSON.parse(await readFile(paths.meta, 'utf8')) as {
      path: string;
      savedAt: string;
      mtime: string;
      size: number;
      hash: string;
      version: number;
    };
    expect(meta).toMatchObject({
      version: 1,
      path: source.path,
      savedAt: '2026-11-15T10:00:00.000Z',
      size: Buffer.byteLength(previous, 'utf8'),
      hash: markdownHash(Buffer.from(previous, 'utf8')),
    });
    expect(Number.isNaN(Date.parse(meta.mtime))).toBe(false);

    // No temporary file survives a successful write.
    const leftovers = (await readdir(root)).filter((name) => name.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
  });

  it('overwrites the single previous copy on the next changed save', async () => {
    const { support, file } = await fixture('# One\n');
    const first = await open(file);
    const second = '# Two\n';
    const saved = await saveMarkdownFile(
      { path: file, markdown: second, base: first.base },
      { appSupportDir: support, savedAt: '2026-11-15T10:00:00.000Z' },
    );
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const third = '# Three\n';
    const again = await saveMarkdownFile(
      { path: file, markdown: third, base: saved.base },
      { appSupportDir: support, savedAt: '2026-11-15T10:01:00.000Z' },
    );
    expect(again.ok).toBe(true);
    const backup = await readMarkdownBackup(support, first.path);
    expect(backup?.bytes.toString('utf8')).toBe(second);
    expect(backup?.meta.savedAt).toBe('2026-11-15T10:01:00.000Z');
    // The backup key is the canonical path returned by the read.
    const paths = markdownBackupPaths(support, first.path);
    const entries = await readdir(paths.directory);
    expect(entries.sort()).toEqual(['meta.json', 'previous.md']);
  });

  it('refuses to overwrite a file that changed outside the app', async () => {
    const { support, file } = await fixture();
    const source = await open(file);
    await writeFile(file, '# External write\n\nSomeone else edited this.\n');
    const before = await readFile(file, 'utf8');
    const result = await saveMarkdownFile(
      {
        path: source.path,
        markdown: '# Local write\n',
        base: source.base,
      },
      { appSupportDir: support },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('conflict');
      expect(result.base?.hash).toBe(markdownHash(Buffer.from(before, 'utf8')));
    }
    expect(await readFile(file, 'utf8')).toBe(before);
    // The conflict path wrote no backup and no `.md.bak`.
    await expect(readFile(`${file}.bak`, 'utf8')).rejects.toThrow();
    expect(await readMarkdownBackup(support, source.path)).toBeNull();
  });

  it('overwrites only through the explicit overwriteExternal flag', async () => {
    const { support, file } = await fixture();
    const source = await open(file);
    await writeFile(file, '# External\n');
    const next = '# Explicit overwrite\n';
    const result = await saveMarkdownFile(
      {
        path: source.path,
        markdown: next,
        base: source.base,
        overwriteExternal: true,
      },
      { appSupportDir: support },
    );
    expect(result.ok).toBe(true);
    expect(await readFile(file, 'utf8')).toBe(next);
    // The overwritten external bytes are the previous copy in app support.
    const backup = await readMarkdownBackup(support, source.path);
    expect(backup?.bytes.toString('utf8')).toBe('# External\n');
  });

  it('never recreates a deleted file', async () => {
    const { support, file } = await fixture();
    const source = await open(file);
    await rm(file);
    const result = await saveMarkdownFile(
      {
        path: source.path,
        markdown: '# recreated?\n',
        base: source.base,
        overwriteExternal: true,
      },
      { appSupportDir: support },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('missing');
    await expect(stat(file)).rejects.toThrow();
  });

  it('treats identical bytes as a no-op save and does not rewrite the file', async () => {
    const { support, file } = await fixture();
    const source = await open(file);
    const before = await stat(file);
    const result = await saveMarkdownFile(
      {
        path: file,
        markdown: source.markdown,
        base: source.base,
      },
      { appSupportDir: support },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unchanged).toBe(true);
    const after = await stat(file);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    await expect(readFile(`${file}.bak`, 'utf8')).rejects.toThrow();
    expect(await readMarkdownBackup(support, source.path)).toBeNull();
  });

  it('rejects a non-absolute or non-Markdown path', async () => {
    expect((await saveMarkdownFile({ path: 'notes.md', markdown: '', base: null })).ok).toBe(false);
    expect(
      (await saveMarkdownFile({ path: '/tmp/notes.txt', markdown: '', base: null })).ok,
    ).toBe(false);
  });
});
