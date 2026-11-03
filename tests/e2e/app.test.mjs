import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { _electron as electron } from 'playwright';
import { inspectPdfFile, textContains } from '../../scripts/lib/pdf.mjs';

const root = resolve(import.meta.dirname, '../..');
const outDir = resolve(root, 'artifacts/e2e');
const fixtureDir = resolve(root, 'fixtures');

let app;
let page;
const pageErrors = [];

async function loadFixture(file) {
  await page.evaluate((target) => window.__noteforest.loadFixture(target), file);
  await page.waitForFunction(
    (target) => window.__noteforest && window.__noteforest.getState().fixtureFile === target,
    file,
    { timeout: 240000 },
  );
  return page.evaluate(() => window.__noteforest.getState());
}

async function setView(view) {
  await page.evaluate((next) => window.__noteforest.setView(next), view);
  if (view === 'page') await page.waitForSelector('[data-page-number="1"]');
  else await page.waitForSelector('[data-reader-chapter]');
}

describe('NoteForest Spike 1', () => {
  before(async () => {
    await mkdir(outDir, { recursive: true });
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({
      args: ['apps/desktop'],
      cwd: root,
      env: {
        ...env,
        NOTEFOREST_E2E: '1',
        NOTEFOREST_FIXTURES: fixtureDir,
        NOTEFOREST_OUTPUT_DIR: outDir,
      },
    });
    page = await app.firstWindow();
    page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message));
    await page.waitForFunction(() => Boolean(window.__noteforest), null, { timeout: 120000 });
  });

  after(async () => {
    if (app) await app.close();
  });

  it('loads F1 in reader and page view without console errors', async () => {
    const state = await loadFixture('golden-eigenvalues.json');
    assert.equal(state.blockCount, 5);
    assert.equal(state.pageCount, 3);
    assert.deepEqual(state.defects, []);
    assert.equal(state.blocks.map((block) => block.blockId).join(','), 'b1,b3,b5,b2,b4');
    await setView('page');
    const geometry = await page.evaluate(() => window.__noteforest.getPageViewGeometry());
    assert.equal(geometry.pages.length, 3);
    await page.screenshot({ path: resolve(outDir, 'F1-page-view.png') });
    await setView('reader');
    assert.ok(await page.locator('[data-reader-chapter]').count());
  });

  it('exports F1 with the paginator page count and real text', async () => {
    const state = await page.evaluate(() => window.__noteforest.getState());
    const result = await page.evaluate(() => window.__noteforest.exportPdf());
    assert.equal(result.ok, true, result.error);
    assert.equal(result.expectedPageCount, state.pageCount);
    assert.equal(result.pdfPageCount, state.pageCount);
    assert.ok((await stat(result.path)).size > 10000);
    const pdf = await inspectPdfFile(result.path);
    assert.equal(pdf.pageCount, state.pageCount);
    assert.equal(pdf.missingGlyphCount, 0);
    assert.ok(textContains(pdf.text, 'Computing eigenvalues'));
    assert.ok(textContains(pdf.text, 'eigenvalue'));
    assert.ok(textContains(pdf.text, 'continues on page 2'));
  });

  it('exports F2 as a 50+ page real-text PDF', async () => {
    const state = await loadFixture('long-50-pages.json');
    assert.ok(state.pageCount >= 50);
    await setView('page');
    const result = await page.evaluate(() => window.__noteforest.exportPdf());
    assert.equal(result.ok, true, result.error);
    assert.equal(result.pdfPageCount, state.pageCount);
    const pdf = await inspectPdfFile(result.path);
    assert.equal(pdf.pageCount, state.pageCount);
    assert.equal(pdf.missingGlyphCount, 0);
    assert.ok(textContains(pdf.text, 'Topic 1.1'));
    assert.ok(textContains(pdf.text, 'Eigenvalue table'));
    assert.ok(textContains(pdf.text, 'continues on page'));
    assert.ok(textContains(pdf.text, 'continued from page'));
    assert.ok(pdf.textItems.length > 1000);
  });

  it('blocks export for F6 when a table row is taller than the page', async () => {
    const target = resolve(outDir, 'spike-01-tables.pdf');
    await rm(target, { force: true });
    const state = await loadFixture('tables.json');
    assert.ok(state.defects.some((defect) => defect.code === 'too-tall-row' && defect.blocksExport));
    const result = await page.evaluate(() => window.__noteforest.exportPdf());
    assert.equal(result.ok, false);
    assert.match(result.error, /too-tall-row|Table row/i);
    assert.equal(existsSync(target), false);
  });

  it('surfaces F8 defects and leaves no partial PDF', async () => {
    const target = resolve(outDir, 'spike-01-defects.pdf');
    await rm(target, { force: true });
    const state = await loadFixture('defects.json');
    const codes = new Set(state.defects.map((defect) => defect.code));
    for (const code of ['content-too-wide', 'no-safe-break', 'missing-asset', 'impossible-hint']) {
      assert.ok(codes.has(code), `missing ${code}`);
    }
    const result = await page.evaluate(() => window.__noteforest.exportPdf());
    assert.equal(result.ok, false);
    assert.ok(result.error.length > 0);
    assert.equal(existsSync(target), false);
  });

  it('keeps broken and ambiguous anchor branches and exports markers', async () => {
    const state = await loadFixture('broken-anchor.json');
    const codes = new Set(state.defects.map((defect) => defect.code));
    assert.ok(codes.has('broken-anchor'));
    assert.ok(codes.has('ambiguous-anchor'));
    const result = await page.evaluate(() => window.__noteforest.exportPdf());
    assert.equal(result.ok, true, result.error);
    const pdf = await inspectPdfFile(result.path);
    assert.equal(pdf.pageCount, state.pageCount);
    assert.ok(textContains(pdf.text, 'anchor broken'));
    assert.ok(textContains(pdf.text, 'anchor ambiguous'));
  });

  it('keeps reference edges out of layout', async () => {
    await loadFixture('shared-child.json');
    const probe = await page.evaluate(() => window.__noteforest.referenceProbe());
    assert.equal(probe.positionsIdentical, true);
    assert.equal(probe.pageBreaksIdentical, true);
    assert.equal(probe.pageCountBefore, probe.pageCountAfter);
  });

  it('meets the 300-block performance, stability, and export gate', async () => {
    const state = await loadFixture('scale-300.json');
    assert.equal(state.blockCount, 300);
    assert.equal(state.defects.length, 0);
    assert.ok(state.metrics.warmMedianMs < 50, `warm layout ${state.metrics.warmMedianMs} ms`);
    assert.ok(state.metrics.warmP95Ms < 50, `warm p95 ${state.metrics.warmP95Ms} ms`);
    const stability = await page.evaluate(() => window.__noteforest.stabilityProbe());
    assert.ok(stability.add.keptRatio >= 0.95);
    assert.equal(stability.add.unrelatedChaptersMoved, 0);
    assert.equal(stability.delete.outsideAffectedMoved, 0);
    assert.equal(stability.reference.positionsIdentical, true);
    assert.equal(stability.reference.pageBreaksIdentical, true);
    const result = await page.evaluate(() => window.__noteforest.exportPdf());
    assert.equal(result.ok, true, result.error);
    assert.ok(result.durationMs < 10000, `export ${result.durationMs} ms`);
    assert.equal(result.pdfPageCount, state.pageCount);
  });

  it('did not emit renderer page errors', () => {
    assert.deepEqual(pageErrors, []);
  });
});
