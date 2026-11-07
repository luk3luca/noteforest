import { contextBridge, ipcRenderer } from 'electron';
import type {
  ApplyResult,
  BootstrapResult,
  CreateDocumentResult,
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
  saveSession: (state: SessionState): Promise<void> =>
    ipcRenderer.invoke('session:save', state),
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
};

contextBridge.exposeInMainWorld('noteforest', api);
