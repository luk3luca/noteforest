import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDocumentPackage } from '../src/node/store.js';
import type { DocumentStore } from '../src/node/store.js';
import { writeDocumentPackageCopy } from '../src/node/copy.js';
import { stringifyDocument } from '../src/serialize.js';
import type { Document } from '../src/types.js';
import { makeTempDir, removeDir } from './helpers.js';

let root = '';
let library = '';
let appSupport = '';
let stores: DocumentStore[] = [];

beforeEach(async () => {
  root = await makeTempDir('noteforest-copy-');
  library = path.join(root, 'library');
  appSupport = path.join(root, 'support');
  await fs.mkdir(library, { recursive: true });
});

afterEach(async () => {
  for (const store of stores) await store.close().catch(() => undefined);
  stores = [];
  await removeDir(root);
});

async function createSource(title = 'Source') {
  const created = await createDocumentPackage(
    library,
    { title, chapterTitle: 'Chapter One' },
    { appSupportDir: appSupport, registerRecent: false, heartbeatIntervalMs: 0 },
  );
  if (!created.ok) throw new Error(created.error.message);
  stores.push(created.store);
  return created;
}

function withTitle(document: Document, title: string): Document {
  return { ...document, title };
}

describe('save a copy', () => {
  it('writes the in-memory document and assets without touching the source', async () => {
    const source = await createSource('Source');
    const sourceDocumentPath = path.join(source.packagePath, 'document.json');
    const sourceBytes = await fs.readFile(sourceDocumentPath);
    await fs.mkdir(path.join(source.packagePath, 'assets'), { recursive: true });
    await fs.writeFile(path.join(source.packagePath, 'assets', 'figure.png'), 'png-bytes');

    const target = path.join(library, 'source copy');
    const result = await writeDocumentPackageCopy({
      sourcePackagePath: source.packagePath,
      targetPackagePath: target,
      document: withTitle(source.document, 'Copied title'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.packagePath).toBe(target);
    expect(result.assetsCopied).toBe(true);

    const copied = JSON.parse(
      await fs.readFile(path.join(target, 'document.json'), 'utf8'),
    ) as Document;
    expect(copied.title).toBe('Copied title');
    expect(Object.keys(copied.blocks)).toEqual(Object.keys(source.document.blocks));

    expect(await fs.readFile(path.join(target, 'assets', 'figure.png'), 'utf8')).toBe('png-bytes');
    expect((await fs.readFile(sourceDocumentPath)).equals(sourceBytes)).toBe(true);
  });

  it('refuses to overwrite an existing package', async () => {
    const source = await createSource('Source');
    const target = path.join(library, 'taken');
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(
      path.join(target, 'document.json'),
      stringifyDocument(source.document),
    );

    const result = await writeDocumentPackageCopy({
      sourcePackagePath: source.packagePath,
      targetPackagePath: target,
      document: source.document,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('recovery-failed');
      expect(result.error.message).toMatch(/already exists/i);
    }
  });

  it('refuses to copy a document onto itself', async () => {
    const source = await createSource('Source');
    const result = await writeDocumentPackageCopy({
      sourcePackagePath: source.packagePath,
      targetPackagePath: source.packagePath,
      document: source.document,
    });
    expect(result.ok).toBe(false);
  });

  it('refuses to write an invalid document', async () => {
    const source = await createSource('Source');
    const invalid = structuredClone(source.document);
    invalid.schemaVersion = 999;
    const result = await writeDocumentPackageCopy({
      sourcePackagePath: source.packagePath,
      targetPackagePath: path.join(library, 'invalid'),
      document: invalid,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid-document');
  });

  it('copies a document that has no assets directory', async () => {
    const source = await createSource('No assets');
    const target = path.join(library, 'no-assets-copy');
    const result = await writeDocumentPackageCopy({
      sourcePackagePath: source.packagePath,
      targetPackagePath: target,
      document: withTitle(source.document, 'No assets copy'),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      await expect(fs.access(path.join(target, 'assets'))).resolves.toBeUndefined();
      await expect(fs.access(path.join(target, 'document.json'))).resolves.toBeUndefined();
    }
  });
});

describe('io failure classification', () => {
  it('maps permission and disk-full errno values without collapsing them', async () => {
    const { ioFailureDetails } = await import('../src/node/store.js');
    const permission = Object.assign(new Error('denied'), { code: 'EACCES' });
    const readOnlyFs = Object.assign(new Error('read-only fs'), { code: 'EROFS' });
    const diskFull = Object.assign(new Error('no space'), { code: 'ENOSPC' });
    const quota = Object.assign(new Error('quota'), { code: 'EDQUOT' });
    const other = Object.assign(new Error('boom'), { code: 'EIO' });

    expect(ioFailureDetails(permission)).toEqual({ reason: 'permission', errno: 'EACCES' });
    expect(ioFailureDetails(readOnlyFs)).toEqual({ reason: 'permission', errno: 'EROFS' });
    expect(ioFailureDetails(diskFull)).toEqual({ reason: 'disk-full', errno: 'ENOSPC' });
    expect(ioFailureDetails(quota)).toEqual({ reason: 'disk-full', errno: 'EDQUOT' });
    expect(ioFailureDetails(other)).toEqual({ reason: 'io-error', errno: 'EIO' });
    expect(ioFailureDetails(new Error('plain'))).toEqual({ reason: 'io-error' });
  });
});
