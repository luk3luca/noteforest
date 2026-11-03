import {
  app,
  BrowserWindow,
  ipcMain,
  session,
  type IpcMainEvent,
  type WebContents,
} from 'electron';
import { join } from 'node:path';
import { basename } from 'node:path';
import { inspectPdf, writeFileAtomic } from '@noteforest/pdf/node';
import { pageGeometry, type PageSetup } from '@noteforest/layout';
import type {
  ExportRequest,
  ExportResult,
  PrintPayload,
  SystemInfo,
} from '../shared/api.js';
import { findWorkspaceRoot, listFixtures, loadFixture } from './fixtures.js';

const isDev = Boolean(process.env['ELECTRON_RENDERER_URL']);
let mainWindow: BrowserWindow | null = null;

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.setName('NoteForest Spike 1');

function preloadPath(): string {
  return join(__dirname, '../preload/index.js');
}

function rendererEntry(win: BrowserWindow, query: Record<string, string>): Promise<void> {
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    const url = new URL(devUrl);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    return win.loadURL(url.toString());
  }
  return win.loadFile(join(__dirname, '../renderer/index.html'), { query });
}

function webPreferences(): Electron.WebPreferences {
  return {
    preload: preloadPath(),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    spellcheck: false,
    backgroundThrottling: false,
  };
}

function harden(contents: WebContents): void {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    if (url !== contents.getURL()) event.preventDefault();
  });
  contents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 1000,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#101315',
    title: 'NoteForest Spike 1',
    webPreferences: webPreferences(),
  });
  harden(mainWindow.webContents);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  void rendererEntry(mainWindow, {}).catch((error) => {
    console.error('Failed to load the main renderer', error);
  });
}

function sanitizeFileName(name: string): string {
  const clean = basename(name)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > 0 ? clean : 'noteforest-export.pdf';
}

function outputPathFor(request: ExportRequest): string {
  const root = findWorkspaceRoot();
  const dir = process.env['NOTEFOREST_OUTPUT_DIR'] ?? join(root, 'artifacts', 'spike-01');
  const requested = request.outputName ?? `${sanitizeFileName(request.document.title)}.pdf`;
  const withExtension = requested.toLowerCase().endsWith('.pdf') ? requested : `${requested}.pdf`;
  return join(dir, sanitizeFileName(withExtension));
}

function waitForIpc(
  channel: string,
  sender: WebContents,
  predicate: (payload: unknown) => boolean,
  timeoutMs: number,
  label: string,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ipcMain.off(channel, listener);
      reject(new Error(`Timed out waiting for ${label} (${channel}).`));
    }, timeoutMs);
    const listener = (event: IpcMainEvent, payload: unknown): void => {
      if (event.sender.id !== sender.id) return;
      if (!predicate(payload)) return;
      clearTimeout(timer);
      ipcMain.off(channel, listener);
      resolve(payload);
    };
    ipcMain.on(channel, listener);
  });
}

