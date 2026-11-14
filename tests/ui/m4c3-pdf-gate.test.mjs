import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifactsPath, root, waitUntil } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { writePagePackage } from '../support/page-fixtures.mjs';
import {
  m4c3DimensionedImageDocument,
  m4c3GateDocument,
  m4c3Scale300Document,
} from '../support/m4c3-fixtures.mjs';
import { inspectPdfFile, normalizeText, textContains } from '../../scripts/lib/pdf.mjs';

/**
 * M4c3 — 50+ page PDF gate.
 *
 * Production build, hidden Electron window, real `printToPDF`: the gate
 * fixture covers body/headings/lists/quotes, long code, KaTeX, real/missing/
 * region-anchored images, a table crossing pages, anchored callouts, wrapped
 * children/trunks, a broken anchor, and multiple chapters. The suite verifies
 * page count/size/orientation/margins, no blank/cut content, real text/glyphs,
 * continuation/ghost markers, raster/Page Read label parity at 1.0 mm, A5/
 * Letter smoke, the 300-block timing, and the S2-2 deleted-asset path.
 *
 * The product owner does the subjective visual/Notability check; this suite
 * writes the PDF and raster evidence under `artifacts/m4c3/`.
 */

const tempRoot = artifactsPath('m4c3-ui');
const outputRoot = artifactsPath('m4c3', 'gate');
const rasterRoot = artifactsPath('m4c3', 'raster');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
const evidence = [];
let page;

const A4_PORTRAIT = {
  size: 'A4',
  orientation: 'portrait',
  margins: { top: 20, right: 20, bottom: 20, left: 20 },
};
const A5_LANDSCAPE = {
  size: 'A5',
  orientation: 'landscape',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
};
const LETTER_PORTRAIT = {
  size: 'Letter',
  orientation: 'portrait',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
};

async function launch(name) {
  page = await ui.launch(ui.isolated(name));
}

async function openPackage(env, name, document, assetFiles = {}) {
  const packagePath = await writePagePackage(
    env.NOTEFOREST_LIBRARY,
    name,
    document,
    assetFiles,
  );
  const opened = await page.evaluate(
    (path) => window.__noteforestTest.openPath(path),
    packagePath,
  );
  assert.equal(opened, true, 'fixture package opens');
  await page.waitForFunction(
    (path) => window.__noteforestTest.state().activeTab === path,
    packagePath,
    { timeout: 20000 },
  );
  await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]', {
    timeout: 20000,
  });
  return packagePath;
}

async function setPageSettings(packagePath, override) {
  return page.evaluate(
    ({ path, value }) => window.__noteforestTest.setPageSettingsOverride(path, value),
    { path: packagePath, value: override },
  );
}

async function exportPdf({ packagePath, outputPath, overwrite }) {
  const started = await page.evaluate(
    (input) => window.noteforest.exportPdf(input),
    { packagePath, outputPath, ...(overwrite === undefined ? {} : { overwrite }) },
  );
  assert.equal(started.ok, true, started.message);
  return waitUntil(
    async () => {
      const current = await page.evaluate(
        (id) => window.noteforest.getExportJob(id),
        started.jobId,
      );
      return current !== null && current.status !== 'running' ? current : false;
    },
    `export ${started.jobId}`,
    180000,
  );
}

async function inspect(path) {
  return inspectPdfFile(path);
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
    assert.ok(
      pdfPage.textItemCount > 0 || pdfPage.imageCount > 0 || pdfPage.pathCount > 0,
      `page ${pdfPage.pageNumber} is not blank`,
    );
  }
  assert.equal(pdf.missingGlyphCount, 0, 'no replacement glyphs');
}

function assertSentinels(pdf, expected, label) {
  for (const text of expected) {
    assert.ok(textContains(pdf.text, text), `${label}: PDF contains "${text}"`);
  }
}

function hasContentType(node, type) {
  if (node.type === type) return true;
  return (node.children ?? []).some((child) => hasContentType(child, type));
}

function firstBlockPage(modelPages, document, predicate) {
  const blockIds = new Set(
    Object.entries(document.blocks)
      .filter(([, block]) => predicate(block.content))
      .map(([blockId]) => blockId),
  );
  return modelPages.find((modelPage) =>
    modelPage.blockIds.some((blockId) => blockIds.has(blockId)),
  );
}

