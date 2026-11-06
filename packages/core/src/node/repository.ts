/**
 * Typed document repository boundary (Node implementation).
 *
 * The renderer never sees a filesystem path it can write. The Electron main
 * process talks to this repository for load/validate/save/backup/list, and the
 * repository delegates every write to `DocumentStore` so atomic save,
 * backup-before-write, single-writer lock, recovery, external-modification,
 * and newer-document behavior stay exactly where they already are.
 *
 * The repository owns the open-store registry for one process. Opening a
 * package twice returns the same store; closing it releases the lock and
 * removes it from the registry. Listing is read-only and never takes a lock.
 */

import { promises as fs, type Dirent } from 'node:fs';
import path from 'node:path';
import type { BackupKind, BackupRecord } from './backups.js';
import { defaultAppSupportDir, documentJsonPath, packageTitle } from './paths.js';
import type { RecoveryCandidate, RecoveryOptions } from './recovery.js';
import { inspectRecoveryCandidates } from './recovery.js';
import type {
  CreateDocumentPackageFailure,
  CreateDocumentPackageInput,
  CreateDocumentPackageResult,
  DocumentStore,
  DocumentStoreOptions,
  OpenDocumentResult,
  SaveOptions,
  SaveResult,
} from './store.js';
import { createDocumentPackage, openDocumentPackage } from './store.js';
import type { CoreError, ValidationIssue } from '../errors.js';
import { coreError } from '../errors.js';
import { parseDocumentJson } from '../serialize.js';
import type { Document } from '../types.js';
import { documentStats } from '../types.js';

export type DocumentPackageStatus = 'ok' | 'missing' | 'unreadable' | 'newer-schema';

/** Read-only summary of one package folder. Mirrors the library row shape. */
export interface DocumentPackageSummary {
  packagePath: string;
  title: string;
  status: DocumentPackageStatus;
  /** Human reason for a non-ok status; absent for ok rows. */
  reason?: string;
  documentId: string | null;
  revision: number | null;
  updatedAt: string;
  blockCount: number;
  chapterCount: number;
}

export interface DocumentPackageList {
  libraryPath: string;
  documents: DocumentPackageSummary[];
  warnings: string[];
}

export interface RepositoryValidationSuccess {
  ok: true;
  document: Document;
  warnings: ValidationIssue[];
  schemaVersion: number;
  /** Set when an older on-disk document was upgraded during validation. */
  migratedFrom?: number;
  migrationsApplied?: string[];
}

export interface RepositoryValidationFailure {
  ok: false;
  error: CoreError;
  warnings: ValidationIssue[];
  /** Best-effort version from the raw JSON; null for corrupt/missing files. */
  schemaVersion: number | null;
}

export type RepositoryValidationResult =
  | RepositoryValidationSuccess
  | RepositoryValidationFailure;

export type RepositoryOpenOptions = DocumentStoreOptions;
export type RepositoryCreateOptions = DocumentStoreOptions;

export interface RepositoryBackupListOptions {
  appSupportDir?: string;
  backupsDir?: string;
  /** Maximum candidates to inspect (default 50, as recovery). */
  maxBackups?: number;
}

export type RepositoryBackupResult =
  | { ok: true; record: BackupRecord }
  | { ok: false; error: CoreError };

export interface RepositoryCloseOptions {
  /** Save unsaved changes before closing (default false). */
  save?: boolean;
}

/**
 * Persistence boundary used by the Electron main process.
 *
 * Implementations must preserve the core store's save semantics; this
 * interface exists to make the boundary explicit, not to create a second save
 * path. `validate` and `list` are read-only and never take the writer lock.
 */
export interface DocumentRepository {
  /** Open one package, reusing an already-open store. Validates and migrates. */
  open(packagePath: string, options?: RepositoryOpenOptions): Promise<OpenDocumentResult>;
  /** Validate one package without locking or writing. */
  validate(packagePath: string): Promise<RepositoryValidationResult>;
  /** Create a package in a library and register its writable store. */
  create(
    libraryDir: string,
    input?: CreateDocumentPackageInput,
    options?: RepositoryCreateOptions,
  ): Promise<CreateDocumentPackageResult | CreateDocumentPackageFailure>;
  /** Atomic save with backup-before-write and external-modification checks. */
  save(packagePath: string, options?: SaveOptions): Promise<SaveResult>;
  /** Snapshot the canonical file (manual, pre-migration, pre-repair). */
  backup(packagePath: string, kind?: BackupKind): Promise<RepositoryBackupResult>;
  /** List temp/backup candidates for a package, newest first; never writes. */
  listBackups(
    packagePath: string,
    options?: RepositoryBackupListOptions,
  ): Promise<RecoveryCandidate[]>;
  /** Validate and summarize every package folder in a library; never writes. */
  list(libraryDir: string): Promise<DocumentPackageList>;
  /** The open store for a package, or null. */
  get(packagePath: string): DocumentStore | null;
  /** Release the lock and forget the store; optionally save first. */
  close(packagePath: string, options?: RepositoryCloseOptions): Promise<void>;
  closeAll(): Promise<void>;
  /** Open packages with unsaved changes. */
  dirty(): Array<{ packagePath: string; title: string }>;
  saveAllDirty(): Promise<Array<{ packagePath: string; error: string }>>;
}

