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
  NodeAssetStore,
  NodeDocumentRepository,
  pathExists,
  readRecentDocuments,
  restoreCandidateToPackage,
  writeDocumentPackageCopy,
  writeFileAtomic,
  type DocumentStore,
  type OpenDocumentResult as CoreOpenDocumentResult,
} from '@noteforest/core/node';
import type {
  ApplyResult,
  BackupCandidateView,
  DocumentSettingsBackupView,
  DocumentSettingsEntry,
  DocumentSettingsRecoveryResult,
  DocumentSettingsSaveInput,
  DocumentSettingsSaveResult,
  ImportImageBytesInput,
  ImportImageResult,
  LibraryView,
  ListBackupsResult,
  LockInfoView,
  OpenDocumentResult,
  OpenDocumentSnapshot,
  RecoveryDocumentView,
  ReloadDocumentResult,
  RestoreBackupResult,
  SaveCopyResult,
  SaveRequestOptions,
  SaveResult,
  SessionState,
  SessionTabState,
  SettingsFileStatus,
  SettingsSaveResult,
  TakeOverLockResult,
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
  resetDocumentSettings,
  restoreDocumentSettingsBackup,
  saveDocumentSettings as applyDocumentSettings,
  writeDocumentSettingsFile,
} from './document-settings.js';
import { saveFailureCode } from './save-error.js';
import { normalizeDocumentViewState } from '../shared/view-state.js';
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

const DEFAULT_SESSION: SessionState = {
  tabs: [],
  activeTab: null,
  sidebarCollapsed: false,
  sidebarWidth: SIDEBAR_SNAP_WIDTH,
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

function settingsPath(): string {
  return path.join(appSupportDir(), 'settings.json');
}

export function isInsideLibrary(candidate: string): boolean {
  return isPathInside(libraryDir(), candidate);
}

/**
 * Process-wide persistence boundary. It owns the open-store registry; the
 * renderer still talks only to the main process.
 */
const repository = new NodeDocumentRepository({ appSupportDir });

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

export async function ensureLibrary(): Promise<string> {
  const directory = libraryDir();
  await fs.mkdir(directory, { recursive: true });
  return directory;
}

export async function scanLibrary(): Promise<LibraryView> {
  const directory = await ensureLibrary();
  const support = appSupportDir();
  const listing = await repository.list(directory);
  const documents: LibraryView['documents'] = listing.documents;
  const warnings: string[] = [...listing.warnings];

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
  const resolved = path.resolve(packagePath);
  if (!isInsideLibrary(resolved)) {
    return { error: 'Document is outside the NoteForest library.' };
  }
  const existing = repository.get(resolved);
  if (existing !== null) {
    const current = await snapshot(existing);
    if (current !== null) return { store: existing, snapshot: current };
  }

  await ensureLibrary();
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
  if (!isInsideLibrary(resolved)) {
    return { ok: false, code: 'unknown', message: 'Document is outside the NoteForest library.' };
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
  const directory = await ensureLibrary();
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
  const source = path.resolve(sourcePackagePath);
  if (!isInsideLibrary(source)) {
    return { ok: false, message: 'The source document is outside the NoteForest library.' };
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
    document,
  });
  if (!copied.ok) return { ok: false, message: copied.error.message };

  // Opening is only possible inside the library; a copy saved elsewhere is
  // revealed in Finder by the caller instead.
  if (isInsideLibrary(copied.packagePath)) {
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
  if (!isInsideLibrary(resolved)) {
    return { ok: false, message: 'Document is outside the NoteForest library.' };
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
  return uniqueRestoreDestination(libraryDir(), packagePath, new Date(), pathExists);
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
  if (!isInsideLibrary(sourcePackage)) {
    return {
      ok: false,
      code: 'outside-library',
      message: 'Document is outside the NoteForest library.',
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
    libraryDir: libraryDir(),
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
  if (!isInsideLibrary(resolved)) {
    return {
      ok: false,
      code: 'outside-library',
      message: 'Document is outside the NoteForest library.',
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
  if (!isInsideLibrary(resolved)) {
    return { ok: false, message: 'Document is outside the NoteForest library.' };
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
  const resolved = path.resolve(packagePath);
  await repository.close(resolved, { save: options.save });
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
  settings: AppSettings;
  settingsStatus: SettingsFileStatus;
  documentSettings: DocumentSettingsEntry[];
  documentSettingsStatus: SettingsFileStatus;
  documentSettingsBackup: DocumentSettingsBackupView | null;
  session: SessionState;
  openDocuments: OpenDocumentSnapshot[];
  recoveries: RecoveryDocumentView[];
}> {
  const settingsRead = await readSettingsFile();
  const sessionRead = await readSessionWithOverrides();
  const session = sessionRead.session;
  const openDocuments: OpenDocumentSnapshot[] = [];
  const recoveries: RecoveryDocumentView[] = [];
  for (const tab of session.tabs) {
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
    settings: settingsRead.settings,
    settingsStatus: settingsRead.status,
    documentSettings: migrated.entries,
    documentSettingsStatus: migrated.status,
    // Computed after the one-time session migration so a backup written by it
    // is visible on the first Data page. A read-only scan, never a write.
    documentSettingsBackup: await findNewestValidDocumentSettingsBackup(appSupportDir()),
    session,
    openDocuments,
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
  if ('recovery' in opened) throw new Error(opened.recovery.reason);
  return { snapshot: opened.snapshot, library: await scanLibrary() };
}
