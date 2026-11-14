/**
 * Library and document runtime for the Electron main process.
 *
 * The renderer never sees the filesystem. Every document is opened once
 * through `@noteforest/core/node`, held as a single `DocumentStore`, and
 * mutated only through typed commands.
 */

import { constants as fsConstants, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createDocument as createCoreDocument,
  createDocumentCopy,
  executeCommand,
  orderKeysAfter,
  validateDocument,
  type AssetAvailability,
  type Asset,
  type AssetReadResult,
  type Branch,
  type ContentBlock,
  type ContentNode,
  type Document,
  type DocumentCommand,
} from '@noteforest/core';
import {
  backupsDirForPackage,
  breakStaleLock,
  createUniquePackageDir,
  defaultAppSupportDir,
  documentJsonPath,
  assetsDirPath,
  isLockStale,
  materializeDocumentPackage,
  NodeAssetStore,
  NodeDocumentRepository,
  packageTitle,
  pathExists,
  readDocumentLock,
  readRecentDocuments,
  recentManifestPath,
  removeRecentDocument,
  restoreCandidateToPackage,
  writeDocumentPackageCopy,
  writeFileAtomic,
  type DocumentStore,
  type OpenDocumentResult as CoreOpenDocumentResult,
  type RecentDocumentsManifest,
} from '@noteforest/core/node';
import type {
  ApplyResult,
  BackupCandidateView,
  CreateDraftResult,
  CreateLibraryInput,
  DocumentSettingsBackupView,
  DocumentSettingsEntry,
  DocumentSettingsRecoveryResult,
  DocumentSettingsSaveInput,
  DocumentSettingsSaveResult,
  DraftLibraryResult,
  ImportImageBytesInput,
  ImportImageResult,
  LibraryActionResult,
  LibraryView,
  ListBackupsResult,
  LockInfoView,
  MarkdownFileView,
  MaterializeDraftResult,
  OpenDocumentResult,
  OpenDocumentSnapshot,
  RecentLibraryView,
  RecoveryDocumentView,
  ReloadDocumentResult,
  RemoveMissingDocumentResult,
  RestoreBackupResult,
  SaveCopyResult,
  SaveRequestOptions,
  SaveResult,
  SessionState,
  SessionTabState,
  SettingsFileStatus,
  SettingsSaveResult,
  TakeOverLockResult,
  TrashDocumentResult,
  TrashDocumentStatus,
  TrashPreflight,
} from '../shared/api.js';
import {
  DEFAULT_APP_SETTINGS,
  normalizeAppSettings,
  normalizePageSettingsOverride,
  type AppSettings,
} from '@noteforest/layout';
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_SNAP_WIDTH,
} from '../shared/shell.js';
import {
  SETTINGS_SCHEMA_VERSION,
  isRecord,
  migrateSettingsDocument,
  settingsDocumentForWrite,
} from '../shared/settings-file.js';
import type { LegacySessionOverride } from '../shared/document-settings.js';
import {
  findNewestValidDocumentSettingsBackup,
  migrateLegacySessionOverrides,
  preserveCorruptFile,
  readDocumentSettingsFile,
  removeDocumentSettingsEntries,
  resetDocumentSettings,
  restoreDocumentSettingsBackup,
  saveDocumentSettings as applyDocumentSettings,
  writeDocumentSettingsFile,
} from './document-settings.js';
import { saveFailureCode } from './save-error.js';
import { normalizeDocumentViewState } from '../shared/view-state.js';
import { isMarkdownPath, isMarkdownFileName, markdownFileTitle } from '../shared/markdown.js';
import { readMarkdownFile } from './markdown-file.js';
import {
  backupCandidates,
  isPathInside,
  restoreDestinationProblem,
  uniqueRestoreDestination,
} from './backup-restore.js';
import { recoveryDetails, recoveryStatus, recoveryTitle } from './recovery-view.js';
import {
  IMAGE_EXTENSIONS,
  MAX_IMAGE_BYTES,
  SUPPORTED_IMAGE_MIMES,
  imageMimeFromName,
} from '../shared/images.js';
import { readImageDimensions } from './image-dimensions.js';
import { draftIdFromKey, draftKey, isDraftKey } from '../shared/drafts.js';
import {
  duplicateLibraryBasenames,
  libraryBasename,
  normalizeLibraryPath,
  readLibraryRoots,
  removeLibraryRecent,
  replaceLibraryRecent,
  upsertLibraryRecent,
  writeLibraryRoots,
  type LibraryRootEntry,
} from './library-roots.js';

const DEFAULT_SESSION: SessionState = {
  tabs: [],
  activeTab: null,
  sidebarCollapsed: false,
  sidebarWidth: SIDEBAR_SNAP_WIDTH,
  collapsedTopics: {},
  sidebarTab: 'library',
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

function settingsPath(): string {
  return path.join(appSupportDir(), 'settings.json');
}

/**
 * Active library and recents are session/app-support state. The cache is keyed
 * by the seed/support paths so an isolated test environment (or a worktree
 * launch) never reuses another environment's active library.
 */
let activeLibraryCache: string | null | undefined;
let knownLibrariesCache: string[] | null = null;
let knownLibraryCanonicalCache: string[] | null = null;
let libraryRuntimeWarnings: string[] = [];
let libraryCacheKey = '';

function currentLibraryCacheKey(): string {
  return `${libraryDir()}\0${appSupportDir()}`;
}

function ensureLibraryCacheScope(): void {
  const key = currentLibraryCacheKey();
  if (key === libraryCacheKey) return;
  libraryCacheKey = key;
  activeLibraryCache = undefined;
  knownLibrariesCache = null;
  knownLibraryCanonicalCache = null;
  libraryRuntimeWarnings = [];
}

async function pathIsDirectory(target: string): Promise<boolean> {
  try {
    return (await fs.stat(target)).isDirectory();
  } catch {
    return false;
  }
}

async function canonicalLibraryPath(target: string): Promise<string> {
  const resolved = path.resolve(target);
  try {
    return await fs.realpath(resolved);
  } catch {
    const parent = path.dirname(resolved);
    if (parent === resolved) return resolved;
    return path.join(await canonicalLibraryPath(parent), path.basename(resolved));
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : String(error);
}

function dedupeWarnings(warnings: readonly string[]): string[] {
  return [...new Set(warnings)];
}

async function persistActiveLibrary(next: string | null): Promise<void> {
  const session = await readSession();
  if (session.activeLibrary === next) return;
  await writeSession({ ...session, activeLibrary: next });
}

async function addRecentLibrary(
  chosen: string,
  lastOpenedAt: string,
): Promise<LibraryRootEntry[]> {
  const roots = await readLibraryRoots(appSupportDir());
  libraryRuntimeWarnings.push(...roots.warnings);
  const chosenCanonical = await canonicalLibraryPath(chosen);
  const kept: LibraryRootEntry[] = [];
  for (const entry of roots.libraries) {
    if ((await canonicalLibraryPath(entry.path)) === chosenCanonical) continue;
    kept.push(entry);
  }
  const next = upsertLibraryRecent(kept, {
    path: normalizeLibraryPath(chosen),
    lastOpenedAt,
  });
  await writeLibraryRoots(appSupportDir(), next);
  knownLibrariesCache = null;
  knownLibraryCanonicalCache = null;
  return next;
}

/**
 * Resolve the active library from the session. A missing stored library is
 * returned as-is (never recreated). Only a session with no `activeLibrary`
 * field and no recents seeds the default `~/Documents/NoteForest`; an explicit
 * `null` means the user removed the last library and stays empty.
 */
export async function activeLibraryPath(): Promise<string | null> {
  ensureLibraryCacheScope();
  if (activeLibraryCache !== undefined) return activeLibraryCache;

  const session = await readSession();
  if (session.activeLibrary !== undefined) {
    activeLibraryCache =
      session.activeLibrary === null
        ? null
        : normalizeLibraryPath(session.activeLibrary);
    if (activeLibraryCache !== null) {
      const roots = await readLibraryRoots(appSupportDir());
      libraryRuntimeWarnings.push(...roots.warnings);
      const present = roots.libraries.some(
        (entry) => normalizeLibraryPath(entry.path) === activeLibraryCache,
      );
      if (!present) {
        await addRecentLibrary(activeLibraryCache, new Date().toISOString());
      }
    }
    return activeLibraryCache;
  }

  const roots = await readLibraryRoots(appSupportDir());
  libraryRuntimeWarnings.push(...roots.warnings);
  if (roots.libraries.length > 0) {
    activeLibraryCache = roots.libraries[0]?.path ?? null;
    await persistActiveLibrary(activeLibraryCache);
    return activeLibraryCache;
  }

  // First run (or a pre-L2 session with no recents): create the seed/default
  // library once and record it. This is the only path that creates a root.
  const seed = normalizeLibraryPath(libraryDir());
  await fs.mkdir(seed, { recursive: true });
  activeLibraryCache = seed;
  await addRecentLibrary(seed, new Date().toISOString());
  await persistActiveLibrary(seed);
  return seed;
}

async function knownLibraryPaths(): Promise<string[]> {
  ensureLibraryCacheScope();
  if (knownLibrariesCache !== null) return knownLibrariesCache;
  const active = await activeLibraryPath();
  const roots = await readLibraryRoots(appSupportDir());
  libraryRuntimeWarnings.push(...roots.warnings);
  const candidates = [
    ...(active === null ? [] : [active]),
    ...roots.libraries.map((entry) => entry.path),
  ];
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const normalized = normalizeLibraryPath(candidate);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    paths.push(normalized);
  }
  knownLibrariesCache = paths;
  knownLibraryCanonicalCache = null;
  return paths;
}

async function knownLibraryCanonicalPaths(): Promise<string[]> {
  if (knownLibraryCanonicalCache !== null) return knownLibraryCanonicalCache;
  const paths = await knownLibraryPaths();
  const canonical: string[] = [];
  const seen = new Set<string>();
  for (const candidate of paths) {
    const real = await canonicalLibraryPath(candidate);
    if (seen.has(real)) continue;
    seen.add(real);
    canonical.push(real);
  }
  knownLibraryCanonicalCache = canonical;
  return canonical;
}

/** Commands and opens are limited to the active library plus known recents. */
export async function isInsideKnownLibrary(candidate: string): Promise<boolean> {
  if (isDraftKey(candidate)) return false;
  return (await libraryRootForPath(candidate)) !== null;
}

/** The known library root that contains `candidate`, or null. */
export async function libraryRootForPath(candidate: string): Promise<string | null> {
  const real = await canonicalLibraryPath(candidate);
  for (const root of await knownLibraryPaths()) {
    if (isPathInside(await canonicalLibraryPath(root), real)) return root;
  }
  return null;
}

async function recentLibraryViews(active: string | null): Promise<RecentLibraryView[]> {
  const roots = await readLibraryRoots(appSupportDir());
  libraryRuntimeWarnings.push(...roots.warnings);
  const duplicates = duplicateLibraryBasenames(roots.libraries);
  const activeCanonical = active === null ? null : await canonicalLibraryPath(active);
  const views: RecentLibraryView[] = [];
  for (const entry of roots.libraries) {
    const name = libraryBasename(entry.path);
    const missing = !(await pathIsDirectory(entry.path));
    const canonical = await canonicalLibraryPath(entry.path);
    views.push({
      path: entry.path,
      name,
      lastOpenedAt: entry.lastOpenedAt,
      missing,
      active: activeCanonical !== null && canonical === activeCanonical,
      ...(duplicates.has(name) ? { parentPath: path.dirname(entry.path) } : {}),
    });
  }
  return views;
}

async function activateLibraryPath(next: string): Promise<LibraryView> {
  ensureLibraryCacheScope();
  const normalized = normalizeLibraryPath(next);
  activeLibraryCache = normalized;
  knownLibrariesCache = null;
  knownLibraryCanonicalCache = null;
  await addRecentLibrary(normalized, new Date().toISOString());
  await persistActiveLibrary(normalized);
  return scanLibrary(normalized);
}

interface LibraryValidation {
  ok: boolean;
  path?: string;
  message?: string;
}

/**
 * A library root is a real directory, not a document package, and not nested
 * with another known library. `ignorePath` is the missing path being located:
 * it is removed from the known set so its replacement can be validated.
 */
async function validateLibraryRoot(
  candidate: string,
  ignorePath?: string,
): Promise<LibraryValidation> {
  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    return { ok: false, message: 'No folder was chosen.' };
  }
  const resolved = normalizeLibraryPath(candidate);
  if (!(await pathIsDirectory(resolved))) {
    return {
      ok: false,
      message: `That folder does not exist or is not a directory: ${resolved}`,
    };
  }
  try {
    await fs.access(resolved, fsConstants.R_OK);
  } catch {
    return { ok: false, message: `The folder is not readable: ${resolved}` };
  }
  if (await pathExists(documentJsonPath(resolved))) {
    return {
      ok: false,
      message:
        'This is a document, not a library. Choose the folder that contains NoteForest notes.',
    };
  }

  const canonical = await canonicalLibraryPath(resolved);
  const ignoreCanonical =
    ignorePath === undefined ? null : await canonicalLibraryPath(ignorePath);
  for (const root of await knownLibraryPaths()) {
    const rootCanonical = await canonicalLibraryPath(root);
    if (rootCanonical === canonical || rootCanonical === ignoreCanonical) continue;
    if (isPathInside(rootCanonical, canonical)) {
      return {
        ok: false,
        message: `That folder is inside the library “${libraryBasename(root)}”. Choose a folder outside it.`,
      };
    }
    if (isPathInside(canonical, rootCanonical)) {
      return {
        ok: false,
        message: `“${libraryBasename(root)}” is already a library inside that folder. Choose a folder that does not contain another library.`,
      };
    }
  }
  return { ok: true, path: resolved };
}

