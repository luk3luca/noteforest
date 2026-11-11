import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifactsPath, waitUntil } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import {
  multiPageBlocksDocument,
  pageCalloutModesDocument,
  pageDocument,
  textBlock,
  writePagePackage,
} from '../support/page-fixtures.mjs';
import { inspectPdfFile, textContains } from '../../scripts/lib/pdf.mjs';

/**
 * M4c2 PDF export orchestration.
 *
 * Production build, hidden Electron window, real `printToPDF`: the export is
 * started from the default Continuous surface (the Page view is never mounted),
 * measures the current in-memory document snapshot itself, validates the PDF,
 * and writes it atomically. No native dialog, no fixed sleep.
 */

const tempRoot = artifactsPath('m4c2-ui');
const outputRoot = artifactsPath('m4c2', 'export');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
const evidence = [];
let page;

const A5_PORTRAIT = {
  size: 'A5',
  orientation: 'portrait',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
};
const A5_LANDSCAPE = {
  size: 'A5',
  orientation: 'landscape',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
};
const A5_STACKED = {
  size: 'A5',
  orientation: 'portrait',
  margins: { top: 46, right: 46, bottom: 46, left: 46 },
};
const LETTER_PORTRAIT = {
  size: 'Letter',
  orientation: 'portrait',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
};
const LETTER_LANDSCAPE = {
  size: 'Letter',
  orientation: 'landscape',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
};

async function launch(name) {
  page = await ui.launch(ui.isolated(name));
}

/** Write a real canonical package and open it; Continuous stays the layout. */
async function openPackage(env, name, document) {
  const packagePath = await writePagePackage(env.NOTEFOREST_LIBRARY, name, document);
  const opened = await page.evaluate(
    (path) => window.__noteforestTest.openPath(path),
    packagePath,
  );
  assert.equal(opened, true, 'fixture package opens');
  await page.waitForFunction(
    (path) => window.__noteforestTest.state().activeTab === path,
    packagePath,
    { timeout: 10000 },
  );
  await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
  return packagePath;
}

async function setPageSettings(packagePath, override) {
  return page.evaluate(
    ({ path, value }) => window.__noteforestTest.setPageSettingsOverride(path, value),
    { path: packagePath, value: override },
  );
}

/** Start a real export and poll the main-process job to a terminal state. */
async function exportPdf({ packagePath, outputPath, overwrite }) {
  const started = await page.evaluate(
    (input) => window.noteforest.exportPdf(input),
    { packagePath, outputPath, ...(overwrite === undefined ? {} : { overwrite }) },
  );
  assert.equal(started.ok, true, started.message);
  const job = await waitUntil(
    async () => {
      const current = await page.evaluate(
        (id) => window.noteforest.getExportJob(id),
        started.jobId,
      );
      return current !== null && current.status !== 'running' ? current : false;
    },
    `export ${started.jobId}`,
    120000,
  );
  return job;
}

async function readDirectory(dir) {
  return (await readdir(dir)).sort();
}

async function inspect(outputPath) {
  return inspectPdfFile(outputPath);
}

function assertPageSizes(pdf, job) {
  assert.equal(pdf.pageCount, job.pageCount, 'PDF page count equals the paginator page count');
  assert.equal(pdf.pageCount, pdf.pages.length);
  for (const pdfPage of pdf.pages) {
    assert.ok(
      Math.abs(pdfPage.widthMm - job.pageWidthMm) <= 0.25,
      `page ${pdfPage.pageNumber} width ${pdfPage.widthMm.toFixed(2)} mm matches ${job.pageWidthMm} mm`,
    );
    assert.ok(
      Math.abs(pdfPage.heightMm - job.pageHeightMm) <= 0.25,
      `page ${pdfPage.pageNumber} height ${pdfPage.heightMm.toFixed(2)} mm matches ${job.pageHeightMm} mm`,
    );
    assert.ok(pdfPage.text.trim().length > 0, `page ${pdfPage.pageNumber} is not blank`);
  }
  assert.ok(pdf.text.trim().length > 0, 'the PDF has real extractable text');
  assert.equal(pdf.missingGlyphCount, 0, 'no replacement glyphs');
}

function record(entry) {
  evidence.push({
    at: new Date().toISOString(),
    ...entry,
  });
}

