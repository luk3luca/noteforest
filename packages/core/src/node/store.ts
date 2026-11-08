/**
 * Local document package store (Node-only).
 *
 * - `<library>/<slug>/document.json` + `assets/`
 * - atomic save (temp + fsync + rename)
 * - backup snapshot before each successful save, rotated in app support
 * - monotonic revision per committed save
 * - single-writer lock per package; concurrent readers allowed
 * - corrupt/newer/invalid documents open read-only and are never overwritten
 *
 * All mutations go through `store.apply(command)`, which delegates to the pure
 * command layer. There is no raw write API.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AtomicWriteHooks } from './atomic.js';
import { writeFileAtomic } from './atomic.js';
import { NodeAssetStore } from './assets.js';
import {
  BackupManager,
  type BackupKind,
  type BackupRecord,
  type BackupRetention,
} from './backups.js';
import {
  type AcquireLockOptions,
  type LockHandle,
  type LockRecord,
  acquireDocumentLock,
  readDocumentLock,
} from './lock.js';
import {
  assetsDirPath,
  backupsDirForPackage,
  createUniquePackageDir,
  defaultAppSupportDir,
  documentJsonPath,
  sha256Hex,
} from './paths.js';
import { recordRecentDocument } from './recent.js';
import type {
  CommandResult,
  DocumentCommand,
  ExecuteCommandOptions,
} from '../commands.js';
import { executeCommand } from '../commands.js';
import type { CoreError, ValidationIssue } from '../errors.js';
import { coreError, errorMessage } from '../errors.js';
import type { Clock, CoreContext, IdFactory } from '../ids.js';
import { createContext } from '../ids.js';
import { parseDocumentJson, stringifyDocument } from '../serialize.js';
import type { Document } from '../types.js';
import { documentStats } from '../types.js';
import { validateDocument } from '../validation.js';

export type ReadOnlyReason =
  | 'newer-schema'
  | 'corrupt'
  | 'invalid'
  | 'locked'
  | 'stale-lock'
  | 'missing'
  | 'requested'
  | 'io-error';

export interface DocumentStoreOptions {
  appSupportDir?: string;
  backupsDir?: string;
  /** Extra directory for lock files (defaults to app support locks). */
  lockDir?: string;
  mode?: 'write' | 'read';
  backupRetention?: Partial<BackupRetention>;
  atomicWriteHooks?: AtomicWriteHooks;
  lockStaleAfterMs?: number;
  breakStaleLock?: boolean;
  heartbeatIntervalMs?: number;
  registerRecent?: boolean;
  recentLimit?: number;
  idFactory?: IdFactory;
  clock?: Clock;
  now?: () => Date;
}

export interface OpenDocumentResult {
  status: 'editable' | 'read-only';
  readOnlyReason?: ReadOnlyReason;
  document: Document | null;
  errors: CoreError[];
  warnings: ValidationIssue[];
  packagePath: string;
  store: DocumentStore;
}

export interface SaveOptions {
  /** Write even if the file changed externally since open/last save. */
  overwriteExternal?: boolean;
  /** Skip the pre-save backup (default false). */
  skipBackup?: boolean;
  now?: Date;
}

export interface SaveSuccess {
  ok: true;
  changed: boolean;
  revision: number;
  bytes: number;
  durationMs: number;
  backupPath?: string;
  dailyBackupPath?: string;
  warnings: string[];
}

export interface SaveFailure {
  ok: false;
  error: CoreError;
  durationMs: number;
}

export type SaveResult = SaveSuccess | SaveFailure;

export interface StoreStatus {
  packagePath: string;
  readOnly: boolean;
  readOnlyReason?: ReadOnlyReason;
  hasDocument: boolean;
  revision: number | null;
  dirty: boolean;
  lockPath: string | null;
  lockLost: boolean;
  closed: boolean;
}

/** Existing lock metadata for a read-only store; shown before takeover. */
export interface LockInfo {
  record: LockRecord | null;
  corrupt: boolean;
}

interface LastSaved {
  exists: boolean;
  hash: string | null;
  revision: number;
}