async function validateNewLibraryTarget(target: string): Promise<LibraryValidation> {
  const parent = path.dirname(target);
  if (!(await pathIsDirectory(parent))) {
    return { ok: false, message: 'Choose a parent folder that exists.' };
  }
  if (await pathExists(target)) {
    return {
      ok: false,
      message: `A folder named “${path.basename(target)}” already exists there.`,
    };
  }
  const canonical = await canonicalLibraryPath(target);
  for (const root of await knownLibraryPaths()) {
    const rootCanonical = await canonicalLibraryPath(root);
    if (isPathInside(rootCanonical, canonical)) {
      return {
        ok: false,
        message: `That folder would be inside the library “${libraryBasename(root)}”. Choose a parent outside it.`,
      };
    }
    if (isPathInside(canonical, rootCanonical)) {
      return {
        ok: false,
        message: `“${libraryBasename(root)}” is already a library inside that parent. Choose another parent.`,
      };
    }
  }
  return { ok: true, path: target };
}

export async function openLibraryPath(candidate: string): Promise<LibraryActionResult> {
  const validation = await validateLibraryRoot(candidate);
  if (!validation.ok || validation.path === undefined) {
    return { ok: false, message: validation.message ?? 'That folder cannot be a library.' };
  }
  const library = await activateLibraryPath(validation.path);
  const reconciliation = library.missing
    ? { tabs: [], recentChanged: false }
    : await reconcileMovedDocuments(validation.path, library.documents);
  const refreshed = reconciliation.tabs.length > 0 || reconciliation.recentChanged;
  return {
    ok: true,
    library: refreshed ? await scanLibrary(validation.path) : library,
    ...(reconciliation.tabs.length === 0 ? {} : { reconciledTabs: reconciliation.tabs }),
  };
}

export async function createLibraryRoot(
  input: CreateLibraryInput,
): Promise<LibraryActionResult> {
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  if (name.length === 0) return { ok: false, message: 'Enter a library name.' };
  if (name === '.' || name === '..' || /[\\/]/.test(name)) {
    return { ok: false, message: 'The library name cannot contain a path separator.' };
  }
  if (typeof input?.parentPath !== 'string' || input.parentPath.trim().length === 0) {
    return { ok: false, message: 'Choose a parent folder.' };
  }
  const target = path.join(normalizeLibraryPath(input.parentPath), name);
  const validation = await validateNewLibraryTarget(target);
  if (!validation.ok || validation.path === undefined) {
    return { ok: false, message: validation.message ?? 'That library cannot be created.' };
  }
  try {
    await fs.mkdir(validation.path);
  } catch (error) {
    return { ok: false, message: `Could not create the library: ${errorMessage(error)}` };
  }
  const library = await activateLibraryPath(validation.path);
  return { ok: true, library };
}

export async function switchLibraryRoot(candidate: string): Promise<LibraryActionResult> {
  const resolved = normalizeLibraryPath(candidate);
  const canonical = await canonicalLibraryPath(resolved);
  let known = false;
  for (const root of await knownLibraryCanonicalPaths()) {
    if (root === canonical) {
      known = true;
      break;
    }
  }
  if (!known) {
    return { ok: false, message: 'That folder is not one of the known libraries.' };
  }
  const library = await activateLibraryPath(resolved);
  const reconciliation = library.missing
    ? { tabs: [], recentChanged: false }
    : await reconcileMovedDocuments(resolved, library.documents);
  const refreshed = reconciliation.tabs.length > 0 || reconciliation.recentChanged;
  return {
    ok: true,
    library: refreshed ? await scanLibrary(resolved) : library,
    ...(reconciliation.tabs.length === 0 ? {} : { reconciledTabs: reconciliation.tabs }),
  };
}

export async function removeRecentLibraryRoot(
  candidate: string,
): Promise<LibraryActionResult> {
  const resolved = normalizeLibraryPath(candidate);
  const roots = await readLibraryRoots(appSupportDir());
  const next = removeLibraryRecent(roots.libraries, resolved);
  await writeLibraryRoots(appSupportDir(), next);
  knownLibrariesCache = null;
  knownLibraryCanonicalCache = null;

  const active = await activeLibraryPath();
  const activeCanonical = active === null ? null : await canonicalLibraryPath(active);
  const removedCanonical = await canonicalLibraryPath(resolved);
  if (activeCanonical !== null && activeCanonical === removedCanonical) {
    const fallback = next[0]?.path ?? null;
    activeLibraryCache = fallback;
    await persistActiveLibrary(fallback);
    knownLibrariesCache = null;
    knownLibraryCanonicalCache = null;
    return { ok: true, library: await scanLibrary(fallback ?? undefined) };
  }
  return { ok: true, library: await scanLibrary(active ?? undefined) };
}

export async function locateLibraryRoot(
  missingPath: string,
  chosenPath: string,
): Promise<LibraryActionResult> {
  const missing = normalizeLibraryPath(missingPath);
  const validation = await validateLibraryRoot(chosenPath, missing);
  if (!validation.ok || validation.path === undefined) {
    return { ok: false, message: validation.message ?? 'That folder cannot be the library.' };
  }
  const chosen = validation.path;
  const roots = await readLibraryRoots(appSupportDir());
  const next = replaceLibraryRecent(roots.libraries, missing, {
    path: chosen,
    lastOpenedAt: new Date().toISOString(),
  });
  await writeLibraryRoots(appSupportDir(), next);

  const active = await activeLibraryPath();
  const activeCanonical = active === null ? null : await canonicalLibraryPath(active);
  const missingCanonical = await canonicalLibraryPath(missing);
  const wasActive = activeCanonical !== null && activeCanonical === missingCanonical;
  if (wasActive) {
    activeLibraryCache = chosen;
    await persistActiveLibrary(chosen);
  }
  knownLibrariesCache = null;
  knownLibraryCanonicalCache = null;

  const scanned = await scanLibrary(chosen);
  const reconciliation = scanned.missing
    ? { tabs: [], recentChanged: false }
    : await reconcileMovedDocuments(chosen, scanned.documents);
  const refreshed = reconciliation.tabs.length > 0 || reconciliation.recentChanged;
  const view = wasActive
    ? refreshed
      ? await scanLibrary(chosen)
      : scanned
    : await scanLibrary(active ?? undefined);
  return {
    ok: true,
    library: view,
    ...(reconciliation.tabs.length === 0 ? {} : { reconciledTabs: reconciliation.tabs }),
  };
}

/**
 * Match missing session tabs and recent-document entries to a scanned document
 * by canonical `document.id`. Legacy path-only entries (no id) stay missing.
 *
 * `recentChanged` tells the caller that the recent-documents manifest was
 * rewritten (a moved recent with no open tab), so the pre-reconciliation
 * `LibraryView` is stale and must be replaced with a fresh scan.
 */
async function reconcileMovedDocuments(
  root: string,
  documents: LibraryView['documents'],
): Promise<{
  tabs: Array<{ from: string; to: string; documentId: string }>;
  recentChanged: boolean;
}> {
  const byId = new Map<string, string>();
  const duplicateIds = new Set<string>();
  for (const document of documents) {
    if (document.status === 'ok' && document.documentId !== null) {
      if (byId.has(document.documentId)) duplicateIds.add(document.documentId);
      else byId.set(document.documentId, document.packagePath);
    }
  }
  // A duplicated document id (Save a copy / Finder duplicate) cannot identify
  // one package: never bind a missing tab or recent to the wrong copy.
  for (const id of duplicateIds) byId.delete(id);
  if (duplicateIds.size > 0) {
    console.warn(
      `[noteforest] left moved documents unresolved for ${duplicateIds.size} duplicated document id(s): ${[...duplicateIds].join(', ')}`,
    );
  }
  if (byId.size === 0) return { tabs: [], recentChanged: false };
  const reconciled: Array<{ from: string; to: string; documentId: string }> = [];
  let recentChanged = false;

  const session = await readSession();
  const tabs: SessionTabState[] = [];
  let sessionChanged = false;
  for (const tab of session.tabs) {
    const documentId = tab.documentId;
    if (documentId === undefined || documentId === null) {
      tabs.push(tab);
      continue;
    }
    if (await pathExists(documentJsonPath(tab.packagePath))) {
      tabs.push(tab);
      continue;
    }
    const next = byId.get(documentId);
    if (next === undefined) {
      tabs.push(tab);
      continue;
    }
    sessionChanged = true;
    reconciled.push({ from: tab.packagePath, to: next, documentId });
    tabs.push({ ...tab, packagePath: next });
  }
  if (sessionChanged) {
    await writeSession({ ...session, tabs });
  }

  try {
    const read = await readRecentDocuments(appSupportDir());
    let manifestChanged = false;
    const items: RecentDocumentsManifest['items'] = [];
    for (const item of read.manifest.items) {
      if (await pathExists(documentJsonPath(item.path))) {
        items.push(item);
        continue;
      }
      const next = byId.get(item.documentId);
      if (next === undefined) {
        items.push(item);
        continue;
      }
      const summary = documents.find((document) => document.packagePath === next);
      manifestChanged = true;
      items.push({
        ...item,
        path: next,
        title: summary?.title ?? item.title,
      });
    }
    if (manifestChanged) {
      recentChanged = true;
      const manifest: RecentDocumentsManifest = {
        version: read.manifest.version,
        items,
      };
      await fs.mkdir(appSupportDir(), { recursive: true });
      await writeFileAtomic(
        recentManifestPath(appSupportDir()),
        `${JSON.stringify(manifest, null, 2)}\n`,
      );
    }
  } catch {
    // Recent-document reconciliation is best-effort; tabs are the primary state.
  }
  void root;
  return { tabs: reconciled, recentChanged };
}

