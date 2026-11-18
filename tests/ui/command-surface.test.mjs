import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { artifactsPath, waitUntil } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';

/**
 * Command-surface parity (one manifest, four adapters).
 *
 * The palette row, the key toast and the menu click must state the same
 * decision for the same context; one keypress must run exactly one command;
 * a hidden chord must stay with the local surface; and the native menu must
 * display the catalogue accelerator without registering an app accelerator.
 * No fixed sleeps: every wait is a selector, a state, or a toast count.
 */

const tempRoot = artifactsPath('command-surface-temp');
const evidence = artifactsPath('command-surface');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

const NO_DOCUMENT = 'Open a document first';
const EXPORT_NO_NOTE = 'Open a note before exporting a PDF.';
const GUEST_EXPORT = 'Markdown files have no Page or PDF export.';
const READ_MODE = 'Read mode — switch to Continuous Edit to run this command';
const NO_SELECTION = 'Select a block first.';

/** The 24 application menu labels; every one displays a catalogue accelerator. */
const APP_MENU_LABELS = [
  'New note',
  'Open note…',
  'Open Markdown…',
  'New chapter',
  'Save',
  'Export PDF…',
  'Close tab',
  'Reopen closed tab',
  'Close Window',
  'Undo',
  'Redo',
  'Find…',
  'Find Next',
  'Find Previous',
  'Command palette…',
  'Toggle sidebar',
  'Fit width',
  'Fit page',
  'Focus branch',
  'Reset zoom',
  'Zoom in',
  'Zoom out',
  'Settings…',
  'Keyboard shortcuts',
];

async function launch(name) {
  page = await ui.launch({ ...ui.isolated(name), NOTEFOREST_E2E_HIDDEN: '1' });
  await h.setWindowSize(1440, 900);
}

async function shellState() {
  return page.evaluate(() => window.__noteforestTest.state());
}

async function commandState(id) {
  return page.evaluate((value) => window.__noteforestTest.commandState(value), id);
}

async function activeView() {
  const state = await shellState();
  return page.evaluate(
    (path) => window.__noteforestTest.viewState()[path] ?? {},
    state.activeTab,
  );
}

async function waitView(packagePath, layout, interactionMode) {
  await page.waitForFunction(
    ({ path, expectedLayout, expectedMode }) => {
      const view = window.__noteforestTest.viewState()[path];
      return view?.layout === expectedLayout && view?.interactionMode === expectedMode;
    },
    { path: packagePath, expectedLayout: layout, expectedMode: interactionMode },
    { timeout: 5000 },
  );
}

async function openPalette() {
  await page.keyboard.press('Meta+k');
  await page.waitForSelector('.nf-palette');
}

async function closePalette() {
  if ((await page.locator('.nf-palette').count()) === 0) return;
  await page.keyboard.press('Escape');
  await page.waitForSelector('.nf-palette', { state: 'detached' });
}

function paletteRow(id) {
  return page.locator(`[data-palette-item="${id}"]`);
}

async function paletteReason(id) {
  return paletteRow(id).getAttribute('data-palette-reason');
}

async function commandRowIds() {
  return page.locator('[data-palette-group="Commands"]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-palette-item')),
  );
}

function toastsWith(text) {
  return page.locator('[data-sonner-toast]', { hasText: text });
}

async function waitToast(text, count = 1) {
  await page.waitForFunction(
    ({ needle, expected }) =>
      [...document.querySelectorAll('[data-sonner-toast]')].filter((node) =>
        node.textContent?.includes(needle),
      ).length === expected,
    { needle: text, expected: count },
    { timeout: 5000 },
  );
  return toastsWith(text).last().innerText();
}

