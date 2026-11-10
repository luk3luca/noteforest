import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings } from '@noteforest/layout';
import type {
  ApplyResult,
  BootstrapResult,
  ChooseExportFolderResult,
  CreateDocumentResult,
  DocumentSettingsSaveResult,
  ExportDefaults,
  ExportJobView,
  ExportPathStatus,
  ExportPdfInput,
  ExportPdfStartResult,
  ExportSnapshotReply,
  ExportSnapshotRequest,
  FlushResult,
  ImportImageBytesInput,
  ImportImageResult,
  LibraryView,
  ListBackupsResult,
  MenuCommand,
  NoteForestApi,
  OpenDocumentResult,
  ReloadDocumentResult,
  RestoreBackupResult,
  RevealResult,
  SaveCopyResult,
  SaveResult,
  SeedResult,
  SessionState,
  SettingsSaveResult,
  TakeOverLockResult,
  WindowState,
} from '../shared/api.js';
import { normalizeFlushResult } from '../shared/flush.js';

const api: NoteForestApi = {
  bootstrap: (): Promise<BootstrapResult> => ipcRenderer.invoke('app:bootstrap'),
  scanLibrary: (): Promise<LibraryView> => ipcRenderer.invoke('library:scan'),
  createDocument: (input): Promise<CreateDocumentResult> =>
    ipcRenderer.invoke('library:create', input),
  openDocument: (packagePath: string): Promise<OpenDocumentResult> =>
    ipcRenderer.invoke('document:open', packagePath),
  takeOverLock: (packagePath: string): Promise<TakeOverLockResult> =>
    ipcRenderer.invoke('document:take-over-lock', packagePath),
  apply: (packagePath: string, command): Promise<ApplyResult> =>
    ipcRenderer.invoke('document:apply', packagePath, command),
  save: (packagePath: string, options): Promise<SaveResult> =>
    ipcRenderer.invoke('document:save', packagePath, options),
  saveCopy: (packagePath: string): Promise<SaveCopyResult> =>
    ipcRenderer.invoke('document:save-copy', packagePath),
  listBackups: (packagePath: string): Promise<ListBackupsResult> =>
    ipcRenderer.invoke('document:list-backups', packagePath),
  restoreBackup: (packagePath: string, sourcePath: string): Promise<RestoreBackupResult> =>
    ipcRenderer.invoke('document:restore-backup', packagePath, sourcePath),
  restoreNewestBackup: (packagePath: string): Promise<RestoreBackupResult> =>
    ipcRenderer.invoke('document:restore-newest-backup', packagePath),
  reloadDocument: (packagePath: string): Promise<ReloadDocumentResult> =>
    ipcRenderer.invoke('document:reload', packagePath),
  closeDocument: (packagePath: string, options): Promise<void> =>
    ipcRenderer.invoke('document:close', packagePath, options),
  revealDocument: (packagePath: string): Promise<RevealResult> =>
    ipcRenderer.invoke('document:reveal', packagePath),
  revealLibrary: (): Promise<void> => ipcRenderer.invoke('library:reveal'),
  revealAppSupport: (): Promise<void> => ipcRenderer.invoke('settings:reveal'),
  saveSession: (state: SessionState): Promise<void> =>
    ipcRenderer.invoke('session:save', state),
  saveSettings: (settings: AppSettings): Promise<SettingsSaveResult> =>
    ipcRenderer.invoke('settings:save', settings),
  saveDocumentSettings: (input): Promise<DocumentSettingsSaveResult> =>
    ipcRenderer.invoke('document-settings:save', input),
  setWindowState: (state: WindowState): Promise<void> =>
    ipcRenderer.invoke('window:set-state', state),
  onMenu: (handler: (command: MenuCommand) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: MenuCommand): void => {
      handler(command);
    };
    ipcRenderer.on('menu:command', listener);
    return () => ipcRenderer.removeListener('menu:command', listener);
  },
  onRequestFlush: (handler: () => Promise<FlushResult>): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, requestId: string): void => {
      void Promise.resolve()
        .then(handler)
        .then((result) => {
          ipcRenderer.send('app:flush-done', requestId, normalizeFlushResult(result));
        })
        .catch((error: unknown) => {
          // A rejected handler is a failed flush, never an acknowledged one.
          const message =
            error instanceof Error && error.message.length > 0 ? error.message : String(error);
          ipcRenderer.send('app:flush-done', requestId, {
            status: 'error',
            error: message,
          } satisfies FlushResult);
        });
    };
    ipcRenderer.on('app:request-flush', listener);
    return () => ipcRenderer.removeListener('app:request-flush', listener);
  },
  debugSeed: (kind): Promise<SeedResult> => ipcRenderer.invoke('debug:seed', kind),
  importImage: (packagePath: string): Promise<ImportImageResult> =>
    ipcRenderer.invoke('document:import-image', packagePath),
  importImageBytes: (
    packagePath: string,
    input: ImportImageBytesInput,
  ): Promise<ImportImageResult> =>
    ipcRenderer.invoke('document:import-image-bytes', packagePath, input),
  copyImageAsset: (
    sourcePackagePath: string,
    targetPackagePath: string,
    assetId: string,
  ): Promise<ImportImageResult> =>
    ipcRenderer.invoke(
      'document:copy-image-asset',
      sourcePackagePath,
      targetPackagePath,
      assetId,
    ),
  getSystemInfo: (): Promise<{
    electron: string;
    chrome: string;
    appVersion: string;
    platform: string;
  }> => ipcRenderer.invoke('system:info'),
  exportPdf: (input: ExportPdfInput): Promise<ExportPdfStartResult> =>
    ipcRenderer.invoke('export:pdf', input),
  getExportJob: (jobId: string): Promise<ExportJobView | null> =>
    ipcRenderer.invoke('export:job', jobId),
  cancelExport: (jobId: string): Promise<boolean> =>
    ipcRenderer.invoke('export:cancel', jobId),
  getExportDefaults: (): Promise<ExportDefaults> =>
    ipcRenderer.invoke('export:defaults'),
  chooseExportFolder: (input): Promise<ChooseExportFolderResult> =>
    ipcRenderer.invoke('export:choose-folder', input),
  exportPathExists: (outputPath: string): Promise<ExportPathStatus> =>
    ipcRenderer.invoke('export:path-exists', outputPath),
  revealExport: (outputPath: string): Promise<RevealResult> =>
    ipcRenderer.invoke('export:reveal', outputPath),
  openExport: (outputPath: string): Promise<RevealResult> =>
    ipcRenderer.invoke('export:open', outputPath),
  onExportSnapshotRequest: (
    handler: (request: ExportSnapshotRequest) => Promise<ExportSnapshotReply>,
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      request: ExportSnapshotRequest,
    ): void => {
      void Promise.resolve()
        .then(() => handler(request))
        .then((reply) => {
          ipcRenderer.send('export:snapshot', request.jobId, reply);
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error && error.message.length > 0 ? error.message : String(error);
          ipcRenderer.send('export:snapshot', request.jobId, { error: message });
        });
    };
    ipcRenderer.on('export:request-snapshot', listener);
    return () => ipcRenderer.removeListener('export:request-snapshot', listener);
  },
};

contextBridge.exposeInMainWorld('noteforest', api);
