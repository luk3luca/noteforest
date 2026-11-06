/**
 * In-memory `DocumentGateway` for renderer tests.
 *
 * It implements the same typed contract as the Electron adapter without IPC,
 * files, or native dialogs:
 *
 * - `apply` executes the real core command pipeline against an in-memory
 *   document, so structural results (revision, inverse, created IDs) match the
 *   main process contract;
 * - `save` records calls, reports whether the revision changed, and can return
 *   scripted failures such as `external-modification` or `permission`;
 * - recovery calls (`saveCopy`, `restoreBackup`, `reloadDocument`,
 *   `takeOverLock`) return scripted results, with reload/takeover succeeding
 *   against the in-memory snapshot by default.
 *
 * Scripted results are consumed FIFO per method; the default remains in effect
 * when the queue is empty.
 */

import { executeCommand, type Document, type DocumentCommand } from '@noteforest/core';
import type {
  ApplyResult,
  OpenDocumentSnapshot,
  OpenStatus,
  ReloadDocumentResult,
  RestoreBackupResult,
  SaveCopyResult,
  SaveRequestOptions,
  SaveResult,
  TakeOverLockResult,
} from '../../../shared/api';
import type { DocumentGateway } from './document-gateway';

export type InMemoryGatewayCall =
  | { readonly method: 'takeOverLock'; readonly packagePath: string }
  | {
      readonly method: 'apply';
      readonly packagePath: string;
      readonly command: DocumentCommand;
    }
  | {
      readonly method: 'save';
      readonly packagePath: string;
      readonly options?: SaveRequestOptions;
    }
  | { readonly method: 'saveCopy'; readonly packagePath: string }
  | {
      readonly method: 'restoreBackup';
      readonly packagePath: string;
      readonly sourcePath: string;
    }
  | { readonly method: 'reloadDocument'; readonly packagePath: string };

export interface InMemoryDocumentGateway {
  /** The port to inject into `DocumentRuntime`. */
  readonly gateway: DocumentGateway;
  /** Every platform call, in order, with its arguments. */
  readonly calls: InMemoryGatewayCall[];
  currentDocument(): Document;
  currentStatus(): OpenStatus;
  /** Replace the canonical document (simulates an external reload/takeover). */
  setDocument(document: Document): void;
  setStatus(status: OpenStatus, readOnlyReason?: string): void;
  queueSave(result: SaveResult): void;
  queueApply(result: ApplyResult): void;
  queueSaveCopy(result: SaveCopyResult): void;
  queueRestoreBackup(result: RestoreBackupResult): void;
  queueReload(result: ReloadDocumentResult): void;
  queueTakeOverLock(result: TakeOverLockResult): void;
}

export interface InMemoryDocumentGatewayOptions {
  packagePath: string;
  document: Document;
  status?: OpenStatus;
  readOnlyReason?: string;
}

export function createInMemoryDocumentGateway(
  options: InMemoryDocumentGatewayOptions,
): InMemoryDocumentGateway {
  let document = options.document;
  let status: OpenStatus = options.status ?? 'editable';
  let readOnlyReason = options.readOnlyReason;
  let savedRevision = document.revision;
  const calls: InMemoryGatewayCall[] = [];
  const saveResults: SaveResult[] = [];
  const applyResults: ApplyResult[] = [];
  const saveCopyResults: SaveCopyResult[] = [];
  const restoreBackupResults: RestoreBackupResult[] = [];
  const reloadResults: ReloadDocumentResult[] = [];
  const takeOverLockResults: TakeOverLockResult[] = [];

  const snapshot = (): OpenDocumentSnapshot => ({
    packagePath: options.packagePath,
    document,
    status,
    ...(readOnlyReason === undefined ? {} : { readOnlyReason }),
    errors: [],
    warnings: [],
  });

  const gateway: DocumentGateway = {
    takeOverLock: async (packagePath) => {
      calls.push({ method: 'takeOverLock', packagePath });
      const scripted = takeOverLockResults.shift();
      if (scripted !== undefined) {
        if (scripted.ok) {
          document = scripted.snapshot.document;
          status = scripted.snapshot.status;
          readOnlyReason = scripted.snapshot.readOnlyReason;
        }
        return scripted;
      }
      status = 'editable';
      readOnlyReason = undefined;
      return { ok: true, snapshot: snapshot() };
    },

    apply: async (packagePath, command) => {
      calls.push({ method: 'apply', packagePath, command });
      const scripted = applyResults.shift();
      if (scripted !== undefined) return scripted;
      const result = executeCommand(document, command);
      if (!result.ok) {
        return { ok: false, message: result.message, code: result.code };
      }
      document = result.document;
      return {
        ok: true,
        document: result.document,
        revision: result.document.revision,
        created: result.created,
        inverse: result.inverse,
      };
    },

    save: async (packagePath, saveOptions) => {
      calls.push({
        method: 'save',
        packagePath,
        ...(saveOptions === undefined ? {} : { options: saveOptions }),
      });
      const scripted = saveResults.shift();
      if (scripted !== undefined) {
        if (scripted.ok) savedRevision = scripted.revision;
        return scripted;
      }
      const changed = document.revision !== savedRevision;
      savedRevision = document.revision;
      return { ok: true, changed, revision: document.revision };
    },

    saveCopy: async (packagePath) => {
      calls.push({ method: 'saveCopy', packagePath });
      return saveCopyResults.shift() ?? { ok: false, canceled: true };
    },

    restoreBackup: async (packagePath, sourcePath) => {
      calls.push({ method: 'restoreBackup', packagePath, sourcePath });
      return restoreBackupResults.shift() ?? { ok: false, canceled: true };
    },

    reloadDocument: async (packagePath) => {
      calls.push({ method: 'reloadDocument', packagePath });
      return reloadResults.shift() ?? { ok: true, snapshot: snapshot() };
    },
  };

  return {
    gateway,
    calls,
    currentDocument: () => document,
    currentStatus: () => status,
    setDocument: (next) => {
      document = next;
    },
    setStatus: (next, reason) => {
      status = next;
      readOnlyReason = reason;
    },
    queueSave: (result) => saveResults.push(result),
    queueApply: (result) => applyResults.push(result),
    queueSaveCopy: (result) => saveCopyResults.push(result),
    queueRestoreBackup: (result) => restoreBackupResults.push(result),
    queueReload: (result) => reloadResults.push(result),
    queueTakeOverLock: (result) => takeOverLockResults.push(result),
  };
}
