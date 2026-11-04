/**
 * Library and document runtime for the Electron main process.
 *
 * The renderer never sees the filesystem. Every document is opened once
 * through `@noteforest/core/node`, held as a single `DocumentStore`, and
 * mutated only through typed commands.
 */

import { promises as fs, type Dirent } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createDocument as createCoreDocument,
  documentStats,
  orderKeysAfter,
  parseDocumentJson,
  validateDocument,
  type Branch,
  type ContentBlock,
  type ContentNode,
  type Document,
  type DocumentCommand,
} from '@noteforest/core';
import {
  createDocumentPackage,
  createUniquePackageDir,
  defaultAppSupportDir,
  documentJsonPath,
  assetsDirPath,
  openDocumentPackage,
  readRecentDocuments,
  writeDocumentPackageCopy,
  writeFileAtomic,
  type DocumentStore,
} from '@noteforest/core/node';
import type {
  ApplyResult,
  LibraryView,
  OpenDocumentResult,
  OpenDocumentSnapshot,
  ReloadDocumentResult,
  SaveCopyResult,
  SaveRequestOptions,
  SaveResult,
  SessionState,
  SessionTabState,
} from '../shared/api.js';
import { saveFailureCode } from './save-error.js';

const DEFAULT_SESSION: SessionState = {
  tabs: [],
  activeTab: null,
  sidebarCollapsed: false,
  sidebarWidth: 264,
  collapsedTopics: {},
};

export function libraryDir(): string {
  const override = process.env['NOTEFOREST_LIBRARY'];
  if (override !== undefined && override.length > 0) return path.resolve(override);
  return path.join(os.homedir(), 'Documents', 'NoteForest');
}

export function appSupportDir(): string {
  return process.env['NOTEFOREST_APP_SUPPORT'] ?? defaultAppSupportDir();
}

function sessionPath(): string {
  return path.join(appSupportDir(), 'shell-session.json');
}

export function isInsideLibrary(candidate: string): boolean {
  const library = path.resolve(libraryDir());
  const resolved = path.resolve(candidate);
  return resolved === library || resolved.startsWith(`${library}${path.sep}`);
}

const stores = new Map<string, DocumentStore>();

function snapshot(store: DocumentStore): OpenDocumentSnapshot | null {
  if (store.document === null) return null;
  return {
    packagePath: store.packagePath,
    document: store.document,
    status: store.readOnly ? 'read-only' : 'editable',
    ...(store.readOnlyReason === undefined ? {} : { readOnlyReason: store.readOnlyReason }),
    errors: store.errors.map((error) => error.message),
    warnings: store.warnings.map((warning) => warning.message),
  };
}

export async function ensureLibrary(): Promise<string> {
  const directory = libraryDir();
  await fs.mkdir(directory, { recursive: true });
  return directory;
}

