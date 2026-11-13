import {
  BrowserWindow,
  app,
  dialog,
  ipcMain,
  nativeTheme,
  session,
  shell,
} from 'electron';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import type {
  BootstrapResult,
  CreateLibraryInput,
  FlushResult,
  MenuCommand,
  RevealResult,
  SessionState,
  WindowState,
} from '../shared/api.js';
import { normalizeFlushResult } from '../shared/flush.js';
import {
  activeLibraryPath,
  applyCommand,
  appSupportDir,
  bootstrap,
  chooseDraftLibrary,
  closeAllStores,
  closeDocument,
  copyImageAsset,
  createDocument,
  createDraftSession,
  createLibraryRoot,
  defaultRestoreDestination,
  dirtyDocuments,
  discardAllDraftSessions,
  importImageBytes,
  importImageFile,
  isInsideKnownLibrary,
  libraryRootForPath,
  listBackups,
  locateLibraryRoot,
  materializeDraftSession,
  openDocument,
  openLibraryPath,
  reloadDocument,
  removeMissingDocument,
  removeRecentLibraryRoot,
  resetDocumentSettingsMap,
  resetSettings,
  restoreBackup,
  restoreDocumentSettingsMap,
  restoreNewestBackup,
  saveAllDirty,
  saveDocument,
  saveDocumentCopy,
  saveDocumentSettings,
  scanLibrary,
  seedDocument,
  switchLibraryRoot,
  takeOverStaleLock,
  trashDocument,
  trashPreflight,
  writeSession,
  writeSettings,
} from './library.js';
import { attachTextContextMenu, installApplicationMenu } from './menu.js';
import { flushDecision, quitCanProceed } from './lifecycle.js';
import { installE2EDialogGuard } from './dialog-guard.js';
import { installAssetProtocol, registerAssetScheme } from './asset-protocol.js';
import { createExportService, installExportIpc } from './export-service.js';
import type { PrintPageTarget } from './export-window.js';
import { IMAGE_EXTENSIONS } from '../shared/images.js';

const isDev = Boolean(process.env['ELECTRON_RENDERER_URL']);
const isE2E = process.env['NOTEFOREST_E2E'] === '1';
/** E2E windows stay hidden by default so a test run never steals OS focus. */
const isE2EHidden = isE2E && process.env['NOTEFOREST_E2E_HIDDEN'] !== '0';
if (isE2E) installE2EDialogGuard(dialog);
// Custom schemes must be registered before the app is ready.
registerAssetScheme();
let mainWindow: BrowserWindow | null = null;
/** Last folder chosen in the export sheet picker; session/app scope only. */
let lastExportFolder: string | null = null;
let allowClose = false;
let closeInProgress = false;
let quitting = false;

/** Production `print.html` or the dev-server equivalent for the hidden export window. */
function printPageTarget(): PrintPageTarget {
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    const base = devUrl.endsWith('/') ? devUrl : `${devUrl}/`;
    return { kind: 'url', url: new URL('print.html', base).toString() };
  }
  return { kind: 'file', path: join(__dirname, '../renderer/print.html') };
}

/** PDF export job + hidden print window; registered with the app IPC surface. */
const exportService = createExportService({
  getWindow: () => mainWindow,
  printPageTarget,
});

if (isE2E) app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.setName('NoteForest');
// Keep Electron's Chromium profile with the app-support override so test
// instances (and parallel worktrees) never share a profile lock.
app.setPath('userData', appSupportDir());

function preloadPath(): string {
  return join(__dirname, '../preload/index.js');
}

function rendererEntry(win: BrowserWindow): Promise<void> {
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) return win.loadURL(devUrl);
  return win.loadFile(join(__dirname, '../renderer/index.html'));
}

function webPreferences(): Electron.WebPreferences {
  return {
    preload: preloadPath(),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    spellcheck: true,
    backgroundThrottling: false,
  };
}

function harden(contents: Electron.WebContents): void {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    if (url !== contents.getURL()) event.preventDefault();
  });
  contents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
}