const DEFAULT_HEARTBEAT_INTERVAL_MS = 10_000;

/**
 * Classify a filesystem failure without hiding it: the app's recovery surface
 * needs "permission" and "disk-full" as distinct reasons, while any other
 * errno stays a generic I/O failure. The raw errno is kept for diagnostics.
 */
export function ioFailureDetails(error: unknown): {
  reason: 'permission' | 'disk-full' | 'io-error';
  errno?: string;
} {
  const errno = (error as NodeJS.ErrnoException | null)?.code;
  if (errno === 'EACCES' || errno === 'EPERM' || errno === 'EROFS') {
    return { reason: 'permission', errno };
  }
  if (errno === 'ENOSPC' || errno === 'EDQUOT') {
    return { reason: 'disk-full', errno };
  }
  return errno === undefined ? { reason: 'io-error' } : { reason: 'io-error', errno };
}

export class DocumentStore {
  readonly packagePath: string;

  readonly documentPath: string;

  readonly assetsPath: string;

  /** Content-addressed asset store for this package. */
  readonly assets: NodeAssetStore;

  readonly appSupportDir: string;

  readonly backups: BackupManager;

  readonly readOnly: boolean;

  readonly readOnlyReason?: ReadOnlyReason;

  /** Existing lock that blocked a writable open, if any. */
  readonly lockInfo?: LockInfo;

  readonly errors: CoreError[];

  readonly warnings: ValidationIssue[];

  private documentValue: Document | null;

  private lastSaved: LastSaved;

  private dirtyFlag: boolean;

  private lockHandle: LockHandle | null;

  private lockLostFlag = false;

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  private closedFlag = false;

  private saveQueue: Promise<void> = Promise.resolve();

  private readonly context: CoreContext;

  private readonly atomicWriteHooks: AtomicWriteHooks | undefined;

  private readonly heartbeatIntervalMs: number;

  private readonly registerRecent: boolean;

  private readonly recentLimit: number;

  private readonly now: () => Date;

  constructor(config: {
    packagePath: string;
    appSupportDir: string;
    backupsDir: string;
    readOnly: boolean;
    readOnlyReason?: ReadOnlyReason;
    lockInfo?: LockInfo;
    document: Document | null;
    errors: CoreError[];
    warnings: ValidationIssue[];
    lastSaved: LastSaved;
    lockHandle: LockHandle | null;
    options: DocumentStoreOptions;
  }) {
    this.packagePath = path.resolve(config.packagePath);
    this.documentPath = documentJsonPath(this.packagePath);
    this.assetsPath = assetsDirPath(this.packagePath);
    this.assets = new NodeAssetStore({
      packagePath: this.packagePath,
      assetRecord: (id) => this.documentValue?.assets[id],
    });
    this.appSupportDir = config.appSupportDir;
    this.backups = new BackupManager(config.backupsDir, config.options.backupRetention);
    this.readOnly = config.readOnly;
    if (config.readOnlyReason !== undefined) this.readOnlyReason = config.readOnlyReason;
    if (config.lockInfo !== undefined) this.lockInfo = config.lockInfo;
    this.errors = config.errors;
    this.warnings = config.warnings;
    this.documentValue = config.document;
    this.lastSaved = config.lastSaved;
    this.dirtyFlag = false;
    this.lockHandle = config.lockHandle;
    this.atomicWriteHooks = config.options.atomicWriteHooks;
    this.heartbeatIntervalMs =
      config.options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    this.registerRecent = config.options.registerRecent !== false;
    this.recentLimit = config.options.recentLimit ?? 50;
    this.now = config.options.now ?? (() => new Date());
    this.context = createContext({
      ...(config.options.idFactory === undefined ? {} : { newId: config.options.idFactory }),
      ...(config.options.clock === undefined ? {} : { now: config.options.clock }),
    });
    if (!this.readOnly && this.lockHandle !== null) this.startHeartbeat();
  }

  get document(): Document | null {
    return this.documentValue;
  }

  get revision(): number | null {
    return this.documentValue?.revision ?? null;
  }