export async function scanLibrary(): Promise<LibraryView> {
  const directory = await ensureLibrary();
  const support = appSupportDir();
  const documents: LibraryView['documents'] = [];
  const warnings: string[] = [];

  let entries: Dirent[] = [];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    warnings.push(`Could not read the library: ${error instanceof Error ? error.message : String(error)}`);
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const packagePath = path.join(directory, entry.name);
    const jsonPath = documentJsonPath(packagePath);
    try {
      const text = await fs.readFile(jsonPath, 'utf8');
      const parsed = parseDocumentJson(text);
      if (!parsed.ok) {
        warnings.push(`${entry.name}: ${parsed.error.message}`);
        continue;
      }
      const stats = documentStats(parsed.document);
      documents.push({
        packagePath,
        documentId: parsed.document.id,
        title: parsed.document.title,
        revision: parsed.document.revision,
        updatedAt: parsed.document.updatedAt,
        blockCount: stats.blocks,
        chapterCount: stats.chapters,
      });
    } catch {
      // Folders without a document.json are not documents.
    }
  }

  documents.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  let recent: LibraryView['recent'] = [];
  try {
    const read = await readRecentDocuments(support);
    warnings.push(...read.warnings);
    recent = await Promise.all(
      read.manifest.items.map(async (item) => {
        const packagePath = path.resolve(item.path);
        let missing = false;
        try {
          await fs.access(documentJsonPath(packagePath));
        } catch {
          missing = true;
        }
        return {
          documentId: item.documentId,
          title: item.title,
          packagePath,
          lastOpenedAt: item.lastOpenedAt,
          ...(missing ? { missing } : {}),
        };
      }),
    );
  } catch (error) {
    warnings.push(`Could not read recent documents: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { libraryPath: directory, appSupportPath: support, documents, recent, warnings };
}

export interface OpenedStore {
  store: DocumentStore;
  snapshot: OpenDocumentSnapshot;
}

export async function openStore(packagePath: string): Promise<OpenedStore | { error: string }> {
  const resolved = path.resolve(packagePath);
  if (!isInsideLibrary(resolved)) {
    return { error: 'Document is outside the NoteForest library.' };
  }
  const existing = stores.get(resolved);
  if (existing !== undefined && !existing.closed) {
    const current = snapshot(existing);
    if (current !== null) return { store: existing, snapshot: current };
  }

  await ensureLibrary();
  let result = await openDocumentPackage(resolved, { registerRecent: true });
  if (result.status !== 'editable' && result.readOnlyReason === 'stale-lock') {
    result = await openDocumentPackage(resolved, { registerRecent: true, breakStaleLock: true });
  }
  stores.set(resolved, result.store);
  const current = snapshot(result.store);
  if (current === null) {
    return { error: result.errors[0]?.message ?? 'The document could not be opened.' };
  }
  return { store: result.store, snapshot: current };
}

export async function openDocument(packagePath: string): Promise<OpenDocumentResult> {
  const opened = await openStore(packagePath);
  if ('error' in opened) {
    return { ok: false, message: opened.error, packagePath };
  }
  return opened.snapshot;
}

export async function createDocument(input: { title?: string }): Promise<{
  ok: true;
  snapshot: OpenDocumentSnapshot;
  library: LibraryView;
} | { ok: false; message: string }> {
  const directory = await ensureLibrary();
  const title = input.title?.trim() || 'Untitled';
  const created = await createDocumentPackage(directory, { title });
  if (!created.ok) return { ok: false, message: created.error.message };
  stores.set(created.packagePath, created.store);
  const chapterId = created.document.chapters[0]?.id;
  if (chapterId !== undefined) {
    const block = created.store.apply({
      type: 'block.create',
      placement: { kind: 'top-level', chapterId },
    });
    if (!block.ok) {
      created.store.close().catch(() => undefined);
      stores.delete(created.packagePath);
      return { ok: false, message: `Could not create the first block: ${block.message}` };
    }
    await created.store.save({});
  }
  const current = snapshot(created.store);
  if (current === null) return { ok: false, message: 'The new document could not be opened.' };
  return { ok: true, snapshot: current, library: await scanLibrary() };
}

export async function applyCommand(
  packagePath: string,
  command: DocumentCommand,
): Promise<ApplyResult> {
  const opened = await openStore(packagePath);
  if ('error' in opened) return { ok: false, message: opened.error, code: 'not-found' };
  const result = opened.store.apply(command);
  if (!result.ok) {
    return { ok: false, message: result.message, code: result.code };
  }
  const current = snapshot(opened.store);
  return {
    ok: true,
    document: result.document,
    revision: result.revision,
    created: result.created,
    inverse: result.inverse,
    ...(current === null ? {} : {}),
  };
}

function parseOverwriteFlag(options: unknown):
  | { ok: true; value: boolean | undefined }
  | { ok: false } {
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    return { ok: false };
  }
  const value = (options as { overwriteExternal?: unknown }).overwriteExternal;
  if (value !== undefined && typeof value !== 'boolean') return { ok: false };
  return { ok: true, value };
}

export async function saveDocument(
  packagePath: string,
  options: SaveRequestOptions = {},
): Promise<SaveResult> {
  if (typeof packagePath !== 'string' || packagePath.length === 0) {
    return { ok: false, changed: false, revision: 0, code: 'unknown', error: 'No document path was provided.' };
  }
  // The renderer may only force a write after the explicit overwrite dialog.
  // Anything other than a boolean flag is rejected before the store is touched.
  const parsed = parseOverwriteFlag(options);
  if (!parsed.ok) {
    return {
      ok: false,
      changed: false,
      revision: 0,
      code: 'unknown',
      error: 'Invalid overwrite flag.',
    };
  }
  const overwriteExternal = parsed.value;
  const opened = await openStore(packagePath);
  if ('error' in opened) {
    return {
      ok: false,
      changed: false,
      revision: 0,
      code: 'unknown',
      error: opened.error,
    };
  }
  if (overwriteExternal === true && opened.store.readOnly) {
    return {
      ok: false,
      changed: false,
      revision: opened.store.revision ?? 0,
      code: 'read-only',
      coreCode: 'read-only',
      error: 'document is open read-only; save is blocked',
    };
  }
  const result = await opened.store.save(
    overwriteExternal === true ? { overwriteExternal: true } : {},
  );
  if (!result.ok) {
    const failure: SaveResult = {
      ok: false,
      changed: false,
      revision: opened.store.revision ?? 0,
      code: saveFailureCode(result.error),
      coreCode: result.error.code,
      error: result.error.message,
    };
    return failure;
  }
  return {
    ok: true,
    changed: result.changed,
    revision: result.revision,
  };
}

/**
 * Write the current canonical document (including edits not yet on disk) plus
 * its assets into a new package. The original package is never written.
 */
export async function saveDocumentCopy(
  packagePath: string,
  destination: string,
): Promise<SaveCopyResult> {
  if (typeof packagePath !== 'string' || packagePath.length === 0) {
    return { ok: false, message: 'No document path was provided.' };
  }
  if (typeof destination !== 'string' || destination.length === 0) {
    return { ok: false, message: 'No copy location was provided.' };
  }
  const opened = await openStore(packagePath);
  if ('error' in opened) return { ok: false, message: opened.error };
  const document = opened.store.document;
  if (document === null) {
    return { ok: false, message: 'There is no document to copy.' };
  }

  const target = path.resolve(destination);
  const source = path.resolve(opened.store.packagePath);
  if (target === source || target.startsWith(`${source}${path.sep}`)) {
    return { ok: false, message: 'Choose a location outside the current document folder.' };
  }

  const copied = await writeDocumentPackageCopy({
    sourcePackagePath: source,
    targetPackagePath: target,
    document,
  });
  if (!copied.ok) return { ok: false, message: copied.error.message };

  // Opening is only possible inside the library; a copy saved elsewhere is
  // revealed in Finder by the caller instead.
  if (isInsideLibrary(copied.packagePath)) {
    const copy = await openStore(copied.packagePath);
    if (!('error' in copy)) {
      return {
        ok: true,
        packagePath: copied.packagePath,
        snapshot: copy.snapshot,
        library: await scanLibrary(),
      };
    }
  }
  return {
    ok: true,
    packagePath: copied.packagePath,
    library: await scanLibrary(),
  };
}

/**
 * Close the in-memory store and reopen the canonical package from disk.
 * Unsaved renderer changes are discarded by the caller after explicit
 * confirmation; nothing is written here.
 */
export async function reloadDocument(packagePath: string): Promise<ReloadDocumentResult> {
  if (typeof packagePath !== 'string' || packagePath.length === 0) {
    return { ok: false, message: 'No document path was provided.' };
  }
  const resolved = path.resolve(packagePath);
  if (!isInsideLibrary(resolved)) {
    return { ok: false, message: 'Document is outside the NoteForest library.' };
  }
  const existing = stores.get(resolved);
  if (existing !== undefined) {
    await existing.close().catch(() => undefined);
    stores.delete(resolved);
  }
  const opened = await openStore(resolved);
  if ('error' in opened) return { ok: false, message: opened.error };
  return { ok: true, snapshot: opened.snapshot };
}

export async function closeDocument(packagePath: string, options: { save: boolean }): Promise<void> {
  const resolved = path.resolve(packagePath);
  const store = stores.get(resolved);
  if (store === undefined) return;
  try {
    if (options.save && store.hasUnsavedChanges) await store.save({});
  } catch {
    // Closing still releases the lock; the failure is surfaced by the save path.
  }
  await store.close().catch(() => undefined);
  stores.delete(resolved);
}

export function dirtyDocuments(): Array<{ packagePath: string; title: string }> {
  const dirty: Array<{ packagePath: string; title: string }> = [];
  for (const store of stores.values()) {
    if (store.document !== null && store.hasUnsavedChanges) {
      dirty.push({ packagePath: store.packagePath, title: store.document.title });
    }
  }
  return dirty;
}

export async function saveAllDirty(): Promise<Array<{ packagePath: string; error: string }>> {
  const failures: Array<{ packagePath: string; error: string }> = [];
  for (const store of stores.values()) {
    if (!store.hasUnsavedChanges) continue;
    const result = await store.save({});
    if (!result.ok) failures.push({ packagePath: store.packagePath, error: result.error.message });
  }
  return failures;
}

export async function closeAllStores(): Promise<void> {
  for (const store of stores.values()) {
    await store.close().catch(() => undefined);
  }
  stores.clear();
}

// ---------------------------------------------------------------------------
// Session (UI state only; not document content)
// ---------------------------------------------------------------------------

export async function readSession(): Promise<SessionState> {
  const file = sessionPath();
  try {
    const text = await fs.readFile(file, 'utf8');
    const raw = JSON.parse(text) as Partial<SessionState>;
    const tabs: SessionTabState[] = [];
    if (Array.isArray(raw.tabs)) {
      for (const tab of raw.tabs) {
        if (typeof tab !== 'object' || tab === null) continue;
        const packagePath = (tab as { packagePath?: unknown }).packagePath;
        if (typeof packagePath !== 'string' || packagePath.length === 0) continue;
        const scrollTop = Number((tab as { scrollTop?: unknown }).scrollTop);
        const selectedBlockId = (tab as { selectedBlockId?: unknown }).selectedBlockId;
        const collapsedRaw = (tab as { collapsed?: unknown }).collapsed;
        const collapsed = Array.isArray(collapsedRaw)
          ? collapsedRaw.filter((item): item is string => typeof item === 'string')
          : [];
        tabs.push({
          packagePath,
          scrollTop: Number.isFinite(scrollTop) && scrollTop >= 0 ? scrollTop : 0,
          selectedBlockId: typeof selectedBlockId === 'string' ? selectedBlockId : null,
          collapsed,
        });
      }
    }
    const activeTab =
      typeof raw.activeTab === 'string' && tabs.some((tab) => tab.packagePath === raw.activeTab)
        ? raw.activeTab
        : tabs[0]?.packagePath ?? null;
    const width = Number(raw.sidebarWidth);
    const collapsedTopics: Record<string, string[]> = {};
    if (typeof raw.collapsedTopics === 'object' && raw.collapsedTopics !== null) {
      for (const [key, value] of Object.entries(raw.collapsedTopics)) {
        if (Array.isArray(value)) {
          collapsedTopics[key] = value.filter((item): item is string => typeof item === 'string');
        }
      }
    }
    return {
      tabs,
      activeTab,
      sidebarCollapsed: raw.sidebarCollapsed === true,
      sidebarWidth:
        Number.isFinite(width) && width >= 208 && width <= 360 ? Math.round(width) : 264,
      collapsedTopics,
    };
  } catch {
    return structuredClone(DEFAULT_SESSION);
  }
}

export async function writeSession(state: SessionState): Promise<void> {
  await fs.mkdir(appSupportDir(), { recursive: true });
  await writeFileAtomic(sessionPath(), `${JSON.stringify(state, null, 2)}\n`);
}

export async function bootstrap(): Promise<{
  session: SessionState;
  openDocuments: OpenDocumentSnapshot[];
  missing: Array<{ packagePath: string; message: string }>;
}> {
  const session = await readSession();
  const openDocuments: OpenDocumentSnapshot[] = [];
  const missing: Array<{ packagePath: string; message: string }> = [];
  for (const tab of session.tabs) {
    try {
      const opened = await openStore(tab.packagePath);
      if ('error' in opened) {
        missing.push({ packagePath: tab.packagePath, message: opened.error });
      } else {
        openDocuments.push(opened.snapshot);
      }
    } catch (error) {
      missing.push({
        packagePath: tab.packagePath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { session, openDocuments, missing };
}

// ---------------------------------------------------------------------------
// Test/demo fixtures. Guarded by NOTEFOREST_ALLOW_SEED so normal launches can
// never create data behind the user's back.
// ---------------------------------------------------------------------------

function seedAllowed(): boolean {
  return process.env['NOTEFOREST_ALLOW_SEED'] === '1' || process.env['NOTEFOREST_E2E'] === '1';
}

function text(value: string): ContentNode {
  return { type: 'text', text: value };
}

function paragraph(value: string): ContentNode {
  return { type: 'paragraph', children: [text(value)] };
}

function heading(level: number, value: string): ContentNode {
  return { type: 'heading', attrs: { level }, children: [text(value)] };
}

function contentOf(...children: ContentNode[]): ContentNode {
  return { type: 'doc', children };
}

function block(content: ContentNode): ContentBlock {
  return { id: crypto.randomUUID(), content };
}

function branch(sourceBlockId: string, targetBlockId: string, order: string): Branch {
  return {
    id: crypto.randomUUID(),
    source: { blockId: sourceBlockId },
    targetBlockId,
    role: 'primary',
    order,
  };
}

async function writeSeedDocument(title: string, document: Document): Promise<string> {
  const directory = await ensureLibrary();
  const report = validateDocument(document);
  if (!report.ok) {
    throw new Error(`seed document is invalid: ${report.errors.map((issue) => issue.message).join('; ')}`);
  }
  const packagePath = await createUniquePackageDir(directory, title);
  await fs.mkdir(assetsDirPath(packagePath), { recursive: true });
  await writeFileAtomic(documentJsonPath(packagePath), JSON.stringify(document, null, 2));
  return packagePath;
}

function demoDocument(): Document {
  const document = createCoreDocument({ title: 'Linear algebra', chapterTitle: 'Chapter 1 · Eigenvalues' });
  const chapter = document.chapters[0];
  if (chapter === undefined) throw new Error('missing seed chapter');
  const add = (content: ContentNode, id = crypto.randomUUID()): ContentBlock => {
    const item: ContentBlock = { id, content };
    document.blocks[id] = item;
    return item;
  };
  const A = add(contentOf(heading(2, 'Eigenvalues'), paragraph('A scalar λ is an eigenvalue of A if there is a nonzero vector v with Av = λv.')));
  const B = add(contentOf(heading(3, 'Eigenvector'), paragraph('A nonzero vector v that satisfies Av = λv for some λ.')));
  const C = add(contentOf(paragraph('Spectrum'), paragraph('The set of all eigenvalues of A, written σ(A).')));
  const D = add(contentOf(paragraph('Characteristic polynomial'), paragraph('Eigenvalues are the roots of det(A − λI) = 0.')));
  const E = add(contentOf(heading(2, 'Worked example'), paragraph('Take the symmetric matrix below. Its eigenvalues are 1 and 3.')));
  const F = add(
    contentOf(
      paragraph('Trace and determinant'),
      {
        type: 'bulletList',
        children: [
          { type: 'listItem', children: [paragraph('trace(A) = λ₁ + λ₂')] },
          { type: 'listItem', children: [paragraph('det(A) = λ₁ · λ₂')] },
        ],
      },
    ),
  );
  const G = add(
    contentOf(
      {
        type: 'codeBlock',
        attrs: { language: 'text' },
        children: [text('A = [[2, 1],\n     [1, 2]]')],
      },
      {
        type: 'table',
        children: [
          {
            type: 'tableRow',
            children: [
              { type: 'tableHeader', children: [paragraph('λ')] },
              { type: 'tableHeader', children: [paragraph('eigenvector')] },
            ],
          },
          {
            type: 'tableRow',
            children: [
              { type: 'tableCell', children: [paragraph('1')] },
              { type: 'tableCell', children: [paragraph('(1, −1)')] },
            ],
          },
        ],
      },
    ),
  );
  chapter.topLevelBlockIds.push(A.id, E.id, F.id, G.id);
  const addBranch = (source: string, target: string, order: string): void => {
    const record = branch(source, target, order);
    document.branches[record.id] = record;
  };
  addBranch(A.id, B.id, 'm');
  addBranch(A.id, C.id, 't');
  addBranch(B.id, D.id, 'm');
  document.updatedAt = new Date().toISOString();
  return document;
}

function performanceDocument(count = 300): Document {
  const document = createCoreDocument({ title: `${count} blocks`, chapterTitle: 'Stress test' });
  const chapter = document.chapters[0];
  if (chapter === undefined) throw new Error('missing seed chapter');
  const roots: string[] = [];
  for (let index = 0; index < 8; index += 1) {
    const id = crypto.randomUUID();
    const content = contentOf(
      heading(2, `Topic ${index + 1}`),
      paragraph(`Top-level block ${index + 1}. The quick brown fox jumps over the lazy dog.`),
    );
    document.blocks[id] = { id, content };
    chapter.topLevelBlockIds.push(id);
    roots.push(id);
  }
  const queue = [...roots];
  let total = roots.length;
  let cursor = 0;
  while (total < count && queue.length > 0) {
    const parent = queue[cursor % queue.length];
    cursor += 1;
    if (parent === undefined) break;
    const batch = total < count * 0.8 ? 3 : 1;
    const keys = orderKeysAfter(null, batch);
    for (let index = 0; index < batch && total < count; index += 1) {
      const id = crypto.randomUUID();
      const depthLabel = `${total + 1}`;
      document.blocks[id] = {
        id,
        content: contentOf(paragraph(`Block ${depthLabel}: a short line of study text with an equation-like token x${depthLabel}.`)),
      };
      const record = branch(parent, id, keys[index] ?? 'm');
      document.branches[record.id] = record;
      queue.push(id);
      total += 1;
    }
  }
  document.updatedAt = new Date().toISOString();
  return document;
}

export async function seedDocument(kind: 'demo' | 'performance' | 'performance-1000'): Promise<{
  snapshot: OpenDocumentSnapshot;
  library: LibraryView;
}> {
  if (!seedAllowed()) throw new Error('seeding is disabled');
  const document = kind === 'demo' ? demoDocument() : performanceDocument(kind === 'performance-1000' ? 1000 : 300);
  const packagePath = await writeSeedDocument(document.title, document);
  const opened = await openStore(packagePath);
  if ('error' in opened) throw new Error(opened.error);
  return { snapshot: opened.snapshot, library: await scanLibrary() };
}