/**
 * Process-wide persistence boundary. It owns the open-store registry; the
 * renderer still talks only to the main process.
 */
const repository = new NodeDocumentRepository({ appSupportDir });

// ---------------------------------------------------------------------------
// Draft sessions (L3)
//
// A draft is a canonical document that exists only in memory: no package
// folder, no lock, and no recent entry. It keeps a stable `draftId`, a stable
// document id, and the library that was active at creation. The first real
// mutation materializes it into a normal package; the tab key/path changes but
// the renderer never remounts its editor.
// ---------------------------------------------------------------------------

interface DraftSession {
  draftId: string;
  document: Document;
  /** Library active at creation. A library switch never retargets it. */
  libraryPath: string;
  /** Real package path after materialization; null while still in memory. */
  materializedPath: string | null;
}

const draftSessions = new Map<string, DraftSession>();

function draftSessionForPath(documentKey: string): DraftSession | null {
  const draftId = draftIdFromKey(documentKey);
  if (draftId === null) return null;
  return draftSessions.get(draftId) ?? null;
}

function draftSnapshot(session: DraftSession): OpenDocumentSnapshot {
  return {
    packagePath: draftKey(session.draftId),
    document: session.document,
    status: 'editable',
    assetAvailability: [],
    errors: [],
    warnings: [],
  };
}

/** Open a new in-memory draft bound to the active library. Writes nothing. */
export async function createDraftSession(): Promise<CreateDraftResult> {
  const directory = await activeLibraryPath();
  if (directory === null || directory.length === 0) {
    return { ok: false, message: 'No library is open. Open a folder as a library first.' };
  }
  if (!(await pathIsDirectory(directory))) {
    return {
      ok: false,
      message: `The active library was not found: ${directory}. Locate it or open another library.`,
    };
  }

  let document = createCoreDocument({ title: 'Untitled', chapterTitle: 'Chapter 1' });
  const chapterId = document.chapters[0]?.id;
  if (chapterId !== undefined) {
    const block = executeCommand(document, {
      type: 'block.create',
      // Match the editor's empty-body projection. Without this, the mount-time
      // normalization would be committed as a "first edit" and materialize an
      // untouched draft on close/quit.
      content: { type: 'doc', children: [{ type: 'paragraph' }] },
      placement: { kind: 'top-level', chapterId },
    });
    if (!block.ok) {
      return { ok: false, message: `Could not create the draft: ${block.message}` };
    }
    document = block.document;
  }

  const draftId = crypto.randomUUID();
  const session: DraftSession = {
    draftId,
    document,
    libraryPath: directory,
    materializedPath: null,
  };
  draftSessions.set(draftId, session);
  return {
    ok: true,
    draft: {
      draftId,
      libraryPath: directory,
      snapshot: draftSnapshot(session),
    },
  };
}

type DraftMaterializeFailure = {
  ok: false;
  code: 'library-missing' | 'locked' | 'not-found' | 'unknown';
  message: string;
};

/**
 * Write one draft into a real package. Idempotent: a draft that already
 * materialized returns its path. The package folder is allocated by the
 * existing title rules, the lock is acquired with `breakStale: true` (the
 * folder was just created by this call, so only a stale/corrupt lock can exist
 * there; a live lock still fails), `document.json` is written atomically, and
 * the recent list is updated by the core writer.
 */
async function ensureDraftMaterialized(
  session: DraftSession,
): Promise<{ ok: true; packagePath: string } | DraftMaterializeFailure> {
  if (session.materializedPath !== null) {
    return { ok: true, packagePath: session.materializedPath };
  }
  if (!(await pathIsDirectory(session.libraryPath))) {
    return {
      ok: false,
      code: 'library-missing',
      message: `The library this note was created in is not available: ${session.libraryPath}. Reconnect it or choose another library, then retry.`,
    };
  }
  const created = await materializeDocumentPackage(session.libraryPath, session.document, {
    appSupportDir: appSupportDir(),
    registerRecent: true,
  });
  if (!created.ok) {
    if (
      created.error.code === 'document-locked' ||
      created.error.code === 'stale-lock'
    ) {
      return {
        ok: false,
        code: 'locked',
        message:
          'The note folder is locked by another NoteForest session. Close the other NoteForest window and try again.',
      };
    }
    return { ok: false, code: 'unknown', message: created.error.message };
  }
  repository.adopt(created.store);
  session.materializedPath = created.packagePath;
  session.document = created.document;
  return { ok: true, packagePath: created.packagePath };
}

/** Materialize one draft on demand (explicit IPC); never remounts the editor. */
export async function materializeDraftSession(
  documentKey: string,
): Promise<MaterializeDraftResult> {
  const session = draftSessionForPath(documentKey);
  if (session === null) {
    return {
      ok: false,
      code: 'not-found',
      message: 'This draft is no longer open. Create a new note and try again.',
    };
  }
  const target = await ensureDraftMaterialized(session);
  if (!target.ok) return target;
  return {
    ok: true,
    packagePath: target.packagePath,
    library: await scanLibrary(),
  };
}

/** Materialize a draft before an operation that needs real package bytes. */
async function materializedTargetPath(
  documentKey: string,
): Promise<{ ok: true; packagePath: string } | { ok: false; message: string }> {
  const draft = draftSessionForPath(documentKey);
  if (draft === null) return { ok: true, packagePath: documentKey };
  const target = await ensureDraftMaterialized(draft);
  return target.ok ? { ok: true, packagePath: target.packagePath } : { ok: false, message: target.message };
}

/**
 * Rebind a draft whose creation library is missing to a library the user
 * chooses now. The library is validated and activated through the normal
 * library paths, then the draft retries materialization into it.
 */
export async function chooseDraftLibrary(
  documentKey: string,
  chosenPath: string,
): Promise<DraftLibraryResult> {
  const session = draftSessionForPath(documentKey);
  if (session === null) {
    return { ok: false, message: 'This draft is no longer open.' };
  }
  const validation = await validateLibraryRoot(chosenPath);
  if (!validation.ok || validation.path === undefined) {
    return { ok: false, message: validation.message ?? 'That folder cannot be a library.' };
  }
  session.libraryPath = validation.path;
  const library = await activateLibraryPath(validation.path);
  return { ok: true, libraryPath: validation.path, library };
}

/** Discard one draft session; a materialized draft's store is closed. */
async function discardDraftSession(documentKey: string): Promise<void> {
  const session = draftSessionForPath(documentKey);
  if (session === null) return;
  draftSessions.delete(session.draftId);
  if (session.materializedPath !== null) {
    await repository.close(session.materializedPath, { save: false });
  }
}

/** Close/quit: drop every in-memory draft; materialized stores close too. */
export async function discardAllDraftSessions(): Promise<void> {
  const sessions = [...draftSessions.values()];
  draftSessions.clear();
  for (const session of sessions) {
    if (session.materializedPath !== null) {
      await repository.close(session.materializedPath, { save: false });
    }
  }
}

/** Test/diagnostic view of the in-memory drafts (no renderer exposure). */
export function draftSessionPaths(): Array<{
  draftId: string;
  documentKey: string;
  packagePath: string | null;
  libraryPath: string;
}> {
  return [...draftSessions.values()].map((session) => ({
    draftId: session.draftId,
    documentKey: draftKey(session.draftId),
    packagePath: session.materializedPath,
    libraryPath: session.libraryPath,
  }));
}

function lockInfoView(store: DocumentStore): LockInfoView | undefined {
  const info = store.lockInfo;
  if (info === undefined) return undefined;
  return {
    pid: info.record?.pid ?? null,
    host: info.record?.host ?? null,
    sessionId: info.record?.sessionId ?? null,
    acquiredAt: info.record?.acquiredAt ?? null,
    heartbeatAt: info.record?.heartbeatAt ?? null,
    corrupt: info.corrupt,
  };
}

/**
 * Session availability for every asset record. A record whose MIME is not an
 * allowed image type is reported as unavailable (`asset-missing` with an
 * `unsupported-mime` detail) so a crafted document cannot make a non-image
 * response part of the health/export path.
 */
async function assetAvailabilityFor(store: DocumentStore): Promise<AssetAvailability[]> {
  const document = store.document;
  if (document === null) return [];
  const entries: AssetAvailability[] = [];
  for (const asset of Object.values(document.assets)) {
    if (!SUPPORTED_IMAGE_MIMES.has(asset.mime)) {
      entries.push({
        id: asset.id,
        state: 'asset-missing',
        detail: 'unsupported-mime',
        message: `asset ${asset.id} has an unsupported MIME type`,
      });
      continue;
    }
    entries.push(await store.assets.availability(asset.id));
  }
  return entries;
}

async function snapshot(store: DocumentStore): Promise<OpenDocumentSnapshot | null> {
  if (store.document === null) return null;
  const lock = lockInfoView(store);
  return {
    packagePath: store.packagePath,
    document: store.document,
    status: store.readOnly ? 'read-only' : 'editable',
    ...(store.readOnlyReason === undefined ? {} : { readOnlyReason: store.readOnlyReason }),
    ...(lock === undefined ? {} : { lock }),
    assetAvailability: await assetAvailabilityFor(store),
    errors: store.errors.map((error) => error.message),
    warnings: store.warnings.map((warning) => warning.message),
  };
}

/**
 * Root-level `.md` guest files for the Library list. These are ordinary files,
 * not packages: no `document.json` is read and a missing/unreadable file is a
 * file problem, never a "broken note".
 */
async function listRootMarkdownFiles(
  directory: string,
  warnings: string[],
): Promise<LibraryView['documents']> {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    warnings.push(`Could not read the library: ${errorMessage(error)}`);
    return [];
  }
  const rows: LibraryView['documents'] = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith('.') || !isMarkdownFileName(entry.name)) {
      continue;
    }
    const filePath = path.join(directory, entry.name);
    let updatedAt = new Date().toISOString();
    let status: 'ok' | 'unreadable' = 'ok';
    let reason: string | undefined;
    try {
      updatedAt = (await fs.stat(filePath)).mtime.toISOString();
    } catch (error) {
      status = 'unreadable';
      reason = `could not read this Markdown file: ${errorMessage(error)}`;
    }
    rows.push({
      packagePath: filePath,
      title: entry.name,
      kind: 'markdown',
      status,
      ...(reason === undefined ? {} : { reason }),
      documentId: null,
      revision: null,
      updatedAt,
      blockCount: 0,
      chapterCount: 0,
    });
  }
  return rows;
}

