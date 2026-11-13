import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDocument,
  type Document,
} from '../src/index.js';
import {
  acquireDocumentLock,
  lockPathForPackage,
  type LockHandle,
} from '../src/node/lock.js';
import {
  readRecentDocuments,
} from '../src/node/recent.js';
import {
  materializeDocumentPackage,
  type DocumentStore,
  type DocumentStoreOptions,
} from '../src/node/store.js';
import { makeTempDir, removeDir, textContent } from './helpers.js';

let root = '';
let library = '';
let appSupport = '';
const stores: DocumentStore[] = [];
const locks: LockHandle[] = [];

function options(overrides: Partial<DocumentStoreOptions> = {}): DocumentStoreOptions {
  return {
    appSupportDir: appSupport,
    heartbeatIntervalMs: 0,
    ...overrides,
  };
}

/** One in-memory draft document with a first empty block, like the app. */
function draftDocument(title = 'Untitled'): Document {
  const document = createDocument({ title, chapterTitle: 'Chapter 1' });
  const chapterId = document.chapters[0]?.id;
  if (chapterId === undefined) throw new Error('missing chapter');
  document.blocks['block-1'] = {
    id: 'block-1',
    content: textContent('Typed in the draft'),
    createdAt: '2026-11-13T08:00:00.000Z',
    updatedAt: '2026-11-13T08:00:00.000Z',
  };
  document.chapters[0]?.topLevelBlockIds.push('block-1');
  return document;
}

beforeEach(async () => {
  root = await makeTempDir('noteforest-materialize-');
  library = path.join(root, 'Library');
  appSupport = path.join(root, 'support');
  await fs.mkdir(library, { recursive: true });
  await fs.mkdir(appSupport, { recursive: true });
});

afterEach(async () => {
  for (const store of stores) await store.close().catch(() => undefined);
  stores.length = 0;
  for (const lock of locks) await lock.release().catch(() => undefined);
  locks.length = 0;
  await removeDir(root);
});

async function liveLock(target: string): Promise<void> {
  const acquired = await acquireDocumentLock(target, { appSupportDir: appSupport });
  if (!acquired.ok) throw new Error(acquired.message);
  locks.push(acquired.handle);
}

async function writeStaleLock(target: string): Promise<void> {
  const lockPath = lockPathForPackage(target, appSupport);
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  await fs.writeFile(
    lockPath,
    JSON.stringify({
      version: 1,
      documentPath: path.resolve(target),
      pid: process.pid,
      host: os.hostname(),
      sessionId: 'stale-create-session',
      token: 'stale-token',
      acquiredAt: '2020-01-01T00:00:00.000Z',
      heartbeatAt: '2020-01-01T00:00:00.000Z',
    }),
  );
}

describe('materializeDocumentPackage', () => {
  it('writes the existing document identity and content unchanged', async () => {
    const document = draftDocument();
    const result = await materializeDocumentPackage(library, document, options());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    stores.push(result.store);

    expect(result.packagePath).toBe(path.join(library, 'untitled'));
    expect(result.document.id).toBe(document.id);
    expect(result.document.revision).toBe(document.revision);
    expect(Object.keys(result.document.blocks)).toEqual(['block-1']);
    expect(result.store.document?.id).toBe(document.id);

    const onDisk = JSON.parse(
      await fs.readFile(path.join(result.packagePath, 'document.json'), 'utf8'),
    ) as Document;
    expect(onDisk.id).toBe(document.id);
    expect(JSON.stringify(onDisk)).toBe(JSON.stringify(result.document));

    const recent = await readRecentDocuments(appSupport);
    expect(recent.manifest.items[0]).toMatchObject({
      documentId: document.id,
      path: result.packagePath,
    });
  });

  it('allocates unique folders for duplicate titles', async () => {
    const first = await materializeDocumentPackage(library, draftDocument(), options());
    const second = await materializeDocumentPackage(library, draftDocument(), options());
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    stores.push(first.store, second.store);
    expect(first.packagePath).not.toBe(second.packagePath);
    expect(path.basename(first.packagePath)).toBe('untitled');
    expect(path.basename(second.packagePath)).toBe('untitled-2');
  });

  it('breaks a stale lock but fails on a live lock without leaving a folder', async () => {
    const staleTarget = path.join(library, 'untitled');
    await writeStaleLock(staleTarget);
    const stale = await materializeDocumentPackage(library, draftDocument(), options());
    expect(stale.ok).toBe(true);
    if (stale.ok) stores.push(stale.store);
    expect(await fs.readFile(lockPathForPackage(staleTarget, appSupport), 'utf8')).not.toContain(
      'stale-token',
    );

    const liveTarget = path.join(library, 'untitled-2');
    await liveLock(liveTarget);
    const live = await materializeDocumentPackage(library, draftDocument(), options());
    expect(live.ok).toBe(false);
    if (live.ok) return;
    expect(live.error.code).toBe('document-locked');
    await expect(fs.stat(liveTarget)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses an invalid document before creating a folder', async () => {
    const document = draftDocument();
    document.chapters[0]?.topLevelBlockIds.push('missing-block');
    const result = await materializeDocumentPackage(library, document, options());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid-document');
    await expect(fs.stat(path.join(library, 'untitled'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