function sendMenuCommand(command: MenuCommand): void {
  if (mainWindow === null || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('menu:command', command);
}

const DEFAULT_FLUSH_TIMEOUT_MS = 2500;
const flushWaiters = new Map<string, (result: FlushResult) => void>();

function flushTimeoutMs(): number {
  const override = Number(process.env['NOTEFOREST_FLUSH_TIMEOUT_MS']);
  if (Number.isFinite(override) && override >= 1) return Math.floor(override);
  return DEFAULT_FLUSH_TIMEOUT_MS;
}

function requestRendererFlush(win: BrowserWindow): Promise<FlushResult> {
  return new Promise((resolve) => {
    if (win.isDestroyed()) {
      resolve({ status: 'error', error: 'The window was closed before it could save.' });
      return;
    }
    const timeout = flushTimeoutMs();
    const requestId = `flush-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timer = setTimeout(() => {
      flushWaiters.delete(requestId);
      resolve({
        status: 'timeout',
        error: `The editor did not confirm the save within ${timeout} ms.`,
      });
    }, timeout);
    flushWaiters.set(requestId, (result) => {
      clearTimeout(timer);
      flushWaiters.delete(requestId);
      resolve(result);
    });
    win.webContents.send('app:request-flush', requestId);
  });
}

async function showFlushFailure(win: BrowserWindow, result: FlushResult): Promise<boolean> {
  const reason = result.error ?? 'The editor did not report a reason.';
  const response = await dialog.showMessageBox(win, {
    type: 'error',
    title: 'Changes not saved',
    message: `NoteForest could not save your changes before ${quitting ? 'quitting' : 'closing'}.`,
    detail: `${reason}\n\nThe window is still open. Retry the save, or cancel and keep working.`,
    buttons: ['Retry', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  return response.response === 0;
}

async function attemptClose(win: BrowserWindow): Promise<void> {
  if (allowClose || closeInProgress || win.isDestroyed()) return;
  closeInProgress = true;
  try {
    let result = await requestRendererFlush(win);
    while (flushDecision(result, !win.isDestroyed()) === 'block') {
      if (win.isDestroyed()) return;
      if (!(await showFlushFailure(win, result))) {
        quitting = false;
        return;
      }
      result = await requestRendererFlush(win);
    }
    if (win.isDestroyed()) return;
    const dirty = dirtyDocuments();
    if (dirty.length > 0) {
      if (isE2E) {
        const failures = await saveAllDirty();
        if (failures.length > 0) {
          await dialog.showMessageBox(win, {
            type: 'error',
            message: 'Could not save your changes.',
            detail: failures.map((item) => item.error).join('\n'),
            buttons: ['Cancel'],
          });
          quitting = false;
          return;
        }
      } else {
        const response = await dialog.showMessageBox(win, {
          type: 'warning',
          message:
            dirty.length === 1
              ? `Save changes to “${dirty[0]?.title ?? 'this document'}” before closing?`
              : `Save changes to ${dirty.length} documents before closing?`,
          detail: dirty.map((item) => item.title).join('\n'),
          buttons: ['Save', 'Don’t Save', 'Cancel'],
          defaultId: 0,
          cancelId: 2,
        });
        if (response.response === 2) {
          quitting = false;
          return;
        }
        if (response.response === 0) {
          const failures = await saveAllDirty();
          if (failures.length > 0) {
            await dialog.showMessageBox(win, {
              type: 'error',
              message: 'Could not save your changes.',
              detail: failures.map((item) => item.error).join('\n'),
              buttons: ['Cancel'],
            });
            quitting = false;
            return;
          }
        }
      }
    }
    await closeAllStores();
    await discardAllDraftSessions();
    allowClose = true;
    if (quitting) {
      app.quit();
    } else {
      win.close();
    }
  } finally {
    closeInProgress = false;
  }
}

function createMainWindow(): void {
  // Hidden E2E mode: no window, no dock icon, no focus stealing. Playwright
  // still drives the renderer through CDP.
  if (isE2EHidden && process.platform === 'darwin') app.dock?.hide();
  // A new window always starts with the close guard armed. Resetting it in
  // `closed` instead would re-arm the M2 quit bug: after the last window is
  // gone, `before-quit` would cancel every quit with no window left to ask.
  allowClose = false;
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#17181a',
    title: 'NoteForest',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 9 },
    webPreferences: webPreferences(),
  });
  harden(mainWindow.webContents);
  attachTextContextMenu(mainWindow);
  mainWindow.once('ready-to-show', () => {
    if (!isE2EHidden) mainWindow?.show();
  });
  mainWindow.on('close', (event) => {
    if (allowClose) return;
    event.preventDefault();
    if (mainWindow !== null) void attemptClose(mainWindow);
  });
  mainWindow.on('closed', () => {
    // Keep `allowClose` as-is: it reflects the completed close handshake, and
    // resetting it here would leave a later quit with no window to prompt and
    // no way to allow the quit. `createMainWindow` resets it for a new window.
    mainWindow = null;
  });
  void rendererEntry(mainWindow).catch((error) => {
    console.error('Failed to load the NoteForest renderer', error);
  });
}

/** Native directory picker used by the library open/create/locate flows. */
async function chooseLibraryDirectory(
  title: string,
  buttonLabel: string,
  defaultPath?: string,
): Promise<string | null> {
  const win = mainWindow;
  if (win === null || win.isDestroyed()) return null;
  const choice = await dialog.showOpenDialog(win, {
    title,
    buttonLabel,
    ...(defaultPath === undefined ? {} : { defaultPath }),
    properties: ['openDirectory', 'createDirectory'],
  });
  const folder = choice.filePaths[0];
  if (choice.canceled || folder === undefined || folder.trim().length === 0) return null;
  return folder;
}

function libraryActionFailure(error: unknown): { ok: false; message: string } {
  return {
    ok: false,
    message: error instanceof Error && error.message.length > 0 ? error.message : String(error),
  };
}

function registerIpc(): void {
  ipcMain.handle('app:bootstrap', async (): Promise<BootstrapResult> => {
    const restored = await bootstrap();
    return {
      library: restored.library,
      session: restored.session,
      settings: restored.settings,
      settingsStatus: restored.settingsStatus,
      documentSettings: restored.documentSettings,
      documentSettingsStatus: restored.documentSettingsStatus,
      documentSettingsBackup: restored.documentSettingsBackup,
      openDocuments: restored.openDocuments,
      recoveries: restored.recoveries,
      appVersion: app.getVersion(),
      platform: process.platform,
    };
  });

  ipcMain.handle('library:scan', (_event, root?: string) => scanLibrary(root));

  ipcMain.handle('library:open', async () => {
    const folder = await chooseLibraryDirectory('Open folder as library', 'Open Library');
    if (folder === null) {
      return { ok: false as const, canceled: true, message: 'No folder was chosen.' };
    }
    try {
      return await openLibraryPath(folder);
    } catch (error) {
      return libraryActionFailure(error);
    }
  });

  ipcMain.handle('library:choose-parent', async () => {
    const folder = await chooseLibraryDirectory('Choose parent folder', 'Choose');
    if (folder === null) return { canceled: true as const };
    return { canceled: false as const, path: folder };
  });

  ipcMain.handle('library:create-root', async (_event, input: unknown) => {
    try {
      return await createLibraryRoot(input as CreateLibraryInput);
    } catch (error) {
      return libraryActionFailure(error);
    }
  });

  ipcMain.handle('library:switch', async (_event, libraryPath: unknown) => {
    if (typeof libraryPath !== 'string' || libraryPath.length === 0) {
      return { ok: false as const, message: 'No library path was provided.' };
    }
    try {
      return await switchLibraryRoot(libraryPath);
    } catch (error) {
      return libraryActionFailure(error);
    }
  });

  ipcMain.handle('library:remove-recent', async (_event, libraryPath: unknown) => {
    if (typeof libraryPath !== 'string' || libraryPath.length === 0) {
      return { ok: false as const, message: 'No library path was provided.' };
    }
    try {
      return await removeRecentLibraryRoot(libraryPath);
    } catch (error) {
      return libraryActionFailure(error);
    }
  });

  ipcMain.handle('library:locate', async (_event, missingPath: unknown) => {
    if (typeof missingPath !== 'string' || missingPath.length === 0) {
      return { ok: false as const, message: 'No missing library path was provided.' };
    }
    const folder = await chooseLibraryDirectory('Locate library', 'Use this folder');
    if (folder === null) {
      return { ok: false as const, canceled: true, message: 'No folder was chosen.' };
    }
    try {
      return await locateLibraryRoot(missingPath, folder);
    } catch (error) {
      return libraryActionFailure(error);
    }
  });

  ipcMain.handle('library:refresh', () => scanLibrary());

  ipcMain.handle('library:create', (_event, input: { title?: string }) =>
    createDocument(input ?? {}),
  );

  // L3: a draft is in-memory only; nothing is written until materialization.
  ipcMain.handle('draft:create', () => createDraftSession());

  ipcMain.handle('draft:materialize', (_event, documentKey: unknown) => {
    if (typeof documentKey !== 'string' || documentKey.length === 0) {
      return {
        ok: false as const,
        code: 'unknown' as const,
        message: 'No draft was provided.',
      };
    }
    return materializeDraftSession(documentKey);
  });

  ipcMain.handle('draft:choose-library', async (_event, documentKey: unknown) => {
    if (typeof documentKey !== 'string' || documentKey.length === 0) {
      return { ok: false as const, message: 'No draft was provided.' };
    }
    const folder = await chooseLibraryDirectory(
      'Choose a library for this note',
      'Use this library',
    );
    if (folder === null) {
      return { ok: false as const, canceled: true, message: 'No folder was chosen.' };
    }
    return chooseDraftLibrary(documentKey, folder);
  });

  ipcMain.handle('document:trash-preflight', (_event, packagePath: unknown) => {
    if (typeof packagePath !== 'string' || packagePath.length === 0) {
      return {
        packagePath: '',
        title: 'Untitled',
        status: 'missing' as const,
        documentId: null,
        liveLock: false,
        lock: null,
        open: false,
        canTrash: false,
        reason: 'No document path was provided.',
      };
    }
    return trashPreflight(packagePath);
  });

  ipcMain.handle('document:trash', async (_event, packagePath: unknown) => {
    if (typeof packagePath !== 'string' || packagePath.length === 0) {
      return {
        ok: false as const,
        code: 'unknown' as const,
        message: 'No document path was provided.',
      };
    }
    return trashDocument(packagePath, (target) => shell.trashItem(target));
  });

  ipcMain.handle(
    'document:remove-missing',
    async (_event, packagePath: unknown, documentId: unknown) => {
      if (typeof packagePath !== 'string' || packagePath.length === 0) {
        return { ok: false as const, message: 'No document path was provided.' };
      }
      return removeMissingDocument(
        packagePath,
        typeof documentId === 'string' && documentId.length > 0 ? documentId : null,
      );
    },
  );

  ipcMain.handle('document:open', (_event, packagePath: string) => openDocument(packagePath));

  ipcMain.handle('document:take-over-lock', (_event, packagePath: string) =>
    takeOverStaleLock(packagePath),
  );

  ipcMain.handle('document:apply', (_event, packagePath: string, command) =>
    applyCommand(packagePath, command),
  );

  ipcMain.handle('document:save', (_event, packagePath: string, options) =>
    saveDocument(packagePath, options),
  );

  ipcMain.handle('document:save-copy', async (_event, packagePath: string) => {
    const win = mainWindow;
    if (win === null || win.isDestroyed()) {
      return { ok: false as const, message: 'The window is not available.' };
    }
    const base = join(
      (await libraryRootForPath(packagePath)) ?? app.getPath('documents'),
      `${basename(packagePath) || 'document'} copy`,
    );
    const choice = await dialog.showSaveDialog(win, {
      title: 'Save a copy',
      buttonLabel: 'Save copy',
      defaultPath: base,
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (choice.canceled || choice.filePath === undefined || choice.filePath.length === 0) {
      return { ok: false as const, canceled: true };
    }
    const result = await saveDocumentCopy(packagePath, choice.filePath);
    if (result.ok && result.snapshot === undefined) {
      // A copy outside the library cannot be opened in-app; show it instead.
      shell.showItemInFolder(join(result.packagePath, 'document.json'));
    }
    return result;
  });

  ipcMain.handle('document:reload', (_event, packagePath: string) =>
    reloadDocument(packagePath),
  );

  ipcMain.handle('document:list-backups', (_event, packagePath: string) =>
    listBackups(packagePath),
  );

  ipcMain.handle(
    'document:restore-backup',
    async (_event, packagePath: string, sourcePath: string) => {
      const win = mainWindow;
      if (win === null || win.isDestroyed()) {
        return {
          ok: false as const,
          code: 'unknown' as const,
          message: 'The window is not available.',
        };
      }
      // Validate the source before opening a destination picker: the renderer
      // may only restore one of the backups currently listed for this package.
      const listing = await listBackups(packagePath);
      if (!listing.ok) {
        return { ok: false as const, code: 'unknown' as const, message: listing.message };
      }
      const requested = typeof sourcePath === 'string' ? resolve(sourcePath) : '';
      const source = listing.backups.find(
        (backup) => backup.valid && resolve(backup.sourcePath) === requested,
      );
      if (source === undefined) {
        return {
          ok: false as const,
          code: 'invalid-source' as const,
          message: 'That backup is not one of the valid backups for this document.',
        };
      }
      const defaultPath = await defaultRestoreDestination(packagePath);
      const choice = await dialog.showSaveDialog(win, {
        title: 'Restore backup as a copy',
        buttonLabel: 'Restore copy',
        defaultPath,
        properties: ['createDirectory'],
      });
      if (choice.canceled || choice.filePath === undefined || choice.filePath.length === 0) {
        return { ok: false as const, canceled: true };
      }
      const result = await restoreBackup(packagePath, source.sourcePath, choice.filePath);
      if (result.ok && result.snapshot === undefined) {
        // The restored package is always inside the library; this is only a
        // fallback for an unexpected open failure.
        shell.showItemInFolder(join(result.packagePath, 'document.json'));
      }
      return result;
    },
  );

  ipcMain.handle(
    'document:restore-newest-backup',
    (_event, packagePath: unknown) => {
      if (typeof packagePath !== 'string' || packagePath.length === 0) {
        return {
          ok: false as const,
          code: 'unknown' as const,
          message: 'No document path was provided.',
        };
      }
      return restoreNewestBackup(packagePath);
    },
  );

  ipcMain.handle(
    'document:close',
    async (_event, packagePath: string, options: { save: boolean }) => {
      await closeDocument(packagePath, options);
    },
  );

  ipcMain.handle('document:reveal', async (_event, packagePath: unknown): Promise<RevealResult> => {
    if (typeof packagePath !== 'string' || packagePath.length === 0) {
      return { ok: false, message: 'No document path was provided.' };
    }
    if (!(await isInsideKnownLibrary(packagePath))) {
      return { ok: false, message: 'Document is outside the known NoteForest libraries.' };
    }
    shell.showItemInFolder(join(packagePath, 'document.json'));
    return { ok: true };
  });

  ipcMain.handle('library:reveal', async (_event, libraryPath?: unknown): Promise<RevealResult> => {
    const target =
      typeof libraryPath === 'string' && libraryPath.length > 0
        ? libraryPath
        : await activeLibraryPath();
    if (target === null || target.length === 0) {
      return { ok: false, message: 'No library is open.' };
    }
    const message = await shell.openPath(target);
    return message.length === 0 ? { ok: true } : { ok: false, message };
  });

  ipcMain.handle('settings:reveal', async () => {
    await shell.openPath(appSupportDir());
  });

  ipcMain.handle('session:save', async (_event, state: SessionState) => {
    await writeSession(state);
  });

  ipcMain.handle('settings:save', async (_event, settings: unknown) =>
    writeSettings(settings),
  );

  // The only path allowed to replace a corrupt/unreadable settings file: the
  // explicit Settings → "Reset settings" action (UI Sentinel F3).
  ipcMain.handle('settings:reset', async () => resetSettings());

  // S3-13: the explicit map recovery actions. Both back up the current file and
  // write through the serialized map queue; ordinary saves stay refused.
  ipcMain.handle('document-settings:reset', async () => resetDocumentSettingsMap());
  ipcMain.handle('document-settings:restore', async () => restoreDocumentSettingsMap());

  ipcMain.handle('document-settings:save', async (_event, input: unknown) => {
    if (typeof input !== 'object' || input === null) {
      return { ok: false as const, message: 'No document settings were provided.' };
    }
    const record = input as {
      documentId?: unknown;
      packagePath?: unknown;
      page?: unknown;
    };
    if (typeof record.packagePath !== 'string' || record.packagePath.length === 0) {
      return { ok: false as const, message: 'No document path was provided.' };
    }
    if (
      record.documentId !== null &&
      record.documentId !== undefined &&
      typeof record.documentId !== 'string'
    ) {
      return { ok: false as const, message: 'Invalid document id.' };
    }
    return saveDocumentSettings({
      documentId:
        typeof record.documentId === 'string' && record.documentId.length > 0
          ? record.documentId
          : null,
      packagePath: record.packagePath,
      page: (record.page ?? null) as Parameters<typeof saveDocumentSettings>[0]['page'],
    });
  });

  ipcMain.handle('window:set-state', (_event, state: WindowState) => {
    if (mainWindow === null || mainWindow.isDestroyed()) return;
    mainWindow.setDocumentEdited(Boolean(state.dirty));
    const safeTitle = state.title.trim().length > 0 ? state.title : 'NoteForest';
    mainWindow.setTitle(`${safeTitle} — NoteForest`);
    if (state.representedPath !== null) {
      mainWindow.setRepresentedFilename(state.representedPath);
    }
  });

  ipcMain.handle('debug:seed', async (_event, kind: 'demo' | 'performance' | 'performance-1000') =>
    seedDocument(kind),
  );

  ipcMain.handle('document:import-image', async (_event, packagePath: unknown) => {
    if (typeof packagePath !== 'string' || packagePath.length === 0) {
      return { ok: false as const, message: 'No document path was provided.' };
    }
    const win = mainWindow;
    if (win === null || win.isDestroyed()) {
      return { ok: false as const, message: 'The window is not available.' };
    }
    const choice = await dialog.showOpenDialog(win, {
      title: 'Insert image',
      buttonLabel: 'Insert',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: [...IMAGE_EXTENSIONS] }],
    });
    const filePath = choice.filePaths[0];
    if (choice.canceled || filePath === undefined) {
      return { ok: false as const, canceled: true, message: 'No image selected.' };
    }
    return importImageFile(packagePath, filePath);
  });

  ipcMain.handle(
    'document:import-image-bytes',
    (_event, packagePath: unknown, input: unknown) => {
      if (typeof packagePath !== 'string' || packagePath.length === 0) {
        return { ok: false as const, message: 'No document path was provided.' };
      }
      if (typeof input !== 'object' || input === null) {
        return { ok: false as const, message: 'No image data was provided.' };
      }
      return importImageBytes(packagePath, input as Parameters<typeof importImageBytes>[1]);
    },
  );

  ipcMain.handle(
    'document:copy-image-asset',
    (_event, sourcePackagePath: unknown, targetPackagePath: unknown, assetId: unknown) => {
      if (typeof sourcePackagePath !== 'string' || sourcePackagePath.length === 0) {
        return { ok: false as const, message: 'No source document path was provided.' };
      }
      if (typeof targetPackagePath !== 'string' || targetPackagePath.length === 0) {
        return { ok: false as const, message: 'No destination document path was provided.' };
      }
      if (typeof assetId !== 'string' || assetId.length === 0) {
        return { ok: false as const, message: 'No image asset was provided.' };
      }
      return copyImageAsset(sourcePackagePath, targetPackagePath, assetId);
    },
  );

  ipcMain.handle('system:info', () => ({
    electron: process.versions.electron ?? 'unknown',
    chrome: process.versions.chrome ?? 'unknown',
    appVersion: app.getVersion(),
    platform: process.platform,
  }));

  // Batch A export sheet: the folder picker is the only native surface. The
  // renderer owns the filename and the in-sheet overwrite decision; the job
  // engine still refuses to clobber for `overwrite: false`.
  ipcMain.handle('export:defaults', () => ({
    folder: lastExportFolder ?? app.getPath('documents'),
  }));

  ipcMain.handle('export:choose-folder', async (_event, input: unknown) => {
    const win = mainWindow;
    if (win === null || win.isDestroyed()) return { canceled: true as const };
    const requestedPath =
      typeof input === 'object' &&
      input !== null &&
      typeof (input as { defaultPath?: unknown }).defaultPath === 'string' &&
      (input as { defaultPath: string }).defaultPath.length > 0
        ? (input as { defaultPath: string }).defaultPath
        : null;
    const choice = await dialog.showOpenDialog(win, {
      title: 'Choose export folder',
      buttonLabel: 'Choose',
      defaultPath: requestedPath ?? lastExportFolder ?? app.getPath('documents'),
      properties: ['openDirectory', 'createDirectory'],
    });
    const folderPath = choice.filePaths[0];
    if (choice.canceled || folderPath === undefined || folderPath.trim().length === 0) {
      return { canceled: true as const };
    }
    lastExportFolder = folderPath;
    return { canceled: false as const, folderPath };
  });

  ipcMain.handle('export:path-exists', async (_event, outputPath: unknown) => {
    if (
      typeof outputPath !== 'string' ||
      !isAbsolute(outputPath) ||
      !/\.pdf$/i.test(outputPath)
    ) {
      return { exists: false };
    }
    try {
      await stat(outputPath);
      return { exists: true };
    } catch {
      return { exists: false };
    }
  });

  ipcMain.handle('export:open', async (_event, outputPath: unknown): Promise<RevealResult> => {
    if (
      typeof outputPath !== 'string' ||
      !isAbsolute(outputPath) ||
      !/\.pdf$/i.test(outputPath)
    ) {
      return { ok: false, message: 'No PDF path was provided.' };
    }
    const message = await shell.openPath(outputPath);
    return message.length === 0 ? { ok: true } : { ok: false, message };
  });

  ipcMain.handle('export:reveal', (_event, outputPath: unknown): RevealResult => {
    if (
      typeof outputPath !== 'string' ||
      !isAbsolute(outputPath) ||
      !/\.pdf$/i.test(outputPath)
    ) {
      return { ok: false, message: 'No PDF path was provided.' };
    }
    shell.showItemInFolder(outputPath);
    return { ok: true };
  });

  ipcMain.on('app:flush-done', (_event, requestId: unknown, result: unknown) => {
    if (typeof requestId !== 'string') return;
    flushWaiters.get(requestId)?.(normalizeFlushResult(result));
  });

  installExportIpc(exportService);
}

app.on('before-quit', (event) => {
  const win = mainWindow;
  const liveWindow = win !== null && !win.isDestroyed();
  if (quitCanProceed(allowClose, liveWindow)) {
    allowClose = true;
    exportService.dispose();
    return;
  }
  event.preventDefault();
  quitting = true;
  if (win !== null && !win.isDestroyed()) void attemptClose(win);
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow !== null) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    nativeTheme.themeSource = 'dark';
    if (process.platform === 'darwin') app.setAccessibilitySupportEnabled(true);
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
    installAssetProtocol();
    registerIpc();
    installApplicationMenu(() => mainWindow, sendMenuCommand);
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('web-contents-created', (_event, contents) => {
  harden(contents);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught main-process error', error);
});

if (isDev) {
  console.log(`NoteForest ${app.getVersion()} in development mode.`);
}
