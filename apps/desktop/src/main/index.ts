import {
  BrowserWindow,
  app,
  dialog,
  ipcMain,
  nativeTheme,
  session,
  shell,
} from 'electron';
import { join } from 'node:path';
import type {
  BootstrapResult,
  MenuCommand,
  SessionState,
  WindowState,
} from '../shared/api.js';
import {
  applyCommand,
  appSupportDir,
  bootstrap,
  closeAllStores,
  closeDocument,
  createDocument,
  dirtyDocuments,
  libraryDir,
  openDocument,
  saveAllDirty,
  saveDocument,
  scanLibrary,
  seedDocument,
  writeSession,
} from './library.js';
import { attachTextContextMenu, installApplicationMenu } from './menu.js';

const isDev = Boolean(process.env['ELECTRON_RENDERER_URL']);
const isE2E = process.env['NOTEFOREST_E2E'] === '1';
let mainWindow: BrowserWindow | null = null;
let allowClose = false;
let closeInProgress = false;
let quitting = false;

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

const flushWaiters = new Map<string, () => void>();

function requestRendererFlush(win: BrowserWindow): Promise<void> {
  return new Promise((resolve) => {
    const requestId = `flush-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timer = setTimeout(() => {
      flushWaiters.delete(requestId);
      resolve();
    }, 2500);
    flushWaiters.set(requestId, () => {
      clearTimeout(timer);
      flushWaiters.delete(requestId);
      resolve();
    });
    if (win.isDestroyed()) {
      clearTimeout(timer);
      resolve();
      return;
    }
    win.webContents.send('app:request-flush', requestId);
  });
}

async function attemptClose(win: BrowserWindow): Promise<void> {
  if (allowClose || closeInProgress) return;
  closeInProgress = true;
  try {
    await requestRendererFlush(win);
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
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#17181a',
    title: 'NoteForest',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 14 },
    webPreferences: webPreferences(),
  });
  harden(mainWindow.webContents);
  attachTextContextMenu(mainWindow);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('close', (event) => {
    if (allowClose) return;
    event.preventDefault();
    if (mainWindow !== null) void attemptClose(mainWindow);
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    allowClose = false;
  });
  void rendererEntry(mainWindow).catch((error) => {
    console.error('Failed to load the NoteForest renderer', error);
  });
}

function registerIpc(): void {
  ipcMain.handle('app:bootstrap', async (): Promise<BootstrapResult> => {
    const library = await scanLibrary();
    const restored = await bootstrap();
    return {
      library,
      session: restored.session,
      openDocuments: restored.openDocuments,
      appVersion: app.getVersion(),
      platform: process.platform,
    };
  });

  ipcMain.handle('library:scan', () => scanLibrary());

  ipcMain.handle('library:create', (_event, input: { title?: string }) =>
    createDocument(input ?? {}),
  );

  ipcMain.handle('document:open', (_event, packagePath: string) => openDocument(packagePath));

  ipcMain.handle('document:apply', (_event, packagePath: string, command) =>
    applyCommand(packagePath, command),
  );

  ipcMain.handle('document:save', (_event, packagePath: string) => saveDocument(packagePath));

  ipcMain.handle(
    'document:close',
    async (_event, packagePath: string, options: { save: boolean }) => {
      await closeDocument(packagePath, options);
    },
  );

  ipcMain.handle('document:reveal', (_event, packagePath: string) => {
    shell.showItemInFolder(join(packagePath, 'document.json'));
  });

  ipcMain.handle('library:reveal', async () => {
    await shell.openPath(libraryDir());
  });

  ipcMain.handle('session:save', async (_event, state: SessionState) => {
    await writeSession(state);
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

  ipcMain.handle('system:info', () => ({
    electron: process.versions.electron ?? 'unknown',
    chrome: process.versions.chrome ?? 'unknown',
    appVersion: app.getVersion(),
    platform: process.platform,
  }));

  ipcMain.on('app:flush-done', (_event, requestId: string) => {
    flushWaiters.get(requestId)?.();
  });
}

app.on('before-quit', (event) => {
  if (allowClose) return;
  event.preventDefault();
  quitting = true;
  if (mainWindow !== null && !mainWindow.isDestroyed()) void attemptClose(mainWindow);
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
    registerIpc();
    installApplicationMenu(() => mainWindow, sendMenuCommand);
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        allowClose = false;
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