function pxToMm(value) {
  return (value * 25.4) / 96;
}

function matchTextItem(pdfPage, textItems, expected, expectedX, expectedTop) {
  const needle = normalizeText(expected);
  if (needle.length === 0) return null;
  return textItems
    .filter((item) => {
      const value = normalizeText(item.text);
      return (
        value === needle ||
        value.startsWith(needle) ||
        needle.startsWith(value)
      );
    })
    .map((item) => {
      const xMm = (item.x * 25.4) / 72;
      const topMm =
        pdfPage.heightMm - (item.y * 25.4) / 72 - (item.height * 25.4) / 72;
      return { ...item, xMm, topMm, distance: Math.hypot(xMm - expectedX, topMm - expectedTop) };
    })
    .sort((left, right) => left.distance - right.distance)[0] ?? null;
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
    { timeout: 60000 },
  );
}

async function showPageReadActualSize() {
  await page.keyboard.press('Meta+3');
  await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view');
  await waitPageReady();
  await page.keyboard.press('Meta+0');
  await page.waitForFunction(
    () => {
      const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
      const wrap = view?.querySelector('.nf-page-sheet-wrap');
      return wrap !== null && wrap !== undefined && wrap.getAttribute('data-page-zoom') === '100';
    },
    undefined,
    { timeout: 10000 },
  );
  await ui.ensureInteractionMode('read');
}

async function currentPageNumber() {
  return Number(
    await page.locator('.nf-editor[data-active="true"] .nf-page-view').getAttribute(
      'data-current-page',
    ),
  );
}

async function gotoPage(target) {
  let current = await currentPageNumber();
  while (current < target) {
    const next = current + 1;
    await page.locator('[data-page-nav="next"]').click();
    await page.waitForFunction(
      (expected) =>
        Number(
          document
            .querySelector('.nf-editor[data-active="true"] .nf-page-view')
            ?.getAttribute('data-current-page'),
        ) === expected,
      next,
      { timeout: 10000 },
    );
    current = next;
  }
  while (current > target) {
    const previous = current - 1;
    await page.locator('[data-page-nav="prev"]').click();
    await page.waitForFunction(
      (expected) =>
        Number(
          document
            .querySelector('.nf-editor[data-active="true"] .nf-page-view')
            ?.getAttribute('data-current-page'),
        ) === expected,
      previous,
      { timeout: 10000 },
    );
    current = previous;
  }
}

async function readPageGeometry() {
  return page.evaluate(() => {
    const sheet = document.querySelector('.nf-editor[data-active="true"] .nf-page-sheet');
    if (sheet === null) return null;
    const sheetRect = sheet.getBoundingClientRect();
    const box = (element) => {
      if (element === null) return null;
      const rect = element.getBoundingClientRect();
      return {
        text: (element.textContent ?? '').trim(),
        x: rect.left - sheetRect.left,
        y: rect.top - sheetRect.top,
      };
    };
    return {
      labels: [...sheet.querySelectorAll('[data-fragment-block] .nf-label')].map(box),
      headerTitle: box(sheet.querySelector('.nf-page-header-text')),
      footerText: box(sheet.querySelector('.nf-page-footer-text')),
      footerNumber: box(sheet.querySelector('.nf-page-footer-number')),
      edges: sheet.querySelectorAll('[data-page-edge-id]').length,
      trunks: sheet.querySelectorAll('[data-page-trunk-id]').length,
      width: sheetRect.width,
      height: sheetRect.height,
    };
  });
}

