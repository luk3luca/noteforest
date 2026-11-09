/**
 * Hidden-window print session for one PDF export (M4c2, hardened in M4c3).
 *
 * The window is local-only and disposable: it has no preload, no Node
 * integration, no window.open/navigation/redirect, and runs on the default
 * session so the `noteforest-asset:` protocol resolves package images. It loads
 * the production `print.html`, receives the current-document snapshot through
 * `executeJavaScript`, and measures/renders it there (R2: independent of the
 * visible Page surface).
 *
 * The main process never trusts the hidden-window result (S3-2): the summary
 * must pass `isPrintRunSummary`, and a print requires `rendered: true` plus a
 * non-null metrics probe. Redirects are denied, a crashed renderer fails fast,
 * console errors are carried on the job, and the abort listener/snapshot
 * reference are released on dispose (S3-4).
 */

import { BrowserWindow } from 'electron';
import {
  isPrintRunSummary,
  type ExportFailureCode,
  type ExportSnapshot,
  type PrintBuildResult,
  type PrintPdfOptions,
  type PrintRunSummary,
} from '../shared/export.js';
import { ExportJobError, type ExportPrinterSession } from './export-job.js';

const LOAD_TIMEOUT_MS = 30_000;
const MEASURE_TIMEOUT_MS = 180_000;
const PRINT_TIMEOUT_MS = 180_000;

export type PrintPageTarget = { kind: 'file'; path: string } | { kind: 'url'; url: string };

export interface PrintWindowInput {
  jobId: string;
  /** Mutable so `dispose()` can release the document snapshot (S3-4). */
  snapshot: ExportSnapshot | null;
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
  private summary: PrintRunSummary | null = null;
  private readonly consoleErrors: string[] = [];
  private crashReject: ((error: Error) => void) | null = null;
  private removeAbortListener: (() => void) | null = null;
  /** The snapshot is released when the session is disposed (S3-4). */
  private snapshot: ExportSnapshot | null;

  constructor(input: PrintWindowInput, target: PrintPageTarget) {
    this.input = input;
    this.target = target;
    this.snapshot = input.snapshot;
  }

  setAbortCleanup(cleanup: () => void): void {
    this.removeAbortListener = cleanup;
  }

  private crashPromise(): Promise<never> {
    return new Promise<never>((_resolve, reject) => {
      this.crashReject = reject;
    });
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
    // A dev-URL redirect must not escape the navigation guard (S3-4).
    window.webContents.on('will-redirect', (event) => {
      event.preventDefault();
    });
    window.webContents.on('console-message', (details) => {
      if (details.level === 'error') this.consoleErrors.push(details.message);
    });
    window.webContents.on('render-process-gone', (_event, details) => {
      // A crashed renderer would otherwise wait for the 180 s measure/print
      // timeout. Fail the pending promise immediately and destroy the window.
      this.crashReject?.(
        new ExportJobError(
          'window-failed',
          `The hidden print window renderer exited (${details.reason}).`,
        ),
      );
      this.destroy();
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
    const snapshot = this.snapshot;
    if (snapshot === null) {
      throw new ExportJobError('snapshot-failed', 'The export snapshot is no longer available.');
    }
    const window = this.createWindow();
    const crash = this.crashPromise();
    crash.catch(() => undefined);
    await this.load(window);
    if (this.destroyed || this.input.signal.aborted) {
      throw new ExportJobError('cancelled', 'Export cancelled.');
    }
    const buildExpression = `window.__noteforestPrint.build(${jsLiteral(snapshot)})`;
    const result = await Promise.race([
      withTimeout(
        window.webContents.executeJavaScript(buildExpression),
        MEASURE_TIMEOUT_MS,
        () => this.cancel(),
        'window-failed',
        'measuring and rendering the print model',
      ),
      crash,
    ]);
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
    if (!isPrintRunSummary(built.summary)) {
      throw new ExportJobError(
        'window-failed',
        'The print compositor returned a malformed run summary; the export was refused.',
      );
    }
    built.summary.consoleErrors = [...this.consoleErrors];
    this.summary = built.summary;
    return built.summary;
  }

  async print(options: PrintPdfOptions): Promise<Uint8Array> {
    const window = this.window;
    if (window === null || window.isDestroyed()) {
      throw new ExportJobError('window-failed', 'The print window is no longer available.');
    }
    if (this.summary === null || !this.summary.rendered || this.summary.metrics === null) {
      throw new ExportJobError(
        'render-error',
        'The print window did not render a complete page model with theme metrics.',
      );
    }
    const crash = this.crashPromise();
    crash.catch(() => undefined);
    const buffer = await Promise.race([
      withTimeout(
        window.webContents.printToPDF(options),
        PRINT_TIMEOUT_MS,
        () => this.cancel(),
        'print-failed',
        'printing the Page PDF',
      ),
      crash,
    ]);
    return new Uint8Array(buffer);
  }

  cancel(): void {
    this.destroy();
  }

  dispose(): void {
    this.destroy();
    this.removeAbortListener?.();
    this.removeAbortListener = null;
    // Release the document snapshot; a completed job must not retain it.
    this.snapshot = null;
    this.input.snapshot = null;
    this.summary = null;
    this.crashReject = null;
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
  // `dispose()` (not only `cancel()`) releases the snapshot and removes the
  // listener even when cancellation lands before the job stores the session.
  const onAbort = (): void => session.dispose();
  input.signal.addEventListener('abort', onAbort, { once: true });
  session.setAbortCleanup(() => input.signal.removeEventListener('abort', onAbort));
  return session;
}