  get hasUnsavedChanges(): boolean {
    if (this.documentValue === null) return false;
    return this.dirtyFlag || this.documentValue.revision !== this.lastSaved.revision;
  }

  get lockPath(): string | null {
    return this.lockHandle?.path ?? null;
  }

  get lockLost(): boolean {
    return this.lockLostFlag;
  }

  get closed(): boolean {
    return this.closedFlag;
  }

  status(): StoreStatus {
    const status: StoreStatus = {
      packagePath: this.packagePath,
      readOnly: this.readOnly,
      hasDocument: this.documentValue !== null,
      revision: this.documentValue?.revision ?? null,
      dirty: this.hasUnsavedChanges,
      lockPath: this.lockPath,
      lockLost: this.lockLostFlag,
      closed: this.closedFlag,
    };
    if (this.readOnlyReason !== undefined) status.readOnlyReason = this.readOnlyReason;
    return status;
  }

  /**
   * Apply one typed command. The only in-memory mutation path.
   * Lock loss does not block editing; it blocks saving.
   */
  apply(command: DocumentCommand, options: ExecuteCommandOptions = {}): CommandResult {
    if (this.closedFlag) {
      return {
        ok: false,
        code: 'read-only',
        message: 'store is closed; mutations are rejected',
      };
    }
    if (this.readOnly || this.documentValue === null) {
      return {
        ok: false,
        code: 'read-only',
        message: 'document is open read-only; mutations are rejected',
      };
    }
    const result = executeCommand(this.documentValue, command, {
      context: { newId: this.context.newId, now: this.context.now },
      ...(options.skipInputValidation === undefined
        ? {}
        : { skipInputValidation: options.skipInputValidation }),
    });
    if (result.ok) {
      this.documentValue = result.document;
      this.dirtyFlag = true;
    }
    return result;
  }