export interface NodeDocumentRepositoryOptions {
  /** Resolve app support per call; defaults to `defaultAppSupportDir`. */
  appSupportDir?: () => string;
  /** Base options merged into every open/create (tests, CLI). */
  defaultStoreOptions?: DocumentStoreOptions;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rawSchemaVersion(rawText: string): number | null {
  try {
    const value: unknown = JSON.parse(rawText);
    if (isRecord(value) && typeof value['schemaVersion'] === 'number') {
      return value['schemaVersion'];
    }
  } catch {
    return null;
  }
  return null;
}

function openResultFromStore(store: DocumentStore): OpenDocumentResult {
  return {
    status: store.readOnly ? 'read-only' : 'editable',
    ...(store.readOnlyReason === undefined ? {} : { readOnlyReason: store.readOnlyReason }),
    document: store.document,
    errors: store.errors,
    warnings: store.warnings,
    packagePath: store.packagePath,
    store,
  };
}

export class NodeDocumentRepository implements DocumentRepository {
  private readonly stores = new Map<string, DocumentStore>();

  private readonly resolveAppSupportDir: () => string;

  private readonly defaults: DocumentStoreOptions;

  constructor(options: NodeDocumentRepositoryOptions = {}) {
    this.resolveAppSupportDir = options.appSupportDir ?? defaultAppSupportDir;
    this.defaults = options.defaultStoreOptions ?? {};
  }

  private storeOptions(options: DocumentStoreOptions = {}): DocumentStoreOptions {
    const appSupportDir =
      options.appSupportDir ?? this.defaults.appSupportDir ?? this.resolveAppSupportDir();
    return { ...this.defaults, ...options, appSupportDir };
  }

  get(packagePath: string): DocumentStore | null {
    const resolved = path.resolve(packagePath);
    const store = this.stores.get(resolved);
    if (store === undefined) return null;
    if (store.closed) {
      this.stores.delete(resolved);
      return null;
    }
    return store;
  }

  /**
   * Every live store with a loaded document. Used by the main-process asset
   * protocol to resolve a content-addressed id without exposing package paths
   * to the renderer. Read-only; never opens or locks a package.
   */
  openStores(): DocumentStore[] {
    const open: DocumentStore[] = [];
    for (const [packagePath, store] of this.stores) {
      if (store.closed) {
        this.stores.delete(packagePath);
        continue;
      }
      if (store.document !== null) open.push(store);
    }
    return open;
  }

  async open(
    packagePath: string,
    options: RepositoryOpenOptions = {},
  ): Promise<OpenDocumentResult> {
    const resolved = path.resolve(packagePath);
    const existing = this.get(resolved);
    if (existing !== null) return openResultFromStore(existing);

    const result = await openDocumentPackage(resolved, this.storeOptions(options));
    if (result.document === null) {
      // Recovery-only stores have no document, no lock, and no writable path.
      await result.store.close().catch(() => undefined);
      return result;
    }
    this.stores.set(resolved, result.store);
    return result;
  }

  async validate(packagePath: string): Promise<RepositoryValidationResult> {
    const resolved = path.resolve(packagePath);
    const documentPath = documentJsonPath(resolved);
    let text: string;
    try {
      text = await fs.readFile(documentPath, 'utf8');
    } catch (error) {
      const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
      return {
        ok: false,
        warnings: [],
        schemaVersion: null,
        error: coreError(
          missing ? 'not-found' : 'io-error',
          missing
            ? 'document.json does not exist'
            : `could not read document.json: ${
                error instanceof Error ? error.message : String(error)
              }`,
          { path: documentPath },
        ),
      };
    }

    const parsed = parseDocumentJson(text);
    if (!parsed.ok) {
      return {
        ok: false,
        error: parsed.error,
        warnings: parsed.report?.warnings ?? [],
        schemaVersion: rawSchemaVersion(text),
      };
    }
    return {
      ok: true,
      document: parsed.document,
      warnings: parsed.report.warnings,
      schemaVersion: parsed.document.schemaVersion,
      ...(parsed.migratedFrom === undefined
        ? {}
        : {
            migratedFrom: parsed.migratedFrom,
            migrationsApplied: parsed.migrationsApplied ?? [],
          }),
    };
  }

  async create(
    libraryDir: string,
    input: CreateDocumentPackageInput = {},
    options: RepositoryCreateOptions = {},
  ): Promise<CreateDocumentPackageResult | CreateDocumentPackageFailure> {
    const result = await createDocumentPackage(
      libraryDir,
      input,
      this.storeOptions(options),
    );
    if (result.ok) {
      this.stores.set(path.resolve(result.packagePath), result.store);
    }
    return result;
  }

