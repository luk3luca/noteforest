import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifactsPath, waitUntil } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { writePagePackage } from '../support/page-fixtures.mjs';
import {
  anchorReviewDocument,
  REVIEW_ASSET_FILES,
  REVIEW_BLOCK_IDS,
} from '../support/anchor-review-fixture.mjs';
import { inspectPdfFile, textContains } from '../../scripts/lib/pdf.mjs';

/**
 * Anchor resolution index, owner review package (plan §6.3).
 *
 * One fixture with the five visible cases, compared in Continuous, Page Read
 * and the exported PDF. `ANCHOR_REVIEW_BEFORE=1` captures the same evidence
 * against the pre-index code and skips the post-change assertions; the default
 * run is the acceptance gate.
 */

const BEFORE = process.env.ANCHOR_REVIEW_BEFORE === '1';
const PREFIX = BEFORE ? 'before' : 'after';
const tempRoot = artifactsPath('m5a-anchor-review');
const outputDir = artifactsPath('anchor-review');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

const IDS = REVIEW_BLOCK_IDS;

async function launch() {
  page = await ui.launch(ui.isolated('m5a-anchor-review'));
  await h.setWindowSize(1440, 1000);
}

async function openReviewPackage() {
  const packagePath = await writePagePackage(
    ui.isolated('m5a-anchor-review').NOTEFOREST_LIBRARY,
    'anchor-review',
    anchorReviewDocument(),
    REVIEW_ASSET_FILES,
  );
  const opened = await page.evaluate(
    (path) => window.__noteforestTest.openPath(path),
    packagePath,
  );
  assert.equal(opened, true, 'review fixture opens');
  await page.waitForFunction(
    (path) => window.__noteforestTest.state().activeTab === path,
    packagePath,
    { timeout: 10000 },
  );
  await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
  await h.waitSaved();
  return packagePath;
}

async function waitPageReady() {
  await page.waitForFunction(
    () => {
      const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
      return (
        view !== null &&
        view.getAttribute('data-ready') === 'true' &&
        view.getAttribute('data-updating') === 'false'
      );
    },
    undefined,
    { timeout: 30000 },
  );
}

async function showPageRead() {
  await page.keyboard.press('Meta+3');
  await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view');
  await waitPageReady();
  await ui.ensureInteractionMode('read');
  await waitPageReady();
}

async function pageWarnings() {
  return page.evaluate(() => {
    const fragments = [
      ...document.querySelectorAll(
        '.nf-editor[data-active="true"] .nf-page-view [data-fragment-block]',
      ),
    ];
    return fragments.map((fragment) => ({
      blockId: fragment.getAttribute('data-fragment-block'),
      warning: fragment.getAttribute('data-fragment-anchor-warning') === 'true',
      page: Number(fragment.getAttribute('data-fragment-page')),
      rect: fragment.getBoundingClientRect().toJSON(),
    }));
  });
}

async function pageTrunks() {
  return page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '.nf-editor[data-active="true"] .nf-page-view [data-page-trunk-id]',
      ),
    ].map((trunk) => ({
      id: trunk.getAttribute('data-page-trunk-id'),
      parent: trunk.getAttribute('data-page-trunk-parent'),
      placement: trunk.getAttribute('data-page-trunk-placement'),
      group: trunk.getAttribute('data-page-trunk-group'),
      x: Number(trunk.getAttribute('data-page-trunk-x')),
    })),
  );
}

async function anchorStates() {
  return page.evaluate(() => {
    const states = window.__noteforestTest.anchorStates?.();
    return states ?? null;
  });
}

