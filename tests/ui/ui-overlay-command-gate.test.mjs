import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { artifactsPath, waitUntil } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { pageDocument, textBlock, writePagePackage } from '../support/page-fixtures.mjs';
import { inspectPdfFile, textContains } from '../../scripts/lib/pdf.mjs';

/**
 * UI Sentinel F1/F2 regressions.
 *
 * F1: a modal surface owns the global command channel. With Settings, the
 * palette, or the Export sheet open, global shortcuts and native-menu commands
 * must not switch tabs, change layout/mode/zoom, create or close documents, or
 * open another surface. The Export sheet also pins the document it opened for,
 * so a tab switch behind it can never export a different note under the first
 * document's filename.
 *
 * F2: a Page settings write is bound to the document/layer captured when the
 * edit starts. A tab switch during the debounce lands on the document where the
 * edit was typed; a closed document yields a visible "not saved" state and no
 * write at all.
 *
 * No fixed sleeps: every wait is a condition or a render-settled frame pair.
 */

const tempRoot = artifactsPath('ui-overlay-command-gate-temp');
const outputRoot = artifactsPath('ui-overlay-command-gate', 'export');
const screenshotDir = artifactsPath('ui-overlay-command-gate');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

const ALPHA = 'Overlay Alpha';
const BETA = 'Overlay Beta';
const ALPHA_MARKER = 'ALPHA-MARKER only in the alpha document';
const BETA_MARKER = 'BETA-MARKER only in the beta document';

async function launch(name) {
  page = await ui.launch({ ...ui.isolated(name), NOTEFOREST_E2E_HIDDEN: '1' });
  await h.setWindowSize(1440, 900);
}

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
    { timeout: 20000 },
  );
  await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
  return packagePath;
}

function alphaDocument() {
  return pageDocument({
    id: 'overlay-alpha',
    title: ALPHA,
    chapterTitle: 'Alpha chapter',
    blocks: [textBlock('alpha-body', 'Alpha body', ALPHA_MARKER)],
  });
}

function betaDocument() {
  return pageDocument({
    id: 'overlay-beta',
    title: BETA,
    chapterTitle: 'Beta chapter',
    blocks: [textBlock('beta-body', 'Beta body', BETA_MARKER)],
  });
}

async function shellState() {
  return page.evaluate(() => window.__noteforestTest.state());
}

async function overlayOwner() {
  return page.evaluate(() => window.__noteforestTest.overlayOwner());
}

async function activateTab(packagePath) {
  await page.evaluate((path) => window.__noteforestTest.activateTab(path), packagePath);
}

async function closePath(packagePath) {
  await page.evaluate((path) => window.__noteforestTest.closePath(path), packagePath);
}

async function dispatchMenuCommand(command) {
  await page.evaluate((value) => window.__noteforestTest.dispatchMenuCommand(value), command);
}

async function exportState() {
  return page.evaluate(() => window.__noteforestTest.exportState());
}

async function waitExportStatus(status, timeout = 180000) {
  await page.waitForFunction(
    (expected) => window.__noteforestTest.exportState().status === expected,
    status,
    { timeout },
  );
  return exportState();
}

/** Two animation frames: any queued command had its chance to run. */
async function settle() {
  await page.evaluate(
    () =>
      new Promise((done) => {
        requestAnimationFrame(() => requestAnimationFrame(() => done(null)));
      }),
  );
}

/** Replace the guarded native folder picker with a deterministic choice. */
async function mockFolderDialog(folderPath) {
  await h.app.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chosen] });
  }, folderPath);
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

async function chooseFolder(folderPath) {
  await mkdir(folderPath, { recursive: true });
  await mockFolderDialog(folderPath);
  await page.locator('[data-export-choose-folder]').click();
  await page.waitForFunction(
    (expected) =>
      document.querySelector('[data-export-folder]')?.textContent?.trim() === expected,
    folderPath,
    { timeout: 10000 },
  );
}

async function openSettings() {
  await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
  await page.keyboard.press('Meta+,');
  await page.waitForSelector('[data-settings-dialog="true"]');
  // Settings opens on General; Page margins live on the Page page.
  await page.locator('[data-settings-nav="page"]').click();
  await page.waitForSelector('[data-page-margin="top"]');
}

async function closeSettings() {
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
}

function settingsStatus() {
  return page.locator('[data-settings-status]').getAttribute('data-settings-status');
}

