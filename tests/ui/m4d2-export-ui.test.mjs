import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifactsPath, waitUntil } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import {
  pageCalloutModesDocument,
  pageDocument,
  textBlock,
  writePagePackage,
} from '../support/page-fixtures.mjs';
import { m4c3GateDocument } from '../support/m4c3-fixtures.mjs';
import { inspectPdfFile, textContains } from '../../scripts/lib/pdf.mjs';

/**
 * M4d2 temporary export UI.
 *
 * File → Export PDF…, the command palette entry, and the Page toolbar button all
 * run one flow: native save dialog (guarded/overridden in E2E), explicit
 * replacement, `exportPdf` + job polling, progress/cancel, typed errors with
 * preflight block names, and the success path. No native OS dialog and no fixed
 * sleeps; every wait is a condition.
 */

const tempRoot = artifactsPath('m4d2-ui');
const outputRoot = artifactsPath('m4d2', 'export');
const screenshotDir = artifactsPath('m4d2');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
const evidence = [];
let page;

const A5_PORTRAIT = {
  size: 'A5',
  orientation: 'portrait',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
};

async function launch(name, overrides = {}) {
  page = await ui.launch({ ...ui.isolated(name), ...overrides });
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
  await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
  return packagePath;
}

/** Replace the guarded native save dialog with a deterministic path choice. */
async function mockSaveDialog(filePath) {
  await h.app.evaluate(({ dialog }, chosen) => {
    globalThis.__nfSaveDialogCalls = [];
    dialog.showSaveDialog = async (_window, options) => {
      globalThis.__nfSaveDialogCalls.push(structuredClone(options));
      return { canceled: false, filePath: chosen };
    };
  }, filePath);
}

async function saveDialogCalls() {
  return h.app.evaluate(() => globalThis.__nfSaveDialogCalls ?? []);
}

/** Calls recorded by the E2E dialog guard (never a real OS dialog). */
async function guardCalls() {
  return h.app.evaluate(() => globalThis.__nfDialogCalls ?? []);
}

async function invokeAppMenu(id) {
  await h.app.evaluate(
    ({ Menu, BrowserWindow }, menuId) => {
      const item = Menu.getApplicationMenu()?.getMenuItemById(menuId);
      if (item === null || item === undefined) {
        throw new Error(`missing menu item ${menuId}`);
      }
      item.click(item, BrowserWindow.getAllWindows()[0], undefined);
    },
    id,
  );
}

function paletteItem(label) {
  return page.locator('.nf-palette-item', { hasText: label }).first();
}

async function runPaletteCommand(label) {
  await page.keyboard.press('Meta+k');
  await page.waitForSelector('.nf-palette');
  const item = paletteItem(label);
  await item.waitFor({ state: 'visible' });
  await item.click();
  await page.waitForSelector('.nf-palette', { state: 'detached' });
}

async function exportState() {
  return page.evaluate(() => window.__noteforestTest.exportState());
}

async function exportHistory() {
  return page.evaluate(() => window.__noteforestTest.exportHistory());
}

async function waitExportStatus(status, timeout = 180000) {
  await page.waitForFunction(
    (expected) => window.__noteforestTest.exportState().status === expected,
    status,
    { timeout },
  );
  return exportState();
}

async function waitForPageRead() {
  await page.keyboard.press('Meta+3');
  await page.waitForFunction(
    () => {
      const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
      return (
        view !== null &&
        view.getAttribute('data-ready') === 'true' &&
        view.getAttribute('data-updating') !== 'true'
      );
    },
    undefined,
    { timeout: 20000 },
  );
}

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function assertNoPartials(dir) {
  const names = await readdir(dir).catch(() => []);
  assert.ok(
    names.every((name) => !name.endsWith('.partial')),
    `no temporary partial files in ${dir}`,
  );
}

function record(entry) {
  evidence.push({ at: new Date().toISOString(), ...entry });
}

