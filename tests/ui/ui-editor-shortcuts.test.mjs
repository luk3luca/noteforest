import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
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

const ALL_GROUPS = ['Shell', 'View', 'Editor', 'Page'];
const ALL_ROWS = 34;

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

/** The catalogue the renderer renders from (test bridge, never a copy). */
async function catalogue() {
  return page.evaluate(() => window.__noteforestTest.shortcuts());
}

/** The rendered rows, exactly as a user reads them. */
async function renderedRows() {
  return page.locator('.nf-shortcut-row').evaluateAll((nodes) =>
    nodes.map((node) => ({
      label: node.querySelector('dt')?.textContent ?? '',
      keys: node.querySelector('kbd')?.textContent ?? '',
      note: node.querySelector('.nf-shortcut-note')?.textContent ?? null,
    })),
  );
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

const RENDERER_SRC = resolve(
  import.meta.dirname,
  '..',
  '..',
  'apps/desktop/src/renderer/src',
);

/** Every renderer source file, so the glyph guard cannot miss one. */
async function rendererSources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await rendererSources(path)));
    else if (/\.(ts|tsx|css)$/.test(entry.name)) files.push(path);
  }
  return files;
}

/**
 * One glyph order (K1): Apple's `⌃⌥⇧⌘`. A `⌘⇧` literal is the old order and
 * must not come back anywhere in the renderer, comments included. The same
 * guard runs in `apps/desktop/test/shortcuts.test.ts`, so `verify:fast` fails
 * too, not only the UI gate.
 */