  save(options: SaveOptions = {}): Promise<SaveResult> {
    const run = this.saveQueue.then(() => this.saveInternal(options));
    this.saveQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async saveInternal(options: SaveOptions): Promise<SaveResult> {
    const started = performance.now();
    const finish = <T extends SaveResult>(result: T): T => {
      result.durationMs = performance.now() - started;
      return result;
    };
    const failure = (error: CoreError): SaveFailure =>
      finish({ ok: false, error, durationMs: 0 });

    if (this.readOnly) {
      return failure(
        coreError('read-only', 'document is open read-only; save is blocked', {
          reason: this.readOnlyReason ?? 'requested',
        }),
      );
    }
    if (this.closedFlag) {
      return failure(coreError('read-only', 'store is closed; save is blocked', { reason: 'closed' }));
    }
    if (this.documentValue === null) {
      return failure(coreError('not-found', 'no document loaded'));
    }
    if (this.lockLostFlag) {
      return failure(coreError('lock-lost', 'document lock was lost; saving is blocked'));
    }

    const document = structuredClone(this.documentValue);

    // External modification check by content hash (spec §10.10).
    let currentBytes: Buffer | null = null;
    try {
      currentBytes = await fs.readFile(this.documentPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        return failure(
          coreError('io-error', `could not read document before save: ${errorMessage(error)}`, {
            phase: 'pre-save-read',
            ...ioFailureDetails(error),
          }),
        );
      }
      if (this.lastSaved.exists && options.overwriteExternal !== true) {
        return failure(
          coreError('external-modification', 'document file was deleted externally; refusing to overwrite', {
            path: this.documentPath,
          }),
        );
      }
    }

    if (currentBytes !== null && this.lastSaved.hash !== null) {
      const currentHash = sha256Hex(currentBytes);
      if (currentHash !== this.lastSaved.hash && options.overwriteExternal !== true) {
        return failure(
          coreError('external-modification', 'document changed on disk since it was opened', {
            path: this.documentPath,
            expectedHash: this.lastSaved.hash,
            actualHash: currentHash,
          }),
        );
      }
    }

    if (!this.hasUnsavedChanges && currentBytes !== null && sha256Hex(currentBytes) === this.lastSaved.hash) {
      return finish({
        ok: true,
        changed: false,
        revision: document.revision,
        bytes: currentBytes.byteLength,
        durationMs: 0,
        warnings: [],
      });
    }

    const now = options.now ?? this.now();
    const report = validateDocument(document);
    if (!report.ok) {
      return failure(
        coreError('invalid-document', 'refusing to save an invalid document', {
          errorCount: report.errors.length,
        }),
      );
    }

    if (document.revision < this.lastSaved.revision) {
      document.revision = this.lastSaved.revision;
    }
    document.revision = Math.max(document.revision, this.lastSaved.revision + 1);
    document.updatedAt = now.toISOString();
    const payload = stringifyDocument(document);
    const warnings: string[] = [];

    let backupPath: string | undefined;
    let dailyBackupPath: string | undefined;
    if (options.skipBackup !== true && currentBytes !== null) {
      try {
        const backup = await this.backups.create(currentBytes, {
          kind: 'autosave',
          revision: this.lastSaved.revision,
          now,
        });
        backupPath = backup.path;
        if (!(await this.backups.hasDailyBackup(now))) {
          const daily = await this.backups.create(currentBytes, {
            kind: 'daily',
            revision: this.lastSaved.revision,
            now,
          });
          dailyBackupPath = daily.path;
        }
      } catch (error) {
        return failure(
          coreError('backup-failed', `could not write a safety backup; save aborted: ${errorMessage(error)}`, {
            ...ioFailureDetails(error),
          }),
        );
      }
    }

    try {
      await writeFileAtomic(this.documentPath, payload, {
        ...(this.atomicWriteHooks === undefined ? {} : { hooks: this.atomicWriteHooks }),
      });
    } catch (error) {
      return failure(
        coreError('io-error', `atomic save failed; previous file kept: ${errorMessage(error)}`, {
          path: this.documentPath,
          phase: 'atomic-write',
          ...ioFailureDetails(error),
        }),
      );
    }

    const hash = sha256Hex(payload);
    this.lastSaved = { exists: true, hash, revision: document.revision };
    const current = this.documentValue;
    if (current !== null && current.revision === document.revision) {
      current.revision = document.revision;
      current.updatedAt = document.updatedAt;
      this.dirtyFlag = false;
    } else {
      // Edits landed while the save was in flight; keep them dirty.
      this.dirtyFlag = true;
    }

    try {
      await this.backups.rotate(now);
    } catch (error) {
      warnings.push(`backup rotation failed: ${errorMessage(error)}`);
    }

    if (this.registerRecent) {
      try {
        await recordRecentDocument(
          { documentId: document.id, title: document.title, path: this.packagePath },
          { appSupportDir: this.appSupportDir, limit: this.recentLimit },
        );
      } catch (error) {
        warnings.push(`could not update recent documents: ${errorMessage(error)}`);
      }
    }

    const success: SaveSuccess = {
      ok: true,
      changed: true,
      revision: document.revision,
      bytes: Buffer.byteLength(payload, 'utf8'),
      durationMs: 0,
      warnings,
    };
    if (backupPath !== undefined) success.backupPath = backupPath;
    if (dailyBackupPath !== undefined) success.dailyBackupPath = dailyBackupPath;
    return finish(success);
  }

  async listBackups(): Promise<BackupRecord[]> {
    return this.backups.list();
  }

  /** Create a manual/pre-migration/pre-repair snapshot of the canonical file. */
  async createBackup(kind: BackupKind = 'manual'): Promise<{ ok: true; record: BackupRecord } | { ok: false; error: CoreError }> {
    let bytes: Buffer;
    try {
      bytes = await fs.readFile(this.documentPath);
    } catch (error) {
      return { ok: false, error: coreError('io-error', `cannot read document to back it up: ${errorMessage(error)}`) };
    }
    try {
      const record = await this.backups.create(bytes, {
        kind,
        revision: this.documentValue?.revision ?? this.lastSaved.revision,
        now: this.now(),
      });
      return { ok: true, record };
    } catch (error) {
      return { ok: false, error: coreError('backup-failed', `backup failed: ${errorMessage(error)}`) };
    }
  }

  /** Refresh the lock heartbeat; sets lockLost on failure. */
  async refreshLock(): Promise<{ ok: true } | { ok: false; error: CoreError }> {
    if (this.closedFlag) {
      return { ok: false, error: coreError('lock-lost', 'store is closed') };
    }
    if (this.lockHandle === null) {
      return { ok: false, error: coreError('lock-lost', 'no lock handle for this store') };
    }
    try {
      await this.lockHandle.refresh();
      return { ok: true };
    } catch (error) {
      this.lockLostFlag = true;
      this.stopHeartbeat();
      return { ok: false, error: coreError('lock-lost', errorMessage(error)) };
    }
  }

  async readLock(): Promise<Awaited<ReturnType<typeof readDocumentLock>>> {
    return readDocumentLock(this.packagePath, {
      appSupportDir: this.appSupportDir,
    });
  }

  /** Release the single-writer lock. Does not autosave. */
  async close(): Promise<{ released: boolean }> {
    this.stopHeartbeat();
    this.closedFlag = true;
    await this.saveQueue.catch(() => undefined);
    if (this.lockHandle === null) return { released: false };
    const handle = this.lockHandle;
    this.lockHandle = null;
    const released = await handle.release();
    return { released };
  }

  stats(): { revision: number | null; blocks: number; chapters: number; branches: number } {
    if (this.documentValue === null) {
      return { revision: null, blocks: 0, chapters: 0, branches: 0 };
    }
    const stats = documentStats(this.documentValue);
    return {
      revision: this.documentValue.revision,
      blocks: stats.blocks,
      chapters: stats.chapters,
      branches: stats.branches,
    };
  }

  private startHeartbeat(): void {
    if (this.heartbeatIntervalMs <= 0) return;
    this.heartbeatTimer = setInterval(() => {
      void this.refreshLock();
    }, this.heartbeatIntervalMs);
    // Do not keep the Node process alive just for a lock heartbeat.
    this.heartbeatTimer.unref?.();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Open / create
// ---------------------------------------------------------------------------

function resolvePaths(packagePath: string, options: DocumentStoreOptions) {
  const resolved = path.resolve(packagePath);
  const appSupportDir = options.appSupportDir ?? defaultAppSupportDir();
  return { resolved, appSupportDir };
}

function readOnlyOptions(lockFailure: {
  reason: 'locked' | 'stale-lock';
  message: string;
  lockPath: string;
  existing: unknown;
}): CoreError {
  return coreError(
    lockFailure.reason === 'stale-lock' ? 'stale-lock' : 'document-locked',
    lockFailure.message,
    { lockPath: lockFailure.lockPath, existing: lockFailure.existing },
  );
}

export async function openDocumentPackage(
  packagePath: string,
  options: DocumentStoreOptions = {},
): Promise<OpenDocumentResult> {
  const { resolved, appSupportDir } = resolvePaths(packagePath, options);
  const documentPath = documentJsonPath(resolved);
  const wantWrite = options.mode !== 'read';
  const errors: CoreError[] = [];
  const warnings: ValidationIssue[] = [];

  const backupsDir =
    options.backupsDir ?? backupsDirForPackage(appSupportDir, resolved);

  let lockHandle: LockHandle | null = null;
  let lockFailure: {
    reason: 'locked' | 'stale-lock';
    message: string;
    lockPath: string;
    existing: LockRecord | null;
    corrupt: boolean;
  } | null = null;
  if (wantWrite) {
    const lockOptions: AcquireLockOptions = {
      appSupportDir,
      ...(options.lockDir === undefined ? {} : { lockDir: options.lockDir }),
      ...(options.lockStaleAfterMs === undefined ? {} : { staleAfterMs: options.lockStaleAfterMs }),
      ...(options.breakStaleLock === undefined ? {} : { breakStale: options.breakStaleLock }),
    };
    try {
      const acquired = await acquireDocumentLock(resolved, lockOptions);
      if (acquired.ok) {
        lockHandle = acquired.handle;
      } else {
        lockFailure = {
          reason: acquired.reason,
          message: acquired.message,
          lockPath: acquired.lockPath,
          existing: acquired.existing,
          corrupt: acquired.corrupt,
        };
      }
    } catch (error) {
      lockFailure = {
        reason: 'locked',
        message: `could not acquire document lock: ${errorMessage(error)}`,
        lockPath: '',
        existing: null,
        corrupt: false,
      };
    }
  }

  let rawText: string | null = null;
  let readError: CoreError | null = null;
  try {
    rawText = await fs.readFile(documentPath, 'utf8');
  } catch (error) {
    readError = coreError(
      'not-found',
      (error as NodeJS.ErrnoException).code === 'ENOENT'
        ? 'document.json does not exist'
        : `could not read document.json: ${errorMessage(error)}`,
      { path: documentPath },
    );
  }

  if (rawText === null) {
    if (lockHandle !== null) await lockHandle.release().catch(() => undefined);
    errors.push(readError ?? coreError('not-found', 'document.json is missing'));
    const store = new DocumentStore({
      packagePath: resolved,
      appSupportDir,
      backupsDir,
      readOnly: true,
      readOnlyReason: 'missing',
      document: null,
      errors,
      warnings,
      lastSaved: { exists: false, hash: null, revision: 0 },
      lockHandle: null,
      options,
    });
    return {
      status: 'read-only',
      readOnlyReason: 'missing',
      document: null,
      errors,
      warnings,
      packagePath: resolved,
      store,
    };
  }

  const parsed = parseDocumentJson(rawText);
  if (!parsed.ok) {
    if (lockHandle !== null) await lockHandle.release().catch(() => undefined);
    errors.push(parsed.error);
    if (parsed.report !== undefined) warnings.push(...parsed.report.warnings);
    const reason: ReadOnlyReason =
      parsed.error.code === 'newer-schema'
        ? 'newer-schema'
        : parsed.error.code === 'malformed-json'
          ? 'corrupt'
          : 'invalid';
    const store = new DocumentStore({
      packagePath: resolved,
      appSupportDir,
      backupsDir,
      readOnly: true,
      readOnlyReason: reason,
      document: null,
      errors,
      warnings,
      lastSaved: { exists: true, hash: sha256Hex(rawText), revision: 0 },
      lockHandle: null,
      options,
    });
    return {
      status: 'read-only',
      readOnlyReason: reason,
      document: null,
      errors,
      warnings,
      packagePath: resolved,
      store,
    };
  }

  warnings.push(...parsed.report.warnings);
  let status: 'editable' | 'read-only' = 'editable';
  let readOnlyReason: ReadOnlyReason | undefined;
  if (options.mode === 'read') {
    status = 'read-only';
    readOnlyReason = 'requested';
  } else if (lockFailure !== null) {
    status = 'read-only';
    readOnlyReason = lockFailure.reason;
    errors.push(readOnlyOptions(lockFailure));
  }

  const store = new DocumentStore({
    packagePath: resolved,
    appSupportDir,
    backupsDir,
    readOnly: status === 'read-only',
    ...(readOnlyReason === undefined ? {} : { readOnlyReason }),
    ...(lockFailure === null
      ? {}
      : { lockInfo: { record: lockFailure.existing, corrupt: lockFailure.corrupt } }),
    document: parsed.document,
    errors,
    warnings,
    lastSaved: {
      exists: true,
      hash: sha256Hex(rawText),
      revision: parsed.document.revision,
    },
    lockHandle: status === 'editable' ? lockHandle : null,
    options,
  });

  if (status === 'read-only' && lockHandle !== null) {
    await lockHandle.release().catch(() => undefined);
  }

  if (options.registerRecent !== false) {
    try {
      await recordRecentDocument(
        {
          documentId: parsed.document.id,
          title: parsed.document.title,
          path: resolved,
        },
        {
          appSupportDir,
          limit: options.recentLimit ?? 50,
        },
      );
    } catch (error) {
      warnings.push({
        severity: 'warning',
        code: 'invalid-shape',
        message: `could not update recent documents: ${errorMessage(error)}`,
      });
    }
  }

  return {
    status,
    ...(readOnlyReason === undefined ? {} : { readOnlyReason }),
    document: parsed.document,
    errors,
    warnings,
    packagePath: resolved,
    store,
  };
}

export interface CreateDocumentPackageInput {
  title?: string;
  id?: string;
  chapterId?: string;
  chapterTitle?: string;
}

export interface CreateDocumentPackageResult {
  ok: true;
  packagePath: string;
  document: Document;
  store: DocumentStore;
  warnings: ValidationIssue[];
}

export interface CreateDocumentPackageFailure {
  ok: false;
  error: CoreError;
}

export async function createDocumentPackage(
  libraryDir: string,
  input: CreateDocumentPackageInput = {},
  options: DocumentStoreOptions = {},
): Promise<CreateDocumentPackageResult | CreateDocumentPackageFailure> {
  const { appSupportDir } = resolvePaths(libraryDir, options);
  const context = createContext({
    ...(options.idFactory === undefined ? {} : { newId: options.idFactory }),
    ...(options.clock === undefined ? {} : { now: options.clock }),
  });

  const command: DocumentCommand = {
    type: 'document.create',
    title: input.title ?? 'Untitled',
    ...(input.id === undefined ? {} : { id: input.id }),
    ...(input.chapterId === undefined ? {} : { chapterId: input.chapterId }),
    ...(input.chapterTitle === undefined ? {} : { chapterTitle: input.chapterTitle }),
  };

  const created = executeCommand(null, command, { context });
  if (!created.ok) {
    return {
      ok: false,
      error: coreError('invalid-command', created.message, { commandCode: created.code }),
    };
  }
  const document = created.document;

  let packageDir: string;
  try {
    packageDir = await createUniquePackageDir(libraryDir, document.title);
  } catch (error) {
    return { ok: false, error: coreError('io-error', `could not create document folder: ${errorMessage(error)}`) };
  }

  const backupsDir =
    options.backupsDir ?? backupsDirForPackage(appSupportDir, packageDir);
  let lockHandle: LockHandle | null = null;
  try {
    await fs.mkdir(assetsDirPath(packageDir), { recursive: true });
    const acquired = await acquireDocumentLock(packageDir, {
      appSupportDir,
      ...(options.lockDir === undefined ? {} : { lockDir: options.lockDir }),
      documentId: document.id,
    });
    if (!acquired.ok) {
      await fs.rm(packageDir, { recursive: true, force: true }).catch(() => undefined);
      return {
        ok: false,
        error: coreError(
          acquired.reason === 'stale-lock' ? 'stale-lock' : 'document-locked',
          acquired.message,
          { lockPath: acquired.lockPath },
        ),
      };
    }
    lockHandle = acquired.handle;
    const payload = stringifyDocument(document);
    await writeFileAtomic(documentJsonPath(packageDir), payload, {
      ...(options.atomicWriteHooks === undefined ? {} : { hooks: options.atomicWriteHooks }),
    });
    const store = new DocumentStore({
      packagePath: packageDir,
      appSupportDir,
      backupsDir,
      readOnly: false,
      document,
      errors: [],
      warnings: created.warnings.map((message) => ({
        severity: 'warning',
        code: 'invalid-shape',
        message,
      })),
      lastSaved: { exists: true, hash: sha256Hex(payload), revision: document.revision },
      lockHandle,
      options,
    });
    if (options.registerRecent !== false) {
      try {
        await recordRecentDocument(
          { documentId: document.id, title: document.title, path: packageDir },
          { appSupportDir, limit: options.recentLimit ?? 50 },
        );
      } catch {
        // Recent manifest failure must not fail document creation.
      }
    }
    return {
      ok: true,
      packagePath: packageDir,
      document,
      store,
      warnings: [],
    };
  } catch (error) {
    if (lockHandle !== null) await lockHandle.release().catch(() => undefined);
    await fs.rm(packageDir, { recursive: true, force: true }).catch(() => undefined);
    return {
      ok: false,
      error: coreError('io-error', `could not create document package: ${errorMessage(error)}`),
    };
  }
}

/** Convenience alias for callers that only need the affected IDs after apply. */