describe('M4c2 PDF export orchestration', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await rm(outputRoot, { recursive: true, force: true });
    await mkdir(outputRoot, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    await writeFile(
      resolve(outputRoot, 'export-evidence.json'),
      JSON.stringify(evidence, null, 2),
      'utf8',
    );
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('exports mode A from Continuous without ever mounting the Page view', async () => {
    const env = ui.isolated('m4c2-a');
    await launch('m4c2-a');
    const packagePath = await openPackage(
      env,
      'Export mode A',
      pageCalloutModesDocument(),
    );
    // Continuous is the default surface: no Page Read, no page-model registry.
    assert.equal(await page.locator('.nf-page-view').count(), 0, 'Page view is not mounted');
    const outputPath = resolve(outputRoot, 'mode-a-a4-landscape.pdf');
    const job = await exportPdf({ packagePath, outputPath });
    assert.equal(job.status, 'done', job.error?.message ?? 'export succeeds');
    assert.equal(job.error, null);
    // R2 settle handshake: the hidden window measured, rendered, and observed
    // two animation frames before the job called printToPDF.
    assert.equal(job.rendered, true);
    assert.equal(job.framesSettled, true);
    assert.ok(job.timings.measureMs > 0, 'the hidden window measured the snapshot');
    assert.ok(job.timings.settleMs > 0, 'the hidden window settled fonts/images/frames');
    assert.ok(
      !job.warnings.some((warning) => warning.code === 'frames-not-settled'),
      'the settle handshake did not time out',
    );
    const pdf = await inspect(outputPath);
    assertPageSizes(pdf, job);
    assert.equal(job.pageWidthMm, 297);
    assert.equal(job.pageHeightMm, 210);
    assert.ok(textContains(pdf.text, 'Page callout modes'), 'document title is in the PDF');
    assert.ok(textContains(pdf.text, 'eigenvalue'), 'body text is in the PDF');
    assert.deepEqual(await readDirectory(outputRoot), ['mode-a-a4-landscape.pdf']);
    record({
      case: 'mode A',
      pageSetup: job.pageSetup,
      pageCount: job.pageCount,
      pdfPages: pdf.pages.map((item) => ({
        widthMm: Number(item.widthMm.toFixed(2)),
        heightMm: Number(item.heightMm.toFixed(2)),
        chars: item.text.length,
      })),
    });
  });

  it('exports A5 portrait (mode B2) and the explicit stacked geometry', async () => {
    const env = ui.isolated('m4c2-a5');
    await launch('m4c2-a5');
    const packagePath = await openPackage(
      env,
      'Export A5',
      pageCalloutModesDocument(),
    );
    await setPageSettings(packagePath, { setup: A5_PORTRAIT });
    const b2Path = resolve(outputRoot, 'mode-b2-a5-portrait.pdf');
    const b2 = await exportPdf({ packagePath, outputPath: b2Path });
    assert.equal(b2.status, 'done', b2.error?.message ?? 'A5 export succeeds');
    const b2Pdf = await inspect(b2Path);
    assertPageSizes(b2Pdf, b2);
    assert.equal(b2.pageWidthMm, 148);
    assert.equal(b2.pageHeightMm, 210);

    await setPageSettings(packagePath, { setup: A5_LANDSCAPE });
    const a5LandscapePath = resolve(outputRoot, 'a5-landscape.pdf');
    const a5Landscape = await exportPdf({ packagePath, outputPath: a5LandscapePath });
    assert.equal(a5Landscape.status, 'done', a5Landscape.error?.message ?? 'A5 landscape succeeds');
    const a5LandscapePdf = await inspect(a5LandscapePath);
    assertPageSizes(a5LandscapePdf, a5Landscape);
    assert.equal(a5Landscape.pageWidthMm, 210);
    assert.equal(a5Landscape.pageHeightMm, 148);

    await setPageSettings(packagePath, { setup: A5_STACKED, theme: { pagePacking: 'stacked' } });
    const stackedPath = resolve(outputRoot, 'stacked-a5-portrait.pdf');
    const stacked = await exportPdf({ packagePath, outputPath: stackedPath });
    assert.equal(stacked.status, 'done', stacked.error?.message ?? 'stacked export succeeds');
    const stackedPdf = await inspect(stackedPath);
    assertPageSizes(stackedPdf, stacked);
    assert.equal(stacked.pageWidthMm, 148);
    assert.equal(stacked.pageHeightMm, 210);
    assert.ok(textContains(stackedPdf.text, 'eigenvalue'), 'stacked PDF keeps the body text');
    record({
      case: 'A5 B2',
      pageCount: b2.pageCount,
      pdfPages: b2Pdf.pages.map((item) => [Number(item.widthMm.toFixed(2)), Number(item.heightMm.toFixed(2))]),
    });
    record({
      case: 'A5 landscape',
      pageCount: a5Landscape.pageCount,
      pdfPages: a5LandscapePdf.pages.map((item) => [Number(item.widthMm.toFixed(2)), Number(item.heightMm.toFixed(2))]),
    });
    record({
      case: 'A5 stacked',
      pageCount: stacked.pageCount,
      pdfPages: stackedPdf.pages.map((item) => [Number(item.widthMm.toFixed(2)), Number(item.heightMm.toFixed(2))]),
    });
  });

  it('exports the same Page lens at 60% and 120% density (M4e2)', async () => {
    const env = ui.isolated('m4c2-density');
    await launch('m4c2-density');
    const packagePath = await openPackage(
      env,
      'Export density',
      multiPageBlocksDocument(36),
    );
    const results = [];
    for (const [percent, density] of [
      [60, 0.6],
      [120, 1.2],
    ]) {
      await setPageSettings(packagePath, { theme: { density } });
      const outputPath = resolve(outputRoot, `density-${percent}.pdf`);
      const job = await exportPdf({ packagePath, outputPath });
      assert.equal(
        job.status,
        'done',
        job.error?.message ?? `density ${percent}% export succeeds`,
      );
      assert.equal(
        job.error,
        null,
        `density ${percent}% preflight accepts the effective type metrics`,
      );
      assert.ok(
        !job.warnings.some((warning) => warning.code === 'settings-mismatch'),
        `density ${percent}% has no settings mismatch`,
      );
      const pdf = await inspect(outputPath);
      assertPageSizes(pdf, job);
      results.push({ percent, job, pdf });
    }
    const [low, high] = results;
    assert.ok(
      low.job.pageCount <= high.job.pageCount,
      `60% exports no more pages than 120%: ${low.job.pageCount} vs ${high.job.pageCount}`,
    );
    record({
      case: 'density 60/120',
      pages: results.map((item) => ({ density: item.percent, pageCount: item.job.pageCount })),
      textChars: results.map((item) => item.pdf.text.length),
    });
  });

  it('exports advanced typography and advanced layout values from Continuous (Batch C)', async () => {
    const env = ui.isolated('m4c2-advanced');
    await launch('m4c2-advanced');
    const packagePath = await openPackage(
      env,
      'Export advanced',
      multiPageBlocksDocument(24),
    );
    await setPageSettings(packagePath, {
      theme: {
        bodyPt: 11,
        bodyLine: 1.5,
        heading1Pt: 18,
        heading2Pt: 15,
        heading3Pt: 12,
        codePt: 9,
        codeLine: 1.4,
        tablePt: 9,
        tableLine: 1.3,
        labelPt: 10,
        minContentWidth: 180,
        cardPadding: 14,
        cardBorder: 2,
        segmentGap: 6,
        siblingGap: 20,
        calloutGap: 22,
        wrapIndent: 22,
        maxWrapIndent: 64,
        childIndent: 34,
        maxCardWidth: 360,
        density: 0.8,
      },
    });
    const outputPath = resolve(outputRoot, 'advanced-typography-layout.pdf');
    const job = await exportPdf({ packagePath, outputPath });
    assert.equal(job.status, 'done', job.error?.message ?? 'advanced export succeeds');
    assert.equal(job.error, null);
    assert.ok(
      !job.warnings.some((warning) => warning.code === 'settings-mismatch'),
      'advanced values do not change the settings identity',
    );
    assert.equal(job.pageWidthMm, 297);
    assert.equal(job.pageHeightMm, 210);
    const pdf = await inspect(outputPath);
    assertPageSizes(pdf, job);
    assert.ok(textContains(pdf.text, 'Continuous markers'), 'the document title is in the PDF');
    assert.ok(
      textContains(pdf.text, 'A short top-level block'),
      'the body text survives the advanced type/storage lenses',
    );
    record({
      case: 'advanced typography/layout',
      pageCount: job.pageCount,
      pdfPages: pdf.pages.map((item) => [Number(item.widthMm.toFixed(2)), Number(item.heightMm.toFixed(2))]),
    });
  });

  it('exports Letter portrait and landscape with the matching PDF geometry', async () => {
    const env = ui.isolated('m4c2-letter');
    await launch('m4c2-letter');
    const packagePath = await openPackage(env, 'Export Letter', pageCalloutModesDocument());
    await setPageSettings(packagePath, { setup: LETTER_PORTRAIT });
    const portraitPath = resolve(outputRoot, 'letter-portrait.pdf');
    const portrait = await exportPdf({ packagePath, outputPath: portraitPath });
    assert.equal(portrait.status, 'done', portrait.error?.message ?? 'Letter portrait succeeds');
    const portraitPdf = await inspect(portraitPath);
    assertPageSizes(portraitPdf, portrait);
    assert.equal(portrait.pageWidthMm, 215.9);
    assert.equal(portrait.pageHeightMm, 279.4);

    await setPageSettings(packagePath, { setup: LETTER_LANDSCAPE });
    const landscapePath = resolve(outputRoot, 'letter-landscape.pdf');
    const landscape = await exportPdf({ packagePath, outputPath: landscapePath });
    assert.equal(landscape.status, 'done', landscape.error?.message ?? 'Letter landscape succeeds');
    const landscapePdf = await inspect(landscapePath);
    assertPageSizes(landscapePdf, landscape);
    assert.equal(landscape.pageWidthMm, 279.4);
    assert.equal(landscape.pageHeightMm, 215.9);
    record({
      case: 'Letter portrait',
      pageCount: portrait.pageCount,
      pdfPages: portraitPdf.pages.map((item) => [Number(item.widthMm.toFixed(2)), Number(item.heightMm.toFixed(2))]),
    });
    record({
      case: 'Letter landscape',
      pageCount: landscape.pageCount,
      pdfPages: landscapePdf.pages.map((item) => [Number(item.widthMm.toFixed(2)), Number(item.heightMm.toFixed(2))]),
    });
  });

  it('includes unsaved edits and enforces the explicit overwrite policy', async () => {
    const env = ui.isolated('m4c2-unsaved');
    await launch('m4c2-unsaved');
    const packagePath = await openPackage(
      env,
      'Export unsaved',
      pageDocument({
        id: 'export-unsaved',
        title: 'Unsaved export',
        chapterTitle: 'Draft',
        blocks: [textBlock('intro', 'Intro', 'A saved paragraph before the export.')],
      }),
    );
    const chapterId = (await ui.structure()).chapters[0].id;
    await ui.applyCommand({
      type: 'block.create',
      blockId: 'unsaved-block',
      content: {
        type: 'doc',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'An unsaved export paragraph with a unique phrase.' }],
          },
        ],
      },
      placement: { kind: 'top-level', chapterId },
    });
    const runtime = await page.evaluate(() => {
      const state = window.__noteforestTest.state();
      return state.runtimes.find((item) => item.packagePath === state.activeTab);
    });
    assert.equal(runtime.dirty, true, 'the fixture has unsaved changes');

    const outputPath = resolve(outputRoot, 'unsaved-revision.pdf');
    const job = await exportPdf({ packagePath, outputPath });
    assert.equal(job.status, 'done', job.error?.message ?? 'unsaved export succeeds');
    assert.equal(job.revision, runtime.revision, 'the export reports the current revision');
    const pdf = await inspect(outputPath);
    assertPageSizes(pdf, job);
    assert.ok(
      textContains(pdf.text, 'unique phrase'),
      'the unsaved paragraph is in the exported PDF',
    );

    // Write the same path again: explicit overwrite is required, and a refused
    // export never touches the existing file.
    const refused = await exportPdf({ packagePath, outputPath });
    assert.equal(refused.status, 'failed');
    assert.equal(refused.error.code, 'output-exists');
    const kept = await inspect(outputPath);
    assertPageSizes(kept, job);

    const replaced = await exportPdf({ packagePath, outputPath, overwrite: true });
    assert.equal(replaced.status, 'done', replaced.error?.message ?? 'overwrite succeeds');
    assert.equal(replaced.overwrite, true);
    assert.ok((await readDirectory(outputRoot)).every((name) => !name.endsWith('.partial')));
    record({
      case: 'unsaved revision',
      revision: job.revision,
      pageCount: job.pageCount,
    });
  });

  it('cancels a running export without leaving a partial file', async () => {
    const env = ui.isolated('m4c2-cancel');
    await launch('m4c2-cancel');
    const packagePath = await openPackage(
      env,
      'Export cancel',
      pageCalloutModesDocument(),
    );
    const outputPath = resolve(outputRoot, 'cancelled.pdf');
    const started = await page.evaluate(
      (input) => window.noteforest.exportPdf(input),
      { packagePath, outputPath },
    );
    assert.equal(started.ok, true, started.message);
    const accepted = await page.evaluate(
      (jobId) => window.noteforest.cancelExport(jobId),
      started.jobId,
    );
    assert.equal(accepted, true, 'the running export accepts cancellation');
    const job = await waitUntil(
      async () => {
        const current = await page.evaluate(
          (id) => window.noteforest.getExportJob(id),
          started.jobId,
        );
        return current !== null && current.status !== 'running' ? current : false;
      },
      'cancelled export',
      30000,
    );
    assert.equal(job.status, 'cancelled');
    assert.equal(job.error.code, 'cancelled');
    const names = await readDirectory(outputRoot);
    assert.ok(!names.includes('cancelled.pdf'), 'no output file after cancellation');
    assert.ok(names.every((name) => !name.endsWith('.partial')), 'no temp file after cancellation');
    record({ case: 'cancelled', status: job.status, outputFiles: names.length });
  });

  it('refuses a document whose tall paragraph would be clipped and names the block', async () => {
    const env = ui.isolated('m4c2-preflight');
    await launch('m4c2-preflight');
    const packagePath = await openPackage(
      env,
      'Export blocked',
      pageDocument({
        id: 'export-blocked',
        title: 'Blocked export',
        chapterTitle: 'Blocked',
        blocks: [textBlock('tall', 'Tall block', 'word '.repeat(4000))],
      }),
    );
    await setPageSettings(packagePath, { setup: A5_PORTRAIT });
    const outputPath = resolve(outputRoot, 'blocked.pdf');
    const job = await exportPdf({ packagePath, outputPath });
    assert.equal(job.status, 'failed');
    assert.equal(job.error.code, 'preflight-blocked');
    assert.ok(job.error.message.includes('Tall block'), job.error.message);
    assert.ok(
      job.error.details.some(
        (detail) => detail.kind === 'blocking-defect' && detail.blockTitle === 'Tall block',
      ),
      'the blocking defect names the affected block',
    );
    const names = await readDirectory(outputRoot);
    assert.ok(!names.includes('blocked.pdf'), 'no PDF is written for a blocked document');
    assert.ok(names.every((name) => !name.endsWith('.partial')), 'no temp file for a blocked document');
    record({ case: 'preflight blocked', error: job.error });
  });

  it('exports with a missing-asset placeholder and surfaces the warning', async () => {
    const env = ui.isolated('m4c2-missing-asset');
    await launch('m4c2-missing-asset');
    const packagePath = await openPackage(
      env,
      'Export missing asset',
      pageDocument({
        id: 'export-missing-asset',
        title: 'Missing asset export',
        chapterTitle: 'Assets',
        blocks: [
          textBlock('intro', 'Intro', 'A paragraph beside a missing figure.'),
          {
            id: 'lost',
            label: 'Lost figure',
            content: {
              type: 'doc',
              children: [
                {
                  type: 'image',
                  attrs: { assetId: 'missing-asset-id', alt: 'Lost diagram' },
                },
              ],
            },
          },
        ],
      }),
    );
    const outputPath = resolve(outputRoot, 'missing-asset.pdf');
    const job = await exportPdf({ packagePath, outputPath });
    assert.equal(job.status, 'done', job.error?.message ?? 'missing-asset export succeeds');
    assert.ok(
      job.warnings.some((warning) => warning.kind === 'asset'),
      'the missing asset is surfaced on the job',
    );
    const pdf = await inspect(outputPath);
    assertPageSizes(pdf, job);
    record({ case: 'missing asset', warnings: job.warnings });
  });
});