async function exportPdf(packagePath) {
  const pdfPath = resolve(outputDir, `${PREFIX}-anchor-review.pdf`);
  const started = await page.evaluate(
    (input) => window.noteforest.exportPdf(input),
    { packagePath, outputPath: pdfPath, overwrite: true },
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
  assert.equal(job.status, 'done', job.error?.message ?? 'the export succeeds');
  return { pdfPath, job };
}

describe('anchor resolution review package', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    await mkdir(outputDir, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('captures Continuous, Page Read and the exported PDF', async () => {
    await launch();
    const packagePath = await openReviewPackage();

    await page.screenshot({
      path: resolve(outputDir, `${PREFIX}-continuous.png`),
      fullPage: false,
    });
    const states = await anchorStates();

    await showPageRead();
    await page.screenshot({
      path: resolve(outputDir, `${PREFIX}-page-read.png`),
      fullPage: false,
    });
    const warnings = await pageWarnings();
    const trunks = await pageTrunks();
    const warningBlocks = warnings.filter((entry) => entry.warning).map((entry) => entry.blockId);

    const { pdfPath, job } = await exportPdf(packagePath);
    const pdf = await inspectPdfFile(pdfPath);
    execFileSync(
      process.execPath,
      [
        resolve(import.meta.dirname, '../../scripts/raster-pdf.mjs'),
        pdfPath,
        resolve(outputDir, `${PREFIX}-pdf`),
        '120',
      ],
      { stdio: 'inherit' },
    );
    const preflightAnchorBlocks = [
      ...new Set(
        job.warnings
          .filter((warning) => warning.kind === 'anchor')
          .map((warning) => warning.blockId)
          .filter((blockId) => typeof blockId === 'string'),
      ),
    ].sort();
    const fragment = new Map(warnings.map((entry) => [entry.blockId, entry.rect]));
    const geometry = {
      formulaParentLeft: fragment.get(IDS.formula)?.left ?? null,
      formulaCalloutLeft: fragment.get(IDS.formulaTarget)?.left ?? null,
      formulaParentRight: fragment.get(IDS.formula)?.right ?? null,
      imageParentLeft: fragment.get(IDS.image)?.left ?? null,
      imageCalloutLeft: fragment.get(IDS.imageTarget)?.left ?? null,
      imageParentRight: fragment.get(IDS.image)?.right ?? null,
      selectorParentLeft: fragment.get(IDS.selector)?.left ?? null,
      selectorCalloutLeft: fragment.get(IDS.selectorTarget)?.left ?? null,
    };
    const evidence = {
      capturedAt: new Date().toISOString(),
      mode: BEFORE ? 'before' : 'after',
      pageCount: job.pageCount,
      anchorStates: states,
      pageWarningBlocks: [...new Set(warningBlocks)].sort(),
      preflightAnchorBlocks,
      calloutGeometry: geometry,
      calloutTrunks: trunks,
      pdfTextContainsControl: textContains(pdf.text, 'control'),
      pdfTextHasWarningGlyph: pdf.text.includes('⚠'),
    };
    await writeFile(
      resolve(outputDir, `${PREFIX}-evidence.json`),
      `${JSON.stringify(evidence, null, 2)}\n`,
    );

    // The PDF is the same print model: real text, no warning marker glyph.
    assert.ok(pdf.text.trim().length > 0, 'the PDF has real text');
    assert.ok(textContains(pdf.text, 'Anchor resolution review'), 'the title is in the PDF');
    assert.ok(textContains(pdf.text, 'control'), 'the control text is in the PDF');
    assert.ok(!pdf.text.includes('⚠'), 'the PDF carries no warning glyph');

    if (BEFORE) return;

    const stateOf = new Map((states ?? []).map((entry) => [entry.anchorId, entry.state]));
    assert.equal(stateOf.get('review-a-multi'), 'resolved');
    assert.equal(stateOf.get('review-a-formula'), 'ambiguous');
    assert.equal(stateOf.get('review-a-image'), 'broken');
    assert.equal(stateOf.get('review-a-selector'), 'resolved');
    assert.equal(stateOf.get('review-a-idle'), 'idle');
    assert.equal(stateOf.get('review-a-control'), 'resolved');

    // A Page dot exists exactly on the blocks whose placed anchor is
    // broken/ambiguous; resolved, selector-only and idle anchors stay clean.
    assert.deepEqual([...new Set(warningBlocks)].sort(), [IDS.formula, IDS.image]);
    assert.deepEqual(preflightAnchorBlocks, [IDS.formula, IDS.image].sort());
    assert.equal(
      warnings.filter((entry) => entry.blockId === IDS.multi).some((entry) => entry.warning),
      false,
      'the multi-node text range has no dot',
    );
    assert.equal(
      warnings.filter((entry) => entry.blockId === IDS.selector).some((entry) => entry.warning),
      false,
      'the selector-only anchor has no dot',
    );
    assert.equal(
      warnings.filter((entry) => entry.blockId === IDS.idle).some((entry) => entry.warning),
      false,
      'the idle anchor has no dot',
    );

    // Ambiguous/broken dots must not drag the card into the right lane: the
    // card keeps the measured callout lane it had before the state became a dot.
    assert.ok(geometry.formulaCalloutLeft !== null && geometry.formulaParentLeft !== null);
    assert.ok(geometry.formulaParentRight !== null);
    assert.ok(
      geometry.formulaCalloutLeft > geometry.formulaParentLeft + 20,
      'the ambiguous card is not at the block left edge',
    );
    assert.ok(
      geometry.formulaCalloutLeft < geometry.formulaParentRight - 40,
      'the ambiguous card is not at the warning point',
    );
    assert.ok(geometry.imageCalloutLeft !== null && geometry.imageParentLeft !== null);
    assert.ok(geometry.imageParentRight !== null);
    assert.ok(geometry.selectorCalloutLeft !== null, 'the selector card is captured');
    // The broken-image card starts on the same callout lane as the
    // selector-only card: never left of the below trunk, so the stem stays
    // visible. The DOM parent left includes a ~1 px page border, so compare
    // the two lane cards instead of hard-coding 38.
    assert.ok(
      Math.abs(geometry.imageCalloutLeft - geometry.selectorCalloutLeft) <= 1,
      'the broken image card uses the callout lane, not its measured content left',
    );
    assert.ok(
      geometry.imageCalloutLeft < geometry.imageParentRight - 40,
      'the broken image card is not at the warning point',
    );
    // A selector-resolved range with no measured rect uses the callout lane
    // offset, not the block/page content left.
    assert.ok(geometry.selectorCalloutLeft !== null && geometry.selectorParentLeft !== null);
    assert.ok(
      geometry.selectorCalloutLeft >= geometry.selectorParentLeft + 36,
      'the selector-only card uses the callout lane offset',
    );

    // Every below callout trunk starts at the block left + calloutTrunkInset
    // (24), including resolved, ambiguous and broken anchors. The attribute is
    // page-local; these review blocks start at the page content left (x = 0).
    for (const blockId of [IDS.multi, IDS.formula, IDS.image, IDS.selector, IDS.control]) {
      const trunk = trunks.find(
        (candidate) => candidate.parent === blockId && candidate.placement === 'below',
      );
      assert.ok(trunk, `below trunk for ${blockId}`);
      assert.ok(
        Math.abs(trunk.x - 24) < 0.6,
        `trunk for ${blockId} starts at the callout inset (${trunk.x} vs 24)`,
      );
    }

    // The print preflight surfaces one warning per dot block, not a second
    // display of a resolved anchor.
    assert.ok(job.warnings.some((warning) => warning.kind === 'anchor' && warning.blockId === IDS.formula));
    assert.ok(job.warnings.some((warning) => warning.kind === 'anchor' && warning.blockId === IDS.image));
    assert.equal(
      job.warnings.some(
        (warning) =>
          warning.kind === 'anchor' &&
          (warning.blockId === IDS.multi ||
            warning.blockId === IDS.selector ||
            warning.blockId === IDS.control),
      ),
      false,
      'resolved anchors produce no preflight warnings',
    );
  });
});
