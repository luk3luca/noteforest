/**
 * Hidden-window print session for one PDF export (M4c2).
 *
 * The window is local-only and disposable: it has no preload, no Node
 * integration, no window.open/navigation, and runs on the default session so
 * the `noteforest-asset:` protocol resolves package images. It loads the
 * production `print.html`, receives the current-document snapshot through
 * `executeJavaScript`, and measures/renders it there (R2: independent of the
 * visible Page surface).
 */

import { BrowserWindow } from 'electron';
import type {
  ExportFailureCode,
  ExportSnapshot,
  PrintBuildResult,
  PrintPdfOptions,
  PrintRunSummary,
} from '../shared/export.js';
import { ExportJobError, type ExportPrinterSession } from './export-job.js';

const LOAD_TIMEOUT_MS = 30_000;
const MEASURE_TIMEOUT_MS = 180_000;
const PRINT_TIMEOUT_MS = 180_000;

export type PrintPageTarget = { kind: 'file'; path: string } | { kind: 'url'; url: string };

export interface PrintWindowInput {
  jobId: string;
  snapshot: ExportSnapshot;
  signal: AbortSignal;
}

function jsLiteral(value: unknown): string {
  // Safely embed a JSON payload as a JS expression. U+2028/U+2029 are valid
  // JSON but historically invalid in script source; escape them explicitly.
  return JSON.stringify(value)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
  code: ExportFailureCode,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(
        new ExportJobError(code, `The hidden print window did not finish ${label} within ${timeoutMs} ms.`),
      );
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

class PrintWindowSession implements ExportPrinterSession {
  private readonly input: PrintWindowInput;
  private readonly target: PrintPageTarget;
  private window: BrowserWindow | null = null;
  private destroyed = false;

  constructor(input: PrintWindowInput, target: PrintPageTarget) {
    this.input = input;
    this.target = target;
  }

  private createWindow(): BrowserWindow {
    const window = new BrowserWindow({
      show: false,
      width: 1200,
      height: 900,
      backgroundColor: '#ffffff',
      webPreferences: {
        // No preload: the print surface has no Node or IPC bridge.
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        spellcheck: false,
        devTools: false,
      },
    });
    this.window = window;
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => {
      if (url !== window.webContents.getURL()) event.preventDefault();
    });
    window.on('closed', () => {
      if (this.window === window) this.window = null;
    });
    return window;
  }

  private async load(window: BrowserWindow): Promise<void> {
    await withTimeout(
      this.target.kind === 'file'
        ? window.loadFile(this.target.path)
        : window.loadURL(this.target.url),
      LOAD_TIMEOUT_MS,
      () => this.cancel(),
      'window-failed',
      'loading the print compositor',
    );
    const ready = await withTimeout(
      window.webContents.executeJavaScript(
        `typeof window.__noteforestPrint?.build === 'function'`,
      ),
      LOAD_TIMEOUT_MS,
      () => this.cancel(),
      'window-failed',
      'starting the print bridge',
    );
    if (ready !== true) {
      throw new ExportJobError(
        'window-failed',
        'The print compositor bundle did not expose its build bridge.',
      );
    }
  }

  async measure(): Promise<PrintRunSummary> {
    if (this.destroyed || this.input.signal.aborted) {
      throw new ExportJobError('cancelled', 'Export cancelled.');
    }
    const window = this.createWindow();
    await this.load(window);
    if (this.destroyed || this.input.signal.aborted) {
      throw new ExportJobError('cancelled', 'Export cancelled.');
    }
    const buildExpression = `window.__noteforestPrint.build(${jsLiteral(this.input.snapshot)})`;
    const result = await withTimeout(
      window.webContents.executeJavaScript(buildExpression),
      MEASURE_TIMEOUT_MS,
      () => this.cancel(),
      'window-failed',
      'measuring and rendering the print model',
    );
    if (result === null || typeof result !== 'object' || typeof result['ok'] !== 'boolean') {
      throw new ExportJobError(
        'window-failed',
        'The print compositor returned an unexpected build result.',
      );
    }
    const built = result as PrintBuildResult;
    if (!built.ok) {
      throw new ExportJobError(built.code, built.message);
    }
    return built.summary;
  }

  async print(options: PrintPdfOptions): Promise<Uint8Array> {
    const window = this.window;
    if (window === null || window.isDestroyed()) {
      throw new ExportJobError('window-failed', 'The print window is no longer available.');
    }
    const buffer = await withTimeout(
      window.webContents.printToPDF(options),
      PRINT_TIMEOUT_MS,
      () => this.cancel(),
      'print-failed',
      'printing the Page PDF',
    );
    return new Uint8Array(buffer);
  }

  cancel(): void {
    this.destroy();
  }

  dispose(): void {
    this.destroy();
  }

  private destroy(): void {
    this.destroyed = true;
    const window = this.window;
    this.window = null;
    if (window !== null && !window.isDestroyed()) window.destroy();
  }
}

/** One print session per job; the window is created on `measure()`. */
export function openPrintWindowSession(
  input: PrintWindowInput,
  target: PrintPageTarget,
): ExportPrinterSession {
  const session = new PrintWindowSession(input, target);
  input.signal.addEventListener('abort', () => session.cancel(), { once: true });
  return session;
}
