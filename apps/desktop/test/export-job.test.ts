import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NoteDocument, PageSetup } from '@noteforest/layout';
import type { ExportSnapshot, PrintRunSummary } from '../src/shared/export';
import {
  ExportJobError,
  PdfExportManager,
  type ExportJobDependencies,
  type ExportPrinterSession,
} from '../src/main/export-job';

/**
 * M4c2 export job state machine, atomic output, failure/cancel surfaces.
 *
 * The hidden window and `printToPDF` are faked; the file system is real, so a
 * failed/cancelled run proves it leaves no output and no temp file.
 */

const A4_LANDSCAPE: PageSetup = {
  size: 'A4',
  orientation: 'landscape',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
};

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

function snapshot(overrides: Partial<ExportSnapshot> = {}): ExportSnapshot {
  return {
    packagePath: '/library/export-test',
    documentId: 'doc-1',
    revision: 4,
    title: 'Export test',
    document: {} as NoteDocument,
    settings: {
      setup: A4_LANDSCAPE,
      theme: {} as ExportSnapshot['settings']['theme'],
      manualBreakBeforeBlockIds: [],
    },
    settingsFingerprint: 'fingerprint-1',
    assetUrls: {},
    failedAssetIds: [],
    ...overrides,
  };
}

function summary(overrides: Partial<PrintRunSummary> = {}): PrintRunSummary {
  return {
    documentId: 'doc-1',
    revision: 4,
    title: 'Export test',
    fingerprint: 'fingerprint-1',
    pageCount: 2,
    pageSetup: A4_LANDSCAPE,
    pageWidthMm: 297,
    pageHeightMm: 210,
    blockingDefects: [],
    defects: [],
    manualBreakWarnings: [],
    anchorWarningBlockIds: [],
    failedAssetIds: [],
    missingAssetIds: [],
    overflowPages: [],
    pages: [
      { pageNumber: 1, fragments: 1, edges: 0, trunks: 0, images: 0, empty: false },
      { pageNumber: 2, fragments: 1, edges: 0, trunks: 0, images: 0, empty: false },
    ],
    modelChecks: {
      blockCount: 2,
      placedBlockCount: 2,
      unplacedBlockIds: [],
      segmentCount: 2,
      segmentCoverageOk: true,
      segmentCoverageIssues: [],
    },
    rendered: true,
    framesSettled: true,
    imagesSettled: true,
    fontsSettled: true,
    consoleErrors: [],
    printOverflowPages: [],
    metrics: {
      fontSizePx: 12,
      lineHeightRatio: 1.3,
      expectedFontSizePx: 12,
      expectedLineHeightRatio: 1.3,
      ok: true,
    },
    timings: { measureMs: 5, settleMs: 3 },
    ...overrides,
  };
}

function inspection(pageCount = 2, widthMm = 297, heightMm = 210) {
  const pages = Array.from({ length: pageCount }, (_, index) => ({
    pageNumber: index + 1,
    widthPt: (widthMm * 72) / 25.4,
    heightPt: (heightMm * 72) / 25.4,
    widthMm,
    heightMm,
    text: `Page ${index + 1} body text`,
    textItemCount: 1,
    imageCount: 0,
    pathCount: 0,
    hasOperatorList: true,
  }));
  return {
    pageCount,
    pages,
    text: pages.map((page) => page.text).join('\n'),
    textItems: [],
    missingGlyphCount: 0,
  };
}

interface SessionOptions {
  summary?: () => Promise<PrintRunSummary>;
  print?: () => Promise<Uint8Array>;
  onCancel?: () => void;
}

function fakeSession(options: SessionOptions = {}): ExportPrinterSession {
  return {
    measure: options.summary ?? (async () => summary()),
    print: options.print ?? (async () => PDF_BYTES),
    cancel: options.onCancel ?? (() => undefined),
    dispose: () => undefined,
  };
}

interface Harness {
  manager: PdfExportManager;
  dir: string;
  outputPath: string;
  deps: ExportJobDependencies;
}

const tempDirs: string[] = [];

async function harness(
  overrides: Partial<ExportJobDependencies> = {},
  session: ExportPrinterSession = fakeSession(),
): Promise<Harness> {
  const dir = await mkdtemp(join(tmpdir(), 'nf-export-job-'));
  tempDirs.push(dir);
  const outputPath = join(dir, 'note.pdf');
  const deps: ExportJobDependencies = {
    requestSnapshot: async () => snapshot(),
    openPrintSession: async () => session,
    inspectPdf: async () => inspection(),
    createJobId: () => 'job-1',
    ...overrides,
  };
  return { manager: new PdfExportManager(deps), dir, outputPath, deps };
}