function assertLabelParity(pdf, pdfPage, geometry, label) {
  const checks = [
    ...geometry.labels.map((item) => ({ ...item, kind: 'label' })),
    ...(geometry.headerTitle === null
      ? []
      : [{ ...geometry.headerTitle, kind: 'header-title' }]),
    ...(geometry.footerText === null
      ? []
      : [{ ...geometry.footerText, kind: 'footer-text' }]),
    ...(geometry.footerNumber === null
      ? []
      : [{ ...geometry.footerNumber, kind: 'footer-number' }]),
  ];
  let maxDelta = 0;
  let checked = 0;
  for (const item of checks) {
    if (item.text.length === 0) continue;
    const expectedX = pxToMm(item.x);
    const expectedTop = pxToMm(item.y);
    const match = matchTextItem(
      pdfPage,
      pdf.textItems.filter((textItem) => textItem.pageNumber === pdfPage.pageNumber),
      item.text,
      expectedX,
      expectedTop,
    );
    assert.ok(match !== null, `${label}: PDF has text "${item.text}"`);
    const deltaX = Math.abs(match.xMm - expectedX);
    const deltaY = Math.abs(match.topMm - expectedTop);
    maxDelta = Math.max(maxDelta, deltaX, deltaY);
    assert.ok(
      deltaX <= 1.0 && deltaY <= 1.0,
      `${label}: "${item.text}" delta ${deltaX.toFixed(2)}/${deltaY.toFixed(2)} mm <= 1.0 mm`,
    );
    checked += 1;
  }
  assert.ok(checked > 0, `${label}: at least one text geometry item checked`);
  return { checked, maxDeltaMm: Number(maxDelta.toFixed(2)) };
}

/** Embedded font programs are visible in the PDF object dictionaries. */
async function assertEmbeddedFonts(pdfPath) {
  const latin = (await readFile(pdfPath)).toString('latin1');
  const fontObjects = (latin.match(/\/Type\s*\/Font/g) ?? []).length;
  const fontFiles = (latin.match(/\/FontFile[23]?/g) ?? []).length;
  assert.ok(fontObjects > 0, 'the PDF has font objects');
  assert.ok(fontFiles > 0, 'the PDF embeds font programs');
  return { fontObjects, fontFiles };
}

/** Content labels stay inside the resolved page margins. */
function assertContentMargins(geometry, job, label) {
  const mmToPx = 96 / 25.4;
  const left = job.pageSetup.margins.left * mmToPx;
  const right = job.pageSetup.margins.right * mmToPx;
  const top = job.pageSetup.margins.top * mmToPx;
  const bottom = job.pageSetup.margins.bottom * mmToPx;
  for (const item of geometry.labels) {
    assert.ok(item.x >= left - 1, `${label}: "${item.text}" left ${item.x.toFixed(1)} >= ${left.toFixed(1)}`);
    assert.ok(
      item.x <= geometry.width - right + 1,
      `${label}: "${item.text}" right ${item.x.toFixed(1)} <= ${(geometry.width - right).toFixed(1)}`,
    );
    assert.ok(item.y >= top - 1, `${label}: "${item.text}" top ${item.y.toFixed(1)} >= ${top.toFixed(1)}`);
    assert.ok(
      item.y <= geometry.height - bottom + 1,
      `${label}: "${item.text}" bottom ${item.y.toFixed(1)} <= ${(geometry.height - bottom).toFixed(1)}`,
    );
  }
}

function rasterize(pdfPath, prefix, pages) {
  execFileSync(
    process.execPath,
    [resolve(root, 'scripts/raster-pdf.mjs'), pdfPath, prefix, '150', pages],
    { stdio: 'pipe' },
  );
}

function record(entry) {
  evidence.push({ at: new Date().toISOString(), ...entry });
}

