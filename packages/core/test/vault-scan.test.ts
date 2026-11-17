import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDocumentPackage } from '@noteforest/core/node';
import {
  stringifyDocument,
  type ContentBlock,
  type ContentNode,
  type Document,
} from '@noteforest/core';
import {
  compareVaultNodes,
  isVaultAssetDirName,
  isVaultBackupName,
  isVaultMarkdownName,
  scanVaultTree,
  type VaultFolderNode,
  type VaultNode,
} from '@noteforest/core/node';

let root = '';
let library = '';
let support = '';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'noteforest-vault-scan-'));
  library = path.join(root, 'library');
  support = path.join(root, 'support');
  await fs.mkdir(library, { recursive: true });
  await fs.mkdir(support, { recursive: true });
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function note(folder: string, title = folder): Promise<string> {
  const target = path.join(library, folder);
  await fs.mkdir(path.dirname(target), { recursive: true });
  // createDocumentPackage derives its folder name from the title, so create in
  // a staging root and move the finished package to the exact test path.
  const staging = await fs.mkdtemp(path.join(root, 'staging-'));
  const created = await createDocumentPackage(
    staging,
    { title, chapterTitle: 'Chapter' },
    { appSupportDir: support, registerRecent: false, heartbeatIntervalMs: 0 },
  );
  if (!created.ok) throw new Error(created.error.message);
  await created.store.close();
  await fs.rename(created.packagePath, target);
  return target;
}

function kinds(nodes: VaultNode[]): string[] {
  return nodes.map((node) => `${node.kind}:${node.name}`);
}

/** Rewrite one package's `document.json` through the canonical serializer. */
async function rewriteNote(
  target: string,
  mutate: (document: Document) => void,
): Promise<void> {
  const file = path.join(target, 'document.json');
  const document = JSON.parse(await fs.readFile(file, 'utf8')) as Document;
  mutate(document);
  await fs.writeFile(file, stringifyDocument(document));
}

/** A one-row table; `rich` gives the second cell two paragraphs (P2 item 5). */
function cellTable(rich: boolean): ContentNode {
  const cell = (text: string): ContentNode => ({
    type: 'paragraph',
    children: [{ type: 'text', text }],
  });
  return {
    type: 'table',
    children: [
      {
        type: 'tableRow',
        children: [
          { type: 'tableHeader', children: [cell('Term')] },
          {
            type: 'tableCell',
            children: rich ? [cell('one'), cell('two')] : [cell('one')],
          },
        ],
      },
    ],
  } as ContentNode;
}

function addTableBlock(document: Document, blockId: string, rich: boolean): void {
  const block: ContentBlock = {
    id: blockId,
    content: { type: 'doc', children: [cellTable(rich)] },
  };
  document.blocks[blockId] = block;
  document.chapters[0]?.topLevelBlockIds.push(blockId);
}

function folder(nodes: VaultNode[], name: string): VaultFolderNode {
  const node = nodes.find((candidate) => candidate.kind === 'folder' && candidate.name === name);
  if (node === undefined || node.kind !== 'folder') throw new Error(`no folder ${name}`);
  return node;
}