async function printRequest(
  request: ExportRequest,
  exportId: string,
): Promise<{ buffer: Buffer; pageCount: number }> {
  const win = new BrowserWindow({
    width: 1100,
    height: 1500,
    show: false,
    backgroundColor: '#ffffff',
    title: 'NoteForest print compositor',
    webPreferences: webPreferences(),
  });
  harden(win.webContents);
  win.webContents.setBackgroundThrottling(false);
  try {
    const hello = waitForIpc('print:hello', win.webContents, () => true, 30_000, 'print hello');
    await rendererEntry(win, { print: '1' });
    await hello;

    const ready = waitForIpc(
      'print:ready',
      win.webContents,
      (payload) =>
        typeof payload === 'object' &&
        payload !== null &&
        (payload as { exportId?: string }).exportId === exportId,
      90_000,
      'print ready',
    );
    const payload: PrintPayload = {
      exportId,
      document: request.document,
      layout: request.layout,
      pages: request.pages,
      assets: request.assets,
    };
    win.webContents.send('print:payload', payload);
    await ready;

    const buffer = await win.webContents.printToPDF({
      pageSize: 'A4',
      landscape: request.pageSetup.orientation === 'landscape',
      printBackground: true,
      preferCSSPageSize: true,
      scale: 1,
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      displayHeaderFooter: false,
      generateTaggedPDF: false,
    });
    return { buffer, pageCount: request.pages.pageCount };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

async function validatePdf(
  buffer: Buffer,
  expectedPageCount: number,
  pageSetup: PageSetup,
): Promise<number> {
  const inspection = await inspectPdf(new Uint8Array(buffer));
  if (inspection.pageCount !== expectedPageCount) {
    throw new Error(
      `PDF page count ${inspection.pageCount} does not match the paginator's ${expectedPageCount}.`,
    );
  }
  const geometry = pageGeometry(pageSetup);
  for (const page of inspection.pages) {
    if (Math.abs(page.widthMm - geometry.pageWidthMm) > 1.5) {
      throw new Error(
        `PDF page ${page.pageNumber} width ${page.widthMm.toFixed(1)} mm does not match ${geometry.pageWidthMm} mm.`,
      );
    }
    if (Math.abs(page.heightMm - geometry.pageHeightMm) > 1.5) {
      throw new Error(
        `PDF page ${page.pageNumber} height ${page.heightMm.toFixed(1)} mm does not match ${geometry.pageHeightMm} mm.`,
      );
    }
  }
  if (inspection.missingGlyphCount > 0) {
    throw new Error(`PDF text layer contains ${inspection.missingGlyphCount} missing-glyph markers.`);
  }
  return inspection.pageCount;
}

async function runExport(request: ExportRequest): Promise<ExportResult> {
  const started = performance.now();
  const exportId = `export-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const blocking = request.pages.defects.filter((defect) => defect.blocksExport);
  if (blocking.length > 0) {
    return {
      ok: false,
      error: `Export blocked by ${blocking.length} pagination defect(s): ${blocking
        .map((defect) => defect.message)
        .join(' ')}`,
      expectedPageCount: request.pages.pageCount,
    };
  }
  try {
    const { buffer } = await printRequest(request, exportId);
    const pdfPageCount = await validatePdf(buffer, request.pages.pageCount, request.pageSetup);
    const target = outputPathFor(request);
    const forceFailure = process.env['NOTEFOREST_FORCE_EXPORT_FAILURE'] === '1';
    await writeFileAtomic(target, new Uint8Array(buffer), {
      validate: async () => {
        if (forceFailure) throw new Error('Forced export failure for the atomic-write gate.');
      },
    });
    return {
      ok: true,
      path: target,
      expectedPageCount: request.pages.pageCount,
      pdfPageCount,
      bytes: buffer.byteLength,
      durationMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      expectedPageCount: request.pages.pageCount,
    };
  }
}

let exportChain: Promise<ExportResult> = Promise.resolve({ ok: false, error: 'not started' });

function registerIpc(): void {
  ipcMain.handle('fixtures:list', () => listFixtures());
  ipcMain.handle('fixtures:load', (_event, file: string) => loadFixture(file));
  ipcMain.handle('system:info', (): SystemInfo => ({
    electron: process.versions.electron ?? 'unknown',
    chrome: process.versions.chrome ?? 'unknown',
    node: process.versions.node,
    v8: process.versions.v8,
    platform: process.platform,
    arch: process.arch,
    appVersion: app.getVersion(),
  }));
  ipcMain.handle('export:pdf', (_event, request: ExportRequest) => {
    const run = (): Promise<ExportResult> => runExport(request);
    const result = exportChain.then(run, run);
    exportChain = result;
    return result;
  });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  registerIpc();
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || process.env['NOTEFOREST_E2E'] === '1') app.quit();
});

app.on('web-contents-created', (_event, contents) => {
  harden(contents);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught main-process error', error);
});

if (isDev) {
  console.log('NoteForest Spike 1 running in development mode.');
}