export async function scanLibrary(root?: string): Promise<LibraryView> {
  ensureLibraryCacheScope();
  const active = await activeLibraryPath();
  const directory = root === undefined ? active : normalizeLibraryPath(root);
  const support = appSupportDir();
  const libraries = await recentLibraryViews(active);
  const warnings: string[] = [...libraryRuntimeWarnings];

  if (directory === null || directory.length === 0) {
    return {
      libraryPath: '',
      libraryName: 'Library',
      appSupportPath: support,
      documents: [],
      recent: [],
      libraries,
      missing: false,
      warnings: dedupeWarnings(warnings),
    };
  }

  let documents: LibraryView['documents'] = [];
  let missing = false;
  if (!(await pathIsDirectory(directory))) {
    missing = true;
    warnings.push(`Library not found: ${directory}`);
  } else {
    try {
      const listing = await repository.list(directory);
      const markdown = await listRootMarkdownFiles(directory, warnings);
      documents = [...listing.documents, ...markdown].sort((left, right) => {
        const byUpdatedAt = right.updatedAt.localeCompare(left.updatedAt);
        return byUpdatedAt !== 0 ? byUpdatedAt : left.title.localeCompare(right.title);
      });
      warnings.push(...listing.warnings);
    } catch (error) {
      warnings.push(`Could not scan the library: ${errorMessage(error)}`);
    }
  }

  let recent: LibraryView['recent'] = [];
  try {
    const read = await readRecentDocuments(support);
    warnings.push(...read.warnings);
    recent = await Promise.all(
      read.manifest.items.map(async (item) => {
        const packagePath = path.resolve(item.path);
        let itemMissing = false;
        try {
          await fs.access(documentJsonPath(packagePath));
        } catch {
          itemMissing = true;
        }
        return {
          documentId: item.documentId,
          title: item.title,
          packagePath,
          lastOpenedAt: item.lastOpenedAt,
          ...(itemMissing ? { missing: true } : {}),
        };
      }),
    );
  } catch (error) {
    warnings.push(`Could not read recent documents: ${errorMessage(error)}`);
  }

  return {
    libraryPath: directory,
    libraryName: libraryBasename(directory),
    appSupportPath: support,
    documents,
    recent,
    libraries,
    missing,
    warnings: dedupeWarnings(warnings),
  };
}

export interface OpenedStore {
  store: DocumentStore;
  snapshot: OpenDocumentSnapshot;
}

export interface OpenedRecovery {
  recovery: RecoveryDocumentView;
}

export type OpenStoreResult = OpenedStore | OpenedRecovery | { error: string };

/**
 * Build the renderer-safe recovery view for a package whose `document.json`
 * did not parse. The package store is already read-only and holds no document;
 * nothing here writes to the package.
 */
async function recoveryViewFromOpen(
  result: CoreOpenDocumentResult,
): Promise<RecoveryDocumentView> {
  const status = recoveryStatus(result.readOnlyReason);
  let rawText: string | null = null;
  try {
    rawText = await fs.readFile(documentJsonPath(result.packagePath), 'utf8');
  } catch {
    // Missing/unreadable file: the folder-name fallback is the title.
  }
  const reason =
    result.errors[0]?.message ??
    (status === 'missing'
      ? 'This folder has no document.json.'
      : 'The document could not be opened.');
  return {
    recovery: true,
    packagePath: result.packagePath,
    title: recoveryTitle(result.packagePath, rawText),
    status,
    reason,
    details: recoveryDetails(result.errors),
    warnings: result.warnings.map((warning) => warning.message),
  };
}

function recoveryViewForError(packagePath: string, message: string): RecoveryDocumentView {
  return {
    recovery: true,
    packagePath,
    title: recoveryTitle(packagePath, null),
    status: 'unreadable',
    reason: message,
    details: [message],
    warnings: [],
  };
}

export async function openStore(packagePath: string): Promise<OpenStoreResult> {
  if (isDraftKey(packagePath)) {
    const draft = draftSessionForPath(packagePath);
    if (draft === null) return { error: 'This draft is no longer open.' };
    // A draft has no package to open; callers that need a real store must
    // materialize first (apply/save/import do this themselves).
    return { error: 'The note is still a draft and has no package folder yet.' };
  }
  const resolved = path.resolve(packagePath);
  if (!(await isInsideKnownLibrary(resolved))) {
    return { error: 'Document is outside the known NoteForest libraries.' };
  }
  const existing = repository.get(resolved);
  if (existing !== null) {
    const current = await snapshot(existing);
    if (current !== null) return { store: existing, snapshot: current };
  }

  const result = await repository.open(resolved, { registerRecent: true });
  if (result.document === null) {
    // Recovery-only stores are closed by the repository: they have no
    // document, no lock, and no writable path.
    return { recovery: await recoveryViewFromOpen(result) };
  }
  const current = await snapshot(result.store);
  if (current === null) {
    return { recovery: await recoveryViewFromOpen(result) };
  }
  return { store: result.store, snapshot: current };
}

export async function openDocument(packagePath: string): Promise<OpenDocumentResult> {
  const opened = await openStore(packagePath);
  if ('error' in opened) {
    return { ok: false, message: opened.error, packagePath };
  }
  if ('recovery' in opened) return opened.recovery;
  return opened.snapshot;
}

/**
 * Explicit stale-lock takeover, reachable only from the read-only banner's
 * "Take over lock" action. It never runs as part of a normal open:
 * `breakStaleLock` refuses a live lock, so a current writable session can
 * never be stolen by a delayed heartbeat.
 */
export async function takeOverStaleLock(
  packagePath: string,
): Promise<TakeOverLockResult> {
  if (typeof packagePath !== 'string' || packagePath.length === 0) {
    return { ok: false, code: 'unknown', message: 'No document path was provided.' };
  }
  const resolved = path.resolve(packagePath);
  if (!(await isInsideKnownLibrary(resolved))) {
    return { ok: false, code: 'unknown', message: 'Document is outside the known NoteForest libraries.' };
  }

  const existing = repository.get(resolved);
  if (existing !== null) {
    const current = await snapshot(existing);
    if (current !== null && !existing.readOnly) return { ok: true, snapshot: current };
    await repository.close(resolved);
  }

  const broken = await breakStaleLock(resolved, { appSupportDir: appSupportDir() });
  if (!broken.ok && broken.reason !== 'missing') {
    if (broken.reason === 'locked') {
      return {
        ok: false,
        code: 'locked',
        message:
          'The lock is live: another NoteForest session is writing this document. Taking over is not allowed while its heartbeat is current.',
      };
    }
    if (broken.reason === 'io-error') {
      return {
        ok: false,
        code: 'unknown',
        message: `Could not remove the stale lock: ${broken.message ?? 'filesystem error'}`,
      };
    }
  }

  const opened = await repository.open(resolved, { registerRecent: true });
  if (opened.document === null) {
    return {
      ok: false,
      code: 'read-only',
      message: opened.errors[0]?.message ?? 'The document could not be opened after taking over the lock.',
    };
  }
  if (opened.status !== 'editable') {
    await repository.close(resolved);
    return {
      ok: false,
      code: 'read-only',
      message:
        'The document is still read-only. Another session may have acquired the lock before the takeover completed; reopen the document to inspect it.',
    };
  }
  const current = await snapshot(opened.store);
  if (current === null) {
    await repository.close(resolved);
    return { ok: false, code: 'unknown', message: 'The reopened document has no snapshot.' };
  }
  return { ok: true, snapshot: current };
}

export async function createDocument(input: { title?: string }): Promise<{
  ok: true;
  snapshot: OpenDocumentSnapshot;
  library: LibraryView;
} | { ok: false; message: string }> {
  const directory = await activeLibraryPath();
  if (directory === null || directory.length === 0) {
    return {
      ok: false,
      message: 'No library is open. Open a folder as a library first.',
    };
  }
  if (!(await pathIsDirectory(directory))) {
    return {
      ok: false,
      message: `The active library was not found: ${directory}. Locate it or open another library.`,
    };
  }
  const title = input.title?.trim() || 'Untitled';
  const created = await repository.create(directory, { title });
  if (!created.ok) {
    // A live lock on the freshly allocated folder name is a session collision,
    // not a filesystem detail: never surface the raw lock path/message.
    if (
      created.error.code === 'document-locked' ||
      created.error.code === 'stale-lock'
    ) {
      return {
        ok: false,
        message:
          'The note folder is locked by another NoteForest session. Close the other NoteForest window and try again.',
      };
    }
    return { ok: false, message: created.error.message };
  }
  const chapterId = created.document.chapters[0]?.id;
  if (chapterId !== undefined) {
    const block = created.store.apply({
      type: 'block.create',
      placement: { kind: 'top-level', chapterId },
    });
    if (!block.ok) {
      await repository.close(created.packagePath);
      return { ok: false, message: `Could not create the first block: ${block.message}` };
    }
    await repository.save(created.packagePath);
  }
  const current = await snapshot(created.store);
  if (current === null) return { ok: false, message: 'The new document could not be opened.' };
  return { ok: true, snapshot: current, library: await scanLibrary() };
}

export async function applyCommand(
  packagePath: string,
  command: DocumentCommand,
): Promise<ApplyResult> {
  // A draft has no store. Any real command materializes the package first; the
  // result carries the new path so the renderer can swap its tab key without
  // remounting the editor.
  const draft = draftSessionForPath(packagePath);
  if (draft !== null) {
    const target = await ensureDraftMaterialized(draft);
    if (!target.ok) {
      return { ok: false, message: target.message, code: target.code };
    }
    const result = await applyCommand(target.packagePath, command);
    return { ...result, packagePath: target.packagePath };
  }
  const opened = await openStore(packagePath);
  if ('error' in opened) return { ok: false, message: opened.error, code: 'not-found' };
  if ('recovery' in opened) {
    return { ok: false, message: opened.recovery.reason, code: 'read-only' };
  }
  const result = opened.store.apply(command);
  if (!result.ok) {
    return { ok: false, message: result.message, code: result.code };
  }
  const affectedAssetIds = result.affected.assetIds;
  // A command that adds/removes a record invalidates the cached availability
  // decision for that id. Verified bytes stay trusted (the file is content
  // addressed), so an import is not hashed twice in one session.
  for (const id of affectedAssetIds) opened.store.assets.invalidateAvailability(id);
  const assetAvailability =
    affectedAssetIds.length === 0
      ? undefined
      : await Promise.all(
          affectedAssetIds.map(async (id) => {
            const asset = result.document.assets[id];
            if (asset === undefined) {
              return {
                id,
                state: 'asset-missing' as const,
                detail: 'record-missing' as const,
                message: `asset record ${id} is missing`,
              };
            }
            if (!SUPPORTED_IMAGE_MIMES.has(asset.mime)) {
              return {
                id,
                state: 'asset-missing' as const,
                detail: 'unsupported-mime' as const,
                message: `asset ${id} has an unsupported MIME type`,
              };
            }
            return opened.store.assets.availability(id);
          }),
        );
  return {
    ok: true,
    document: result.document,
    revision: result.revision,
    created: result.created,
    inverse: result.inverse,
    ...(assetAvailability === undefined ? {} : { assetAvailability }),
  };
}