describe('vault node detection', () => {
  it('recurses folders and keeps empty folders, notes, and Markdown files', async () => {
    await note('serie-1', 'Serie one');
    await fs.mkdir(path.join(library, 'Università', 'Analisi', 'serie-2'), { recursive: true });
    const nested = await note('Università/Analisi/serie-2', 'Serie two');
    await fs.mkdir(path.join(library, 'Università', 'Personale'), { recursive: true });
    await fs.writeFile(path.join(library, 'diario.md'), '# Diario\n');
    await fs.mkdir(path.join(library, 'diario.assets'), { recursive: true });
    await fs.writeFile(path.join(library, 'diario.assets', 'pic.png'), 'not an image');

    const scan = await scanVaultTree(library);
    expect(scan.warnings).toEqual([]);
    // Folders first, then notes, then Markdown, case-insensitive.
    expect(scan.nodes.map((node) => node.kind)).toEqual(['folder', 'note', 'markdown']);
    expect(scan.nodes[0]).toMatchObject({ kind: 'folder', name: 'Università' });
    expect(scan.nodes[1]).toMatchObject({ kind: 'note', name: 'serie-1' });
    expect(scan.documents.map((row) => row.path)).toEqual([
      nested,
      path.join(library, 'serie-1'),
      path.join(library, 'diario.md'),
    ]);
    const universita = folder(scan.nodes, 'Università');
    expect(universita.children.map((node) => node.name)).toEqual(['Analisi', 'Personale']);
    expect(folder(universita.children, 'Personale')).toMatchObject({ children: [] });
    // The nested note is a note row, not a folder.
    expect(folder(universita.children, 'Analisi').children[0]).toMatchObject({
      kind: 'note',
      name: 'serie-2',
      relativePath: 'Università/Analisi/serie-2',
    });
  });

  it('never treats an arbitrary folder as a missing note', async () => {
    await fs.mkdir(path.join(library, 'empty'), { recursive: true });
    await fs.mkdir(path.join(library, 'with-image'), { recursive: true });
    await fs.writeFile(path.join(library, 'with-image', 'photo.png'), 'x');
    await fs.mkdir(path.join(library, 'notes'), { recursive: true });
    await fs.writeFile(path.join(library, 'notes', 'diario.md'), '# diario');

    const scan = await scanVaultTree(library);
    expect(kinds(scan.nodes)).toEqual([
      'folder:empty',
      'folder:notes',
      'folder:with-image',
    ]);
    expect(folder(scan.nodes, 'empty')).toMatchObject({ children: [] });
    // A `.md` inside a plain folder is a Markdown node, not a note.
    expect(folder(scan.nodes, 'notes').children).toMatchObject([
      { kind: 'markdown', name: 'diario.md' },
    ]);
    expect(scan.documents.map((row) => row.kind)).toEqual(['markdown']);
  });

  it('keeps a package-like folder as a missing note row', async () => {
    const missing = path.join(library, 'gone');
    await fs.mkdir(path.join(missing, 'assets'), { recursive: true });
    const marked = path.join(library, 'marked');
    await fs.mkdir(marked, { recursive: true });
    await fs.writeFile(path.join(marked, '.noteforest'), 'marker');

    const scan = await scanVaultTree(library);
    expect(kinds(scan.nodes)).toEqual(['note:gone', 'note:marked']);
    const node = scan.nodes[0];
    expect(node?.kind).toBe('note');
    if (node?.kind !== 'note') return;
    expect(node.row).toMatchObject({
      path: missing,
      title: 'gone',
      status: 'missing',
      documentId: null,
      blockCount: 0,
      chapterCount: 0,
    });
    expect(node.row.reason).toMatch(/document\.json is missing/);
  });

  it('marks a rich table cell unreadable and leaves an inline cell ok (P2)', async () => {
    const rich = await note('rich-cell', 'Rich cell');
    const inline = await note('inline-cell', 'Inline cell');
    await rewriteNote(rich, (document) => addTableBlock(document, 'rich-table', true));
    await rewriteNote(inline, (document) => addTableBlock(document, 'inline-table', false));

    const scan = await scanVaultTree(library);
    const richRow = scan.documents.find((row) => row.path === rich);
    expect(richRow).toMatchObject({
      kind: 'note',
      status: 'unreadable',
      documentId: null,
      revision: null,
      blockCount: 0,
      chapterCount: 0,
    });
    // The row carries the same sentence the loader refuses with; the caller
    // keeps it under Details.
    expect(richRow?.reason).toMatch(/table cell holds one paragraph of inline content/);
    expect(richRow?.reason).toMatch(/blocks\.rich-table\.content/);

    const inlineRow = scan.documents.find((row) => row.path === inline);
    expect(inlineRow?.status).toBe('ok');
    expect(inlineRow?.documentId).toBeTruthy();
  });
});

describe('vault ignore policy', () => {
  it('ignores assets, assets siblings, backups, images, hidden entries, and symlinks', async () => {
    await note('serie-1', 'Serie one');
    await fs.writeFile(path.join(library, 'serie-1', 'assets', 'image.png'), 'x');
    await fs.writeFile(path.join(library, 'diario.md.bak'), '# old');
    await fs.writeFile(path.join(library, 'notes.md'), '# notes');
    await fs.mkdir(path.join(library, 'notes.assets'), { recursive: true });
    await fs.writeFile(path.join(library, 'notes.assets', 'image.png'), 'x');
    await fs.writeFile(path.join(library, 'photo.png'), 'x');
    await fs.writeFile(path.join(library, '.hidden.md'), '# hidden');
    await fs.mkdir(path.join(library, '.hidden-folder'), { recursive: true });
    await fs.mkdir(path.join(library, 'backups'), { recursive: true });
    await fs.mkdir(path.join(library, 'old.backup'), { recursive: true });
    const outside = path.join(root, 'outside');
    await fs.mkdir(outside, { recursive: true });
    await fs.writeFile(path.join(outside, 'escape.md'), '# escape');
    await fs.symlink(outside, path.join(library, 'escape-link'), 'dir');
    await fs.symlink(
      path.join(outside, 'escape.md'),
      path.join(library, 'escape.md'),
      'file',
    );

    const scan = await scanVaultTree(library);
    expect(kinds(scan.nodes)).toEqual(['note:serie-1', 'markdown:notes.md']);
    // The note package's own assets/ is never descended into.
    expect(await fs.readdir(path.join(library, 'serie-1', 'assets'))).toEqual(['image.png']);
    expect(scan.warnings).toEqual([]);
  });

  it('names the ignore rules in one place', () => {
    expect(isVaultAssetDirName('assets')).toBe(true);
    expect(isVaultAssetDirName('diario.assets')).toBe(true);
    expect(isVaultAssetDirName('asset')).toBe(false);
    expect(isVaultBackupName('notes.md.bak')).toBe(true);
    expect(isVaultBackupName('backups')).toBe(true);
    expect(isVaultMarkdownName('notes.md')).toBe(true);
    expect(isVaultMarkdownName('notes.md.bak')).toBe(false);
    expect(isVaultMarkdownName('notes.txt')).toBe(false);
    expect(isVaultMarkdownName('.md')).toBe(false);
  });
});