async function waitTerminal(manager: PdfExportManager, jobId: string) {
  await vi.waitFor(
    () => {
      const job = manager.getExportJob(jobId);
      expect(job).not.toBeNull();
      expect(job!.status).not.toBe('running');
    },
    { timeout: 5000, interval: 5 },
  );
  return manager.getExportJob(jobId)!;
}

async function partialFiles(dir: string): Promise<string[]> {
  return (await readdir(dir)).filter((name) => name.endsWith('.partial'));
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe('PdfExportManager', () => {
  it('reports the resolved page count and setup before printToPDF runs', async () => {
    let releasePrint: ((bytes: Uint8Array) => void) | undefined;
    const session = fakeSession({
      print: () =>
        new Promise<Uint8Array>((resolvePrint) => {
          releasePrint = resolvePrint;
        }),
    });
    const { manager, outputPath } = await harness({}, session);
    manager.exportPdf({ packagePath: '/library/export-test', outputPath });
    await vi.waitFor(
      () => {
        const running = manager.getExportJob('job-1');
        expect(running?.phase).toBe('print');
      },
      { timeout: 5000, interval: 5 },
    );
    const running = manager.getExportJob('job-1')!;
    expect(running.status).toBe('running');
    expect(running.pageCount).toBe(2);
    expect(running.pageSetup).toEqual(A4_LANDSCAPE);
    expect(running.documentId).toBe('doc-1');
    expect(running.fingerprint).toBe('fingerprint-1');
    releasePrint?.(PDF_BYTES);
    const job = await waitTerminal(manager, 'job-1');
    expect(job.status).toBe('done');
  });

  it('writes the produced PDF atomically and reports the resolved page count/setup', async () => {
    const { manager, dir, outputPath } = await harness();
    const started = manager.exportPdf({
      packagePath: '/library/export-test',
      outputPath,
    });
    expect(started).toEqual({ ok: true, jobId: 'job-1' });
    const job = await waitTerminal(manager, 'job-1');
    expect(job.status).toBe('done');
    expect(job.phase).toBe('done');
    expect(job.progress).toBe(1);
    expect(job.pageCount).toBe(2);
    expect(job.pageSetup).toEqual(A4_LANDSCAPE);
    expect(job.pageWidthMm).toBe(297);
    expect(job.pageHeightMm).toBe(210);
    expect(job.fingerprint).toBe('fingerprint-1');
    expect(job.revision).toBe(4);
    expect(job.rendered).toBe(true);
    expect(job.framesSettled).toBe(true);
    expect(job.timings).toEqual({ measureMs: 5, settleMs: 3 });
    expect(job.outputPath).toBe(outputPath);
    expect(new Uint8Array(await readFile(outputPath))).toEqual(PDF_BYTES);
    expect(await partialFiles(dir)).toEqual([]);
  });

  it('fails before printing when the output exists and overwrite is not set', async () => {
    const { manager, dir, outputPath } = await harness();
    await writeFile(outputPath, 'existing');
    const started = manager.exportPdf({
      packagePath: '/library/export-test',
      outputPath,
    });
    expect(started.ok).toBe(true);
    const job = await waitTerminal(manager, 'job-1');
    expect(job.status).toBe('failed');
    expect(job.error?.code).toBe('output-exists');
    expect(await readFile(outputPath, 'utf8')).toBe('existing');
    expect(await partialFiles(dir)).toEqual([]);
  });

  it('replaces an existing output when overwrite is true', async () => {
    const { manager, outputPath } = await harness();
    await writeFile(outputPath, 'existing');
    manager.exportPdf({
      packagePath: '/library/export-test',
      outputPath,
      overwrite: true,
    });
    const job = await waitTerminal(manager, 'job-1');
    expect(job.status).toBe('done');
    expect(job.overwrite).toBe(true);
    expect(new Uint8Array(await readFile(outputPath))).toEqual(PDF_BYTES);
  });

  it('leaves no file when printToPDF fails', async () => {
    const session = fakeSession({
      print: async () => {
        throw new ExportJobError('print-failed', 'printToPDF failed.');
      },
    });
    const { manager, dir, outputPath } = await harness({}, session);
    manager.exportPdf({ packagePath: '/library/export-test', outputPath });
    const job = await waitTerminal(manager, 'job-1');
    expect(job.status).toBe('failed');
    expect(job.error?.code).toBe('print-failed');
    expect(await readdir(dir)).toEqual([]);
  });

  it('surfaces a write failure and leaves no partial file', async () => {
    const { manager, dir, outputPath } = await harness({
      writeFile: async () => {
        throw new Error('ENOSPC: no space left on device');
      },
    });
    manager.exportPdf({ packagePath: '/library/export-test', outputPath });
    const job = await waitTerminal(manager, 'job-1');
    expect(job.status).toBe('failed');
    expect(job.error?.code).toBe('write-failed');
    expect(job.error?.message).toContain('ENOSPC');
    expect(await readdir(dir)).toEqual([]);
  });

  it('surfaces an inspection failure as a validation failure', async () => {
    const { manager, dir, outputPath } = await harness({
      inspectPdf: async () => {
        throw new Error('Invalid PDF structure.');
      },
    });
    manager.exportPdf({ packagePath: '/library/export-test', outputPath });
    const job = await waitTerminal(manager, 'job-1');
    expect(job.status).toBe('failed');
    expect(job.error?.code).toBe('validation-failed');
    expect(job.error?.message).toContain('Invalid PDF structure');
    expect(await readdir(dir)).toEqual([]);
  });

  it('deletes the temp file and leaves no output when PDF validation fails', async () => {
    const { manager, dir, outputPath } = await harness({
      inspectPdf: async () => inspection(3),
    });
    manager.exportPdf({ packagePath: '/library/export-test', outputPath });
    const job = await waitTerminal(manager, 'job-1');
    expect(job.status).toBe('failed');
    expect(job.error?.code).toBe('validation-failed');
    expect(job.error?.message).toContain('3 pages');
    expect(await readdir(dir)).toEqual([]);
  });

  it('fails the job on a truly blank produced page (S2-1)', async () => {
    const base = inspection(2);
    const { manager, dir, outputPath } = await harness({
      inspectPdf: async () => ({
        ...base,
        pages: [
          base.pages[0]!,
          {
            ...base.pages[1]!,
            text: '',
            textItemCount: 0,
            imageCount: 0,
            pathCount: 0,
          },
        ],
        text: base.pages[0]!.text,
      }),
    });
    manager.exportPdf({ packagePath: '/library/export-test', outputPath });
    const job = await waitTerminal(manager, 'job-1');
    expect(job.status).toBe('failed');
    expect(job.error?.code).toBe('validation-failed');
    expect(job.error?.message).toContain('blank');
    expect(await readdir(dir)).toEqual([]);
  });

  it('accepts an image-only produced page without text (S2-1)', async () => {
    const base = inspection(2);
    const { manager, outputPath } = await harness({
      inspectPdf: async () => ({
        ...base,
        pages: [
          base.pages[0]!,
          {
            ...base.pages[1]!,
            text: '',
            textItemCount: 0,
            imageCount: 1,
            pathCount: 0,
          },
        ],
        text: base.pages[0]!.text,
      }),
    });
    manager.exportPdf({ packagePath: '/library/export-test', outputPath });
    const job = await waitTerminal(manager, 'job-1');
    expect(job.status).toBe('done');
    expect(job.warnings.some((warning) => warning.code === 'textless-page')).toBe(true);
  });

  it('refuses a blocking defect with the affected block name and never prints', async () => {
    const print = vi.fn(async () => PDF_BYTES);
    const session = fakeSession({
      summary: async () =>
        summary({
          pageCount: 0,
          rendered: false,
          blockingDefects: [
            {
              code: 'no-safe-break',
              severity: 'blocking',
              message: 'Block tall has no safe break inside the page content height.',
              blockId: 'tall',
              blockTitle: 'A very tall block',
            },
          ],
        }),
      print,
    });
    const { manager, dir, outputPath } = await harness({}, session);
    manager.exportPdf({ packagePath: '/library/export-test', outputPath });
    const job = await waitTerminal(manager, 'job-1');
    expect(job.status).toBe('failed');
    expect(job.error?.code).toBe('preflight-blocked');
    expect(job.error?.message).toContain('A block doesn’t fit the page.');
    expect(job.error?.details[0]).toMatchObject({ blockId: 'tall', kind: 'blocking-defect' });
    expect(print).not.toHaveBeenCalled();
    expect(await readdir(dir)).toEqual([]);
  });

  it('refuses a print run for different resolved settings', async () => {
    const session = fakeSession({ summary: async () => summary({ fingerprint: 'other' }) });
    const { manager, dir, outputPath } = await harness({}, session);
    manager.exportPdf({ packagePath: '/library/export-test', outputPath });
    const job = await waitTerminal(manager, 'job-1');
    expect(job.status).toBe('failed');
    expect(job.error?.code).toBe('settings-mismatch');
    expect(await readdir(dir)).toEqual([]);
  });

  it('cancels during printing: no output, no temp file, hidden window cancelled', async () => {
    let rejectPrint: ((error: Error) => void) | undefined;
    const printStarted = vi.fn();
    const cancelled = vi.fn();
    const session = fakeSession({
      print: () => {
        printStarted();
        return new Promise<Uint8Array>((_resolve, reject) => {
          rejectPrint = reject;
        });
      },
      onCancel: () => {
        cancelled();
        rejectPrint?.(new Error('print window destroyed'));
      },
    });
    const { manager, dir, outputPath } = await harness({}, session);
    manager.exportPdf({ packagePath: '/library/export-test', outputPath });
    await vi.waitFor(() => expect(printStarted).toHaveBeenCalled());
    expect(manager.cancelExport('job-1')).toBe(true);
    const job = await waitTerminal(manager, 'job-1');
    expect(job.status).toBe('cancelled');
    expect(job.error?.code).toBe('cancelled');
    expect(cancelled).toHaveBeenCalled();
    expect(await readdir(dir)).toEqual([]);
  });

  it('cancels while waiting for the renderer snapshot', async () => {
    let resolveSnapshot: ((value: ExportSnapshot) => void) | undefined;
    const { manager, dir, outputPath } = await harness({
      requestSnapshot: () =>
        new Promise<ExportSnapshot>((resolve) => {
          resolveSnapshot = resolve;
        }),
    });
    manager.exportPdf({ packagePath: '/library/export-test', outputPath });
    await vi.waitFor(() => expect(typeof resolveSnapshot).toBe('function'));
    expect(manager.cancelExport('job-1')).toBe(true);
    const job = await waitTerminal(manager, 'job-1');
    expect(job.status).toBe('cancelled');
    resolveSnapshot?.(snapshot());
    expect(await readdir(dir)).toEqual([]);
  });

  it('surfaces snapshot and empty-model failures', async () => {
    const { manager, outputPath } = await harness({
      requestSnapshot: async () => {
        throw new ExportJobError('snapshot-failed', 'The document is not open.');
      },
    });
    manager.exportPdf({ packagePath: '/library/export-test', outputPath });
    const failed = await waitTerminal(manager, 'job-1');
    expect(failed.status).toBe('failed');
    expect(failed.error?.code).toBe('snapshot-failed');

    const empty = new PdfExportManager({
      requestSnapshot: async () => snapshot(),
      openPrintSession: async () =>
        fakeSession({
          summary: async () => {
            throw new ExportJobError('empty-document', 'The document has no page content to export.');
          },
        }),
      inspectPdf: async () => inspection(),
      createJobId: () => 'job-empty',
    });
    empty.exportPdf({ packagePath: '/library/export-test', outputPath });
    const emptyJob = await waitTerminal(empty, 'job-empty');
    expect(emptyJob.status).toBe('failed');
    expect(emptyJob.error?.code).toBe('empty-document');
  });

  it('rejects invalid input without creating a job', async () => {
    const { manager } = await harness();
    expect(
      manager.exportPdf({ packagePath: '/library/export-test', outputPath: 'relative.pdf' }),
    ).toEqual(
      expect.objectContaining({ ok: false, code: 'invalid-input' }),
    );
    expect(manager.getExportJob('job-1')).toBeNull();
  });

  it('reports warnings on a successful export', async () => {
    const session = fakeSession({
      summary: async () =>
        summary({
          manualBreakWarnings: [
            {
              code: 'impossible-hint',
              severity: 'warning',
              message: 'Manual break hint names unknown block ghost; it is ignored.',
              blockId: 'ghost',
            },
          ],
          missingAssetIds: ['missing-image'],
        }),
    });
    const { manager, outputPath } = await harness({}, session);
    manager.exportPdf({ packagePath: '/library/export-test', outputPath });
    const job = await waitTerminal(manager, 'job-1');
    expect(job.status).toBe('done');
    expect(job.warnings.map((warning) => warning.kind)).toEqual(['manual-break', 'asset']);
  });

  it('refuses an output path inside the source document package (S3-3)', async () => {
    const { manager, dir } = await harness();
    const packagePath = join(dir, 'package');
    const started = manager.exportPdf({
      packagePath,
      outputPath: join(packagePath, 'document.json'),
      overwrite: true,
    });
    expect(started).toEqual(expect.objectContaining({ ok: false, code: 'invalid-input' }));
    expect(manager.getExportJob('job-1')).toBeNull();
    expect(await readdir(dir)).toEqual([]);
  });

  it('creates the temp file exclusively and leaves no output when it already exists (S3-3)', async () => {
    const { manager, dir, outputPath } = await harness();
    const tempPath = join(dir, '.note.pdf.job-1.partial');
    await writeFile(tempPath, 'stale');
    manager.exportPdf({ packagePath: '/library/export-test', outputPath });
    const job = await waitTerminal(manager, 'job-1');
    expect(job.status).toBe('failed');
    expect(job.error?.code).toBe('write-failed');
    expect(await readdir(dir)).toEqual([]);
  });

  it('cleans a stale partial from a crashed export (S3-3)', async () => {
    const { manager, dir, outputPath } = await harness();
    const stale = join(dir, '.note.pdf.old-job.partial');
    await writeFile(stale, 'stale');
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await utimes(stale, old, old);
    manager.exportPdf({ packagePath: '/library/export-test', outputPath });
    const job = await waitTerminal(manager, 'job-1');
    expect(job.status).toBe('done');
    expect(await readdir(dir)).toEqual(['note.pdf']);
  });

  it('atomically refuses an output created after the preflight exists check (S3-3)', async () => {
    const race = { outputPath: '' };
    const session = fakeSession({
      print: async () => {
        // Simulate another process creating the output while the PDF is being
        // produced; the no-clobber link must fail with output-exists.
        await writeFile(race.outputPath, 'winner');
        return PDF_BYTES;
      },
    });
    const { manager, outputPath, dir } = await harness({}, session);
    race.outputPath = outputPath;
    manager.exportPdf({ packagePath: '/library/export-test', outputPath });
    const job = await waitTerminal(manager, 'job-1');
    expect(job.status).toBe('failed');
    expect(job.error?.code).toBe('output-exists');
    expect(await readFile(outputPath, 'utf8')).toBe('winner');
    expect(await partialFiles(dir)).toEqual([]);
  });

  it('maps a render failure to the typed render-error code (S3-8)', async () => {
    const session = fakeSession({
      summary: async () => {
        throw new ExportJobError('render-error', 'The print compositor threw while rendering.');
      },
    });
    const { manager, dir, outputPath } = await harness({}, session);
    manager.exportPdf({ packagePath: '/library/export-test', outputPath });
    const job = await waitTerminal(manager, 'job-1');
    expect(job.status).toBe('failed');
    expect(job.error?.code).toBe('render-error');
    expect(await readdir(dir)).toEqual([]);
  });

  it('refuses a rendered:false summary with no preflight block (S3-2)', async () => {
    const session = fakeSession({
      summary: async () => summary({ rendered: false }),
    });
    const { manager, dir, outputPath } = await harness({}, session);
    manager.exportPdf({ packagePath: '/library/export-test', outputPath });
    const job = await waitTerminal(manager, 'job-1');
    expect(job.status).toBe('failed');
    expect(job.error?.code).toBe('render-error');
    expect(await readdir(dir)).toEqual([]);
  });

  it('refuses a summary with non-finite geometry (S3-2)', async () => {
    const session = fakeSession({
      summary: async () => summary({ pageWidthMm: Number.NaN }),
    });
    const { manager, dir, outputPath } = await harness({}, session);
    manager.exportPdf({ packagePath: '/library/export-test', outputPath });
    const job = await waitTerminal(manager, 'job-1');
    expect(job.status).toBe('failed');
    expect(job.error?.code).toBe('window-failed');
    expect(await readdir(dir)).toEqual([]);
  });
});
