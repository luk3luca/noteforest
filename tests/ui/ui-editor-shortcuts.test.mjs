import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';

/**
 * Settings → Editor shortcut surface (AP-22 / S3-8 + the searchable list).
 *
 * The native Help → Keyboard shortcuts item must open Settings on the Editor
 * page instead of the default Page page, through the same gated command
 * dispatch as every other menu command. The Editor list stays a read-only,
 * grouped kbd reference and gains a case-insensitive filter over labels and
 * key combinations, hidden empty groups, an empty state with a clear action,
 * and Escape-clears-the-query while Settings stays open.
 *
 * No document is needed: Settings is app-level. No fixed sleeps; every wait is
 * a selector or a condition.
 */

const tempRoot = artifactsPath('ui-editor-shortcuts-temp');
const screenshotDir = artifactsPath('ui-editor-shortcuts');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

const ALL_GROUPS = ['Shell', 'Editor', 'Page'];
const ALL_ROWS = 27;

async function launch(name) {
  page = await ui.launch({ ...ui.isolated(name), NOTEFOREST_E2E_HIDDEN: '1' });
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

async function dispatchMenuCommand(command) {
  await page.evaluate((value) => window.__noteforestTest.dispatchMenuCommand(value), command);
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

async function waitSettingsOpen() {
  await page.waitForSelector('[data-settings-dialog="true"]');
}

async function waitSettingsClosed() {
  await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
}

function shortcutSearch() {
  return page.locator('[data-shortcut-search="true"]');
}

async function activeNav() {
  return page.locator('.nf-settings-nav-item[aria-current="page"]').innerText();
}

async function groupNames() {
  return page.locator('[data-shortcut-group]').evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-shortcut-group')),
  );
}

async function rowLabels() {
  return page.locator('.nf-shortcut-row dt').allInnerTexts();
}

async function waitRows(count) {
  await page.waitForFunction(
    (expected) => document.querySelectorAll('.nf-shortcut-row').length === expected,
    count,
    { timeout: 5000 },
  );
}

async function filterShortcuts(value, expectedRows) {
  await shortcutSearch().fill(value);
  await waitRows(expectedRows);
}

describe('Settings Editor shortcut list', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    await mkdir(screenshotDir, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('opens Settings on Editor from the native Help → Keyboard shortcuts item', async () => {
    await launch('editor-shortcuts-native');

    const helpMenu = await h.app.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      const help = menu?.items.find((item) => item.role === 'help');
      return (help?.submenu?.items ?? []).map((item) => ({
        id: item.id,
        label: item.label,
      }));
    });
    assert.deepEqual(helpMenu, [
      { id: 'menu-keyboard-shortcuts', label: 'Keyboard shortcuts' },
    ]);

    await invokeAppMenu('menu-keyboard-shortcuts');
    await waitSettingsOpen();
    await page.waitForSelector('[data-shortcut-search="true"]');

    assert.equal(await activeNav(), 'Editor', 'the Editor page is active');
    assert.equal(await page.locator('.nf-settings-page-title').innerText(), 'Editor');
    assert.deepEqual(await groupNames(), ALL_GROUPS);
    await waitRows(ALL_ROWS);

    // The menu target puts focus in the shortcut search field.
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('data-shortcut-search') === 'true',
      undefined,
      { timeout: 5000 },
    );
    assert.equal(
      await shortcutSearch().getAttribute('aria-label'),
      'Search keyboard shortcuts',
    );
    assert.equal(await shortcutSearch().getAttribute('placeholder'), 'Search by name or shortcut');

    // The list stays a read-only kbd reference with the autosave copy and no
    // future/disabled controls.
    const paneText = await page.locator('.nf-settings-pane').innerText();
    assert.match(paneText, /Saves automatically\. ⌘S saves now\./);
    assert.match(paneText, /Shortcuts are fixed\./);
    assert.doesNotMatch(paneText, /single-key|autosave interval|coming soon/i);
    assert.equal(await page.locator('.nf-shortcut-row kbd').count(), ALL_ROWS);
    assert.equal(
      await page
        .locator('.nf-settings-pane button:disabled, .nf-settings-pane input:disabled')
        .count(),
      0,
      'the Editor page has no disabled or future controls',
    );
    assert.equal(await page.locator('[data-shortcut-clear]').count(), 0, 'no clear action when empty');

    await page.screenshot({ path: join(screenshotDir, 'editor-shortcuts.png') });
  });

  it('opens the default Settings entry on General and gates the shortcut command behind the modal', async () => {
    await launch('editor-shortcuts-command');

    // ⌘, opens General, not the shortcut list and not the Page page.
    await page.keyboard.press('Meta+,');
    await waitSettingsOpen();
    assert.equal(await activeNav(), 'General');
    assert.equal(await page.locator('[data-shortcut-search="true"]').count(), 0);
    assert.equal(await page.locator('[data-settings-nav="general"]').getAttribute('aria-current'), 'page');

    // The same gated dispatch path as every menu command: Settings owns the
    // channel, so the command cannot switch the open dialog to Editor.
    const before = await page.evaluate(() => window.__noteforestTest.overlayOwner());
    assert.equal(before, 'dialog');
    await dispatchMenuCommand('settings-shortcuts');
    await settle();
    assert.equal(await activeNav(), 'General', 'the open Settings dialog keeps its page');
    assert.equal(await page.locator('[data-shortcut-search="true"]').count(), 0);

    await page.getByRole('button', { name: 'Done' }).click();
    await waitSettingsClosed();

    // With the channel free, the renderer dispatch opens Editor.
    await dispatchMenuCommand('settings-shortcuts');
    await waitSettingsOpen();
    await page.waitForSelector('[data-shortcut-search="true"]');
    assert.equal(await activeNav(), 'Editor');
    await waitRows(ALL_ROWS);
  });

  it('lands on Editor from the General Open shortcut list button and filters by label and key', async () => {
    await launch('editor-shortcuts-filter');
    await page.keyboard.press('Meta+,');
    await waitSettingsOpen();

    await page.locator('[data-settings-nav="general"]').click();
    await page.locator('[data-settings-open-shortcuts]').click();
    assert.equal(await activeNav(), 'Editor');
    await page.waitForSelector('[data-shortcut-search="true"]');
    await waitRows(ALL_ROWS);
    assert.deepEqual(await groupNames(), ALL_GROUPS);

    // The field is reachable by Tab from the last nav item.
    await page.locator('[data-settings-nav="data"]').focus();
    await page.keyboard.press('Tab');
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('data-shortcut-search') === 'true',
      undefined,
      { timeout: 5000 },
    );

    // Label filtering is case-insensitive and hides groups with no match.
    await filterShortcuts('focus', 2);
    assert.deepEqual(await groupNames(), ['Editor']);
    assert.deepEqual(await rowLabels(), ['Focus branch', 'Focus previous / next block']);

    // Key filtering matches the rendered combination text.
    await filterShortcuts('⌘s', 1);
    assert.deepEqual(await groupNames(), ['Shell']);
    assert.deepEqual(await rowLabels(), ['Save']);

    // Upper-case label query matches across more than one group.
    await filterShortcuts('PAGE', 4);
    assert.deepEqual(await groupNames(), ['Shell', 'Page']);
    assert.deepEqual(await rowLabels(), [
      'Continuous / Page',
      'Previous / next page',
      'Fit page / Fit width',
      'Commit Page Edit',
    ]);

    // The explicit clear action restores the whole grouped list.
    await page.locator('[data-shortcut-clear]').click();
    await waitRows(ALL_ROWS);
    assert.equal(await shortcutSearch().inputValue(), '');
    assert.deepEqual(await groupNames(), ALL_GROUPS);
    assert.equal(await page.locator('[data-shortcut-clear]').count(), 0);
  });

  it('shows the empty state with the query and clears with the button and Escape', async () => {
    await launch('editor-shortcuts-empty');
    await dispatchMenuCommand('settings-shortcuts');
    await waitSettingsOpen();
    await page.waitForSelector('[data-shortcut-search="true"]');
    await waitRows(ALL_ROWS);

    await filterShortcuts('zzzz', 0);
    const empty = page.locator('[data-shortcuts-empty]');
    await empty.waitFor();
    assert.match(await empty.innerText(), /No shortcuts match “zzzz”\./);
    assert.equal(await page.locator('[data-shortcut-group]').count(), 0, 'empty groups are hidden');
    await page.screenshot({ path: join(screenshotDir, 'editor-shortcuts-empty.png') });

    await page.locator('[data-shortcuts-empty-clear]').click();
    await waitRows(ALL_ROWS);
    assert.equal(await shortcutSearch().inputValue(), '');
    assert.equal(await page.locator('[data-shortcuts-empty]').count(), 0);

    // Escape clears a non-empty query and keeps Settings open.
    await filterShortcuts('focus', 2);
    await page.screenshot({ path: join(screenshotDir, 'editor-shortcuts-filtered.png') });
    await shortcutSearch().press('Escape');
    await waitRows(ALL_ROWS);
    assert.equal(await shortcutSearch().inputValue(), '');
    assert.equal(
      await page.locator('[data-settings-dialog="true"]').count(),
      1,
      'Escape with a query only clears the filter',
    );

    // Escape on the empty field keeps the normal dismiss behavior.
    await shortcutSearch().press('Escape');
    await waitSettingsClosed();
  });
});