describe('vault deterministic order', () => {
  it('orders folders, then notes, then Markdown, case-insensitively', async () => {
    // macOS APFS is case-insensitive, so each directory cannot hold both `A`
    // and `a`; the path tie-break for equal case-insensitive names is covered
    // by the pure comparator test below.
    for (const name of ['b', 'A', 'C']) {
      await fs.mkdir(path.join(library, name), { recursive: true });
    }
    await note('zeta', 'Zeta');
    await note('beta', 'Beta');
    await fs.writeFile(path.join(library, 'Zeta.md'), '# a');
    await fs.writeFile(path.join(library, 'alpha.md'), '# b');

    const scan = await scanVaultTree(library);
    expect(scan.nodes.map((node) => node.name)).toEqual([
      'A',
      'b',
      'C',
      'beta',
      'zeta',
      'alpha.md',
      'Zeta.md',
    ]);
  });

  it('is a pure comparator', () => {
    const folderNode: VaultNode = {
      kind: 'folder',
      path: '/lib/b',
      name: 'b',
      relativePath: 'b',
      children: [],
    };
    const noteNode: VaultNode = {
      kind: 'note',
      path: '/lib/a',
      name: 'a',
      relativePath: 'a',
      row: {
        path: '/lib/a',
        title: 'a',
        kind: 'note',
        status: 'ok',
        documentId: null,
        revision: null,
        updatedAt: '2026-01-01T00:00:00.000Z',
        blockCount: 0,
        chapterCount: 0,
      },
    };
    expect([noteNode, folderNode].sort(compareVaultNodes)).toEqual([folderNode, noteNode]);
  });
});

describe('vault limits', () => {
  it('stops at the depth limit with one warning', async () => {
    await fs.mkdir(path.join(library, 'one', 'two', 'three'), { recursive: true });
    await fs.writeFile(path.join(library, 'one', 'two', 'three', 'deep.md'), '# deep');

    const shallow = await scanVaultTree(library, { maxDepth: 1 });
    expect(kinds(shallow.nodes)).toEqual(['folder:one']);
    expect(shallow.documents).toEqual([]);
    expect(shallow.warnings.join(' ')).toMatch(/deeper than 1 levels/);

    const deeper = await scanVaultTree(library, { maxDepth: 3 });
    expect(deeper.documents.map((row) => row.title)).toEqual(['deep.md']);
  });

  it('caps the visited entries', async () => {
    for (let index = 0; index < 6; index += 1) {
      await fs.writeFile(path.join(library, `note-${index}.md`), '# n');
    }
    const scan = await scanVaultTree(library, { maxEntries: 3 });
    expect(scan.documents.length).toBe(3);
    expect(scan.warnings.join(' ')).toMatch(/more than 3 entries/);
  });

  it('reports an unreadable folder as a warning and keeps it as a folder', async () => {
    const blocked = path.join(library, 'blocked');
    await fs.mkdir(blocked, { recursive: true });
    await fs.chmod(blocked, 0o000);
    try {
      const scan = await scanVaultTree(library);
      const node = scan.nodes.find((candidate) => candidate.name === 'blocked');
      expect(node).toMatchObject({ kind: 'folder' });
      if (node?.kind === 'folder') {
        expect(node.children).toEqual([]);
        expect(node.warning ?? '').toMatch(/Could not read the folder/);
      }
      expect(scan.warnings.length).toBeGreaterThan(0);
    } finally {
      await fs.chmod(blocked, 0o755);
    }
  });

  it('warns and returns no nodes when the library root is missing', async () => {
    const scan = await scanVaultTree(path.join(root, 'nope'));
    expect(scan.nodes).toEqual([]);
    expect(scan.documents).toEqual([]);
    expect(scan.warnings.join(' ')).toMatch(/Library not found/);
  });
});
