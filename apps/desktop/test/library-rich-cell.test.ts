import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activeLibraryPath,
  closeAllStores,
  closeDocument,
  createDocument,
  dirtyDocuments,
  openStore,
  scanLibrary,
} from '../src/main/library';
import { lockPathForPackage } from '@noteforest/core/node';
import { stringifyDocument, type Block, type ContentNode, type Document } from '@noteforest/core';

/**
 * P2 item 5 — a note with a rich table cell must say so in the Library.
 *
 * The VH1 guard refuses such a note **before** `repository.open`, so it opens
 * in the unreadable/recovery state and `document.json` stays byte-identical —
 * but the row used to look normal. The scan now applies the same judgement on
 * the document it already parsed, so the row and the open path agree, with no
 * second read and no lock.
 */

let root = '';
let library = '';
let support = '';
let previousLibrary: string | undefined;
let previousSupport: string | undefined;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'noteforest-rich-cell-'));
  library = path.join(root, 'library');
  support = path.join(root, 'support');
  await fs.mkdir(library, { recursive: true });
  await fs.mkdir(support, { recursive: true });
  previousLibrary = process.env['NOTEFOREST_LIBRARY'];
  previousSupport = process.env['NOTEFOREST_APP_SUPPORT'];
  process.env['NOTEFOREST_LIBRARY'] = library;
  process.env['NOTEFOREST_APP_SUPPORT'] = support;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await closeAllStores();
  if (previousLibrary === undefined) delete process.env['NOTEFOREST_LIBRARY'];
  else process.env['NOTEFOREST_LIBRARY'] = previousLibrary;
  if (previousSupport === undefined) delete process.env['NOTEFOREST_APP_SUPPORT'];
  else process.env['NOTEFOREST_APP_SUPPORT'] = previousSupport;
  await fs.rm(root, { recursive: true, force: true });
});

async function createNote(title: string): Promise<string> {
  const created = await createDocument({ title });
  if (!created.ok) throw new Error(created.message);
  const packagePath = created.snapshot.packagePath;
  await closeDocument(packagePath, { save: true });
  return packagePath;
}

function cell(text: string): ContentNode {
  return { type: 'paragraph', children: [{ type: 'text', text }] };
}

/** A one-row table; `rich` gives the second cell two paragraphs. */
function cellTable(rich: boolean): ContentNode {
  return {
    type: 'table',
    children: [
      {
        type: 'tableRow',
        children: [
          { type: 'tableHeader', children: [cell('Term')] },
          { type: 'tableCell', children: rich ? [cell('one'), cell('two')] : [cell('one')] },
        ],
      },
    ],
  } as ContentNode;
}

async function addTableBlock(packagePath: string, blockId: string, rich: boolean): Promise<void> {
  const file = path.join(packagePath, 'document.json');
  const document = JSON.parse(await fs.readFile(file, 'utf8')) as Document;
  const block: Block = {
    id: blockId,
    content: { type: 'doc', children: [cellTable(rich)] },
  };
  document.blocks[blockId] = block;
  document.chapters[0]?.topLevelBlockIds.push(blockId);
  await fs.writeFile(file, stringifyDocument(document));
}

async function documentHash(packagePath: string): Promise<string> {
  const bytes = await fs.readFile(path.join(packagePath, 'document.json'));
  return createHash('sha256').update(bytes).digest('hex');
}

describe('library scan and the rich table cell (P2)', () => {
  it('lists a rich-cell note as unreadable, refuses to open it, and writes nothing', async () => {
    await activeLibraryPath();
    const richPath = await createNote('Rich cell');
    await addTableBlock(richPath, 'rich-table', true);
    const before = await documentHash(richPath);
    const entriesBefore = (await fs.readdir(richPath)).sort();

    const scan = await scanLibrary(undefined, { force: true });
    const row = scan.documents.find((document) => document.packagePath === richPath);
    expect(row?.status).toBe('unreadable');
    // The same short line a corrupt note gets; the raw sentence stays in the
    // tooltip/Details channel.
    expect(row?.reason).toBe('This note couldn’t be read.');
    expect(row?.reasonDetails).toMatch(/table cell holds one paragraph of inline content/);
    expect(row?.documentId).toBeNull();

    const opened = await openStore(richPath);
    expect(opened).toMatchObject({
      recovery: {
        recovery: true,
        status: 'unreadable',
        reason: 'The file isn’t valid NoteForest data.',
      },
    });
    if ('recovery' in opened) {
      expect(opened.recovery.reasonDetails).toMatch(/table cell holds one paragraph/);
      expect(opened.recovery.details.join(' ')).toMatch(/blocks\.rich-table\.content/);
    }

    // No lock, no store, no write: the guard runs before `repository.open`.
    await expect(fs.stat(lockPathForPackage(richPath, support))).rejects.toThrow();
    expect(dirtyDocuments()).toEqual([]);
    expect(await documentHash(richPath)).toBe(before);
    expect((await fs.readdir(richPath)).sort()).toEqual(entriesBefore);
  });

  it('leaves a note with an inline-only table, and a plain note, listing and opening normally', async () => {
    await activeLibraryPath();
    const inlinePath = await createNote('Inline cell');
    await addTableBlock(inlinePath, 'inline-table', false);
    const plainPath = await createNote('Plain note');

    const scan = await scanLibrary(undefined, { force: true });
    for (const packagePath of [inlinePath, plainPath]) {
      const row = scan.documents.find((document) => document.packagePath === packagePath);
      expect(row?.status, packagePath).toBe('ok');
      expect(row?.documentId, packagePath).toBeTruthy();
      const opened = await openStore(packagePath);
      expect('store' in opened, packagePath).toBe(true);
      if ('store' in opened) {
        if (packagePath === inlinePath) {
          expect(opened.store.document?.blocks['inline-table']?.content).toBeDefined();
        }
        await closeDocument(packagePath, { save: false });
      }
    }
  });

  it('reads each document.json once per scan, whatever the cell shape', async () => {
    await activeLibraryPath();
    const paths: string[] = [];
    for (let index = 0; index < 6; index += 1) {
      const packagePath = await createNote(`Scan ${index}`);
      // Half the library needs the guard's walk, half does not: both read once.
      if (index % 2 === 0) await addTableBlock(packagePath, `table-${index}`, index === 0);
      paths.push(packagePath);
    }

    const readFile = fs.readFile.bind(fs);
    const reads: string[] = [];
    vi.spyOn(fs, 'readFile').mockImplementation(((file: Parameters<typeof fs.readFile>[0], ...rest: unknown[]) => {
      if (typeof file === 'string' && file.endsWith('document.json')) reads.push(file);
      return (readFile as (...args: unknown[]) => Promise<unknown>)(file, ...rest);
    }) as typeof fs.readFile);

    const scan = await scanLibrary(undefined, { force: true });
    expect(scan.documents).toHaveLength(paths.length);
    const perDocument = new Map<string, number>();
    for (const file of reads) {
      perDocument.set(file, (perDocument.get(file) ?? 0) + 1);
    }
    expect([...perDocument.values()]).toEqual(paths.map(() => 1));
    expect([...perDocument.keys()].sort()).toEqual(
      paths.map((packagePath) => path.join(packagePath, 'document.json')).sort(),
    );
  });
});
