#!/usr/bin/env node
/**
 * Spike 1 gate harness. It launches the real Electron app, drives the fixture
 * suite through the renderer, exports PDFs through webContents.printToPDF,
 * and verifies the PDFs with pdfjs-dist. It writes artifacts and a JSON report.
 */
import { _electron as electron } from 'playwright';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  readdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { inspectPdfFile, textContains } from './lib/pdf.mjs';
import {
  checkAnchorAlignment,
  checkChapterStarts,
  checkContinuations,
  checkGeometry,
  checkImages,
  checkNoBlankPages,
  checkOverlapsAndGap,
  checkPageCount,
  checkPageSize,
  checkSegmentAtomicity,
  checkTablesCrossPages,
  checkTexts,
  checkVectorContent,
} from './lib/verify.mjs';

const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, 'artifacts/spike-01');
const rasterDir = resolve(outDir, 'rasters');
await mkdir(outDir, { recursive: true });
await mkdir(rasterDir, { recursive: true });

const baseEnv = { ...process.env };
delete baseEnv.ELECTRON_RUN_AS_NODE;
const appEnv = {
  ...baseEnv,
  NOTEFOREST_E2E: '1',
  NOTEFOREST_FIXTURES: resolve(root, 'fixtures'),
  NOTEFOREST_OUTPUT_DIR: outDir,
};

const results = {
  generatedAt: new Date().toISOString(),
  versions: {},
  fixtures: {},
  gates: {},
  logs: [],
  artifacts: {},
};

function recordGate(id, name, pass, details, evidence = []) {
  results.gates[id] = { id, name, pass, details, evidence };
}

function log(line) {
  results.logs.push(line);
  console.log(line);
}