describe('M4d2 export PDF UI', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await rm(outputRoot, { recursive: true, force: true });
    await rm(screenshotDir, { recursive: true, force: true });
    await mkdir(outputRoot, { recursive: true });
    await mkdir(screenshotDir, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    await assertNoPartials(outputRoot);
    await writeFile(
      resolve(outputRoot, 'export-ui-evidence.json'),
      JSON.stringify(evidence, null, 2),
      'utf8',
    );
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('exports from File → Export PDF… in Continuous without mounting the Page view', async () => {
    const env = ui.isolated('m4d2-menu');
    await launch('m4d2-menu');
    await openPackage(
      env,
      'Export menu',
      pageDocument({
        id: 'm4d2-menu',
        title: 'Export menu',
        chapterTitle: 'Export',
        blocks: [textBlock('intro', 'Intro', 'A printable paragraph from the menu path.')],
      }),
    );
    assert.equal(await page.locator('.nf-page-view').count(), 0, 'Page view is not mounted');
    const outputPath = resolve(outputRoot, 'menu.pdf');
    await mockSaveDialog(outputPath);
    await invokeAppMenu('menu-export-pdf');
    const state = await waitExportStatus('done');
    assert.equal(state.outputPath, outputPath);
    assert.equal(state.overwrite, false);
    assert.ok(state.pageCount >= 1, 'the job reports a page count');
    const calls = await saveDialogCalls();
    assert.equal(calls.length, 1, 'one save dialog for one export');
    assert.equal(calls[0].defaultPath, 'Export menu.pdf', 'the default filename is title.pdf');
    assert.deepEqual(await guardCalls(), [], 'the overridden dialog was the only dialog call');
    const history = await exportHistory();
    assert.ok(
      history.some((step) => step.status === 'running' && step.progress > 0),
      'progress is surfaced while the job runs',
    );
    assert.ok(history.some((step) => step.status === 'done'), 'the flow reaches done');
    const pdf = await inspectPdfFile(outputPath);
    assert.equal(pdf.pageCount, state.pageCount, 'PDF page count equals the job page count');
    assert.equal(pdf.pageCount, pdf.pages.length);
    assert.ok(textContains(pdf.text, 'Export menu'), 'the document title is in the PDF');
    assert.ok(textContains(pdf.text, 'printable paragraph'), 'the body text is in the PDF');
    assert.ok(
      Math.abs(pdf.pages[0].widthMm - state.pageWidthMm) <= 0.25,
      `PDF width ${pdf.pages[0].widthMm} mm matches the job geometry`,
    );
    assert.ok(
      Math.abs(pdf.pages[0].heightMm - state.pageHeightMm) <= 0.25,
      `PDF height ${pdf.pages[0].heightMm} mm matches the job geometry`,
    );
    await page.locator('[data-export-reveal]').waitFor({ state: 'visible' });
    await page.locator('[data-export-dismiss]').click();
    assert.equal((await exportState()).status, 'idle', 'Done dismisses the panel');
    record({
      case: 'menu',
      pageCount: state.pageCount,
      pages: pdf.pageCount,
      defaultPath: calls[0].defaultPath,
      history,
    });
  });

  it('exports from the Page toolbar button in Page Read', async () => {
    const env = ui.isolated('m4d2-page');
    await launch('m4d2-page', { NOTEFOREST_E2E_HIDDEN: '0' });
    await openPackage(
      env,
      'Toolbar export',
      pageCalloutModesDocument(),
    );
    await waitForPageRead();
    const view = await page.evaluate(() => {
      const state = window.__noteforestTest.state();
      return window.__noteforestTest.viewState()[state.activeTab];
    });
    assert.equal(view.layout, 'page');
    assert.equal(view.interactionMode, 'read', 'Page opens in Read');
    const outputPath = resolve(outputRoot, 'page-toolbar.pdf');
    await mockSaveDialog(outputPath);
    const button = page.locator('.nf-page-toolbar [data-page-export]');
    await button.waitFor({ state: 'visible' });
    await button.click();
    const state = await waitExportStatus('done');
    assert.equal(state.outputPath, outputPath);
    const calls = await saveDialogCalls();
    assert.equal(calls[0].defaultPath, 'Page callout modes.pdf');
    const pdf = await inspectPdfFile(outputPath);
    assert.equal(pdf.pageCount, state.pageCount);
    assert.ok(textContains(pdf.text, 'Page callout modes'));
    assert.ok(textContains(pdf.text, 'eigenvalue'), 'Page Read/PDF body text matches');
    assert.deepEqual(await guardCalls(), []);
    await page.locator('[data-export-status="done"]').waitFor({ state: 'visible' });
    await h.screenshot(resolve(screenshotDir, 'page-export-panel.png'));
    record({ case: 'page toolbar', pageCount: state.pageCount, pages: pdf.pageCount });
  });

  it('cancels the native save dialog safely through the palette entry', async () => {
    const env = ui.isolated('m4d2-dialog-cancel');
    await launch('m4d2-dialog-cancel');
    await openPackage(
      env,
      'Palette cancel',
      pageDocument({
        id: 'm4d2-dialog-cancel',
        title: 'Palette cancel',
        chapterTitle: 'Export',
        blocks: [textBlock('intro', 'Intro', 'A document whose save dialog is cancelled.')],
      }),
    );
    // No override: the E2E dialog guard cancels the native save dialog.
    await runPaletteCommand('Export PDF');
    const saveCalls = await waitUntil(
      async () => {
        const calls = (await guardCalls()).filter((call) => call.method === 'showSaveDialog');
        return calls.length > 0 ? calls : false;
      },
      'guarded save dialog',
      10000,
    );
    assert.equal(saveCalls.length, 1, 'the guard saw exactly one save dialog');
    assert.equal(saveCalls[0].options.defaultPath, 'Palette cancel.pdf');
    const state = await exportState();
    assert.equal(state.status, 'idle', 'a cancelled save dialog is not an error');
    assert.equal(state.jobId, null, 'no job starts');
    assert.equal(await page.locator('.nf-export-panel').count(), 0, 'no panel remains');
    const messages = (await guardCalls()).filter((call) => call.method !== 'showSaveDialog');
    assert.deepEqual(messages, [], 'no message box or other native dialog opened');
    record({
      case: 'save dialog cancel',
      defaultPath: saveCalls[0].options.defaultPath,
      status: state.status,
    });
  });

  it('surfaces a preflight-blocked document with the block name and no file', async () => {
    const env = ui.isolated('m4d2-blocked');
    await launch('m4d2-blocked');
    const packagePath = await openPackage(
      env,
      'Blocked export',
      pageDocument({
        id: 'm4d2-blocked',
        title: 'Blocked export',
        chapterTitle: 'Blocked',
        blocks: [textBlock('tall', 'Tall block', 'word '.repeat(4000))],
      }),
    );
    await page.evaluate(
      ({ path, value }) => window.__noteforestTest.setPageSettingsOverride(path, value),
      { path: packagePath, value: { setup: A5_PORTRAIT } },
    );
    const outputPath = resolve(outputRoot, 'blocked.pdf');
    await mockSaveDialog(outputPath);
    await invokeAppMenu('menu-export-pdf');
    const state = await waitExportStatus('failed');
    assert.equal(state.error.code, 'preflight-blocked');
    assert.ok(state.error.message.includes('Tall block'), state.error.message);
    assert.ok(
      state.error.details.some(
        (detail) => detail.kind === 'blocking-defect' && detail.blockTitle === 'Tall block',
      ),
      'the blocking defect names the affected block',
    );
    const panel = page.locator('[data-export-status="failed"]');
    await panel.waitFor({ state: 'visible' });
    const text = await panel.innerText();
    assert.match(text, /preflight-blocked/);
    assert.match(text, /Tall block/);
    assert.equal(await fileExists(outputPath), false, 'no PDF for a blocked document');
    await assertNoPartials(outputRoot);
    record({ case: 'preflight blocked', error: state.error });
  });

  it('cancels a running export from the panel without leaving a partial file', async () => {
    const env = ui.isolated('m4d2-cancel');
    await launch('m4d2-cancel');
    const { document, assetFiles } = await m4c3GateDocument();
    await openPackage(env, 'Cancel export', document, assetFiles);
    const cancelDir = resolve(outputRoot, 'cancel');
    await mkdir(cancelDir, { recursive: true });
    const outputPath = resolve(cancelDir, 'cancelled.pdf');
    await mockSaveDialog(outputPath);
    await invokeAppMenu('menu-export-pdf');
    await page.locator('[data-export-status="running"]').waitFor({ state: 'visible' });
    const before = await exportState();
    assert.ok(before.jobId !== null, 'the running job is tracked');
    await page.locator('[data-export-cancel]').click();
    await page.waitForFunction(
      () => window.__noteforestTest.exportState().status === 'idle',
      undefined,
      { timeout: 30000 },
    );
    assert.equal(await fileExists(outputPath), false, 'no output after cancellation');
    assert.deepEqual(await readdir(cancelDir), [], 'no partial file after cancellation');
    const history = await exportHistory();
    assert.ok(
      history.some((step) => step.status === 'idle'),
      'the cancelled job returns the surface to idle',
    );
    record({
      case: 'cancel while running',
      jobId: before.jobId,
      outputFiles: (await readdir(cancelDir)).length,
    });
  });

  it('asks before replacing an existing PDF and never clobbers implicitly', async () => {
    const env = ui.isolated('m4d2-overwrite');
    await launch('m4d2-overwrite');
    await openPackage(
      env,
      'Replace export',
      pageDocument({
        id: 'm4d2-overwrite',
        title: 'Replace export',
        chapterTitle: 'Export',
        blocks: [textBlock('intro', 'Intro', 'A document exported twice to one path.')],
      }),
    );
    const outputPath = resolve(outputRoot, 'replace.pdf');
    await mockSaveDialog(outputPath);
    await invokeAppMenu('menu-export-pdf');
    await waitExportStatus('done');
    assert.equal(await fileExists(outputPath), true);
    const firstHash = await sha256(outputPath);

    // Second run: the existing file triggers the explicit replacement prompt.
    await invokeAppMenu('menu-export-pdf');
    await page.locator('[data-export-status="confirm-overwrite"]').waitFor({ state: 'visible' });
    assert.equal((await exportState()).status, 'confirm-overwrite');
    await page.locator('[data-export-cancel-confirm]').click();
    assert.equal((await exportState()).status, 'idle');
    assert.equal(await sha256(outputPath), firstHash, 'cancel keeps the existing PDF byte-identical');

    // Third run: the palette action starts the same flow (menu commands are
    // deliberately deduped within 120 ms, so use the direct palette path).
    await runPaletteCommand('Export PDF');
    await page.locator('[data-export-replace]').click();
    const state = await waitExportStatus('done');
    assert.equal(state.overwrite, true, 'replacement is explicit');
    assert.equal(await fileExists(outputPath), true);
    assert.equal((await saveDialogCalls()).length, 3, 'each run uses the save dialog');
    record({ case: 'overwrite', explicit: state.overwrite, firstHash });
  });

  it('reports no active document without opening a save dialog', async () => {
    await launch('m4d2-no-document');
    assert.equal(await page.evaluate(() => window.__noteforestTest.state().activeTab), null);
    await invokeAppMenu('menu-export-pdf');
    await page
      .locator('[data-sonner-toast]', { hasText: 'Open a document before exporting a PDF.' })
      .first()
      .waitFor({ timeout: 5000 });
    assert.equal((await exportState()).status, 'idle');
    assert.deepEqual(await guardCalls(), [], 'no save dialog is opened');
    record({ case: 'no document' });
  });
});