async function invokeMenuItem(label) {
  await h.app.evaluate(({ Menu, BrowserWindow }, wanted) => {
    const find = (items) => {
      for (const item of items) {
        if (item.label === wanted) return item;
        const nested = item.submenu ? find(item.submenu.items) : null;
        if (nested !== null) return nested;
      }
      return null;
    };
    const menu = Menu.getApplicationMenu();
    const item = menu === null ? null : find(menu.items);
    if (item === null) throw new Error(`missing menu item ${wanted}`);
    item.click(item, BrowserWindow.getAllWindows()[0], undefined);
  }, label);
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

describe('command surface parity', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await rm(evidence, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    await mkdir(evidence, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('refuses document commands with one sentence when no document is open', async () => {
    await launch('parity-empty');
    assert.equal((await shellState()).tabs.length, 0, 'launched with no open document');

    await openPalette();
    for (const id of ['cmd-save', 'cmd-new-chapter', 'cmd-undo', 'cmd-zoom-in']) {
      assert.equal(
        await paletteRow(id).getAttribute('aria-disabled'),
        'true',
        `${id} is disabled without a document`,
      );
      assert.equal(await paletteReason(id), NO_DOCUMENT, `${id} states the reason`);
    }
    assert.equal(await paletteReason('cmd-export-pdf'), EXPORT_NO_NOTE);
    // The manifest decision is the row, not a second copy of the rule.
    assert.deepEqual(await commandState('save'), {
      kind: 'disabled',
      reason: NO_DOCUMENT,
    });
    assert.deepEqual(await commandState('export-pdf'), {
      kind: 'disabled',
      reason: EXPORT_NO_NOTE,
    });
    await closePalette();

    // The File menu and the chord report the same sentence, once each.
    await invokeMenuItem('New chapter');
    await waitToast(NO_DOCUMENT, 1);
    assert.equal((await shellState()).tabs.length, 0, 'the menu click changed nothing');
    await page.waitForFunction(
      (needle) => {
        const nodes = [...document.querySelectorAll('[data-sonner-toast]')].filter((node) =>
          node.textContent?.includes(needle),
        );
        const last = nodes.at(-1);
        if (last === undefined) return false;
        return (
          Number(getComputedStyle(last).opacity) > 0.95 &&
          last.getBoundingClientRect().height > 0
        );
      },
      NO_DOCUMENT,
      { timeout: 5000 },
    );
    await page.screenshot({
      path: join(evidence, 'no-document-refusal-toast.png'),
    });
    await page.keyboard.press('Shift+Meta+n');
    await waitToast(NO_DOCUMENT, 2);
    assert.equal((await shellState()).tabs.length, 0, 'the key changed nothing');
    assert.equal((await shellState()).dialog, null);

    // New note still works without a document.
    await page.keyboard.press('Meta+n');
    await page.waitForFunction(
      () => window.__noteforestTest.state().tabs.length === 1,
      undefined,
      { timeout: 10000 },
    );
  });

  it('states one Read-mode reason on the palette, the key and the menu', async () => {
    await launch('parity-read');
    await ui.seedDemo();
    const packagePath = (await shellState()).activeTab;
    await page.keyboard.press('Meta+e');
    await waitView(packagePath, 'continuous', 'read');

    await openPalette();
    assert.equal(await paletteRow('cmd-new-chapter').getAttribute('aria-disabled'), 'true');
    const reason = await paletteReason('cmd-new-chapter');
    assert.equal(reason, READ_MODE, 'the palette row uses the unified sentence');
    // The old short toast sentence is gone from the palette too.
    assert.ok(!String(reason).includes('switch to Edit to make changes.'));
    await page.screenshot({ path: join(evidence, 'read-palette-reason.png') });
    await closePalette();

    const before = await page.evaluate(() => {
      const state = window.__noteforestTest.state();
      return state.runtimes.find((runtime) => runtime.packagePath === state.activeTab);
    });

    await page.keyboard.press('Shift+Meta+n');
    const keyToast = await waitToast(reason, 1);
    assert.ok(keyToast.includes(reason), 'the key reports the same sentence');
    await invokeMenuItem('New chapter');
    const menuToast = await waitToast(reason, 2);
    assert.ok(menuToast.includes(reason), 'the menu reports the same sentence');
    assert.deepEqual(await commandState('new-chapter'), {
      kind: 'disabled',
      reason,
    });

    const after = await page.evaluate(() => {
      const state = window.__noteforestTest.state();
      return state.runtimes.find((runtime) => runtime.packagePath === state.activeTab);
    });
    assert.equal(after.revision, before.revision, 'no refusal mutated the document');
    assert.equal(after.blocks, before.blocks);
    assert.equal(after.chapters, before.chapters);
  });

  it('offers the six guest rows, saves with the key, and refuses export with a sentence', async () => {
    const env = ui.isolated('parity-guest');
    const mdPath = join(env.NOTEFOREST_LIBRARY, 'guest.md');
    await mkdir(env.NOTEFOREST_LIBRARY, { recursive: true });
    await writeFile(mdPath, '# Guest note\n\nA paragraph.\n', 'utf8');
    page = await ui.launch({ ...env, NOTEFOREST_E2E_HIDDEN: '1' });
    await h.setWindowSize(1440, 900);

    const row = page.locator('[data-library-document][data-library-kind="markdown"]', {
      hasText: 'guest.md',
    });
    await row.waitFor({ timeout: 15000 });
    await row.click();
    await page.waitForSelector('.nf-markdown-editor[data-active="true"] [contenteditable="true"]', {
      timeout: 20000,
    });

    await openPalette();
    assert.deepEqual(await commandRowIds(), [
      'cmd-open-markdown',
      'cmd-toggle-interaction-mode',
      'cmd-reveal',
      'cmd-close-tab',
      'cmd-toggle-sidebar',
      'cmd-settings',
    ]);
    for (const id of ['cmd-new-chapter', 'cmd-save', 'cmd-export-pdf', 'cmd-undo']) {
      assert.equal(await paletteRow(id).count(), 0, `${id} is not offered on a guest`);
    }
    assert.deepEqual(await commandState('save'), { kind: 'enabled' });
    assert.deepEqual(await commandState('new-chapter'), { kind: 'hidden' });
    await closePalette();

    // ⌘S saves the guest through the command surface (the file is the proof).
    const paragraph = page.locator('.nf-markdown-editor[data-active="true"] p').first();
    await paragraph.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' GUEST-SAVED');
    await page.keyboard.press('Meta+s');
    await waitUntil(
      async () => (await readFile(mdPath, 'utf8')).includes('GUEST-SAVED'),
      'the guest file carries the saved text',
      10000,
    );

    // ⌘P and the File item refuse with the guest sentence; no sheet opens.
    await page.keyboard.press('Meta+p');
    await waitToast(GUEST_EXPORT, 1);
    assert.equal(await page.locator('[data-export-sheet="true"]').count(), 0);
    await invokeMenuItem('Export PDF…');
    await waitToast(GUEST_EXPORT, 2);
    assert.equal(await page.locator('[data-export-sheet="true"]').count(), 0);
  });

  it('runs one command per keypress, with no time window', async () => {
    await launch('parity-once');
    await ui.seedDemo();
    await ui.seedDemo();
    const tabCount = async () => (await shellState()).tabs.length;
    assert.equal(await tabCount(), 2);

    // One ⌘N adds exactly one tab.
    await page.keyboard.press('Meta+n');
    await page.waitForFunction(
      () => window.__noteforestTest.state().tabs.length === 3,
      undefined,
      { timeout: 10000 },
    );
    // Two presses in quick succession run twice: the 120 ms window is gone.
    await page.keyboard.press('Meta+n');
    await page.keyboard.press('Meta+n');
    await page.waitForFunction(
      () => window.__noteforestTest.state().tabs.length === 5,
      undefined,
      { timeout: 10000 },
    );
    // One ⌘W closes exactly one tab.
    await page.keyboard.press('Meta+w');
    await page.waitForFunction(
      () => window.__noteforestTest.state().tabs.length === 4,
      undefined,
      { timeout: 10000 },
    );
    assert.equal((await shellState()).dialog, null, 'closing an empty draft is silent');

    // One menu click runs once.
    const before = (await shellState()).sidebarCollapsed;
    await invokeMenuItem('Toggle sidebar');
    await settle();
    assert.equal((await shellState()).sidebarCollapsed, !before);
  });

  it('keeps a hidden chord with the local surface and refuses ⇧⌘L without a selection', async () => {
    await launch('parity-hidden');
    await ui.seedDemo();
    const packagePath = (await shellState()).activeTab;
    const selected = (await shellState()).runtimes.find(
      (runtime) => runtime.packagePath === packagePath,
    ).selectedBlockId;
    assert.notEqual(selected, null, 'the seeded note has a selected block');

    // Page Escape clears the selection; back in Continuous Edit the reference
    // verb has nothing to link to (D4).
    await page.keyboard.press('Meta+3');
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.layout === 'page',
      packagePath,
      { timeout: 5000 },
    );
    await page.locator('[data-page-position-input]').click();
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      (path) => {
        const state = window.__noteforestTest.state();
        const runtime = state.runtimes.find((item) => item.packagePath === path);
        return runtime !== undefined && runtime.selectedBlockId === null;
      },
      packagePath,
      { timeout: 5000 },
    );
    await page.keyboard.press('Meta+2');
    await waitView(packagePath, 'continuous', 'edit');
    assert.deepEqual(await commandState('link-reference'), {
      kind: 'disabled',
      reason: NO_SELECTION,
    });

    // D4: the row is disabled and the chord consumes and reports.
    await openPalette();
    assert.equal(await paletteRow('cmd-link-reference').getAttribute('aria-disabled'), 'true');
    assert.equal(await paletteReason('cmd-link-reference'), NO_SELECTION);
    await page.locator('.nf-palette-input').fill('Link as reference');
    await page.screenshot({ path: join(evidence, 'link-reference-disabled-row.png') });
    await closePalette();
    await page.keyboard.press('Shift+Meta+l');
    const toast = await waitToast(NO_SELECTION, 1);
    assert.ok(toast.includes(NO_SELECTION));

    // Esc with no find open belongs to the dialog, not to close-find.
    await page.keyboard.press('Meta+,');
    await page.waitForSelector('[data-settings-dialog="true"]');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });

    // With the bar open, Esc closes the find.
    await page.keyboard.press('Meta+f');
    await page.locator('.nf-find-bar').waitFor();
    await page.keyboard.press('Escape');
    await page.waitForSelector('.nf-find-bar', { state: 'detached' });

    // In Continuous ⌘↑ is block navigation, not a page step.
    assert.deepEqual(await commandState('page-previous'), { kind: 'hidden' });
    const pageBefore = (await activeView()).currentPage ?? 0;
    await page.locator('.nf-editor[data-active="true"] .nf-prosemirror').click();
    await page.keyboard.press('Meta+ArrowUp');
    await settle();
    assert.equal((await activeView()).currentPage ?? 0, pageBefore);

    // ⌃Tab with one tab switches nothing.
    const activeBefore = (await shellState()).activeTab;
    await page.keyboard.press('Control+Tab');
    await settle();
    assert.equal((await shellState()).activeTab, activeBefore);
  });

  it('keeps app commands behind a modal surface and dumps the real menu', async () => {
    await launch('parity-overlay');
    await ui.seedDemo();
    const packagePath = (await shellState()).activeTab;
    const before = {
      sidebar: (await shellState()).sidebarCollapsed,
      layout: (await activeView()).layout,
      tabs: (await shellState()).tabs.length,
    };

    await page.keyboard.press('Meta+,');
    await page.waitForSelector('[data-settings-dialog="true"]');
    await dispatchMenuCommand('toggle-sidebar');
    await page.keyboard.press('Meta+2');
    await page.keyboard.press('Meta+k');
    await page.keyboard.press('Meta+w');
    await page.keyboard.press('Meta+p');
    await settle();
    assert.equal((await shellState()).sidebarCollapsed, before.sidebar, 'no sidebar toggle');
    assert.equal((await activeView()).layout, before.layout, 'no layout switch');
    assert.equal((await shellState()).tabs.length, before.tabs, 'no tab closed');
    assert.equal(await page.locator('.nf-palette').count(), 0, 'no palette behind Settings');
    assert.equal(
      await page.locator('[data-export-sheet="true"]').count(),
      0,
      'no export sheet behind Settings',
    );
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
    assert.equal((await shellState()).activeTab, packagePath);

    // The real application menu: every app label displays its catalogue
    // accelerator and none registers it (the renderer owns every chord).
    const dump = await h.app.evaluate(({ Menu }) => {
      const walk = (items, section) =>
        items.flatMap((item) => {
          const row = {
            section,
            id: item.id ?? null,
            label: item.label,
            role: item.role ?? null,
            type: item.type ?? null,
            accelerator: item.accelerator ?? null,
            registerAccelerator: item.registerAccelerator ?? null,
          };
          const nested =
            item.submenu === undefined || item.submenu === null
              ? []
              : walk(item.submenu.items, section ?? item.label);
          return [row, ...nested];
        });
      const menu = Menu.getApplicationMenu();
      return menu === null ? [] : walk(menu.items, null);
    });
    await writeFile(join(evidence, 'app-menu.json'), `${JSON.stringify(dump, null, 2)}\n`, 'utf8');

    const seen = new Set();
    for (const entry of dump) {
      if (!APP_MENU_LABELS.includes(entry.label)) continue;
      seen.add(entry.label);
      if (entry.accelerator === null) continue;
      assert.equal(entry.registerAccelerator, false, `${entry.label} registers no accelerator`);
    }
    assert.deepEqual([...seen].sort(), [...APP_MENU_LABELS].sort(), 'every app item is present');
    // Fit page and Keyboard shortcuts are the two labelled app items with no key.
    for (const label of ['Fit page', 'Keyboard shortcuts']) {
      assert.equal(dump.find((entry) => entry.label === label)?.accelerator ?? null, null);
    }
    const exportItem = dump.find((entry) => entry.id === 'menu-export-pdf');
    assert.equal(exportItem?.accelerator, 'CmdOrCtrl+P');
  });
});