export async function importImageFile(
  packagePath: string,
  filePath: string,
): Promise<ImportImageResult> {
  const target = await materializedTargetPath(packagePath);
  if (!target.ok) return { ok: false, message: target.message };
  packagePath = target.packagePath;
  const opened = await openStore(packagePath);
  if ('error' in opened) return { ok: false, message: opened.error };
  if ('recovery' in opened) return { ok: false, message: opened.recovery.reason };
  const store = opened.store;
  if (store.document === null) return { ok: false, message: 'The document is not open.' };
  if (store.readOnly) {
    return { ok: false, message: 'This document is open read-only; the image was not copied.' };
  }

  const mime = imageMimeFromName(filePath);
  if (mime === undefined) {
    return { ok: false, message: 'That file type is not a supported image.' };
  }
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch (error) {
    return {
      ok: false,
      message: `Could not read the image: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!stat.isFile()) return { ok: false, message: 'The selected path is not a file.' };
  if (stat.size === 0) return { ok: false, message: 'The selected image is empty.' };
  if (stat.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      message: `That image is larger than ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB.`,
    };
  }

  let bytes: Uint8Array;
  try {
    bytes = await fs.readFile(filePath);
  } catch (error) {
    return {
      ok: false,
      message: `Could not read the image: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const inserted = await store.assets.insert({
    bytes,
    mime,
    originalName: path.basename(filePath),
    // Native-picker images must carry intrinsic dimensions: M4 layout/PDF
    // never falls back to the 220×120 estimator once the header is readable.
    ...(readImageDimensions(bytes) ?? {}),
  });
  if (!inserted.ok) return { ok: false, message: inserted.error.message };
  return { ok: true, asset: inserted.asset };
}

function parseOptionalDimension(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

export async function importImageBytes(
  packagePath: string,
  input: ImportImageBytesInput,
): Promise<ImportImageResult> {
  const target = await materializedTargetPath(packagePath);
  if (!target.ok) return { ok: false, message: target.message };
  packagePath = target.packagePath;
  const opened = await openStore(packagePath);
  if ('error' in opened) return { ok: false, message: opened.error };
  if ('recovery' in opened) return { ok: false, message: opened.recovery.reason };
  const store = opened.store;
  if (store.document === null) return { ok: false, message: 'The document is not open.' };
  if (store.readOnly) {
    return { ok: false, message: 'This document is open read-only; the image was not copied.' };
  }

  const rawBytes: unknown = input?.bytes;
  const bytes =
    rawBytes instanceof Uint8Array
      ? rawBytes
      : rawBytes instanceof ArrayBuffer
        ? new Uint8Array(rawBytes)
        : null;
  if (bytes === null) return { ok: false, message: 'No image bytes were provided.' };
  if (bytes.byteLength === 0) return { ok: false, message: 'The image is empty.' };
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      message: `That image is larger than ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB.`,
    };
  }
  const mime = typeof input.mime === 'string' ? input.mime : '';
  if (!SUPPORTED_IMAGE_MIMES.has(mime)) {
    return { ok: false, message: 'That file type is not a supported image.' };
  }
  const originalName =
    typeof input.originalName === 'string' && input.originalName.length > 0
      ? path.basename(input.originalName)
      : undefined;
  const width = parseOptionalDimension(input.width);
  const height = parseOptionalDimension(input.height);
  // Paste/drop normally supplies renderer-measured dimensions. When it cannot
  // (for example a format `createImageBitmap` refuses), decode the header here
  // so the canonical asset still has usable intrinsic dimensions.
  const decoded = width === undefined || height === undefined ? readImageDimensions(bytes) : null;
  const finalWidth = width ?? decoded?.width;
  const finalHeight = height ?? decoded?.height;
  const alt = typeof input.alt === 'string' ? input.alt : undefined;
  const inserted = await store.assets.insert({
    bytes,
    mime,
    ...(originalName === undefined ? {} : { originalName }),
    ...(finalWidth === undefined ? {} : { width: finalWidth }),
    ...(finalHeight === undefined ? {} : { height: finalHeight }),
    ...(alt === undefined ? {} : { alt }),
  });
  if (!inserted.ok) return { ok: false, message: inserted.error.message };
  return { ok: true, asset: inserted.asset };
}

function imageRecordOf(document: Document | null, assetId: string): Asset | null {
  if (document === null) return null;
  const record = Object.hasOwn(document.assets, assetId) ? document.assets[assetId] : undefined;
  return record === undefined || record.id !== assetId ? null : record;
}

/**
 * Copy one content-addressed image from a source package into the destination
 * package. This is the cross-document clipboard path: the source package only
 * has to be open (or readable) so its verified bytes can be reused; the
 * renderer then records the returned canonical asset with `asset.add`.
 *
 * The id is the SHA-256 of the bytes, so deduplication is automatic when the
 * destination already holds the same image. Missing, changed, or non-image
 * source bytes return a typed failure; the destination is never modified.
 */
export async function copyImageAsset(
  sourcePackagePath: string,
  targetPackagePath: string,
  assetId: string,
): Promise<ImportImageResult> {
  if (!/^[0-9a-f]{64}$/.test(assetId)) {
    return { ok: false, message: 'The copied image asset id is malformed.' };
  }
  const materialized = await materializedTargetPath(targetPackagePath);
  if (!materialized.ok) return { ok: false, message: materialized.message };
  targetPackagePath = materialized.packagePath;
  const source = path.resolve(sourcePackagePath);
  if (!(await isInsideKnownLibrary(source)) || isDraftKey(sourcePackagePath)) {
    return { ok: false, message: 'The source document is outside the known NoteForest libraries.' };
  }
  if (source === path.resolve(targetPackagePath)) {
    return { ok: false, message: 'The source and destination documents are the same.' };
  }

  // Prefer the open canonical document; fall back to a read-only validation so
  // a closed source tab can still paste from its package without taking a lock.
  const openSource = repository.get(source);
  let sourceDocument: Document | null = openSource?.document ?? null;
  if (sourceDocument === null) {
    const validated = await repository.validate(source);
    if (!validated.ok || validated.document === undefined) {
      return {
        ok: false,
        message: `The source document could not be read: ${
          validated.ok ? 'no document' : validated.error.message
        }`,
      };
    }
    sourceDocument = validated.document;
  }
  const record = imageRecordOf(sourceDocument, assetId);
  if (record === null) {
    return { ok: false, message: 'The copied image is no longer in the source document.' };
  }
  if (!SUPPORTED_IMAGE_MIMES.has(record.mime)) {
    return { ok: false, message: 'The copied asset is not an allowed image type.' };
  }

  const opened = await openStore(targetPackagePath);
  if ('error' in opened) return { ok: false, message: opened.error };
  if ('recovery' in opened) return { ok: false, message: opened.recovery.reason };
  const target = opened.store;
  if (target.document === null) return { ok: false, message: 'The document is not open.' };
  if (target.readOnly) {
    return { ok: false, message: 'This document is open read-only; the image was not copied.' };
  }

  const sourceAssets = new NodeAssetStore({
    packagePath: source,
    assetRecord: (id) => {
      const value = Object.hasOwn(sourceDocument?.assets ?? {}, id)
        ? sourceDocument?.assets[id]
        : undefined;
      return value;
    },
  });
  const read = await sourceAssets.readVerified(assetId);
  if (!read.ok) {
    return {
      ok: false,
      message:
        read.reason === 'changed'
          ? 'The source image changed; it was not copied.'
          : 'The source image bytes are missing; it was not copied.',
    };
  }
  const inserted = await target.assets.insert({
    bytes: read.bytes,
    mime: record.mime,
    ...(record.originalName === undefined ? {} : { originalName: record.originalName }),
    ...(record.width === undefined ? {} : { width: record.width }),
    ...(record.height === undefined ? {} : { height: record.height }),
  });
  if (!inserted.ok) return { ok: false, message: inserted.error.message };
  return { ok: true, asset: inserted.asset };
}

export type OpenAssetFailureReason = 'asset-missing' | 'asset-changed' | 'asset-unsupported';

export type OpenAssetResolution =
  | { ok: true; id: string; mime: string; bytes: Uint8Array }
  | { ok: false; id: string; reason: OpenAssetFailureReason; message: string };

/** Minimal store shape needed to resolve one image asset; testable without IPC. */
export interface AssetResolutionStore {
  readonly packagePath: string;
  readonly assetsPath: string;
  readonly document: Document | null;
  readonly assets: { readVerified(id: string): Promise<AssetReadResult> };
}

function assetMissing(id: string, message: string): OpenAssetResolution {
  return { ok: false, id, reason: 'asset-missing', message };
}

/**
 * Resolve and serve one content-addressed image from a specific package.
 *
 * The record must exist, its MIME must be an allowed image type, and the file
 * must stay inside a real (non-symlinked-out) `assets/` directory. Bytes come
 * from the verified read: a missing file or SHA-256 mismatch returns a typed
 * failure and never falls back to the changed bytes.
 */
export async function resolveStoreAsset(
  store: AssetResolutionStore,
  id: string,
): Promise<OpenAssetResolution> {
  if (!/^[0-9a-f]{64}$/.test(id)) return assetMissing(id, 'asset id is malformed');
  const document = store.document;
  if (document === null) return assetMissing(id, 'no document is open');
  const asset = document.assets[id];
  if (asset === undefined || asset.id !== id) {
    return assetMissing(id, `asset record ${id} is missing`);
  }
  if (!SUPPORTED_IMAGE_MIMES.has(asset.mime)) {
    return {
      ok: false,
      id,
      reason: 'asset-unsupported',
      message: `asset ${id} is not an allowed image type`,
    };
  }
  const lexicalPath = resolvePackageAssetPath(store.packagePath, store.assetsPath, asset.path);
  if (lexicalPath === null) return assetMissing(id, `asset ${id} has an invalid path`);
  // Content-addressed ids name exactly one file. A crafted record cannot map a
  // hash id to a different file inside the same assets directory.
  if (lexicalPath !== path.join(path.resolve(store.assetsPath), id)) {
    return assetMissing(id, `asset ${id} does not resolve to its content address`);
  }

  // Lexical containment is not enough: an `assets/` directory symlink can move
  // the root outside the package. Resolve both roots and the final file before
  // reading. This narrows (but cannot remove) the lstat/read TOCTOU window.
  const packageRoot = await fs.realpath(store.packagePath).catch(() => null);
  const assetsRoot = await fs.realpath(store.assetsPath).catch(() => null);
  if (packageRoot === null || assetsRoot === null || !isPathInside(packageRoot, assetsRoot)) {
    return assetMissing(id, `asset ${id} resolves outside the package`);
  }
  const fileRealPath = await fs.realpath(lexicalPath).catch(() => null);
  if (fileRealPath === null || !isPathInside(assetsRoot, fileRealPath)) {
    return assetMissing(id, `asset ${id} resolves outside the assets directory`);
  }
  try {
    const stat = await fs.lstat(lexicalPath);
    if (!stat.isFile()) return assetMissing(id, `asset ${id} is not a regular file`);
  } catch {
    return assetMissing(id, `asset ${id} is missing`);
  }

  const read = await store.assets.readVerified(id);
  if (!read.ok) {
    if (read.reason === 'changed') {
      return { ok: false, id, reason: 'asset-changed', message: read.message };
    }
    return assetMissing(id, read.message);
  }
  return { ok: true, id, mime: asset.mime, bytes: read.bytes };
}

/**
 * Resolve one content-addressed id against the open document packages. The
 * renderer's custom-protocol requests can only read an asset that a live
 * document actually records, and only from that package's `assets/` tree.
 */
export async function resolveOpenAsset(id: string): Promise<OpenAssetResolution> {
  if (!/^[0-9a-f]{64}$/.test(id)) return assetMissing(id, 'asset id is malformed');
  let firstFailure: OpenAssetResolution | null = null;
  for (const store of repository.openStores()) {
    const asset = store.document?.assets[id];
    if (asset === undefined || asset.id !== id) continue;
    const resolved = await resolveStoreAsset(store, id);
    if (resolved.ok) return resolved;
    firstFailure ??= resolved;
  }
  return firstFailure ?? assetMissing(id, `asset record ${id} is missing`);
}

/**
 * Lexical containment check for one recorded asset path. `path.resolve` makes
 * absolute paths, `..` segments, and drive-letter paths impossible to smuggle
 * past the `assets/` root; the caller still checks the file type and rejects
 * symlinks with `lstat`.
 */
export function resolvePackageAssetPath(
  packagePath: string,
  assetsPath: string,
  assetPath: unknown,
): string | null {
  if (typeof assetPath !== 'string' || assetPath.length === 0) return null;
  const assetsRoot = path.resolve(assetsPath);
  const filePath = path.resolve(packagePath, assetPath);
  const relative = path.relative(assetsRoot, filePath);
  if (relative.length === 0 || relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return filePath;
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
  // An untouched draft is never written: a plain save (⌘S or a clean flush)
  // succeeds with no change. A dirty draft materializes before the write in the
  // renderer; this branch only forwards a materialized draft.
  const draft = draftSessionForPath(packagePath);
  if (draft !== null) {
    if (draft.materializedPath === null) {
      return { ok: true, changed: false, revision: draft.document.revision };
    }
    const saved = await saveDocument(draft.materializedPath, options);
    return saved.ok ? { ...saved, packagePath: draft.materializedPath } : saved;
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
  if ('recovery' in opened) {
    return {
      ok: false,
      changed: false,
      revision: 0,
      code: opened.recovery.status === 'newer-schema' ? 'read-only' : 'not-found',
      error: opened.recovery.reason,
    };
  }
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
  const result = await repository.save(
    opened.store.packagePath,
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
 *
 * The copy is a **new document** (ADR-0009): a fresh canonical id, the
 * destination package name as its title, copy-time timestamps, and revision 1.
 * Content, anchors, branches, and assets are preserved; per-document Page
 * settings are keyed by document id, so the copy starts on the global layer.
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
  if ('recovery' in opened) return { ok: false, message: opened.recovery.reason };
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
    document: createDocumentCopy(document, { title: path.basename(target) }),
  });
  if (!copied.ok) return { ok: false, message: copied.error.message };

  // Opening is only possible inside a known library; a copy saved elsewhere is
  // revealed in Finder by the caller instead.
  if (await isInsideKnownLibrary(copied.packagePath)) {
    const copy = await openStore(copied.packagePath);
    if (!('error' in copy) && !('recovery' in copy)) {
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
 * List the rotating backups for one document, newest first. Read-only: the
 * package and the backup files are never modified. Invalid backups stay in the
 * list so the renderer can disable them with a reason.
 */
export async function listBackups(packagePath: string): Promise<ListBackupsResult> {
  if (typeof packagePath !== 'string' || packagePath.length === 0) {
    return { ok: false, message: 'No document path was provided.' };
  }
  const resolved = path.resolve(packagePath);
  if (!(await isInsideKnownLibrary(resolved))) {
    return { ok: false, message: 'Document is outside the known NoteForest libraries.' };
  }
  try {
    const candidates = await repository.listBackups(resolved);
    return { ok: true, backups: backupCandidates(candidates) };
  } catch (error) {
    return {
      ok: false,
      message: `Could not list backups: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function findValidBackup(
  packagePath: string,
  sourcePath: string,
): Promise<BackupCandidateView | null> {
  const listing = await listBackups(packagePath);
  if (!listing.ok) return null;
  const resolvedSource = path.resolve(sourcePath);
  return (
    listing.backups.find(
      (backup) => backup.valid && path.resolve(backup.sourcePath) === resolvedSource,
    ) ?? null
  );
}

/** Unique default copy name: `<library>/<folder> restored <timestamp>`. */
export async function defaultRestoreDestination(packagePath: string): Promise<string> {
  const root = (await libraryRootForPath(packagePath)) ?? (await activeLibraryPath());
  if (root === null || root.length === 0) {
    throw new Error('No library is open.');
  }
  return uniqueRestoreDestination(root, packagePath, new Date(), pathExists);
}

/**
 * Restore one listed backup into a new package chosen by the native dialog.
 * The source is re-validated against the current backup listing (no arbitrary
 * path read), the destination must be a new folder inside the library, and the
 * original package is never written.
 */
export async function restoreBackup(
  packagePath: string,
  sourcePath: string,
  destination: string,
): Promise<RestoreBackupResult> {
  if (typeof packagePath !== 'string' || packagePath.length === 0) {
    return { ok: false, code: 'unknown', message: 'No document path was provided.' };
  }
  if (typeof sourcePath !== 'string' || sourcePath.length === 0) {
    return { ok: false, code: 'invalid-source', message: 'No backup was selected.' };
  }
  if (typeof destination !== 'string' || destination.length === 0) {
    return { ok: false, code: 'invalid-destination', message: 'No restore location was provided.' };
  }

  const sourcePackage = path.resolve(packagePath);
  const sourceRoot = await libraryRootForPath(sourcePackage);
  if (sourceRoot === null) {
    return {
      ok: false,
      code: 'outside-library',
      message: 'Document is outside the known NoteForest libraries.',
    };
  }

  const backup = await findValidBackup(sourcePackage, sourcePath);
  if (backup === null) {
    return {
      ok: false,
      code: 'invalid-source',
      message: 'That backup is not one of the valid backups for this document.',
    };
  }
  const backupsRoot = backupsDirForPackage(appSupportDir(), sourcePackage);
  if (!isPathInside(backupsRoot, backup.sourcePath)) {
    return {
      ok: false,
      code: 'invalid-source',
      message: 'That backup does not belong to this document.',
    };
  }

  const target = path.resolve(destination);
  const scope = restoreDestinationProblem({
    destination: target,
    libraryDir: sourceRoot,
    sourcePackagePath: sourcePackage,
    documentExists: false,
  });
  if (scope !== null) {
    return { ok: false, code: scope.code, message: scope.message };
  }

  const targetDocument = documentJsonPath(target);
  let documentExists = false;
  try {
    await fs.access(targetDocument);
    documentExists = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      return {
        ok: false,
        code: 'restore-failed',
        message: `Could not inspect the restore location: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  if (documentExists) {
    return {
      ok: false,
      code: 'exists',
      message: 'A document already exists at that location. Choose a new folder.',
    };
  }

  try {
    await fs.mkdir(target, { recursive: true });
    await fs.access(target, fsConstants.W_OK);
  } catch (error) {
    return {
      ok: false,
      code: 'not-writable',
      message: `The chosen folder is not writable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const restored = await restoreCandidateToPackage(backup.sourcePath, target, {
    assetsSourcePackagePath: sourcePackage,
  });
  if (!restored.ok) {
    const reason = restored.error.details?.['reason'];
    const code =
      restored.error.code === 'recovery-failed'
        ? 'exists'
        : reason === 'permission' || reason === 'read-only'
          ? 'not-writable'
          : 'restore-failed';
    return { ok: false, code, message: restored.error.message };
  }

  const library = await scanLibrary();
  const opened = await openStore(restored.targetPackagePath);
  if ('error' in opened || 'recovery' in opened) {
    return { ok: true, packagePath: restored.targetPackagePath, library };
  }
  return {
    ok: true,
    packagePath: restored.targetPackagePath,
    snapshot: opened.snapshot,
    library,
  };
}

/**
 * Restore the newest valid backup into a unique new package without a native
 * destination picker. This is the recovery-tab action: it reuses the same
 * listing, source validation, destination rules, and core restore writer as the
 * 2b2b surface, and never writes the original package.
 */
export async function restoreNewestBackup(
  packagePath: string,
): Promise<RestoreBackupResult> {
  if (typeof packagePath !== 'string' || packagePath.length === 0) {
    return { ok: false, code: 'unknown', message: 'No document path was provided.' };
  }
  const resolved = path.resolve(packagePath);
  if (!(await isInsideKnownLibrary(resolved))) {
    return {
      ok: false,
      code: 'outside-library',
      message: 'Document is outside the known NoteForest libraries.',
    };
  }
  const listing = await listBackups(resolved);
  if (!listing.ok) {
    return { ok: false, code: 'unknown', message: listing.message };
  }
  const newest = listing.backups.find((backup) => backup.valid);
  if (newest === undefined) {
    return {
      ok: false,
      code: 'no-backup',
      message: 'NoteForest has no valid backup for this document.',
    };
  }
  const destination = await defaultRestoreDestination(resolved);
  return restoreBackup(resolved, newest.sourcePath, destination);
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
  if (!(await isInsideKnownLibrary(resolved))) {
    return { ok: false, message: 'Document is outside the known NoteForest libraries.' };
  }
  const existing = repository.get(resolved);
  if (existing !== null) {
    await repository.close(resolved);
  }
  const opened = await openStore(resolved);
  if ('error' in opened) return { ok: false, message: opened.error };
  if ('recovery' in opened) return { ok: false, message: opened.recovery.reason };
  return { ok: true, snapshot: opened.snapshot };
}

export async function closeDocument(packagePath: string, options: { save: boolean }): Promise<void> {
  if (isDraftKey(packagePath)) {
    await discardDraftSession(packagePath);
    return;
  }
  const resolved = path.resolve(packagePath);
  await repository.close(resolved, { save: options.save });
}

/**
 * Read-only preflight for Move to Trash. It reuses the same validation as the
 * library scan, reports a live lock without breaking it, and refuses the
 * library root itself (LD-12). The confirmation dialog is the explicit
 * authorization for a stale/corrupt lock.
 */
export async function trashPreflight(packagePath: string): Promise<TrashPreflight> {
  if (typeof packagePath !== 'string' || packagePath.length === 0) {
    return {
      packagePath: '',
      title: 'Untitled',
      status: 'missing',
      documentId: null,
      liveLock: false,
      lock: null,
      open: false,
      canTrash: false,
      reason: 'No document path was provided.',
    };
  }
  if (isDraftKey(packagePath)) {
    return {
      packagePath,
      title: 'Untitled',
      status: 'missing',
      documentId: null,
      liveLock: false,
      lock: null,
      open: false,
      canTrash: false,
      reason: 'This note is still a draft. Close its tab to discard it; nothing has been written.',
    };
  }
  const resolved = path.resolve(packagePath);
  const fallbackTitle = path.basename(resolved) || 'Untitled';
  const base: TrashPreflight = {
    packagePath: resolved,
    title: fallbackTitle,
    status: 'missing',
    documentId: null,
    liveLock: false,
    lock: null,
    open: false,
    canTrash: false,
  };
  if (!(await isInsideKnownLibrary(resolved))) {
    return { ...base, reason: 'Document is outside the known NoteForest libraries.' };
  }
  const root = await libraryRootForPath(resolved);
  if (root !== null) {
    const rootCanonical = await canonicalLibraryPath(root);
    const packageCanonical = await canonicalLibraryPath(resolved);
    if (rootCanonical === packageCanonical) {
      return {
        ...base,
        reason:
          'The library folder itself cannot be moved to the Trash. Remove it from Recent instead; its notes stay on disk.',
      };
    }
  }

  const store = repository.get(resolved);
  const open = store !== null;
  let status: TrashDocumentStatus = 'ok';
  let title = fallbackTitle;
  let documentId: string | null = null;
  const onDisk = await pathExists(documentJsonPath(resolved));
  if (!onDisk) {
    // The package folder exists but its document.json is gone, even if an open
    // store still holds the in-memory copy. The row is a missing package and the
    // cleanup (Remove from recents) is the safe action.
    status = 'missing';
    if (store !== null && store.document !== null) {
      title = store.document.title;
      documentId = store.document.id;
    } else {
      title = packageTitle(resolved, null);
    }
  } else if (store !== null && store.document !== null) {
    title = store.document.title;
    documentId = store.document.id;
  } else {
    const validated = await repository.validate(resolved);
    if (validated.ok) {
      title = validated.document.title;
      documentId = validated.document.id;
    } else {
      status = validated.error.code === 'newer-schema' ? 'newer-schema' : 'unreadable';
      try {
        const text = await fs.readFile(documentJsonPath(resolved), 'utf8');
        title = packageTitle(resolved, text);
      } catch {
        title = packageTitle(resolved, null);
      }
    }
  }

  // A lock in this process belongs to our editable store; only a read-only
  // store can be blocked by another session's live lock.
  let liveLock = false;
  let lock: LockInfoView | null = null;
  if (store === null || store.readOnly) {
    const record = await readDocumentLock(resolved, {
      appSupportDir: appSupportDir(),
    }).catch(() => null);
    if (record !== null) {
      liveLock = !isLockStale(record);
      lock = {
        pid: record.pid,
        host: record.host,
        sessionId: record.sessionId,
        acquiredAt: record.acquiredAt,
        heartbeatAt: record.heartbeatAt,
        corrupt: false,
      };
    }
  }

  const canTrash = status !== 'missing' && !liveLock;
  const reason =
    status === 'missing'
      ? 'The package folder has no document.json. Remove it from recents instead.'
      : liveLock
        ? 'Another NoteForest session is writing this document. Close the other window and try again; the live lock is never broken.'
        : undefined;
  return {
    packagePath: resolved,
    title,
    status,
    documentId,
    liveLock,
    lock,
    open,
    canTrash,
    ...(reason === undefined ? {} : { reason }),
  };
}

export type TrashItem = (target: string) => Promise<void>;

/**
 * Move one document package to the OS Trash after the explicit confirmation.
 *
 * The store is closed and the lock released before the move; the move is
 * Electron's `shell.trashItem` (never a recursive delete). A failure leaves the
 * file untouched and reports the OS error. A live lock is refused; a
 * stale/corrupt lock is broken here because the confirmation dialog is the
 * explicit authorization. On success the recent entry, per-document settings,
 * and session tab are removed.
 */
export async function trashDocument(
  packagePath: string,
  trashItem: TrashItem,
): Promise<TrashDocumentResult> {
  const preflight = await trashPreflight(packagePath);
  if (!preflight.canTrash) {
    const code =
      preflight.reason?.includes('library folder') === true
        ? 'library-root'
        : preflight.liveLock
          ? 'locked'
          : preflight.status === 'missing'
            ? 'not-found'
            : 'unknown';
    return {
      ok: false,
      code,
      message: preflight.reason ?? 'This document cannot be moved to the Trash.',
    };
  }
  const resolved = preflight.packagePath;
  if (!(await isInsideKnownLibrary(resolved))) {
    return { ok: false, code: 'not-found', message: 'Document is outside the known NoteForest libraries.' };
  }
  const root = await libraryRootForPath(resolved);
  if (root !== null) {
    const rootCanonical = await canonicalLibraryPath(root);
    const packageCanonical = await canonicalLibraryPath(resolved);
    if (rootCanonical === packageCanonical) {
      return {
        ok: false,
        code: 'library-root',
        message: 'The library folder itself can never be moved to the Trash.',
      };
    }
  }

  const store = repository.get(resolved);
  if (store !== null && store.hasUnsavedChanges) {
    return {
      ok: false,
      code: 'unsaved',
      message: `“${preflight.title}” has unsaved changes. Save or discard them before moving it to the Trash.`,
    };
  }

  // Close the store and release our lock before the OS move. A stale/corrupt
  // lock is removed only here, after the confirmation.
  await repository.close(resolved, { save: false });
  const broken = await breakStaleLock(resolved, { appSupportDir: appSupportDir() });
  if (!broken.ok && broken.reason === 'locked') {
    return {
      ok: false,
      code: 'locked',
      message:
        'Another NoteForest session is writing this document. It was not moved.',
    };
  }
  if (!broken.ok && broken.reason === 'io-error') {
    return {
      ok: false,
      code: 'trash-failed',
      message: `Could not release the document lock: ${broken.message ?? 'filesystem error'}. It was not moved.`,
    };
  }

  try {
    await trashItem(resolved);
  } catch (error) {
    return {
      ok: false,
      code: 'trash-failed',
      message: `Could not move “${preflight.title}” to the Trash: ${
        error instanceof Error && error.message.length > 0 ? error.message : String(error)
      }. The folder was not changed.`,
    };
  }

  await removeRecentDocument(resolved, appSupportDir()).catch(() => undefined);
  // A copy keeps the same document id (Save a copy / Finder duplicate): the
  // cleanup may use the id only when no other known package or session tab
  // shares it. Otherwise the copy keeps its override and its session tab.
  const sharedIdPaths = await sharedDocumentIdPaths(preflight.documentId, resolved);
  const removedSettings = await removeDocumentSettingsEntries(
    appSupportDir(),
    {
      documentId: preflight.documentId,
      packagePath: resolved,
    },
    { sharedIdPaths },
  ).catch(() => null);
  if (removedSettings !== null && removedSettings.ok && removedSettings.keptAmbiguous.length > 0) {
    console.warn(
      `[noteforest] kept document settings for ${removedSettings.keptAmbiguous.length} package(s) sharing document id ${preflight.documentId ?? 'unknown'}: ${removedSettings.keptAmbiguous.join(', ')}`,
    );
  }
  await removeSessionDocument(resolved, preflight.documentId, sharedIdPaths);
  return { ok: true, library: await scanLibrary() };
}

/**
 * Cleanup-only removal for a package that no longer exists (`missing`). It
 * removes the recent entry, per-document settings, and session tab and never
 * deletes a folder or a file.
 */
export async function removeMissingDocument(
  packagePath: string,
  documentId: string | null = null,
): Promise<RemoveMissingDocumentResult> {
  if (typeof packagePath !== 'string' || packagePath.length === 0) {
    return { ok: false, message: 'No document path was provided.' };
  }
  if (isDraftKey(packagePath)) {
    await discardDraftSession(packagePath);
    return { ok: true, library: await scanLibrary() };
  }
  const resolved = path.resolve(packagePath);
  if (!(await isInsideKnownLibrary(resolved))) {
    return { ok: false, message: 'Document is outside the known NoteForest libraries.' };
  }
  if (await pathExists(documentJsonPath(resolved))) {
    return {
      ok: false,
      message: 'The document still exists. Use Move to Trash to remove it.',
    };
  }
  // An open tab may still hold the in-memory document; this cleanup never
  // writes and never deletes the folder.
  await repository.close(resolved, { save: false });
  await removeRecentDocument(resolved, appSupportDir()).catch(() => undefined);
  const sharedIdPaths = await sharedDocumentIdPaths(documentId, resolved);
  const removedSettings = await removeDocumentSettingsEntries(
    appSupportDir(),
    {
      documentId,
      packagePath: resolved,
    },
    { sharedIdPaths },
  ).catch(() => null);
  if (removedSettings !== null && removedSettings.ok && removedSettings.keptAmbiguous.length > 0) {
    console.warn(
      `[noteforest] kept document settings for ${removedSettings.keptAmbiguous.length} package(s) sharing document id ${documentId ?? 'unknown'}: ${removedSettings.keptAmbiguous.join(', ')}`,
    );
  }
  await removeSessionDocument(resolved, documentId, sharedIdPaths);
  return { ok: true, library: await scanLibrary() };
}

/**
 * Other known packages and session tabs that carry one document id. The id is
 * not unique after a copy, so it can only be a cleanup key when this list is
 * empty (F3).
 */
async function sharedDocumentIdPaths(
  documentId: string | null,
  packagePath: string,
): Promise<string[]> {
  if (documentId === null) return [];
  const resolved = path.resolve(packagePath);
  const paths = new Set<string>();
  const root = await libraryRootForPath(resolved);
  if (root !== null) {
    const scanned = await scanLibrary(root);
    for (const document of scanned.documents) {
      if (
        document.status === 'ok' &&
        document.documentId === documentId &&
        path.resolve(document.packagePath) !== resolved
      ) {
        paths.add(document.packagePath);
      }
    }
  }
  const session = await readSession();
  for (const tab of session.tabs) {
    if (tab.documentId === documentId && path.resolve(tab.packagePath) !== resolved) {
      paths.add(tab.packagePath);
    }
  }
  return [...paths];
}

/** Remove one document from the persisted session (tab + active fallback). */
async function removeSessionDocument(
  packagePath: string,
  documentId: string | null,
  sharedIdPaths: readonly string[] = [],
): Promise<void> {
  try {
    const session = await readSession();
    const resolved = path.resolve(packagePath);
    const idShared =
      documentId !== null &&
      (sharedIdPaths.some((candidate) => path.resolve(candidate) !== resolved) ||
        session.tabs.some(
          (tab) =>
            tab.documentId === documentId && path.resolve(tab.packagePath) !== resolved,
        ));
    const tabs = session.tabs.filter(
      (tab) =>
        path.resolve(tab.packagePath) !== resolved &&
        !(
          documentId !== null &&
          !idShared &&
          tab.documentId !== undefined &&
          tab.documentId === documentId
        ),
    );
    if (tabs.length === session.tabs.length) return;
    if (
      idShared &&
      tabs.some(
        (tab) => documentId !== null && tab.documentId === documentId,
      )
    ) {
      console.warn(
        `[noteforest] kept the session tab of a package sharing document id ${documentId}; it is not the one that was removed.`,
      );
    }
    const activeTab =
      session.activeTab !== null &&
      tabs.some((tab) => tab.packagePath === session.activeTab)
        ? session.activeTab
        : tabs[0]?.packagePath ?? null;
    await writeSession({ ...session, tabs, activeTab });
  } catch {
    // Session cleanup is best effort; the renderer closes the tab itself.
  }
}

export function dirtyDocuments(): Array<{ packagePath: string; title: string }> {
  return repository.dirty();
}

export async function saveAllDirty(): Promise<Array<{ packagePath: string; error: string }>> {
  return repository.saveAllDirty();
}

export async function closeAllStores(): Promise<void> {
  await repository.closeAll();
}

// ---------------------------------------------------------------------------
// Personal app settings (ADR-0008; never document content)
// ---------------------------------------------------------------------------

/** Last parsed `settings.json` object; used to preserve unknown fields on write. */
let lastSettingsRaw: Record<string, unknown> = {};
let settingsWriteQueue: Promise<void> = Promise.resolve();

export interface SettingsFileRead {
  settings: AppSettings;
  status: SettingsFileStatus;
  raw: Record<string, unknown>;
}

function settingsErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : String(error);
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}

/**
 * Read the global personal settings with an explicit status (S2-5).
 *
 * A missing file is normal (`defaults`). Corrupt JSON is preserved as
 * `settings.corrupt-<timestamp>.json` and reported; it is never silently
 * replaced on read. A newer schema is normalized for this session and kept at
 * its version on write.
 */
export async function readSettingsFile(): Promise<SettingsFileRead> {
  const defaults = structuredClone(DEFAULT_APP_SETTINGS);
  let text: string;
  try {
    text = await fs.readFile(settingsPath(), 'utf8');
  } catch (error) {
    if (isMissingFile(error)) {
      lastSettingsRaw = {};
      return { settings: defaults, status: { state: 'defaults' }, raw: {} };
    }
    return {
      settings: defaults,
      status: { state: 'unreadable', message: settingsErrorMessage(error) },
      raw: lastSettingsRaw,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    const backupPath = await preserveCorruptFile(settingsPath());
    return {
      settings: defaults,
      status: {
        state: 'corrupt',
        message: settingsErrorMessage(error),
        ...(backupPath === null ? {} : { backupPath }),
      },
      raw: {},
    };
  }
  const migrated = migrateSettingsDocument(parsed);
  lastSettingsRaw = migrated.raw;
  if (migrated.storedVersion > SETTINGS_SCHEMA_VERSION) {
    return {
      settings: migrated.settings,
      status: { state: 'newer', version: migrated.storedVersion },
      raw: migrated.raw,
    };
  }
  return {
    settings: migrated.settings,
    status: migrated.migrated ? { state: 'ok', migrated: true } : { state: 'ok' },
    raw: migrated.raw,
  };
}

/** Backwards-compatible accessor: the settings without their read status. */
export async function readSettings(): Promise<AppSettings> {
  return (await readSettingsFile()).settings;
}

/**
 * Raw settings object for one implicit write, or the reason the write must be
 * refused (UI Sentinel F3).
 *
 * A file that exists but cannot be read or parsed is treated like the corrupt
 * per-document map in `saveDocumentSettings`: the bytes and the backup stay
 * untouched until the user explicitly resets. The check runs at write time, so
 * a file corrupted after bootstrap is refused too.
 */
type SettingsRawForWrite =
  | { ok: true; raw: Record<string, unknown> }
  | { ok: false; message: string };

async function readSettingsRawForWrite(): Promise<SettingsRawForWrite> {
  let text: string;
  try {
    text = await fs.readFile(settingsPath(), 'utf8');
  } catch (error) {
    if (isMissingFile(error)) return { ok: true, raw: {} };
    return {
      ok: false,
      message: `settings.json could not be read; nothing was written: ${settingsErrorMessage(error)}`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    return {
      ok: false,
      message: `settings.json is corrupt and was not overwritten: ${settingsErrorMessage(
        error,
      )}. Use Reset settings to replace it with the product defaults.`,
    };
  }
  return { ok: true, raw: isRecord(parsed) ? parsed : lastSettingsRaw };
}

/** Serialize one settings-file write; the newest queued task wins. */
function enqueueSettingsWrite(
  task: () => Promise<SettingsSaveResult>,
): Promise<SettingsSaveResult> {
  const result = settingsWriteQueue.then(task, task);
  settingsWriteQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/**
 * Persist the global personal settings atomically. Writes are serialized so two
 * rapid Apply actions land in order (last write wins) and the result is only a
 * success after the rename completed. Known paths are replaced; every other
 * stored field survives (see `settingsDocumentForWrite`).
 *
 * An implicit write is refused while `settings.json` exists but cannot be read
 * or parsed: corrupt bytes are never silently replaced by a normal change.
 */
export async function writeSettings(input: unknown): Promise<SettingsSaveResult> {
  return enqueueSettingsWrite(async () => {
    const settings = normalizeAppSettings(
      input as Parameters<typeof normalizeAppSettings>[0],
    );
    const read = await readSettingsRawForWrite();
    if (!read.ok) return { ok: false, message: read.message };
    const document = settingsDocumentForWrite(read.raw, settings);
    try {
      await fs.mkdir(appSupportDir(), { recursive: true });
      await writeFileAtomic(settingsPath(), `${JSON.stringify(document, null, 2)}\n`);
      lastSettingsRaw = document;
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: `Could not save settings: ${settingsErrorMessage(error)}`,
      };
    }
  });
}

/**
 * Explicit "Reset settings": atomically replace `settings.json` with the
 * product defaults. This is the only path allowed to replace a corrupt or
 * unreadable file, and it keeps the existing corrupt backup. Returns the real
 * write result so the renderer can clear the warning only after success.
 */
export async function resetSettings(): Promise<SettingsSaveResult> {
  return enqueueSettingsWrite(async () => {
    const settings = normalizeAppSettings(
      structuredClone(DEFAULT_APP_SETTINGS) as Parameters<typeof normalizeAppSettings>[0],
    );
    const document = settingsDocumentForWrite({}, settings);
    try {
      await fs.mkdir(appSupportDir(), { recursive: true });
      await writeFileAtomic(settingsPath(), `${JSON.stringify(document, null, 2)}\n`);
      lastSettingsRaw = document;
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: `Could not reset settings: ${settingsErrorMessage(error)}`,
      };
    }
  });
}

/** Test-only: wait for the serialized settings queue. */
export async function flushSettingsWrites(): Promise<void> {
  await settingsWriteQueue;
}

/** Durable per-document map used by bootstrap and the settings dialog. */
export function readDocumentSettings(): ReturnType<typeof readDocumentSettingsFile> {
  return readDocumentSettingsFile(appSupportDir());
}

export function writeDocumentSettings(
  entries: readonly DocumentSettingsEntry[],
): Promise<SettingsSaveResult> {
  return writeDocumentSettingsFile(appSupportDir(), entries);
}

export function saveDocumentSettings(
  input: DocumentSettingsSaveInput,
): Promise<DocumentSettingsSaveResult> {
  return applyDocumentSettings(appSupportDir(), input);
}

/**
 * Explicit recovery for a corrupt/unreadable map (S3-13): back up the current
 * file, then atomically replace it with an empty map.
 */
export function resetDocumentSettingsMap(): Promise<DocumentSettingsRecoveryResult> {
  return resetDocumentSettings(appSupportDir());
}

/** Restore the newest valid map backup; the current file is backed up first. */
export function restoreDocumentSettingsMap(): Promise<DocumentSettingsRecoveryResult> {
  return restoreDocumentSettingsBackup(appSupportDir());
}

// ---------------------------------------------------------------------------
// Session (UI state only; not document content)
// ---------------------------------------------------------------------------

export interface SessionRead {
  session: SessionState;
  /**
   * Pre-S2-2 session overrides, read only to migrate them once into
   * `document-settings.json`. New session writes never contain these fields.
   */
  legacyOverrides: LegacySessionOverride[];
}

/**
 * Read the shell session. Legacy `pageSettingsOverride` and
 * `continuousSettingsOverride` fields are removed from the returned tabs and
 * reported separately so bootstrap can migrate them into the durable per-document
 * map (S2-2). A corrupt session still falls back to the empty default.
 */
export async function readSessionWithOverrides(): Promise<SessionRead> {
  const file = sessionPath();
  try {
    const text = await fs.readFile(file, 'utf8');
    const raw = JSON.parse(text) as Partial<SessionState>;
    const tabs: SessionTabState[] = [];
    const legacyOverrides: LegacySessionOverride[] = [];
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
        const view = normalizeDocumentViewState({
          layout: (tab as { layout?: unknown }).layout,
          interactionMode: (tab as { interactionMode?: unknown }).interactionMode,
          currentPage: (tab as { currentPage?: unknown }).currentPage,
          pageZoom: (tab as { pageZoom?: unknown }).pageZoom,
          pageFit: (tab as { pageFit?: unknown }).pageFit,
          zoom: (tab as { zoom?: unknown }).zoom,
        });
        const pageSettingsOverride = normalizePageSettingsOverride(
          (tab as { pageSettingsOverride?: unknown }).pageSettingsOverride,
        );
        if (pageSettingsOverride !== undefined) {
          legacyOverrides.push({ packagePath, pageSettingsOverride });
        }
        tabs.push({
          packagePath,
          ...(typeof (tab as { documentId?: unknown }).documentId === 'string'
            ? { documentId: (tab as { documentId: string }).documentId }
            : {}),
          scrollTop: Number.isFinite(scrollTop) && scrollTop >= 0 ? scrollTop : 0,
          selectedBlockId: typeof selectedBlockId === 'string' ? selectedBlockId : null,
          collapsed,
          layout: view.layout,
          interactionMode: view.interactionMode,
          currentPage: view.currentPage,
          pageZoom: view.pageZoom,
          pageFit: view.pageFit,
          zoom: view.zoom,
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
    const rawActiveLibrary = (raw as { activeLibrary?: unknown }).activeLibrary;
    const activeLibrary =
      rawActiveLibrary === null
        ? null
        : typeof rawActiveLibrary === 'string' && rawActiveLibrary.length > 0
          ? path.resolve(rawActiveLibrary)
          : undefined;
    return {
      session: {
        tabs,
        activeTab,
        sidebarCollapsed: raw.sidebarCollapsed === true,
        sidebarWidth:
          Number.isFinite(width) &&
          width >= SIDEBAR_MIN_WIDTH &&
          width <= SIDEBAR_MAX_WIDTH
            ? Math.round(width)
            : SIDEBAR_SNAP_WIDTH,
        collapsedTopics,
        sidebarTab: raw.sidebarTab === 'outline' ? 'outline' : 'library',
        ...(activeLibrary === undefined ? {} : { activeLibrary }),
      },
      legacyOverrides,
    };
  } catch {
    return { session: structuredClone(DEFAULT_SESSION), legacyOverrides: [] };
  }
}

export async function readSession(): Promise<SessionState> {
  return (await readSessionWithOverrides()).session;
}

export async function writeSession(state: SessionState): Promise<void> {
  await fs.mkdir(appSupportDir(), { recursive: true });
  await writeFileAtomic(sessionPath(), `${JSON.stringify(state, null, 2)}\n`);
}

export async function bootstrap(): Promise<{
  library: LibraryView;
  settings: AppSettings;
  settingsStatus: SettingsFileStatus;
  documentSettings: DocumentSettingsEntry[];
  documentSettingsStatus: SettingsFileStatus;
  documentSettingsBackup: DocumentSettingsBackupView | null;
  session: SessionState;
  openDocuments: OpenDocumentSnapshot[];
  markdownFiles: MarkdownFileView[];
  recoveries: RecoveryDocumentView[];
}> {
  const settingsRead = await readSettingsFile();
  const active = await activeLibraryPath();
  let library = await scanLibrary(active ?? undefined);
  if (active !== null && !library.missing) {
    const reconciliation = await reconcileMovedDocuments(active, library.documents);
    if (reconciliation.tabs.length > 0 || reconciliation.recentChanged) {
      library = await scanLibrary(active);
    }
  }
  const sessionRead = await readSessionWithOverrides();
  const session = sessionRead.session;
  const openDocuments: OpenDocumentSnapshot[] = [];
  const markdownFiles: MarkdownFileView[] = [];
  const recoveries: RecoveryDocumentView[] = [];
  for (const tab of session.tabs) {
    // A `.md` tab is a guest file, re-read from its own path. It never goes
    // through the package store, lock, schema validation, or recent manifest.
    if (isMarkdownPath(tab.packagePath)) {
      const read = await readMarkdownFile(tab.packagePath);
      if (read.ok) {
        markdownFiles.push(read.file);
      } else {
        markdownFiles.push({
          path: tab.packagePath,
          title: markdownFileTitle(tab.packagePath),
          markdown: '',
          base: null,
          readOnly: true,
          error: read.message ?? 'The Markdown file could not be read.',
        });
      }
      continue;
    }
    try {
      const opened = await openStore(tab.packagePath);
      if ('recovery' in opened) {
        recoveries.push(opened.recovery);
      } else if ('error' in opened) {
        recoveries.push(recoveryViewForError(tab.packagePath, opened.error));
      } else {
        openDocuments.push(opened.snapshot);
      }
    } catch (error) {
      recoveries.push(
        recoveryViewForError(
          tab.packagePath,
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }
  // S2-2: move any session-only override into the durable map keyed by the
  // canonical document id (path fallback when a package cannot be opened).
  const documentIdByPath = new Map(
    openDocuments.map((snapshot) => [snapshot.packagePath, snapshot.document.id]),
  );
  const migrated = await migrateLegacySessionOverrides(
    appSupportDir(),
    sessionRead.legacyOverrides,
    documentIdByPath,
  );
  return {
    library,
    settings: settingsRead.settings,
    settingsStatus: settingsRead.status,
    documentSettings: migrated.entries,
    documentSettingsStatus: migrated.status,
    // Computed after the one-time session migration so a backup written by it
    // is visible on the first Data page. A read-only scan, never a write.
    documentSettingsBackup: await findNewestValidDocumentSettingsBackup(appSupportDir()),
    session,
    openDocuments,
    markdownFiles,
    recoveries,
  };
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
  const directory = await activeLibraryPath();
  if (directory === null || directory.length === 0) {
    throw new Error('No library is open.');
  }
  if (!(await pathIsDirectory(directory))) {
    throw new Error(`The active library was not found: ${directory}`);
  }
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
  if ('recovery' in opened) throw new Error(opened.recovery.reason);
  return { snapshot: opened.snapshot, library: await scanLibrary() };
}
