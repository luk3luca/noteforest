import { contextBridge, ipcRenderer } from 'electron';
import type {
  ApplyResult,
  BootstrapResult,
  CreateDocumentResult,
  FlushResult,
  LibraryView,
  MenuCommand,
  NoteForestApi,
  OpenDocumentResult,
  ReloadDocumentResult,
  RevealResult,
  SaveCopyResult,
  SaveResult,
  SeedResult,
  SessionState,
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
  apply: (packagePath: string, command): Promise<ApplyResult> =>
    ipcRenderer.invoke('document:apply', packagePath, command),
  save: (packagePath: string): Promise<SaveResult> =>
    ipcRenderer.invoke('document:save', packagePath),
  saveCopy: (packagePath: string): Promise<SaveCopyResult> =>
    ipcRenderer.invoke('document:save-copy', packagePath),
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
  onRequestFocusBlock: (handler: (blockId: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, blockId: string): void => {
      handler(blockId);
    };
    ipcRenderer.on('app:focus-block', listener);
    return () => ipcRenderer.removeListener('app:focus-block', listener);
  },
  debugSeed: (kind): Promise<SeedResult> => ipcRenderer.invoke('debug:seed', kind),
  getSystemInfo: (): Promise<{
    electron: string;
    chrome: string;
    appVersion: string;
    platform: string;
  }> => ipcRenderer.invoke('system:info'),
};

contextBridge.exposeInMainWorld('noteforest', api);