async function readJsonIfExists(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

async function documentSettings(env) {
  return readJsonIfExists(join(env.NOTEFOREST_APP_SUPPORT, 'document-settings.json'));
}

async function waitSavedState() {
  await page.waitForFunction(
    () => window.__noteforestTest.settings().saveState.status === 'saved',
    undefined,
    { timeout: 15000 },
  );
}

async function commandSnapshot() {
  const state = await shellState();
  const views = await page.evaluate(() => window.__noteforestTest.viewState());
  const view = views[state.activeTab] ?? {};
  return {
    activeTab: state.activeTab,
    tabPaths: state.tabs.map((tab) => tab.packagePath),
    paletteOpen: state.paletteOpen,
    sidebarCollapsed: state.sidebarCollapsed,
    layout: view.layout ?? null,
    interactionMode: view.interactionMode ?? null,
    zoom: view.zoom ?? null,
    pageZoom: view.pageZoom ?? null,
    focusBlockId: view.focusBlockId ?? null,
  };
}

/**
 * Wait for `predicate` on the shell state while asserting the whole command
 * snapshot stayed unchanged. Two frames plus a condition poll instead of a
 * fixed sleep.
 */
async function assertCommandsIgnored(before, action, label) {
  await action();
  await settle();
  const after = await commandSnapshot();
  assert.deepEqual(after, before, `${label} does nothing behind the overlay`);
}

describe('UI overlay command gate and write identity', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await rm(outputRoot, { recursive: true, force: true });
    await mkdir(outputRoot, { recursive: true });
    await mkdir(screenshotDir, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('pins Export to the document it opened for and blocks commands behind the sheet (F1)', async () => {
    const env = ui.isolated('overlay-export-identity');
    await launch('overlay-export-identity');
    const alphaPath = await openPackage(env, 'overlay-alpha', alphaDocument());
    const betaPath = await openPackage(env, 'overlay-beta', betaDocument());
    assert.equal((await shellState()).activeTab, betaPath, 'the beta document is active');

    await invokeAppMenu('menu-export-pdf');
    await page.waitForSelector('[data-export-status="configure"]', { timeout: 20000 });
    const opened = await exportState();
    assert.equal(opened.packagePath, betaPath, 'the sheet pins the active document');
    assert.equal(opened.documentTitle, BETA);
    assert.equal(await overlayOwner(), 'export');

    let before = await commandSnapshot();
    await assertCommandsIgnored(before, () => page.keyboard.press('Meta+2'), '⌘2');
    await assertCommandsIgnored(before, () => page.keyboard.press('Control+Tab'), 'Control+Tab');
    await assertCommandsIgnored(before, () => dispatchMenuCommand('close-tab'), 'native close-tab');
    await assertCommandsIgnored(before, () => dispatchMenuCommand('new-document'), 'native new-document');
    await assertCommandsIgnored(before, () => dispatchMenuCommand('settings'), 'native settings');
    await assertCommandsIgnored(before, () => dispatchMenuCommand('command-palette'), 'native palette');
    await assertCommandsIgnored(before, () => page.keyboard.press('Meta+3'), '⌘3');
    await assertCommandsIgnored(before, () => page.keyboard.press('Meta+e'), '⌘E');
    await assertCommandsIgnored(before, () => page.keyboard.press('Meta+='), '⌘+');
    await assertCommandsIgnored(before, () => page.keyboard.press('Meta+0'), '⌘0');
    await assertCommandsIgnored(before, () => page.keyboard.press('Meta+Shift+F'), '⌘⇧F');
    await assertCommandsIgnored(before, () => page.keyboard.press('Meta+k'), '⌘K');
    await assertCommandsIgnored(before, () => page.keyboard.press('Meta+w'), '⌘W');
    await assertCommandsIgnored(before, () => page.keyboard.press('Meta+n'), '⌘N');
    assert.equal((await exportState()).status, 'configure', 'the sheet is still configured');
    assert.equal((await exportState()).packagePath, betaPath, 'the pinned document never changed');

    const folder = resolve(outputRoot, 'identity');
    await chooseFolder(folder);
    await page.locator('[data-export-start]').click();
    const done = await waitExportStatus('done');
    assert.equal(done.packagePath, betaPath);
    assert.equal(done.documentTitle, BETA);
    assert.equal(
      done.outputPath,
      join(folder, `${BETA}.pdf`),
      'the file is named for the pinned document',
    );
    const pdf = await inspectPdfFile(done.outputPath);
    assert.ok(textContains(pdf.text, BETA_MARKER), 'the PDF contains the beta document');
    assert.equal(
      textContains(pdf.text, ALPHA_MARKER),
      false,
      'the PDF never contains the other open document',
    );

    // Dismissing the sheet releases the channel again.
    await page.locator('[data-export-close]').click();
    await page.waitForSelector('[data-export-sheet="true"]', { state: 'detached' });
    assert.equal(await overlayOwner(), null);
    await page.keyboard.press('Control+Tab');
    await page.waitForFunction(
      (path) => window.__noteforestTest.state().activeTab === path,
      alphaPath,
      { timeout: 10000 },
    );
  });

  it('fails a pinned export clearly when its document closed and writes no file (F1)', async () => {
    const env = ui.isolated('overlay-export-closed');
    await launch('overlay-export-closed');
    const alphaPath = await openPackage(env, 'overlay-alpha', alphaDocument());
    const betaPath = await openPackage(env, 'overlay-beta', betaDocument());

    await invokeAppMenu('menu-export-pdf');
    await page.waitForSelector('[data-export-status="configure"]', { timeout: 20000 });
    const folder = resolve(outputRoot, 'closed');
    await chooseFolder(folder);

    // The document disappears while the sheet is open (for example a system or
    // external close path); the sheet must not re-read the active tab.
    await closePath(betaPath);
    await settle();
    assert.equal((await shellState()).activeTab, alphaPath, 'the other tab is active now');
    assert.equal((await exportState()).packagePath, betaPath, 'the sheet keeps its document');

    await page.locator('[data-export-start]').click();
    await page.waitForFunction(
      () => window.__noteforestTest.exportState().status === 'failed',
      undefined,
      { timeout: 30000 },
    );
    const failed = await exportState();
    assert.equal(failed.error.code, 'document-not-open');
    assert.equal(
      await page.locator('[data-export-failed] [data-export-code]').getAttribute('data-export-code'),
      'document-not-open',
    );
    assert.equal(
      await page.locator('[data-export-error-message]').innerText(),
      'The export didn’t start.',
      'the body states the short outcome once',
    );
    await page.locator('[data-export-failed] summary').click();
    assert.match(
      await page.locator('[data-export-failed] [data-details-value]').innerText(),
      /no longer open/i,
      'the raw reason stays in Details',
    );
    assert.deepEqual(await readdir(folder), [], 'no file was written for the closed document');
  });

  it('keeps Settings, shortcut keys, and native menu commands behind Settings (F1)', async () => {
    const env = ui.isolated('overlay-settings');
    await launch('overlay-settings');
    const alphaPath = await openPackage(env, 'overlay-alpha', alphaDocument());
    const betaPath = await openPackage(env, 'overlay-beta', betaDocument());

    await openSettings();
    assert.equal(await overlayOwner(), 'dialog');

    const before = await commandSnapshot();
    await assertCommandsIgnored(before, () => page.keyboard.press('Meta+2'), '⌘2');
    await assertCommandsIgnored(before, () => page.keyboard.press('Meta+3'), '⌘3');
    await assertCommandsIgnored(before, () => page.keyboard.press('Meta+e'), '⌘E');
    await assertCommandsIgnored(before, () => page.keyboard.press('Meta+k'), '⌘K');
    await assertCommandsIgnored(before, () => page.keyboard.press('Meta+w'), '⌘W');
    await assertCommandsIgnored(before, () => page.keyboard.press('Meta+n'), '⌘N');
    await assertCommandsIgnored(before, () => page.keyboard.press('Meta+,'), '⌘,');
    await assertCommandsIgnored(before, () => page.keyboard.press('Meta+='), 'zoom in');
    await assertCommandsIgnored(before, () => page.keyboard.press('Meta+-'), 'zoom out');
    await assertCommandsIgnored(before, () => page.keyboard.press('Meta+0'), 'actual size');
    await assertCommandsIgnored(before, () => page.keyboard.press('Meta+Shift+F'), 'focus branch');
    await assertCommandsIgnored(before, () => page.keyboard.press('Meta+Shift+E'), 'native export');
    await assertCommandsIgnored(before, () => dispatchMenuCommand('close-tab'), 'native close-tab');
    await assertCommandsIgnored(before, () => dispatchMenuCommand('new-document'), 'native new-document');
    await assertCommandsIgnored(before, () => dispatchMenuCommand('reopen-tab'), 'native reopen-tab');
    await assertCommandsIgnored(before, () => dispatchMenuCommand('toggle-sidebar'), 'native sidebar');
    await assertCommandsIgnored(before, () => dispatchMenuCommand('open-document'), 'native open');
    assert.equal(await page.locator('[data-export-sheet="true"]').count(), 0);
    assert.equal(await page.locator('.nf-palette').count(), 0);

    // Overlay-local input still works and still saves.
    const topMargin = page.locator('[data-page-margin="top"]');
    await topMargin.fill('15');
    await waitSavedState();
    assert.equal(await settingsStatus(), 'saved');

    // Native menu roles are not app commands: the Edit role items stay enabled
    // and are never routed through the renderer command channel.
    const roles = await h.app.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      const edit = menu?.items.find((item) => item.label === 'Edit');
      const appMenu = menu?.items[0];
      const all = [
        ...(edit?.submenu?.items ?? []),
        ...(appMenu?.submenu?.items ?? []),
      ];
      return all
        .filter((item) => typeof item.role === 'string')
        .map((item) => ({ role: item.role, enabled: item.enabled }));
    });
    for (const role of ['cut', 'copy', 'paste', 'selectall', 'quit']) {
      const item = roles.find((candidate) => candidate.role === role);
      assert.ok(item, `${role} is still a native menu role: ${JSON.stringify(roles)}`);
      assert.equal(item.enabled, true, `${role} stays enabled behind Settings`);
    }
    await page.keyboard.press('Meta+c');
    await settle();
    assert.equal(
      await page.locator('[data-settings-dialog="true"]').count(),
      1,
      'native copy does not touch the overlay',
    );

    // Escape owns its own surface, then the command channel is free again.
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
    assert.equal(await overlayOwner(), null);
    await page.keyboard.press('Control+Tab');
    await page.waitForFunction(
      (path) => window.__noteforestTest.state().activeTab === path,
      alphaPath,
      { timeout: 10000 },
    );
  });

  it('gates the command channel behind the palette while its own rows run (F1)', async () => {
    const env = ui.isolated('overlay-palette');
    await launch('overlay-palette');
    await openPackage(env, 'overlay-alpha', alphaDocument());
    const betaPath = await openPackage(env, 'overlay-beta', betaDocument());

    await page.keyboard.press('Meta+k');
    await page.waitForSelector('.nf-palette');
    assert.equal(await overlayOwner(), 'palette');

    const before = await commandSnapshot();
    await assertCommandsIgnored(before, () => page.keyboard.press('Meta+w'), '⌘W');
    await assertCommandsIgnored(before, () => page.keyboard.press('Meta+2'), '⌘2');
    await assertCommandsIgnored(before, () => dispatchMenuCommand('close-tab'), 'native close-tab');

    // Palette-local keys and row execution keep working.
    await page.locator('.nf-palette-input').fill('Toggle sidebar');
    const sidebarBefore = before.sidebarCollapsed;
    await page.getByRole('option', { name: /Toggle sidebar/ }).click();
    await page.waitForSelector('.nf-palette', { state: 'detached' });
    assert.equal((await shellState()).sidebarCollapsed, !sidebarBefore, 'the palette row ran');
    assert.equal((await shellState()).activeTab, betaPath, 'no tab switch happened');

    // ⌘K is the palette's own toggle: it closes the surface that owns the
    // channel, and it never runs an app command behind it.
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('.nf-palette');
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('.nf-palette', { state: 'detached' });

    // Escape closes the palette by itself.
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('.nf-palette');
    const listed = await commandSnapshot();
    await assertCommandsIgnored(listed, () => page.keyboard.press('Meta+3'), '⌘3 behind palette');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.nf-palette', { state: 'detached' });
    assert.equal(await overlayOwner(), null);

    // Row execution through Enter (keyboard path) after the gate is released.
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('.nf-palette');
    await page.locator('.nf-palette-input').fill('Toggle sidebar');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.nf-palette', { state: 'detached' });
    assert.equal((await shellState()).sidebarCollapsed, sidebarBefore, 'Enter ran the same row');
  });

  it('nests Settings → Export and returns to a still-gated Settings (F1)', async () => {
    const env = ui.isolated('overlay-settings-export');
    await launch('overlay-settings-export');
    await openPackage(env, 'overlay-alpha', alphaDocument());
    const betaPath = await openPackage(env, 'overlay-beta', betaDocument());

    await openSettings();
    await page.locator('[data-settings-nav="export"]').click();
    await page.locator('[data-settings-export-now]').click();
    await page.waitForSelector('[data-export-status="configure"]', { timeout: 20000 });
    assert.equal(
      await page.locator('[data-settings-dialog="true"]').count(),
      1,
      'Settings stays open behind the Export sheet',
    );
    assert.notEqual(await overlayOwner(), null);
    await page.screenshot({ path: join(screenshotDir, 'settings-export-nested.png') });

    const before = await commandSnapshot();
    await assertCommandsIgnored(before, () => page.keyboard.press('Meta+2'), '⌘2');
    await assertCommandsIgnored(before, () => dispatchMenuCommand('close-tab'), 'native close-tab');

    await page.locator('[data-export-close]').click();
    await page.waitForSelector('[data-export-sheet="true"]', { state: 'detached' });
    assert.equal(
      await page.locator('[data-settings-dialog="true"]').count(),
      1,
      'closing Export returns to Settings',
    );
    assert.equal(await overlayOwner(), 'dialog');
    const afterExport = await commandSnapshot();
    assert.equal(afterExport.activeTab, betaPath);
    await assertCommandsIgnored(afterExport, () => page.keyboard.press('Meta+2'), '⌘2 after Export');

    // Settings is still usable and still gated.
    await page.locator('[data-settings-nav="page"]').click();
    await page.waitForSelector('[data-page-margin="top"]');
    await page.locator('[data-page-margin="top"]').fill('16');
    await waitSavedState();
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
    assert.equal(await overlayOwner(), null);
  });

  it('writes a debounced document edit to the document where it was typed (F2)', async () => {
    const env = ui.isolated('overlay-write-identity');
    await launch('overlay-write-identity');
    const alphaPath = await openPackage(env, 'overlay-alpha', alphaDocument());
    const betaPath = await openPackage(env, 'overlay-beta', betaDocument());

    await openSettings();
    await page.locator('[data-page-scope-option="document"]').click();
    assert.equal(
      await page.locator('[data-page-scope-option="document"]').getAttribute('aria-pressed'),
      'true',
      'the document layer is selected',
    );

    // Type, then move the active tab while the 300 ms margin debounce is
    // pending. The write must land on the document the edit started on.
    await page.locator('[data-page-margin="top"]').fill('25');
    await activateTab(alphaPath);
    await waitUntil(
      async () => {
        const stored = await documentSettings(env);
        const entry = (stored?.entries ?? []).find((item) => item.packagePath === betaPath);
        return entry?.page?.setup?.margins?.top === 25;
      },
      'the beta margin override is written to the beta document',
      15000,
    );
    await waitSavedState();
    const stored = await documentSettings(env);
    const betaEntry = (stored?.entries ?? []).find((item) => item.packagePath === betaPath);
    assert.equal(betaEntry?.documentId, 'overlay-beta');
    // The override is partial: only the field that changed is stored.
    assert.deepEqual(betaEntry?.page?.setup?.margins, { top: 25 });
    const alphaEntry = (stored?.entries ?? []).find((item) => item.packagePath === alphaPath);
    assert.equal(alphaEntry, undefined, 'the alpha document received no override');
    assert.equal(await settingsStatus(), 'saved');
  });

  it('reports a visible not-saved state and writes nothing when the document closes (F2)', async () => {
    const env = ui.isolated('overlay-write-closed');
    await launch('overlay-write-closed');
    await openPackage(env, 'overlay-alpha', alphaDocument());
    const betaPath = await openPackage(env, 'overlay-beta', betaDocument());

    await openSettings();
    await page.locator('[data-page-scope-option="document"]').click();
    const topMargin = page.locator('[data-page-margin="top"]');
    await topMargin.fill('26');
    await closePath(betaPath);

    await page.waitForFunction(
      () => {
        const status = document.querySelector('[data-settings-status]');
        return status?.getAttribute('data-settings-status') === 'error';
      },
      undefined,
      { timeout: 15000 },
    );
    assert.match(
      await page.locator('[data-settings-save-error="true"]').innerText(),
      /closed before this change was saved/i,
    );
    await page.screenshot({ path: join(screenshotDir, 'settings-target-closed.png') });

    // Nothing was written anywhere for the lost target.
    const stored = await documentSettings(env);
    const tops = (stored?.entries ?? []).map((entry) => entry.page?.setup?.margins?.top ?? null);
    assert.equal(tops.includes(26), false, 'no document received the skipped value');

    // Retry cannot resurrect the closed target and must not claim success.
    await page.locator('[data-settings-retry="true"]').click();
    await settle();
    assert.equal(await settingsStatus(), 'error');
    assert.equal(
      await page.locator('[data-settings-save-error="true"]').count(),
      1,
      'the not-saved state stays visible',
    );
    const afterRetry = await documentSettings(env);
    const retryTops = (afterRetry?.entries ?? []).map(
      (entry) => entry.page?.setup?.margins?.top ?? null,
    );
    assert.equal(retryTops.includes(26), false, 'Retry wrote nothing');

    // Closing Settings is never blocked by a skipped write.
    await closeSettings();
  });
});