describe('M4c3 PDF gate', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await rm(outputRoot, { recursive: true, force: true });
    await rm(rasterRoot, { recursive: true, force: true });
    await mkdir(outputRoot, { recursive: true });
    await mkdir(rasterRoot, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    await writeFile(
      resolve(outputRoot, 'gate-evidence.json'),
      JSON.stringify(evidence, null, 2),
      'utf8',
    );
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('exports the 50+ page A4 gate fixture and proves the page matrix', async () => {
    const env = ui.isolated('m4c3-gate');
    await launch('m4c3-gate');
    const { document, assetFiles } = await m4c3GateDocument();
    const packagePath = await openPackage(env, 'M4c3 gate', document, assetFiles);
    await setPageSettings(packagePath, { setup: A4_PORTRAIT });
    const outputPath = resolve(outputRoot, 'gate-a4-portrait.pdf');
    const job = await exportPdf({ packagePath, outputPath });
    assert.equal(job.status, 'done', job.error?.message ?? 'gate export succeeds');
    assert.equal(job.error, null);
    assert.ok(job.pageCount >= 50, `gate derives at least 50 pages (got ${job.pageCount})`);
    assert.equal(job.pageWidthMm, 210);
    assert.equal(job.pageHeightMm, 297);
    assert.equal(job.rendered, true);
    assert.equal(job.framesSettled, true);
    assert.equal(job.imagesSettled, true);
    assert.equal(job.fontsSettled, true);
    assert.ok(!job.warnings.some((warning) => warning.code === 'console-error'));
    assert.ok(job.timings.measureMs > 0);
    assert.ok(job.timings.settleMs > 0);

    const pdf = await inspect(outputPath);
    assertPageSizes(pdf, job);
    assert.ok(pdf.pageCount >= 50, `PDF has at least 50 pages (got ${pdf.pageCount})`);
    assert.ok(pdf.text.trim().length > 0, 'the PDF has real extractable text');
    const fonts = await assertEmbeddedFonts(outputPath);
    assert.ok(pdf.text.includes('continues on page'), 'continuation markers are printed');
    assert.ok(pdf.text.includes('continued from page'), 'ghost markers are printed');
    assertSentinels(
      pdf,
      [
        'Linear algebra — a long reader',
        'Chapter 1',
        'Chapter 2',
        'Chapter 3',
        'Chapter 4 — gate matrix',
        'Chapter 5 — extended notes',
        'Extended note 70',
        'Gate heading level one',
        'Gate heading level two',
        'Gate heading level three',
        'A quoted sentence that must survive the page gate.',
        '# continuation section 1',
        'continuation_2 = transform(matrix, vector_2)',
        'Eigenvalue',
        'Missing forest plot',
        'Missing gate figure',
        'A callout anchored to the first image region.',
        'A callout anchored to a point on the image.',
      ],
      'gate',
    );
    assert.ok(pdf.text.includes('λ'), 'display/inline lambda is vector text');
    assert.ok(pdf.text.includes('∑'), 'display sum is vector text');
    const missingLabels = Object.values(document.blocks)
      .map((block) => block.label)
      .filter(
        (label) =>
          typeof label === 'string' &&
          label.length > 0 &&
          !textContains(pdf.text, label),
      );
    assert.deepEqual(
      missingLabels,
      [],
      `every block label is printed (missing: ${missingLabels.slice(0, 8).join(', ')})`,
    );
    assert.ok(
      pdf.pages.some((item) => item.imageCount > 0),
      'the real forest image is embedded',
    );
    assert.ok(
      pdf.pages.some((item) => item.pathCount > 0),
      'the PDF contains vector arrows/trunks',
    );
    const missingPage = pdf.pages.find((item) => textContains(item.text, 'Missing gate figure'));
    assert.ok(missingPage !== undefined, 'the missing dimensioned image prints the placeholder');
    assert.equal(missingPage.imageCount, 0, 'the missing asset prints no broken-image XObject');

    const warningCodes = job.warnings.map((warning) => warning.code);
    assert.ok(warningCodes.includes('missing-asset'), 'missing assets are surfaced');
    assert.ok(warningCodes.includes('anchor-warning'), 'the broken anchor is surfaced');
    assert.ok(
      job.warnings.some(
        (warning) =>
          warning.kind === 'anchor' && warning.blockId === 'm4c3-broken-parent',
      ),
      'the broken anchor names its block',
    );
    assert.ok(
      !warningCodes.includes('images-not-settled') && !warningCodes.includes('fonts-not-settled'),
      'the gate export settled every image and font',
    );
    assert.ok(
      !warningCodes.includes('textless-page'),
      'no page is textless on the gate fixture',
    );
    assert.deepEqual(
      (await readdir(outputRoot)).filter((name) => name.endsWith('.partial')),
      [],
    );

    const file = await stat(outputPath);
    rasterize(outputPath, resolve(rasterRoot, 'gate-a4'), '1,2');
    record({
      case: 'A4 portrait gate',
      pageCount: job.pageCount,
      pageSetup: job.pageSetup,
      pdfPages: pdf.pages.length,
      pdfBytes: file.size,
      textChars: pdf.text.length,
      imagePages: pdf.pages.filter((item) => item.imageCount > 0).length,
      vectorPages: pdf.pages.filter((item) => item.pathCount > 0).length,
      fonts,
      warnings: job.warnings,
      timings: job.timings,
    });

    // Page Read vs PDF text geometry at the ADR 1.0 mm gate on representative
    // pages: first, a continuation, the image page, the table page, and last.
    await showPageReadActualSize();
    const modelPages = await page.evaluate(() => window.__noteforestTest.pageModelPages());
    assert.ok(Array.isArray(modelPages), 'Page Read exposes its derived page model');
    assert.equal(modelPages.length, job.pageCount, 'Page Read page count equals the export');
    const continuationPage = modelPages.find(
      (modelPage) => modelPage.continuationIn > 0 || modelPage.continuationOut > 0,
    );
    assert.ok(continuationPage !== undefined, 'the gate has a continuation page');
    const imagePage = modelPages.find((modelPage) =>
      modelPage.blockIds.includes('m4c3-image-regions'),
    );
    assert.ok(imagePage !== undefined, 'the gate has an image page');
    const tableBlockIds = Object.entries(document.blocks)
      .filter(([, block]) => hasContentType(block.content, 'table'))
      .map(([blockId]) => blockId);
    const tablePage = firstBlockPage(modelPages, document, (content) =>
      hasContentType(content, 'table'),
    );
    assert.ok(tablePage !== undefined, 'the gate has a table page');
    const tablePages = modelPages.filter((modelPage) =>
      modelPage.blockIds.some((blockId) => tableBlockIds.includes(blockId)),
    );
    assert.ok(tablePages.length >= 2, 'the table crosses at least two pages');
    const continuationCodePages = modelPages.filter((modelPage) =>
      modelPage.blockIds.includes('m4c3-continuation-child'),
    );
    assert.ok(
      continuationCodePages.length >= 2,
      'the long anchored code branch continues across pages',
    );
    const representatives = [
      modelPages[0],
      continuationPage,
      imagePage,
      tablePage,
      modelPages.at(-1),
    ].filter(
      (modelPage, index, list) =>
        modelPage !== undefined &&
        list.findIndex((candidate) => candidate?.pageNumber === modelPage.pageNumber) === index,
    );
    const parity = [];
    for (const modelPage of representatives) {
      await gotoPage(modelPage.pageNumber);
      const geometry = await readPageGeometry();
      assert.ok(geometry !== null, `page ${modelPage.pageNumber} geometry is readable`);
      assertContentMargins(geometry, job, `margins page ${modelPage.pageNumber}`);
      const result = assertLabelParity(
        pdf,
        pdf.pages[modelPage.pageNumber - 1],
        geometry,
        `parity page ${modelPage.pageNumber}`,
      );
      parity.push({
        pageNumber: modelPage.pageNumber,
        edges: geometry.edges,
        trunks: geometry.trunks,
        ...result,
      });
    }
    assert.ok(
      parity.every((item) => item.maxDeltaMm <= 1.0),
      'every representative page is within the 1.0 mm raster/Page Read gate',
    );
    assert.ok(
      parity.some((item) => item.trunks > 0),
      'a representative page carries semantic group trunks',
    );
    rasterize(
      outputPath,
      resolve(rasterRoot, 'gate-parity'),
      representatives.map((modelPage) => modelPage.pageNumber).join(','),
    );
    record({
      case: 'Page Read parity',
      pages: parity,
      tablePages: tablePages.length,
      continuationCodePages: continuationCodePages.length,
      continuationPage: continuationPage.pageNumber,
    });

    // A5/Letter and portrait/landscape smoke on the same real gate fixture.
    for (const [name, setup, file] of [
      ['A5 landscape', A5_LANDSCAPE, 'gate-a5-landscape.pdf'],
      ['Letter portrait', LETTER_PORTRAIT, 'gate-letter-portrait.pdf'],
    ]) {
      await setPageSettings(packagePath, { setup });
      const smokePath = resolve(outputRoot, file);
      const smokeJob = await exportPdf({ packagePath, outputPath: smokePath });
      assert.equal(smokeJob.status, 'done', `${name}: ${smokeJob.error?.message ?? 'ok'}`);
      const smokePdf = await inspect(smokePath);
      assertPageSizes(smokePdf, smokeJob);
      assert.ok(smokePdf.pageCount >= 20, `${name}: real multi-page export`);
      assert.equal(smokePdf.missingGlyphCount, 0, `${name}: no replacement glyphs`);
      record({
        case: name,
        pageCount: smokeJob.pageCount,
        pageSetup: smokeJob.pageSetup,
        pdfPages: smokePdf.pageCount,
      });
    }

    const dialogs = await h.app.evaluate(() => globalThis.__nfDialogCalls ?? []);
    assert.deepEqual(dialogs, [], 'the gate export opened no native dialog');
  });

  it('prints the app placeholder when a dimensioned asset is deleted after open (S2-2)', async () => {
    const env = ui.isolated('m4c3-deleted-asset');
    await launch('m4c3-deleted-asset');
    const { document, assetFiles, forestId } = await m4c3DimensionedImageDocument();
    const packagePath = await openPackage(env, 'M4c3 deleted asset', document, assetFiles);
    await page.waitForFunction(
      () => {
        const image = document.querySelector(
          '.nf-editor[data-active="true"] [data-block-card="figure"] img.nf-image-el',
        );
        return image !== null && image.complete && image.naturalWidth > 0;
      },
      undefined,
      { timeout: 20000 },
    );
    const assetPath = resolve(packagePath, 'assets', forestId);
    await unlink(assetPath);
    const outputPath = resolve(outputRoot, 'deleted-dimensioned-asset.pdf');
    const job = await exportPdf({ packagePath, outputPath });
    assert.equal(job.status, 'done', job.error?.message ?? 'the export still completes');
    const failed = job.warnings.find((warning) => warning.code === 'failed-asset');
    assert.ok(failed !== undefined, 'the deleted dimensioned asset is a job warning');
    assert.ok(failed.message.includes(forestId), 'the warning names the failed asset');
    const pdf = await inspect(outputPath);
    assertPageSizes(pdf, job);
    assert.ok(
      textContains(pdf.text, 'Missing image: Forest plot'),
      'the app placeholder text is printed',
    );
    assert.equal(
      pdf.pages.reduce((total, item) => total + item.imageCount, 0),
      0,
      'no broken-image XObject is printed',
    );
    record({
      case: 'deleted dimensioned asset',
      warnings: job.warnings,
      imageCount: pdf.pages.reduce((total, item) => total + item.imageCount, 0),
    });

    // Failure matrix: an export for a package that is not open is typed.
    const notOpen = await exportPdf({
      packagePath: resolve(env.NOTEFOREST_LIBRARY, 'not-open'),
      outputPath: resolve(outputRoot, 'not-open.pdf'),
    });
    assert.equal(notOpen.status, 'failed');
    assert.equal(notOpen.error.code, 'document-not-open');
    assert.ok(!(await readdir(outputRoot)).includes('not-open.pdf'));
    record({ case: 'document not open', error: notOpen.error });
  });

  it('measures a 300-block export against the performance budget', async () => {
    const env = ui.isolated('m4c3-scale-300');
    await launch('m4c3-scale-300');
    const document = await m4c3Scale300Document();
    const packagePath = await openPackage(env, 'M4c3 scale 300', document);
    await setPageSettings(packagePath, { setup: A4_PORTRAIT });
    const outputPath = resolve(outputRoot, 'scale-300-a4.pdf');
    const startedAt = Date.now();
    const job = await exportPdf({ packagePath, outputPath });
    const wallMs = Date.now() - startedAt;
    assert.equal(job.status, 'done', job.error?.message ?? '300-block export succeeds');
    const pdf = await inspect(outputPath);
    assertPageSizes(pdf, job);
    assert.ok(job.pageCount > 0);
    assert.ok(wallMs < 30000, `300-block export wall ${wallMs} ms is under the 30 s ceiling`);
    record({
      case: '300 blocks',
      pageCount: job.pageCount,
      wallMs,
      measureMs: job.timings.measureMs,
      settleMs: job.timings.settleMs,
      pdfBytes: (await stat(outputPath)).size,
      targetMs: 10000,
    });
  });
});
