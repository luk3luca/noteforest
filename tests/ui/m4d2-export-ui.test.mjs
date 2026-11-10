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
 * Batch A Export sheet.
 *
 * File → Export PDF…, the command palette, the Page header, and Settings open
 * one sheet. There is no native save dialog: the folder picker is the only
 * native surface, the filename and overwrite decision live in the sheet, and
 * the job pipeline is the unchanged M4c2 print path. Warnings are never
 * truncated. No fixed sleeps; every wait is a condition.
 */

const tempRoot = artifactsPath('m4d2-ui');
const outputRoot = artifactsPath('m4d2', 'export');
const screenshotDir = artifactsPath('ui-batch-a');
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

/** Replace the guarded native folder picker with a deterministic choice. */
async function mockFolderDialog(folderPath) {
  await h.app.evaluate(({ dialog }, chosen) => {
    globalThis.__nfFolderDialogCalls = [];
    dialog.showOpenDialog = async (_window, options) => {
      globalThis.__nfFolderDialogCalls.push(structuredClone(options));
      return { canceled: false, filePaths: [chosen] };
    };
  }, folderPath);
}

async function folderDialogCalls() {
  return h.app.evaluate(() => globalThis.__nfFolderDialogCalls ?? []);
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

async function chooseFolder(folderPath) {
  await mockFolderDialog(folderPath);
  await page.locator('[data-export-choose-folder]').click();
  await page.waitForFunction(
    (expected) =>
      document.querySelector('[data-export-folder]')?.textContent?.trim() === expected,
    folderPath,
    { timeout: 10000 },
  );
}

async function openExportSheetFromMenu() {
  await invokeAppMenu('menu-export-pdf');
  await page.waitForSelector('[data-export-status="configure"]', { timeout: 10000 });
}

async function setFileName(baseName) {
  const input = page.locator('[data-export-filename]');
  await input.fill(baseName);
}

async function startExport() {
  await page.locator('[data-export-start]').click();
}

function record(entry) {
  evidence.push({ at: new Date().toISOString(), ...entry });
}

describe('Batch A export sheet', () => {
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

  it('configures, exports from Continuous, and never opens a native save dialog', async () => {
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
    const folder = resolve(outputRoot, 'menu');
    await mkdir(folder, { recursive: true });
    await mockFolderDialog(folder);
    await openExportSheetFromMenu();
    const initial = await exportState();
    assert.equal(initial.layout, 'continuous');
    assert.equal(initial.baseName, 'Export menu', 'the filename defaults to the sanitized title');
    assert.equal(await page.locator('[data-export-suffix]').innerText(), '.pdf');
    assert.match(
      await page.locator('[data-export-summary]').innerText(),
      /Page layout will be exported/,
    );
    await page.screenshot({ path: resolve(screenshotDir, 'export-configure.png') });

    await page.locator('[data-export-choose-folder]').click();
    await page.waitForFunction(
      (expected) =>
        document.querySelector('[data-export-folder]')?.textContent?.trim() === expected,
      folder,
      { timeout: 10000 },
    );
    // Sanitized and empty filename behavior.
    await setFileName('Notes / Lecture: 1');
    assert.match(
      await page.locator('[data-export-destination]').innerText(),
      /Notes Lecture 1\.pdf/,
    );
    await setFileName('   ');
    assert.match(await page.locator('[data-export-destination]').innerText(), /Untitled\.pdf/);
    await setFileName('Export menu');
    await page.locator('[data-export-add-date]').check();
    assert.match(
      await page.locator('[data-export-destination]').innerText(),
      /Export menu — \d{4}-\d{2}-\d{2}\.pdf/,
    );
    await page.locator('[data-export-add-date]').uncheck();

    const outputPath = resolve(folder, 'Export menu.pdf');
    await startExport();
    const state = await waitExportStatus('done');
    assert.equal(state.outputPath, outputPath);
    assert.equal(state.overwrite, false);
    assert.ok(state.pageCount >= 1, 'the job reports a page count');
    const folderCalls = await folderDialogCalls();
    assert.equal(folderCalls.length, 1, 'one folder picker for one export');
    assert.ok(
      folderCalls[0].properties.includes('openDirectory'),
      'the picker is directories-only',
    );
    assert.deepEqual(
      (await guardCalls()).filter((call) => call.method === 'showSaveDialog'),
      [],
      'no native save dialog was opened',
    );
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
    await page.screenshot({ path: resolve(screenshotDir, 'export-done.png') });
    await page.locator('[data-export-dismiss]').click();
    assert.equal((await exportState()).status, 'idle', 'Done dismisses the sheet');
    record({
      case: 'menu',
      pageCount: state.pageCount,
      pages: pdf.pageCount,
      history,
    });
  });

  it('exports from the Page header in Page Read', async () => {
    const env = ui.isolated('m4d2-page');
    await launch('m4d2-page', { NOTEFOREST_E2E_HIDDEN: '0' });
    await openPackage(env, 'Toolbar export', pageCalloutModesDocument());
    await waitForPageRead();
    const view = await page.evaluate(() => {
      const state = window.__noteforestTest.state();
      return window.__noteforestTest.viewState()[state.activeTab];
    });
    assert.equal(view.layout, 'page');
    assert.equal(view.interactionMode, 'read', 'Page opens in Read');
    const folder = resolve(outputRoot, 'page-toolbar');
    await mkdir(folder, { recursive: true });
    await mockFolderDialog(folder);
    const button = page.locator('.nf-canvas-header [data-page-export]');
    await button.waitFor({ state: 'visible' });
    await button.click();
    await page.waitForSelector('[data-export-status="configure"]');
    assert.match(
      await page.locator('[data-export-summary]').innerText(),
      /Page layout/,
    );
    await page.locator('[data-export-choose-folder]').click();
    await page.waitForFunction(
      (expected) =>
        document.querySelector('[data-export-folder]')?.textContent?.trim() === expected,
      folder,
      { timeout: 10000 },
    );
    await startExport();
    const state = await waitExportStatus('done');
    const outputPath = resolve(folder, 'Page callout modes.pdf');
    assert.equal(state.outputPath, outputPath);
    const pdf = await inspectPdfFile(outputPath);
    assert.equal(pdf.pageCount, state.pageCount);
    assert.ok(textContains(pdf.text, 'Page callout modes'));
    assert.ok(textContains(pdf.text, 'eigenvalue'), 'Page Read/PDF body text matches');
    assert.deepEqual(
      (await guardCalls()).filter((call) => call.method === 'showSaveDialog'),
      [],
    );
    await page.locator('[data-export-status="done"]').waitFor({ state: 'visible' });
    await page.screenshot({ path: resolve(screenshotDir, 'export-page-done.png') });
    record({ case: 'page header', pageCount: state.pageCount, pages: pdf.pageCount });
  });

  it('cancels the folder picker safely through the palette entry', async () => {
    const env = ui.isolated('m4d2-folder-cancel');
    await launch('m4d2-folder-cancel');
    await openPackage(
      env,
      'Palette cancel',
      pageDocument({
        id: 'm4d2-folder-cancel',
        title: 'Palette cancel',
        chapterTitle: 'Export',
        blocks: [textBlock('intro', 'Intro', 'A document whose folder picker is cancelled.')],
      }),
    );
    // No override: the E2E dialog guard cancels the native folder picker.
    await runPaletteCommand('Export PDF');
    await page.waitForSelector('[data-export-status="configure"]');
    await page.locator('[data-export-choose-folder]').click();
    const folderCalls = await waitUntil(
      async () => {
        const calls = (await guardCalls()).filter((call) => call.method === 'showOpenDialog');
        return calls.length === 0 ? false : calls;
      },
      'guarded folder picker',
      10000,
    );
    assert.equal(folderCalls.length, 1, 'the guard saw exactly one folder picker');
    assert.ok(folderCalls[0].options.properties.includes('openDirectory'));
    const state = await exportState();
    assert.equal(state.status, 'configure', 'a cancelled folder picker keeps the sheet');
    assert.equal(state.jobId, null, 'no job starts');
    assert.deepEqual(
      (await guardCalls()).filter((call) => call.method === 'showSaveDialog'),
      [],
      'no native save dialog opened',
    );
    await page.locator('[data-export-dismiss]').click();
    record({ case: 'folder picker cancel', status: state.status });
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
    const folder = resolve(outputRoot, 'blocked');
    await mkdir(folder, { recursive: true });
    await mockFolderDialog(folder);
    await openExportSheetFromMenu();
    await page.locator('[data-export-choose-folder]').click();
    await page.waitForFunction(
      (expected) =>
        document.querySelector('[data-export-folder]')?.textContent?.trim() === expected,
      folder,
      { timeout: 10000 },
    );
    await startExport();
    const state = await waitExportStatus('failed');
    assert.equal(state.error.code, 'preflight-blocked');
    assert.ok(state.error.message.includes('Tall block'), state.error.message);
    assert.ok(
      state.error.details.some(
        (detail) => detail.kind === 'blocking-defect' && detail.blockTitle === 'Tall block',
      ),
      'the blocking defect names the affected block',
    );
    const failed = page.locator('[data-export-status="failed"]');
    await failed.waitFor({ state: 'visible' });
    const text = await failed.innerText();
    assert.match(text, /preflight-blocked/);
    assert.match(text, /Tall block/);
    const outputPath = resolve(folder, 'Blocked export.pdf');
    assert.equal(await fileExists(outputPath), false, 'no PDF for a blocked document');
    await assertNoPartials(folder);
    await page.screenshot({ path: resolve(screenshotDir, 'export-failed.png') });
    // Retry returns to Configure with the same destination.
    await page.locator('[data-export-retry]').click();
    await page.waitForSelector('[data-export-status="configure"]');
    assert.equal((await exportState()).baseName, 'Blocked export');
    record({ case: 'preflight blocked', error: state.error });
  });

  it('cancels a running export from the sheet without leaving a partial file', async () => {
    const env = ui.isolated('m4d2-cancel');
    await launch('m4d2-cancel');
    const { document, assetFiles } = await m4c3GateDocument();
    await openPackage(env, 'Cancel export', document, assetFiles);
    const folder = resolve(outputRoot, 'cancel');
    await mkdir(folder, { recursive: true });
    await mockFolderDialog(folder);
    await openExportSheetFromMenu();
    await page.locator('[data-export-choose-folder]').click();
    await page.waitForFunction(
      (expected) =>
        document.querySelector('[data-export-folder]')?.textContent?.trim() === expected,
      folder,
      { timeout: 10000 },
    );
    await startExport();
    await page.waitForSelector('[data-export-status="running"]');
    const before = await exportState();
    assert.ok(before.jobId !== null, 'the running job is tracked');

    // Esc while running asks before cancelling; no native dialog.
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-export-cancel-prompt="true"]');
    await page.locator('[data-export-keep-exporting]').click();
    await page.waitForSelector('[data-export-cancel-prompt="true"]', { state: 'detached' });
    await page.locator('[data-export-cancel]').click();
    const cancelled = await waitExportStatus('cancelled', 30000);
    assert.equal(cancelled.jobId, null);
    assert.match(
      await page.locator('[data-export-status="cancelled"]').innerText(),
      /No file was written/,
    );
    assert.equal(
      await fileExists(resolve(folder, 'Cancel export.pdf')),
      false,
      'no output after cancellation',
    );
    assert.deepEqual(await readdir(folder), [], 'no partial file after cancellation');
    await page.locator('[data-export-retry]').click();
    await page.waitForSelector('[data-export-status="configure"]');
    record({
      case: 'cancel while running',
      jobId: before.jobId,
      outputFiles: (await readdir(folder)).length,
    });
  });

  it('asks once in-sheet before replacing an existing PDF and never clobbers implicitly', async () => {
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
    const folder = resolve(outputRoot, 'replace');
    await mkdir(folder, { recursive: true });
    await mockFolderDialog(folder);
    const outputPath = resolve(folder, 'Replace export.pdf');
    await openExportSheetFromMenu();
    await page.locator('[data-export-choose-folder]').click();
    await page.waitForFunction(
      (expected) =>
        document.querySelector('[data-export-folder]')?.textContent?.trim() === expected,
      folder,
      { timeout: 10000 },
    );
    await startExport();
    await waitExportStatus('done');
    assert.equal(await fileExists(outputPath), true);
    const firstHash = await sha256(outputPath);
    await page.locator('[data-export-dismiss]').click();

    // Second run: the existing file triggers the one in-sheet replacement.
    await openExportSheetFromMenu();
    await startExport();
    await page.waitForSelector('[data-export-status="confirm-overwrite"]');
    await page.screenshot({ path: resolve(screenshotDir, 'export-overwrite.png') });
    await page.locator('[data-export-cancel-confirm]').click();
    await page.waitForSelector('[data-export-status="configure"]');
    assert.equal(await sha256(outputPath), firstHash, 'cancel keeps the existing PDF byte-identical');

    // Third run: Replace PDF is explicit.
    await startExport();
    await page.waitForSelector('[data-export-status="confirm-overwrite"]');
    await page.locator('[data-export-replace]').click();
    const state = await waitExportStatus('done');
    assert.equal(state.overwrite, true, 'replacement is explicit');
    assert.equal(await fileExists(outputPath), true);
    assert.equal(
      (await guardCalls()).filter((call) => call.method === 'showSaveDialog').length,
      0,
      'replacement never uses a native save dialog',
    );
    await page.locator('[data-export-dismiss]').click();
    record({ case: 'overwrite', explicit: state.overwrite, firstHash });
  });

  it('renders every warning from the produced PDF grouped by source', async () => {
    const env = ui.isolated('m4d2-warnings');
    await launch('m4d2-warnings');
    const { document, assetFiles } = await m4c3GateDocument();
    await openPackage(env, 'Warning export', document, assetFiles);
    const folder = resolve(outputRoot, 'warnings');
    await mkdir(folder, { recursive: true });
    await mockFolderDialog(folder);
    await openExportSheetFromMenu();
    await page.locator('[data-export-choose-folder]').click();
    await page.waitForFunction(
      (expected) =>
        document.querySelector('[data-export-folder]')?.textContent?.trim() === expected,
      folder,
      { timeout: 10000 },
    );
    await startExport();
    const state = await waitExportStatus('done');
    assert.ok(state.warnings.length >= 2, `the export carries warnings (${state.warnings.length})`);
    const groups = page.locator('[data-export-warning-group]');
    const groupCount = await groups.count();
    assert.equal(
      groupCount,
      new Set(state.warnings.map((warning) => warning.kind)).size,
      'one group per warning source',
    );
    const rendered = await page.locator('[data-export-warning-group]').allInnerTexts();
    const text = rendered.join('\n');
    for (const warning of state.warnings) {
      const label =
        warning.blockTitle === undefined ? warning.message : `${warning.blockTitle}: ${warning.message}`;
      assert.ok(text.includes(label), `warning rendered: ${label}`);
    }
    await page.screenshot({ path: resolve(screenshotDir, 'export-warnings.png') });
    record({ case: 'warnings', warnings: state.warnings.length, groups: groupCount });
  });

  it('reports no active document without opening any native dialog', async () => {
    await launch('m4d2-no-document');
    assert.equal(await page.evaluate(() => window.__noteforestTest.state().activeTab), null);
    await invokeAppMenu('menu-export-pdf');
    await page
      .locator('[data-sonner-toast]', { hasText: 'Open a document before exporting a PDF.' })
      .first()
      .waitFor({ timeout: 5000 });
    assert.equal((await exportState()).status, 'idle');
    assert.deepEqual(await guardCalls(), [], 'no native dialog is opened');
    record({ case: 'no document' });
  });
});