async function launchApp(extraEnv = {}) {
  const app = await electron.launch({
    args: ['apps/desktop'],
    cwd: root,
    env: { ...appEnv, ...extraEnv },
  });
  const page = await app.firstWindow();
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      results.logs.push(`[renderer ${message.type()}] ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    results.logs.push(`[renderer pageerror] ${error.stack ?? error.message}`);
  });
  return { app, page };
}

async function loadFixture(page, file) {
  await page.evaluate((f) => window.__noteforest.loadFixture(f), file);
  await page.waitForFunction(
    (f) => window.__noteforest && window.__noteforest.getState().fixtureFile === f,
    file,
    { timeout: 240000 },
  );
  await page.waitForTimeout(100);
  return page.evaluate(() => window.__noteforest.getState());
}

async function setView(page, view) {
  await page.evaluate((next) => window.__noteforest.setView(next), view);
  if (view === 'page') {
    await page.waitForSelector('[data-page-number="1"]', { timeout: 30000 });
  } else {
    await page.waitForSelector('[data-reader-chapter]', { timeout: 30000 });
  }
  await page.waitForTimeout(120);
}

async function exportPdf(page) {
  return page.evaluate(() => window.__noteforest.exportPdf());
}

async function fixtureDocument(file) {
  return JSON.parse(await readFile(resolve(root, 'fixtures', file), 'utf8'));
}

async function pageScreenshot(page, pageNumber, path) {
  await hideChrome(page);
  const locator = page.locator(`[data-page-number="${pageNumber}"]`);
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(80);
  await locator.screenshot({ path });
  results.artifacts[path] = path;
}

async function viewportScreenshot(page, path) {
  await page.screenshot({ path });
  results.artifacts[path] = path;
}

async function hideChrome(page) {
  await page.evaluate(() => {
    for (const element of document.querySelectorAll('.toolbar, .defect-list, .banner')) {
      element.style.display = 'none';
    }
  });
}

async function showChrome(page) {
  await page.evaluate(() => {
    for (const element of document.querySelectorAll('.toolbar, .defect-list, .banner')) {
      element.style.display = '';
    }
  });
}

async function viewportAtPage(page, pageNumber, path) {
  await hideChrome(page);
  await page.evaluate((number) => {
    const scroller = document.querySelector('.page-scroll');
    const target = document.querySelector(`[data-page-number="${number}"]`);
    if (scroller && target) {
      const stage = target.parentElement;
      const offset = target.offsetTop + (stage?.offsetTop ?? 0);
      scroller.scrollTop = Math.max(0, offset - 48);
    }
  }, pageNumber);
  await page.waitForTimeout(120);
  await page.screenshot({ path });
  results.artifacts[path] = path;
}

async function elementScreenshot(page, selector, path) {
  await hideChrome(page);
  const locator = page.locator(selector).first();
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(80);
  await locator.screenshot({ path });
  results.artifacts[path] = path;
}

function raster(pdfPath, prefix, pages = '1') {
  execFileSync(
    process.execPath,
    [resolve(root, 'scripts/raster-pdf.mjs'), pdfPath, prefix, '150', pages],
    { stdio: 'pipe' },
  );
}

function hashGeometry(state) {
  const payload = {
    pages: state.pages.map((page) => [page.pageNumber, page.chapterId, page.yStart, page.yEnd]),
    blocks: state.blocks.map((block) => [block.blockId, block.x, block.y, block.width, block.height]),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function verifyExport(state, document, pdfPath) {
  return inspectPdfFile(pdfPath).then((pdf) => {
    const pageCount = checkPageCount(state, pdf);
    const pageSize = checkPageSize(document, pdf);
    const texts = checkTexts(document, pdf);
    const continuations = checkContinuations(state, pdf);
    const segmentAtomicity = checkSegmentAtomicity(state);
    const blankPages = checkNoBlankPages(state);
    const chapterStarts = checkChapterStarts(state, document);
    const images = checkImages(document, state, pdf);
    const vectors = checkVectorContent(pdf);
    const tables = checkTablesCrossPages(document, state);
    return {
      pdfPageCount: pdf.pageCount,
      pdfBytes: null,
      text: pdf.text,
      pageSizeMm: pdf.pages[0] ? [pdf.pages[0].widthMm, pdf.pages[0].heightMm] : null,
      imagePages: pdf.pages.filter((page) => page.imageCount > 0).map((page) => page.pageNumber),
      totalVectorPaths: vectors.totalPaths,
      checks: { pageCount, pageSize, texts, continuations, segmentAtomicity, blankPages, chapterStarts, images, vectors, tables },
    };
  });
}

async function main() {
  const { app, page } = await launchApp();
  try {
    await page.waitForFunction(() => Boolean(window.__noteforest), null, { timeout: 120000 });
    results.versions = await page.evaluate(() => window.noteforest.getSystemInfo());
    results.versions.devicePixelRatio = await page.evaluate(() => window.devicePixelRatio);
    log(`Versions ${JSON.stringify(results.versions)}`);

    // --- G1: F1 loads and renders, export from the app ----------------------
    const f1Doc = await fixtureDocument('golden-eigenvalues.json');
    const f1 = await loadFixture(page, 'golden-eigenvalues.json');
    results.fixtures['golden-eigenvalues.json'] = {
      state: f1,
      geometryHash: hashGeometry(f1),
    };
    await setView(page, 'reader');
    await viewportScreenshot(page, resolve(outDir, 'F1-reader.png'));
    await hideChrome(page);
    await elementScreenshot(page, '[data-reader-chapter]', resolve(outDir, 'F1-reader-chapter.png'));
    await setView(page, 'page');
    await pageScreenshot(page, 1, resolve(outDir, 'F1-page-01.png'));
    await pageScreenshot(page, 2, resolve(outDir, 'F1-page-02-continuation.png'));
    const f1Geometry = await page.evaluate(() => window.__noteforest.getPageViewGeometry());
    const f1Export = await exportPdf(page);
    let f1Pdf = null;
    if (f1Export.ok) {
      f1Pdf = await verifyExport(f1, f1Doc, f1Export.path);
      f1Pdf.pdfBytes = (await stat(f1Export.path)).size;
      f1Pdf.geometry = checkGeometry(f1Geometry, await inspectPdfFile(f1Export.path));
      raster(f1Export.path, resolve(rasterDir, 'F1'), '1,2,3');
    }
    results.fixtures['golden-eigenvalues.json'].export = f1Export;
    results.fixtures['golden-eigenvalues.json'].pdf = f1Pdf;

    const f1Anchors = checkAnchorAlignment(f1);
    const f1Gaps = checkOverlapsAndGap(f1);
    const f1HintPage = f1.pages.find((p) => p.yStart === f1.blocks.find((b) => b.blockId === 'b4')?.y);
    const f1Order = f1.blocks.map((b) => b.blockId).join(',');
    const f1Continuations = f1.pages.reduce(
      (sum, pageState) => sum + pageState.continuationOut.length + pageState.continuationIn.length,
      0,
    );
    recordGate(
      'G1',
      'Build and run',
      Boolean(f1 && f1Export.ok && f1.defects.length === 0 && !results.logs.some((line) => line.includes('pageerror'))),
      {
        fixture: f1.fixtureFile,
        blocks: f1.blockCount,
        pages: f1.pageCount,
        exportFromApp: f1Export.ok,
        rendererErrors: results.logs.filter((line) => line.includes('pageerror')).length,
      },
      [resolve(outDir, 'F1-reader.png'), resolve(outDir, 'F1-page-01.png')],
    );
    recordGate(
      'G2',
      'Adaptive layout',
      f1Gaps.pass && f1Anchors.pass && f1HintPage !== undefined,
      {
        f1: { gaps: f1Gaps, anchors: f1Anchors, order: f1Order, continuationMarkers: f1Continuations },
      },
      [resolve(outDir, 'F1-reader-chapter.png')],
    );
    recordGate(
      'G3',
      'Pagination',
      f1Pdf?.checks.segmentAtomicity.pass && f1Continuations > 0 && f1HintPage !== undefined,
      {
        f1: {
          continuations: f1Continuations,
          segmentAtomicity: f1Pdf?.checks.segmentAtomicity,
          manualHintPage: f1HintPage?.pageNumber ?? null,
        },
      },
      [resolve(outDir, 'F1-page-02-continuation.png')],
    );
    recordGate(
      'G4-F1',
      'PDF fidelity — F1',
      Boolean(
        f1Pdf &&
          f1Pdf.checks.pageCount.pass &&
          f1Pdf.checks.pageSize.pass &&
          f1Pdf.checks.texts.pass &&
          f1Pdf.checks.images.pass &&
          f1Pdf.checks.vectors.pass &&
          f1Pdf.geometry.pass,
      ),
      {
        f1: {
          pageCount: f1Pdf?.checks.pageCount,
          pageSize: f1Pdf?.checks.pageSize,
          texts: f1Pdf?.checks.texts,
          images: f1Pdf?.checks.images,
          vectors: f1Pdf?.checks.vectors,
          geometry: f1Pdf?.geometry,
          bytes: f1Pdf?.pdfBytes,
        },
      },
      [f1Export.path, resolve(rasterDir, 'F1-001.png')],
    );

    // --- Landscape export ---------------------------------------------------
    const landscapeDoc = await fixtureDocument('landscape-golden.json');
    const landscape = await loadFixture(page, 'landscape-golden.json');
    results.fixtures['landscape-golden.json'] = { state: landscape };
    await setView(page, 'page');
    const landscapeGeometry = await page.evaluate(() => window.__noteforest.getPageViewGeometry());
    const landscapeExport = await exportPdf(page);
    let landscapePdf = null;
    if (landscapeExport.ok) {
      landscapePdf = await verifyExport(landscape, landscapeDoc, landscapeExport.path);
      landscapePdf.pdfBytes = (await stat(landscapeExport.path)).size;
      landscapePdf.geometry = checkGeometry(landscapeGeometry, await inspectPdfFile(landscapeExport.path));
      raster(landscapeExport.path, resolve(rasterDir, 'F1-landscape'), '1');
    }
    results.fixtures['landscape-golden.json'].export = landscapeExport;
    results.fixtures['landscape-golden.json'].pdf = landscapePdf;
    recordGate(
      'G4-landscape',
      'PDF landscape orientation',
      Boolean(
        landscapeExport.ok &&
          landscapePdf?.checks.pageSize.pass &&
          landscapePdf?.checks.texts.pass &&
          landscapePdf?.geometry.pass &&
          Math.abs(landscapePdf.pageSizeMm[0] - 297) < 1.5 &&
          Math.abs(landscapePdf.pageSizeMm[1] - 210) < 1.5,
      ),
      {
        expected: '297 × 210 mm',
        actual: landscapePdf?.pageSizeMm,
        pageCount: landscapePdf?.pdfPageCount,
        pageSize: landscapePdf?.checks.pageSize,
        geometry: landscapePdf?.geometry,
      },
      [landscapeExport.path],
    );

    // --- F2: 50+ page PDF gate ---------------------------------------------
    const f2Doc = await fixtureDocument('long-50-pages.json');
    const f2 = await loadFixture(page, 'long-50-pages.json');
    results.fixtures['long-50-pages.json'] = { state: f2, geometryHash: hashGeometry(f2) };
    await setView(page, 'page');
    await pageScreenshot(page, 1, resolve(outDir, 'F2-page-01.png'));
    const f2ContinuationPage = f2.pages.find((p) => p.continuationIn.length > 0)?.pageNumber ?? 3;
    await pageScreenshot(page, f2ContinuationPage, resolve(outDir, `F2-page-${String(f2ContinuationPage).padStart(2, '0')}-continuation.png`));
    const tableBlock = f2.blocks.find((block) => block.segments.some((segment) => segment.kind === 'table-row'));
    const tablePage = tableBlock
      ? f2.pages.find((p) => p.fragments.some((fragment) => fragment.blockId === tableBlock.blockId))?.pageNumber
      : null;
    if (tablePage) await pageScreenshot(page, tablePage, resolve(outDir, `F2-page-${String(tablePage).padStart(2, '0')}-table.png`));
    const f2Geometry = await page.evaluate(() => window.__noteforest.getPageViewGeometry());
    const f2Export = await exportPdf(page);
    let f2Pdf = null;
    if (f2Export.ok) {
      f2Pdf = await verifyExport(f2, f2Doc, f2Export.path);
      f2Pdf.pdfBytes = (await stat(f2Export.path)).size;
      f2Pdf.geometry = checkGeometry(f2Geometry, await inspectPdfFile(f2Export.path));
      raster(f2Export.path, resolve(rasterDir, 'F2'), `${f2ContinuationPage},${tablePage ?? 1}`);
    }
    results.fixtures['long-50-pages.json'].export = f2Export;
    results.fixtures['long-50-pages.json'].pdf = f2Pdf;
    const f2CodeBlock = f2.blocks.find((block) => block.segments.filter((s) => s.kind === 'code-line').length >= 50);
    const f2CodePages = f2CodeBlock
      ? f2.pages.filter((p) => p.fragments.some((fragment) => fragment.blockId === f2CodeBlock.blockId)).length
      : 0;
    const f2TablePages = tableBlock
      ? f2.pages.filter((p) => p.fragments.some((fragment) => fragment.blockId === tableBlock.blockId)).length
      : 0;
    recordGate(
      'G3-F2',
      'F2 50+ page gate',
      Boolean(
        f2.pageCount >= 50 &&
          f2Export.ok &&
          f2Pdf?.checks.pageCount.pass &&
          f2Pdf?.checks.segmentAtomicity.pass &&
          f2Pdf?.checks.continuations.pass &&
          f2Pdf?.checks.texts.pass &&
          f2Pdf?.checks.chapterStarts.pass &&
          f2Pdf?.checks.images.pass &&
          f2CodePages >= 2 &&
          f2TablePages >= 2 &&
          Boolean(f2Pdf?.geometry.pass),
      ),
      {
        pages: f2.pageCount,
        codeBlockPages: f2CodePages,
        tablePages: f2TablePages,
        pageCount: f2Pdf?.checks.pageCount,
        pageSize: f2Pdf?.checks.pageSize,
        texts: f2Pdf?.checks.texts,
        continuations: f2Pdf?.checks.continuations,
        segmentAtomicity: f2Pdf?.checks.segmentAtomicity,
        chapterStarts: f2Pdf?.checks.chapterStarts,
        images: f2Pdf?.checks.images,
        vectors: f2Pdf?.checks.vectors,
        tables: f2Pdf?.checks.tables,
        geometry: f2Pdf?.geometry,
        exportMs: f2Export.durationMs,
        bytes: f2Pdf?.pdfBytes,
      },
      [f2Export.path, resolve(outDir, 'F2-page-01.png')],
    );

    recordGate(
      'G4',
      'PDF fidelity — F1 and F2',
      Boolean(
        f1Pdf &&
          f1Pdf.checks.pageCount.pass &&
          f1Pdf.checks.pageSize.pass &&
          f1Pdf.checks.texts.pass &&
          f1Pdf.checks.images.pass &&
          f1Pdf.checks.vectors.pass &&
          f1Pdf.geometry.pass &&
          f2Pdf &&
          f2Pdf.checks.pageCount.pass &&
          f2Pdf.checks.pageSize.pass &&
          f2Pdf.checks.texts.pass &&
          f2Pdf.checks.continuations.pass &&
          f2Pdf.checks.segmentAtomicity.pass &&
          f2Pdf.checks.chapterStarts.pass &&
          f2Pdf.checks.images.pass &&
          f2Pdf.checks.vectors.pass &&
          f2Pdf.geometry.pass,
      ),
      {
        f1: {
          pageCount: f1Pdf?.checks.pageCount,
          pageSize: f1Pdf?.checks.pageSize,
          texts: f1Pdf?.checks.texts,
          vectors: f1Pdf?.checks.vectors,
          geometry: f1Pdf?.geometry,
          bytes: f1Pdf?.pdfBytes,
        },
        f2: {
          pageCount: f2Pdf?.checks.pageCount,
          pageSize: f2Pdf?.checks.pageSize,
          texts: f2Pdf?.checks.texts,
          continuations: f2Pdf?.checks.continuations,
          segmentAtomicity: f2Pdf?.checks.segmentAtomicity,
          chapterStarts: f2Pdf?.checks.chapterStarts,
          images: f2Pdf?.checks.images,
          vectors: f2Pdf?.checks.vectors,
          geometry: f2Pdf?.geometry,
          bytes: f2Pdf?.pdfBytes,
        },
      },
      [f1Export.path, f2Export.path, resolve(rasterDir, 'F1-001.png'), resolve(rasterDir, `F2-${String(f2ContinuationPage).padStart(3, '0')}.png`)],
    );

    // --- F3: adaptive fan ---------------------------------------------------
    const f3Doc = await fixtureDocument('wide-fan.json');
    const f3 = await loadFixture(page, 'wide-fan.json');
    await setView(page, 'reader');
    await elementScreenshot(page, '[data-reader-chapter]', resolve(outDir, 'F3-reader-fan.png'));
    const f3Gaps = checkOverlapsAndGap(f3);
    const parent = f3.blocks.find((block) => block.blockId === 'f3-parent');
    const directChildren = f3.blocks.filter((block) => block.parentBlockId === 'f3-parent');
    const rightPlaced = parent
      ? directChildren.filter((child) => child.x >= parent.x + parent.width + 20).length
      : 0;
    const wrapped = parent
      ? directChildren.filter((child) => Math.abs(child.x - (parent.x + 18)) <= 1.5).length
      : 0;
    const uniqueWidths = new Set(f3.blocks.map((block) => Math.round(block.width))).size;
    const f3Export = await exportPdf(page);
    const f3Pdf = f3Export.ok ? await verifyExport(f3, f3Doc, f3Export.path) : null;
    if (f3Pdf) f3Pdf.pdfBytes = (await stat(f3Export.path)).size;
    results.fixtures['wide-fan.json'] = { state: f3, export: f3Export, pdf: f3Pdf };
    recordGate(
      'G2-F3',
      'Wide fan: right and wrap-below placement',
      f3Gaps.pass && rightPlaced > 0 && wrapped > 0 && uniqueWidths >= 3 && Boolean(f3Pdf?.checks.pageCount.pass) && Boolean(f3Pdf?.checks.texts.pass),
      { gaps: f3Gaps, rightPlaced, wrapped, uniqueWidths, widths: f3.blocks.map((b) => Math.round(b.width)) },
      [resolve(outDir, 'F3-reader-fan.png')],
    );

    // --- F4: deep chain and nested callouts --------------------------------
    const f4Doc = await fixtureDocument('deep-chain.json');
    const f4 = await loadFixture(page, 'deep-chain.json');
    await setView(page, 'reader');
    await elementScreenshot(page, '[data-reader-chapter]', resolve(outDir, 'F4-reader-deep-chain.png'));
    const f4Gaps = checkOverlapsAndGap(f4);
    const f4Anchors = checkAnchorAlignment(f4);
    const maxDepth = Math.max(...f4.blocks.map((block) => block.depth));
    const f4Export = await exportPdf(page);
    const f4Pdf = f4Export.ok ? await verifyExport(f4, f4Doc, f4Export.path) : null;
    if (f4Pdf) f4Pdf.pdfBytes = (await stat(f4Export.path)).size;
    results.fixtures['deep-chain.json'] = { state: f4, export: f4Export, pdf: f4Pdf };
    recordGate(
      'G2-F4',
      'Deep chain and nested callouts',
      f4Gaps.pass && f4Anchors.pass && maxDepth >= 4 && f4Pdf?.checks.continuations.checked > 0,
      {
        gaps: f4Gaps,
        anchors: f4Anchors,
        maxDepth,
        pages: f4.pageCount,
        continuations: f4Pdf?.checks.continuations.checked,
        exportPageCount: f4Pdf?.checks.pageCount,
      },
      [resolve(outDir, 'F4-reader-deep-chain.png')],
    );

    // --- F5: shared child and reference invariance -------------------------
    const f5Doc = await fixtureDocument('shared-child.json');
    const f5 = await loadFixture(page, 'shared-child.json');
    const f5Reference = await page.evaluate(() => window.__noteforest.referenceProbe());
    const f5BlockIds = f5.blocks.map((block) => block.blockId);
    const uniqueBlockIds = new Set(f5BlockIds).size === f5BlockIds.length;
    const f5Export = await exportPdf(page);
    const f5Pdf = f5Export.ok ? await verifyExport(f5, f5Doc, f5Export.path) : null;
    if (f5Pdf) f5Pdf.pdfBytes = (await stat(f5Export.path)).size;
    results.fixtures['shared-child.json'] = { state: f5, export: f5Export, pdf: f5Pdf, referenceProbe: f5Reference };
    recordGate(
      'G2-F5',
      'Shared child and reference edges',
      uniqueBlockIds &&
        f5Reference.positionsIdentical &&
        f5Reference.pageBreaksIdentical &&
        f5.blocks.filter((block) => block.blockId === 'f5-b2').length === 1 &&
        Boolean(f5Pdf?.checks.pageCount.pass) &&
        Boolean(f5Pdf?.checks.texts.pass),
      { uniqueBlockIds, referenceProbe: f5Reference, blockCount: f5.blockCount },
      [f5Export.path],
    );

    // --- F6: table pagination and too-tall row -----------------------------
    const f6Doc = await fixtureDocument('tables.json');
    const f6 = await loadFixture(page, 'tables.json');
    await setView(page, 'page');
    await showChrome(page);
    await page.evaluate(() => { const scroller = document.querySelector('.page-scroll'); if (scroller) scroller.scrollTop = 0; });
    await viewportScreenshot(page, resolve(outDir, 'F6-defects-chrome.png'));
    const giantPages = f6.pages.filter((p) => p.fragments.some((fragment) => fragment.blockId === 'f6-giant')).map((p) => p.pageNumber);
    const giantPage = giantPages[giantPages.length - 1];
    if (giantPage) await viewportAtPage(page, giantPage, resolve(outDir, `F6-page-${String(giantPage).padStart(2, '0')}-too-tall-row.png`));
    const f6TooTall = f6.defects.filter((defect) => defect.code === 'too-tall-row');
    const f6Tables = checkTablesCrossPages(f6Doc, f6);
    const f6Export = await exportPdf(page);
    results.fixtures['tables.json'] = { state: f6, export: f6Export, tables: f6Tables };
    recordGate(
      'G3-F6',
      'Table row atomicity and too-tall row defect',
      f6TooTall.length > 0 &&
        f6TooTall.every((defect) => defect.blocksExport) &&
        !f6Export.ok &&
        f6Tables.info.some((table) => table.rows > 20 && table.pages.length >= 2),
      { tooTall: f6TooTall, tables: f6Tables, export: f6Export, pageCount: f6.pageCount },
      giantPage ? [resolve(outDir, `F6-page-${String(giantPage).padStart(2, '0')}-too-tall-row.png`)] : [],
    );

    // --- F7: scale, performance, stability ---------------------------------
    const f7Doc = await fixtureDocument('scale-300.json');
    const f7 = await loadFixture(page, 'scale-300.json');
    results.fixtures['scale-300.json'] = { state: f7, geometryHash: hashGeometry(f7) };
    const f7Gaps = checkOverlapsAndGap(f7);
    const f7Stability = await page.evaluate(() => window.__noteforest.stabilityProbe());
    const f7Reference = await page.evaluate(() => window.__noteforest.referenceProbe());
    await setView(page, 'page');
    await pageScreenshot(page, 1, resolve(outDir, 'F7-page-01.png'));
    const f7Geometry = await page.evaluate(() => window.__noteforest.getPageViewGeometry());
    const f7Scroll = await page.evaluate(async () => {
      const scroller = document.querySelector('.page-scroll');
      if (!scroller) return null;
      const frames = [];
      let previous = performance.now();
      let running = true;
      const tick = (time) => {
        frames.push(time - previous);
        previous = time;
        if (running) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      for (let index = 0; index < 90; index += 1) {
        scroller.scrollTop += 24;
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      running = false;
      const sorted = [...frames].sort((a, b) => a - b);
      return {
        frames: frames.length,
        averageMs: frames.reduce((sum, value) => sum + value, 0) / Math.max(1, frames.length),
        p95Ms: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0,
      };
    });
    const f7Export = await exportPdf(page);
    const f7Pdf = f7Export.ok ? await verifyExport(f7, f7Doc, f7Export.path) : null;
    if (f7Pdf) {
      f7Pdf.pdfBytes = (await stat(f7Export.path)).size;
      f7Pdf.geometry = checkGeometry(f7Geometry, await inspectPdfFile(f7Export.path));
    }
    results.fixtures['scale-300.json'].export = f7Export;
    results.fixtures['scale-300.json'].pdf = f7Pdf;
    results.fixtures['scale-300.json'].stability = f7Stability;
    results.fixtures['scale-300.json'].referenceProbe = f7Reference;
    results.fixtures['scale-300.json'].scroll = f7Scroll;
    recordGate(
      'G2-F7',
      '300-block layout',
      f7.blockCount === 300 && f7Gaps.pass && f7.defects.length === 0 && Boolean(f7Pdf?.geometry.pass),
      { blocks: f7.blockCount, pages: f7.pageCount, gaps: f7Gaps, defects: f7.defects, geometry: f7Pdf?.geometry },
      [resolve(outDir, 'F7-page-01.png')],
    );
    recordGate(
      'G5',
      'Performance',
      f7.metrics.warmMedianMs < 50 &&
        f7.metrics.warmP95Ms < 50 &&
        f7Export.ok &&
        (f7Export.durationMs ?? 999999) < 10000 &&
        (f2Export.durationMs ?? 999999) < 10000 &&
        f7Scroll !== null &&
        f7Scroll.averageMs < 20 &&
        Boolean(f7Pdf?.checks.pageCount.pass) &&
        Boolean(f7Pdf?.checks.texts.pass) &&
        Boolean(f7Pdf?.checks.segmentAtomicity.pass) &&
        Boolean(f7Pdf?.geometry.pass),
      {
        f7: f7.metrics,
        f7ExportMs: f7Export.durationMs,
        f2ExportMs: f2Export.durationMs,
        f7Scroll,
        f2Layout: f2.metrics,
        f7Pdf: {
          pages: f7Pdf?.pdfPageCount,
          bytes: f7Pdf?.pdfBytes,
          pageCount: f7Pdf?.checks.pageCount,
          texts: f7Pdf?.checks.texts,
          segmentAtomicity: f7Pdf?.checks.segmentAtomicity,
          geometry: f7Pdf?.geometry,
        },
      },
      [f7Export.path],
    );
    recordGate(
      'G6',
      'Stability',
      f7Stability.add.keptRatio >= 0.95 &&
        f7Stability.add.unrelatedChaptersMoved === 0 &&
        f7Stability.delete.outsideAffectedMoved === 0 &&
        f7Stability.reference.positionsIdentical &&
        f7Stability.reference.pageBreaksIdentical &&
        f7Reference.positionsIdentical &&
        f7Reference.pageBreaksIdentical,
      { add: f7Stability.add, delete: f7Stability.delete, reference: f7Stability.reference, referenceProbe: f7Reference },
      [],
    );

    // --- F8: defects --------------------------------------------------------
    const f8 = await loadFixture(page, 'defects.json');
    await setView(page, 'page');
    const f8Page = f8.pages.find((p) => p.fragments.some((fragment) => fragment.blockId === 'f8-long'))?.pageNumber ?? 1;
    await showChrome(page);
    await page.evaluate(() => { const scroller = document.querySelector('.page-scroll'); if (scroller) scroller.scrollTop = 0; });
    await viewportScreenshot(page, resolve(outDir, 'F8-defects-chrome.png'));
    await viewportAtPage(page, f8Page, resolve(outDir, `F8-page-${String(f8Page).padStart(2, '0')}-defects.png`));
    const f8Codes = new Set(f8.defects.map((defect) => defect.code));
    const f8Export = await exportPdf(page);
    const f8File = resolve(outDir, 'spike-01-defects.pdf');
    results.fixtures['defects.json'] = { state: f8, export: f8Export };
    recordGate(
      'G7',
      'Defects and errors',
      ['content-too-wide', 'no-safe-break', 'missing-asset', 'impossible-hint'].every((code) => f8Codes.has(code)) &&
        !f8Export.ok &&
        !existsSync(f8File),
      { codes: [...f8Codes], defects: f8.defects, export: f8Export, partialFileExists: existsSync(f8File) },
      [resolve(outDir, `F8-page-${String(f8Page).padStart(2, '0')}-defects.png`)],
    );

    // --- F9: broken and ambiguous anchors ----------------------------------
    const f9Doc = await fixtureDocument('broken-anchor.json');
    const f9 = await loadFixture(page, 'broken-anchor.json');
    await setView(page, 'page');
    await pageScreenshot(page, 1, resolve(outDir, 'F9-page-01-anchor-warnings.png'));
    const f9Codes = new Set(f9.defects.map((defect) => defect.code));
    const f9Export = await exportPdf(page);
    const f9Pdf = f9Export.ok ? await verifyExport(f9, f9Doc, f9Export.path) : null;
    if (f9Pdf) {
      f9Pdf.pdfBytes = (await stat(f9Export.path)).size;
      f9Pdf.anchorMarkers = {
        broken: textContains(f9Pdf.text ?? '', 'anchor broken'),
        ambiguous: textContains(f9Pdf.text ?? '', 'anchor ambiguous'),
      };
    }
    results.fixtures['broken-anchor.json'] = { state: f9, export: f9Export, pdf: f9Pdf };
    recordGate(
      'G3-F9',
      'Broken and ambiguous anchors',
      f9Codes.has('broken-anchor') &&
        f9Codes.has('ambiguous-anchor') &&
        f9Export.ok &&
        f9.blocks.filter((block) => block.blockId === 'f9-b2').length === 1 &&
        f9.blocks.filter((block) => block.blockId === 'f9-b3').length === 1,
      { codes: [...f9Codes], pageCount: f9Pdf?.pdfPageCount, markers: f9Pdf?.anchorMarkers },
      [resolve(outDir, 'F9-page-01-anchor-warnings.png'), f9Export.path],
    );

    // --- Determinism: reload F2 and compare -------------------------------
    const f2Again = await loadFixture(page, 'long-50-pages.json');
    const f2AgainHash = hashGeometry(f2Again);
    const determinism = {
      pageCountSame: f2.pageCount === f2Again.pageCount,
      geometryHashSame: results.fixtures['long-50-pages.json'].geometryHash === f2AgainHash,
      firstHash: results.fixtures['long-50-pages.json'].geometryHash,
      secondHash: f2AgainHash,
    };
    results.fixtures['long-50-pages.json'].determinism = determinism;
    recordGate(
      'G6-determinism',
      'Deterministic reopening',
      determinism.pageCountSame && determinism.geometryHashSame,
      determinism,
      [],
    );

    // --- Memory snapshot ---------------------------------------------------
    try {
      const memory = await app.evaluate(() => process.memoryUsage());
      results.memory = {
        mainRssMB: Math.round((memory.rss / 1024 / 1024) * 10) / 10,
        mainHeapUsedMB: Math.round((memory.heapUsed / 1024 / 1024) * 10) / 10,
        rendererHeapMB: f7.metrics.heapMB,
      };
    } catch (error) {
      results.memory = { error: String(error) };
    }
  } finally {
    await app.close();
  }

  // --- Forced export failure: atomic write leaves no partial file ---------
  const target = resolve(outDir, 'spike-01-golden-eigenvalues.pdf');
  const beforeHash = existsSync(target)
    ? createHash('sha256').update(await readFile(target)).digest('hex')
    : null;
  const beforeMtime = existsSync(target) ? (await stat(target)).mtimeMs : null;
  const forced = await launchApp({ NOTEFOREST_FORCE_EXPORT_FAILURE: '1' });
  try {
    await forced.page.waitForFunction(() => Boolean(window.__noteforest), null, { timeout: 120000 });
    const forcedExport = await forced.page.evaluate(() => window.__noteforest.exportPdf());
    const afterHash = existsSync(target)
      ? createHash('sha256').update(await readFile(target)).digest('hex')
      : null;
    const afterMtime = existsSync(target) ? (await stat(target)).mtimeMs : null;
    const tempFiles = (await readdir(outDir)).filter((file) => file.includes('.tmp-'));
    results.forcedFailure = {
      export: forcedExport,
      targetBeforeHash: beforeHash,
      targetAfterHash: afterHash,
      targetBeforeMtime: beforeMtime,
      targetAfterMtime: afterMtime,
      tempFiles,
    };
    recordGate(
      'G4-atomic',
      'Atomic export failure',
      !forcedExport.ok &&
        beforeHash === afterHash &&
        beforeMtime === afterMtime &&
        tempFiles.length === 0,
      results.forcedFailure,
      [target],
    );
  } finally {
    await forced.app.close();
  }

  // --- G8 visual evidence: app screenshots and PDF rasters -----------------
  recordGate(
    'G8',
    'Visual evidence',
    existsSync(resolve(outDir, 'F1-reader.png')) &&
      existsSync(resolve(outDir, 'F1-page-02-continuation.png')) &&
      existsSync(resolve(rasterDir, 'F1-001.png')),
    {
      screenshots: Object.keys(results.artifacts).length,
      rasters: existsSync(rasterDir) ? (await readdir(rasterDir)).length : 0,
    },
    [resolve(outDir, 'F1-reader.png'), resolve(outDir, 'F1-page-02-continuation.png'), resolve(rasterDir, 'F1-001.png')],
  );

  results.summary = Object.fromEntries(
    Object.entries(results.gates).map(([id, gate]) => [id, gate.pass]),
  );
  await writeFile(resolve(outDir, 'gates.json'), `${JSON.stringify(results, null, 2)}\n`);
  console.log('\nGATE SUMMARY');
  for (const [id, gate] of Object.entries(results.gates)) {
    console.log(`${gate.pass ? 'PASS' : 'FAIL'}  ${id}  ${gate.name}`);
  }
  console.log(`\nWrote ${resolve(outDir, 'gates.json')}`);
}

main().catch(async (error) => {
  console.error(error);
  results.fatal = String(error?.stack ?? error);
  await writeFile(resolve(outDir, 'gates.json'), `${JSON.stringify(results, null, 2)}\n`);
  process.exitCode = 1;
});