  async save(packagePath: string, options: SaveOptions = {}): Promise<SaveResult> {
    const store = this.get(packagePath);
    if (store === null) {
      return {
        ok: false,
        durationMs: 0,
        error: coreError('not-found', 'no open document package to save'),
      };
    }
    return store.save(options);
  }

  async backup(packagePath: string, kind: BackupKind = 'manual'): Promise<RepositoryBackupResult> {
    const store = this.get(packagePath);
    if (store === null) {
      return { ok: false, error: coreError('not-found', 'no open document package to back up') };
    }
    return store.createBackup(kind);
  }

  async listBackups(
    packagePath: string,
    options: RepositoryBackupListOptions = {},
  ): Promise<RecoveryCandidate[]> {
    const resolved = path.resolve(packagePath);
    const recoveryOptions: RecoveryOptions = {
      appSupportDir:
        options.appSupportDir ?? this.defaults.appSupportDir ?? this.resolveAppSupportDir(),
      includeCanonical: false,
      ...(options.backupsDir === undefined ? {} : { backupsDir: options.backupsDir }),
      ...(options.maxBackups === undefined ? {} : { maxBackups: options.maxBackups }),
    };
    return inspectRecoveryCandidates(resolved, recoveryOptions);
  }

  async list(libraryDir: string): Promise<DocumentPackageList> {
    const directory = path.resolve(libraryDir);
    const documents: DocumentPackageSummary[] = [];
    const warnings: string[] = [];

    let entries: Dirent[] = [];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      warnings.push(
        `Could not read the library: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const packagePath = path.join(directory, entry.name);
      const jsonPath = documentJsonPath(packagePath);
      let updatedAt = new Date().toISOString();
      try {
        updatedAt = (await fs.stat(packagePath)).mtime.toISOString();
      } catch {
        // The folder vanished between readdir and stat; still report it.
      }

      let text: string;
      try {
        text = await fs.readFile(jsonPath, 'utf8');
      } catch (error) {
        const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
        documents.push({
          packagePath,
          title: packageTitle(packagePath, null),
          status: missing ? 'missing' : 'unreadable',
          reason: missing
            ? 'document.json is missing from this folder'
            : `could not read document.json: ${
                error instanceof Error ? error.message : String(error)
              }`,
          documentId: null,
          revision: null,
          updatedAt,
          blockCount: 0,
          chapterCount: 0,
        });
        continue;
      }

      const parsed = parseDocumentJson(text);
      if (!parsed.ok) {
        const newer = parsed.error.code === 'newer-schema';
        documents.push({
          packagePath,
          title: packageTitle(packagePath, text),
          status: newer ? 'newer-schema' : 'unreadable',
          reason: parsed.error.message,
          documentId: null,
          revision: null,
          updatedAt,
          blockCount: 0,
          chapterCount: 0,
        });
        continue;
      }

      const stats = documentStats(parsed.document);
      documents.push({
        packagePath,
        title: parsed.document.title,
        status: 'ok',
        documentId: parsed.document.id,
        revision: parsed.document.revision,
        updatedAt: parsed.document.updatedAt,
        blockCount: stats.blocks,
        chapterCount: stats.chapters,
      });
    }

    documents.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return { libraryPath: directory, documents, warnings };
  }

  async close(packagePath: string, options: RepositoryCloseOptions = {}): Promise<void> {
    const resolved = path.resolve(packagePath);
    const store = this.stores.get(resolved);
    if (store === undefined) return;
    try {
      if (options.save === true && store.hasUnsavedChanges) await store.save({});
    } catch {
      // Closing still releases the lock; the failure is surfaced by the save path.
    }
    await store.close().catch(() => undefined);
    this.stores.delete(resolved);
  }

  async closeAll(): Promise<void> {
    for (const store of this.stores.values()) {
      await store.close().catch(() => undefined);
    }
    this.stores.clear();
  }

  dirty(): Array<{ packagePath: string; title: string }> {
    const dirty: Array<{ packagePath: string; title: string }> = [];
    for (const store of this.stores.values()) {
      if (store.document !== null && store.hasUnsavedChanges) {
        dirty.push({ packagePath: store.packagePath, title: store.document.title });
      }
    }
    return dirty;
  }

  async saveAllDirty(): Promise<Array<{ packagePath: string; error: string }>> {
    const failures: Array<{ packagePath: string; error: string }> = [];
    for (const store of this.stores.values()) {
      if (!store.hasUnsavedChanges) continue;
      const result = await store.save({});
      if (!result.ok) failures.push({ packagePath: store.packagePath, error: result.error.message });
    }
    return failures;
  }
}

/** Shared repository used by the Electron main process. */
export function createDocumentRepository(
  options: NodeDocumentRepositoryOptions = {},
): NodeDocumentRepository {
  return new NodeDocumentRepository(options);
}
