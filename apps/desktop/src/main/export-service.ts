/**
 * M4c2 export service: wires the job manager to the app renderer and the
 * hidden print window, and owns the main-process IPC surface.
 *
 * The renderer holds the only current document (including unsaved edits), so
 * the job asks it for a snapshot; the hidden print window then measures that
 * snapshot. The main process never opens `document.json` for export and never
 * mutates the document.
 */

import { ipcMain, type BrowserWindow } from 'electron';
import { inspectPdf } from '@noteforest/pdf/node';
import type {
  ExportJobView,
  ExportPdfStartResult,
  ExportSnapshot,
} from '../shared/export.js';
import { ExportJobError, PdfExportManager } from './export-job.js';
import {
  openPrintWindowSession,
  type PrintPageTarget,
} from './export-window.js';

const SNAPSHOT_TIMEOUT_MS = 20_000;

interface PendingSnapshot {
  resolve: (snapshot: ExportSnapshot) => void;
  reject: (error: Error) => void;
}

export interface ExportService {
  exportPdf(input: unknown): ExportPdfStartResult;
  getExportJob(jobId: unknown): ExportJobView | null;
  cancelExport(jobId: unknown): boolean;
  handleSnapshotReply(jobId: unknown, reply: unknown): void;
  dispose(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isExportSnapshot(value: unknown): value is ExportSnapshot {
  if (!isRecord(value)) return false;
  return (
    typeof value['packagePath'] === 'string' &&
    typeof value['documentId'] === 'string' &&
    typeof value['title'] === 'string' &&
    typeof value['settingsFingerprint'] === 'string' &&
    isRecord(value['document']) &&
    isRecord(value['settings']) &&
    isRecord(value['assetUrls']) &&
    Array.isArray(value['failedAssetIds'])
  );
}

export interface ExportServiceOptions {
  getWindow: () => BrowserWindow | null;
  /** Production `print.html` file or the dev-server URL. */
  printPageTarget: () => PrintPageTarget;
}

export function createExportService(options: ExportServiceOptions): ExportService {
  const pending = new Map<string, PendingSnapshot>();

  function failPending(jobId: string, error: Error): void {
    const entry = pending.get(jobId);
    if (entry === undefined) return;
    pending.delete(jobId);
    entry.reject(error);
  }

  function requestSnapshot(
    jobId: string,
    packagePath: string,
    signal: AbortSignal,
  ): Promise<ExportSnapshot> {
    const window = options.getWindow();
    if (window === null || window.isDestroyed()) {
      return Promise.reject(
        new ExportJobError('snapshot-failed', 'The NoteForest window is not available.'),
      );
    }
    if (signal.aborted) {
      return Promise.reject(new ExportJobError('cancelled', 'Export cancelled.'));
    }
    return new Promise<ExportSnapshot>((resolveSnapshot, rejectSnapshot) => {
      const timer = setTimeout(() => {
        failPending(
          jobId,
          new ExportJobError(
            'snapshot-timeout',
            `The editor did not provide the current document within ${SNAPSHOT_TIMEOUT_MS} ms.`,
          ),
        );
      }, SNAPSHOT_TIMEOUT_MS);
      const onAbort = (): void => {
        clearTimeout(timer);
        failPending(jobId, new ExportJobError('cancelled', 'Export cancelled.'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      pending.set(jobId, {
        resolve: (snapshot) => {
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
          resolveSnapshot(snapshot);
        },
        reject: (error) => {
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
          rejectSnapshot(error);
        },
      });
      window.webContents.send('export:request-snapshot', { jobId, packagePath });
    });
  }

  const manager = new PdfExportManager({
    requestSnapshot,
    openPrintSession: async ({ jobId, snapshot, signal }) => {
      if (signal.aborted) throw new ExportJobError('cancelled', 'Export cancelled.');
      return openPrintWindowSession({ jobId, snapshot, signal }, options.printPageTarget());
    },
    inspectPdf,
  });

  return {
    exportPdf: (input) => manager.exportPdf(input),
    getExportJob: (jobId) =>
      typeof jobId === 'string' && jobId.length > 0 ? manager.getExportJob(jobId) : null,
    cancelExport: (jobId) =>
      typeof jobId === 'string' && jobId.length > 0 ? manager.cancelExport(jobId) : false,
    handleSnapshotReply(jobId, reply: unknown) {
      if (typeof jobId !== 'string') return;
      if (!pending.has(jobId)) return;
      if (reply === null) {
        failPending(
          jobId,
          new ExportJobError('document-not-open', 'The document is not open in NoteForest.'),
        );
        return;
      }
      if (isRecord(reply) && typeof reply['error'] === 'string') {
        failPending(jobId, new ExportJobError('snapshot-failed', reply['error']));
        return;
      }
      if (!isExportSnapshot(reply)) {
        failPending(
          jobId,
          new ExportJobError(
            'snapshot-failed',
            'The editor returned an incomplete document snapshot.',
          ),
        );
        return;
      }
      const entry = pending.get(jobId);
      pending.delete(jobId);
      entry?.resolve(reply);
    },
    dispose() {
      for (const jobId of [...pending.keys()]) {
        failPending(jobId, new ExportJobError('cancelled', 'Export cancelled.'));
      }
      manager.dispose();
    },
  };
}

/** Register the export IPC surface on the main process. */
export function installExportIpc(service: ExportService): void {
  ipcMain.handle('export:pdf', (_event, input: unknown) => service.exportPdf(input));
  ipcMain.handle('export:job', (_event, jobId: unknown) => service.getExportJob(jobId));
  ipcMain.handle('export:cancel', (_event, jobId: unknown) => service.cancelExport(jobId));
  ipcMain.on('export:snapshot', (_event, jobId: unknown, reply: unknown) => {
    service.handleSnapshotReply(jobId, reply);
  });
}