describe('keyboard glyph guard', () => {
  it('keeps the Apple order in every renderer source file', async () => {
    const files = await rendererSources(RENDERER_SRC);
    assert.ok(files.length > 50, `scanned ${files.length} renderer files`);
    const violations = [];
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      if (source.includes('⌘⇧')) violations.push(file.slice(RENDERER_SRC.length + 1));
    }
    assert.deepEqual(violations, []);
  });
});

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

    // The rendered list is the catalogue: same groups, same order, same labels,
    // same keys, same scope notes. A renamed binding fails the unit test; a
    // list that stops reading the catalogue fails here.
    const groups = await catalogue();
    assert.deepEqual(groups.map((group) => group.group), ALL_GROUPS);
    const expectedRows = groups.flatMap((group) =>
      group.rows.map((row) => ({
        label: row.label,
        keys: row.keys,
        note: row.note ?? null,
      })),
    );
    assert.equal(expectedRows.length, ALL_ROWS);
    assert.deepEqual(await renderedRows(), expectedRows, 'the list equals the catalogue');
    assert.deepEqual(await groupNames(), ALL_GROUPS);

    // No row displays the old `⌘⇧` order, and no row names a removed key.
    const keys = await page.locator('.nf-shortcut-row kbd').allInnerTexts();
    for (const value of keys) assert.ok(!value.includes('⌘⇧'), `${value} uses Apple order`);
    const listText = keys.join(' ');
    assert.ok(!listText.includes('⇧1') && !listText.includes('⇧2'), 'no bare-Shift fit keys');
    assert.ok(!listText.includes('⌘1') && !listText.includes('⌘9'), 'no tab digits');
    assert.ok(listText.includes('⌘0'), 'reset zoom keeps its key');
    assert.ok(
      (await page.locator('[data-shortcut-id="reset-zoom"] dt').innerText()) === 'Reset zoom',
      '⌘0 reads Reset zoom',
    );
    assert.ok(
      (await page.locator('[data-shortcut-id="page-step"] kbd').innerText()) === '⌘↑ / ⌘↓',
      'the Page row names the page pair that works',
    );
    assert.equal(
      await page.locator('[data-shortcut-id="block-step"] .nf-shortcut-note').innerText(),
      'Continuous, caret in a block',
      'a scoped row states its scope',
    );

    // P2: Export PDF reads ⌘P in the same list, and no row keeps ⇧⌘E.
    assert.equal(
      await page.locator('[data-shortcut-id="export-pdf"] dt').innerText(),
      'Export PDF…',
    );
    assert.equal(await page.locator('[data-shortcut-id="export-pdf"] kbd').innerText(), '⌘P');
    assert.ok(!(await page.locator('.nf-shortcut-row kbd').allInnerTexts()).includes('⇧⌘E'));
    // The row is `display: contents`, so the evidence is a page shot with the
    // row scrolled into view.
    await page.locator('[data-shortcut-id="export-pdf"] dt').scrollIntoViewIfNeeded();
    await mkdir(join(artifactsPath('p2-polish'), 'settings'), { recursive: true });
    await page.screenshot({
      path: join(artifactsPath('p2-polish', 'settings'), 'export-row.png'),
    });

    await page.screenshot({ path: join(screenshotDir, 'editor-shortcuts.png') });
    await mkdir(join(screenshotDir, '..', 'b1-defects'), { recursive: true });
    await page.screenshot({ path: artifactsPath('b1-defects', 'settings-shortcuts.png') });
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
    await filterShortcuts('focus', 1);
    assert.deepEqual(await groupNames(), ['Editor']);
    assert.deepEqual(await rowLabels(), ['Focus branch']);

    // Key filtering matches the rendered combination text.
    await filterShortcuts('⌘s', 1);
    assert.deepEqual(await groupNames(), ['Shell']);
    assert.deepEqual(await rowLabels(), ['Save']);

    // Upper-case label query matches across more than one group.
    await filterShortcuts('PAGE', 3);
    assert.deepEqual(await groupNames(), ['View', 'Page']);
    assert.deepEqual(await rowLabels(), [
      'Continuous / Page',
      'Previous / next page',
      'Commit Page Edit',
    ]);

    // The scope note is searchable too (`pager` only exists in the note).
    await filterShortcuts('pager', 1);
    assert.deepEqual(await rowLabels(), ['Previous / next page']);

    // The explicit clear action restores the whole grouped list.
    await page.locator('[data-shortcut-clear]').click();
    await waitRows(ALL_ROWS);
    assert.equal(await shortcutSearch().inputValue(), '');
    assert.deepEqual(await groupNames(), ALL_GROUPS);
    assert.equal(await page.locator('[data-shortcut-clear]').count(), 0);
  });

  it('prints the catalogue hints in the palette, never a hand-typed chord (K1)', async () => {
    await launch('editor-shortcuts-palette');
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('.nf-palette');
    const input = page.locator('.nf-palette-input');

    const hintFor = async (query, id) => {
      await input.fill(query);
      const row = page.locator(`[data-palette-item="cmd-${id}"]`);
      await row.waitFor();
      const hints = row.locator('.nf-palette-hint');
      return (await hints.count()) === 0 ? null : hints.innerText();
    };

    assert.equal(await hintFor('Save', 'save'), '⌘S');
    assert.equal(await hintFor('Undo', 'undo'), '⌘Z');
    assert.equal(await hintFor('Redo', 'redo'), '⇧⌘Z');
    assert.equal(await hintFor('Link as reference', 'link-reference'), '⇧⌘L');
    assert.equal(await hintFor('Continuous', 'continuous-layout'), '⌘2');
    assert.equal(await hintFor('Switch to Page', 'page-layout'), '⌘3');
    assert.equal(await hintFor('Reset zoom', 'zoom-reset'), '⌘0');
    assert.equal(await hintFor('Fit width', 'fit-width'), '⇧⌘0');
    assert.equal(await hintFor('Fit page', 'fit-page'), null, 'Fit page has no key');
    // P2: one verb, one key. ⌘P replaced ⇧⌘E, which is no longer an alias.
    assert.equal(await hintFor('Export PDF', 'export-pdf'), '⌘P');

    // Every rendered hint is Apple-ordered and none names a removed key.
    await input.fill('');
    const hints = await page.locator('.nf-palette-hint').allInnerTexts();
    assert.ok(hints.length > 5);
    for (const value of hints) {
      assert.ok(!value.includes('⌘⇧'), `${value} uses the Apple order`);
      assert.ok(!value.includes('⇧1') && !value.includes('⇧2'), `${value} is not a fit key`);
    }
    await page.keyboard.press('Escape');
    await page.waitForSelector('.nf-palette', { state: 'detached' });
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
    await filterShortcuts('focus', 1);
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

  it('cycles tabs with the shifted brackets by physical key and keeps Control+Tab (P2)', async () => {
    await launch('editor-shortcuts-brackets');
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    await page.waitForFunction(() => window.__noteforestTest.state().tabs.length === 1);
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForFunction(() => window.__noteforestTest.state().tabs.length === 2);

    const tabs = (await page.evaluate(() => window.__noteforestTest.state())).tabs.map(
      (tab) => tab.packagePath,
    );
    assert.equal(tabs.length, 2);
    const [firstTab, secondTab] = tabs;
    const activeTab = async () => page.evaluate(() => window.__noteforestTest.state().activeTab);
    assert.equal(await activeTab(), secondTab, 'the second seeded note is active');

    // `⇧⌘]` on a US layout reports `}` as the character; the catalogue matches
    // the physical `BracketRight`.
    await page.keyboard.press('Meta+Shift+BracketRight');
    await page.waitForFunction(
      (path) => window.__noteforestTest.state().activeTab === path,
      firstTab,
      { timeout: 5000 },
    );
    await page.keyboard.press('Meta+Shift+BracketLeft');
    await page.waitForFunction(
      (path) => window.__noteforestTest.state().activeTab === path,
      secondTab,
      { timeout: 5000 },
    );

    // The discoverable pair still works.
    await page.keyboard.press('Control+Tab');
    await page.waitForFunction(
      (path) => window.__noteforestTest.state().activeTab === path,
      firstTab,
      { timeout: 5000 },
    );
    await page.keyboard.press('Control+Shift+Tab');
    await page.waitForFunction(
      (path) => window.__noteforestTest.state().activeTab === path,
      secondTab,
      { timeout: 5000 },
    );
  });

  it('opens Export PDF with ⌘P and no longer with ⇧⌘E (P2)', async () => {
    await launch('editor-shortcuts-export');
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();

    // The canvas header names the same key as the catalogue (Page only).
    await page.keyboard.press('Meta+3');
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view');
    const header = page.locator('[data-page-export]');
    await header.waitFor();
    assert.match(await header.getAttribute('title'), /⌘P/);
    assert.equal(await header.getAttribute('aria-keyshortcuts'), 'Meta+P');
    await mkdir(join(artifactsPath('p2-polish'), 'page'), { recursive: true });
    await header.screenshot({
      path: join(artifactsPath('p2-polish', 'page'), 'export-header.png'),
    });
    await page.keyboard.press('Meta+2');
    await page.waitForFunction(
      () =>
        window.__noteforestTest.viewState()[window.__noteforestTest.state().activeTab]?.layout ===
        'continuous',
      undefined,
      { timeout: 5000 },
    );

    // The old key is gone: one verb, one key.
    await page.keyboard.press('Meta+Shift+E');
    await settle();
    assert.equal(
      await page.locator('[data-export-sheet="true"]').count(),
      0,
      '⇧⌘E no longer opens the export sheet',
    );

    await page.keyboard.press('Meta+P');
    await page.waitForSelector('[data-export-status="configure"]', { timeout: 20000 });
    assert.equal(await page.evaluate(() => window.__noteforestTest.overlayOwner()), 'export');
    await page.locator('[data-export-close]').click();
    await page.waitForSelector('[data-export-sheet="true"]', { state: 'detached' });
  });

  it('runs Edit → Find, Find Next, and Find Previous from the native menu (P2)', async () => {
    await launch('editor-shortcuts-find-menu');
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();

    const editMenu = await h.app.evaluate(({ Menu }) => {
      const edit = Menu.getApplicationMenu()?.items.find((item) => item.label === 'Edit');
      return (edit?.submenu?.items ?? []).map((item) => ({
        id: item.id,
        label: item.label,
        accelerator: item.accelerator,
      }));
    });
    assert.deepEqual(
      editMenu.filter((item) => typeof item.id === 'string' && item.id.startsWith('menu-find')),
      [
        { id: 'menu-find', label: 'Find…', accelerator: 'CmdOrCtrl+F' },
        { id: 'menu-find-next', label: 'Find Next', accelerator: 'CmdOrCtrl+G' },
        { id: 'menu-find-previous', label: 'Find Previous', accelerator: 'CmdOrCtrl+Shift+G' },
      ],
      'the Edit menu carries the three standard Find items',
    );
    // A native macOS menu is OS-rendered, not DOM: the harness cannot
    // screenshot it. The menu structure is the evidence artifact instead.
    await mkdir(artifactsPath('p2-polish'), { recursive: true });
    await writeFile(
      join(artifactsPath('p2-polish'), 'edit-menu.json'),
      `${JSON.stringify(editMenu, null, 2)}\n`,
      'utf8',
    );

    await invokeAppMenu('menu-find');
    await page.locator('.nf-find-input').waitFor();
    await page.locator('.nf-find-input').fill('eigenvalue');
    await page.waitForFunction(
      () => window.__noteforestTest.state().findTotal > 1,
      undefined,
      { timeout: 15000 },
    );
    const findIndex = async () => page.evaluate(() => window.__noteforestTest.state().findIndex);
    const start = await findIndex();

    await invokeAppMenu('menu-find-next');
    await page.waitForFunction(
      (index) => window.__noteforestTest.state().findIndex !== index,
      start,
      { timeout: 10000 },
    );
    const moved = await findIndex();

    await invokeAppMenu('menu-find-previous');
    await page.waitForFunction(
      (index) => window.__noteforestTest.state().findIndex !== index,
      moved,
      { timeout: 10000 },
    );
    assert.equal(await findIndex(), start, 'Find Previous returns to the same hit');
    assert.equal(await page.evaluate(() => window.__noteforestTest.state().findOpen), true);
  });

  it('closes the find with Shift+Escape as well as Escape (P2)', async () => {
    await launch('editor-shortcuts-find-escape');
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();

    await page.keyboard.press('Meta+f');
    await page.locator('.nf-find-input').waitFor();
    await page.locator('.nf-find-input').fill('eigenvalue');
    await page.waitForFunction(
      () => window.__noteforestTest.state().findTotal > 0,
      undefined,
      { timeout: 15000 },
    );
    await page.keyboard.press('Shift+Escape');
    await page.waitForSelector('.nf-find-bar', { state: 'detached' });
    assert.equal(await page.evaluate(() => window.__noteforestTest.state().findOpen), false);

    await page.keyboard.press('Meta+f');
    await page.locator('.nf-find-input').waitFor();
    await page.keyboard.press('Escape');
    await page.waitForSelector('.nf-find-bar', { state: 'detached' });
    assert.equal(await page.evaluate(() => window.__noteforestTest.state().findOpen), false);
  });
});
