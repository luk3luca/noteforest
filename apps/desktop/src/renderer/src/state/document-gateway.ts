/**
 * Typed port for the document-platform calls a runtime needs.
 *
 * `DocumentRuntime` must not reach into `window.noteforest` directly: the
 * Electron/preload bridge is one adapter behind this interface, an in-memory
 * adapter serves tests, and a future local API can implement the same calls
 * without touching document, save, or editor semantics.
 *
 * Implementations pass typed results through unchanged, including failure
 * codes and user-facing messages; the port never translates an error.
 */

import type { DocumentCommand } from '@noteforest/core';
import type {
  ApplyResult,
  MaterializeDraftResult,
  ReloadDocumentResult,
  RestoreBackupResult,
  SaveCopyResult,
  SaveRequestOptions,
  SaveResult,
  TakeOverLockResult,
} from '../../../shared/api';

export interface DocumentGateway {
  /** Explicit stale-lock takeover; never automatic. */
  takeOverLock(packagePath: string): Promise<TakeOverLockResult>;
  /** Materialize a draft into a package; returns the new path (idempotent). */
  materializeDraft(documentKey: string): Promise<MaterializeDraftResult>;
  /** Apply one typed command to the canonical document in the main process. */
  apply(packagePath: string, command: DocumentCommand): Promise<ApplyResult>;
  /** Write the canonical document to disk (atomic save + backup in main). */
  save(packagePath: string, options?: SaveRequestOptions): Promise<SaveResult>;
  /** Write the current canonical content to a new package via native dialog. */
  saveCopy(packagePath: string): Promise<SaveCopyResult>;
  /** Restore one listed backup as a new copy; never overwrites. */
  restoreBackup(packagePath: string, sourcePath: string): Promise<RestoreBackupResult>;
  /** Reopen the package from disk; the main process reacquires the lock. */
  reloadDocument(packagePath: string): Promise<ReloadDocumentResult>;
}
