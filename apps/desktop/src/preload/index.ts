import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings } from '@noteforest/layout';
import type {
  ApplyResult,
  BootstrapResult,
  ChooseExportFolderResult,
  CreateDocumentResult,
  CreateDraftResult,
  CreateLibraryInput,
  DocumentSettingsRecoveryResult,
  DocumentSettingsSaveResult,
  DraftLibraryResult,
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
  LibraryActionResult,
  LibraryParentChoice,
  LibraryView,
  ListBackupsResult,
  MarkdownImageResolution,
  MarkdownFlushResult,
  MarkdownOpenResult,
  MarkdownSaveInput,
  MarkdownSaveResult,
  MaterializeDraftResult,
  MenuCommand,
  NoteForestApi,
  OpenDocumentResult,
  ReloadDocumentResult,
  RemoveMissingDocumentResult,
  RestoreBackupResult,
  RevealResult,
  SaveCopyResult,
  SaveResult,
  SeedResult,
  SessionState,
  SettingsSaveResult,
  TakeOverLockResult,
  TextEditCommand,
  TrashDocumentResult,
  TrashPreflight,
  WindowState,
} from '../shared/api.js';
import { normalizeFlushResult, normalizeMarkdownFlushResult } from '../shared/flush.js';

const api: NoteForestApi = {
  bootstrap: (): Promise<BootstrapResult> => ipcRenderer.invoke('app:bootstrap'),
  editTextCommand: (command: TextEditCommand): Promise<void> =>
    ipcRenderer.invoke('shell:edit-text-command', command),
  scanLibrary: (root?: string): Promise<LibraryView> => ipcRenderer.invoke('library:scan', root),
  createDocument: (input): Promise<CreateDocumentResult> =>
    ipcRenderer.invoke('library:create', input),
  createDraft: (): Promise<CreateDraftResult> => ipcRenderer.invoke('draft:create'),
  materializeDraft: (documentKey: string): Promise<MaterializeDraftResult> =>
    ipcRenderer.invoke('draft:materialize', documentKey),
  chooseDraftLibrary: (documentKey: string): Promise<DraftLibraryResult> =>
    ipcRenderer.invoke('draft:choose-library', documentKey),
  openLibrary: (): Promise<LibraryActionResult> => ipcRenderer.invoke('library:open'),
  chooseLibraryParent: (): Promise<LibraryParentChoice> =>
    ipcRenderer.invoke('library:choose-parent'),
  createLibrary: (input: CreateLibraryInput): Promise<LibraryActionResult> =>
    ipcRenderer.invoke('library:create-root', input),
  switchLibrary: (libraryPath: string): Promise<LibraryActionResult> =>
    ipcRenderer.invoke('library:switch', libraryPath),
  removeRecentLibrary: (libraryPath: string): Promise<LibraryActionResult> =>
    ipcRenderer.invoke('library:remove-recent', libraryPath),
  locateLibrary: (missingPath: string): Promise<LibraryActionResult> =>
    ipcRenderer.invoke('library:locate', missingPath),
  refreshLibrary: (): Promise<LibraryView> => ipcRenderer.invoke('library:refresh'),
  openDocument: (packagePath: string): Promise<OpenDocumentResult> =>
    ipcRenderer.invoke('document:open', packagePath),
  openMarkdownFile: (): Promise<MarkdownOpenResult> => ipcRenderer.invoke('markdown:open'),
  readMarkdownFile: (path: string): Promise<MarkdownOpenResult> =>
    ipcRenderer.invoke('markdown:read', path),
  saveMarkdownFile: (input: MarkdownSaveInput): Promise<MarkdownSaveResult> =>
    ipcRenderer.invoke('markdown:save', input),
  resolveMarkdownImage: (
    path: string,
    source: string,
  ): Promise<MarkdownImageResolution> =>
    ipcRenderer.invoke('markdown:resolve-image', path, source),
  revealMarkdownFile: (path: string): Promise<RevealResult> =>
    ipcRenderer.invoke('markdown:reveal', path),
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
  trashPreflight: (packagePath: string): Promise<TrashPreflight> =>
    ipcRenderer.invoke('document:trash-preflight', packagePath),
  trashDocument: (packagePath: string): Promise<TrashDocumentResult> =>
    ipcRenderer.invoke('document:trash', packagePath),
  removeMissingDocument: (
    packagePath: string,
    documentId?: string | null,
  ): Promise<RemoveMissingDocumentResult> =>
    ipcRenderer.invoke('document:remove-missing', packagePath, documentId ?? null),
  revealLibrary: (libraryPath?: string): Promise<RevealResult> =>
    ipcRenderer.invoke('library:reveal', libraryPath),
  revealAppSupport: (): Promise<void> => ipcRenderer.invoke('settings:reveal'),
  saveSession: (state: SessionState): Promise<void> =>
    ipcRenderer.invoke('session:save', state),
  saveSettings: (settings: AppSettings): Promise<SettingsSaveResult> =>
    ipcRenderer.invoke('settings:save', settings),
  resetSettings: (): Promise<SettingsSaveResult> => ipcRenderer.invoke('settings:reset'),
  saveDocumentSettings: (input): Promise<DocumentSettingsSaveResult> =>
    ipcRenderer.invoke('document-settings:save', input),
  resetDocumentSettings: (): Promise<DocumentSettingsRecoveryResult> =>
    ipcRenderer.invoke('document-settings:reset'),
  restoreDocumentSettingsBackup: (): Promise<DocumentSettingsRecoveryResult> =>
    ipcRenderer.invoke('document-settings:restore'),
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
  onRequestMarkdownSave: (handler: () => Promise<MarkdownFlushResult>): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, requestId: string): void => {
      void Promise.resolve()
        .then(handler)
        .then((result) => {
          ipcRenderer.send('app:markdown-save-done', requestId, normalizeMarkdownFlushResult(result));
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error && error.message.length > 0 ? error.message : String(error);
          ipcRenderer.send('app:markdown-save-done', requestId, {
            ok: false,
            failures: [message],
          } satisfies MarkdownFlushResult);
        });
    };
    ipcRenderer.on('app:request-markdown-save', listener);
    return () => ipcRenderer.removeListener('app:request-markdown-save', listener);
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
