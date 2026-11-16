import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { pageDocument, textBlock, writePagePackage } from '../support/page-fixtures.mjs';

/**
 * L1 sidebar surface: Library/Outline tabs, session restore, ARIA keyboard
 * behavior, the single New note path, the Outline empty state, and the
 * product-owner no-left-accent rule. L2 library roots extend this suite.
 */

const tempRoot = artifactsPath('library-surface-temp');
const screenshotDir = artifactsPath('library-surface');
// S1 activity-bar evidence (the same folder the vault suite writes to).
const activityArtifacts = artifactsPath('activity-bar');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

async function launch(name, overrides = {}) {
  page = await ui.launch({ ...ui.isolated(name), ...overrides });
  await h.setWindowSize(1440, 900);
}

async function sidebarState() {
  return page.evaluate(() => window.__noteforestTest.state());
}

/** Replace the guarded native directory picker with a deterministic choice. */
async function mockFolderDialog(folderPath) {
  await h.app.evaluate(({ dialog }, chosen) => {
    globalThis.__nfFolderDialogCalls = [];
    dialog.showOpenDialog = async (_window, options) => {
      globalThis.__nfFolderDialogCalls.push(structuredClone(options));
      return { canceled: false, filePaths: [chosen] };
    };
  }, folderPath);
}

async function openSwitcher() {
  await page.locator('[data-library-switcher]').click();
  await page.locator('.nf-menu').waitFor();
}

async function chooseMenu(label) {
  await page.getByRole('menuitem', { name: label, exact: true }).click();
  await page.locator('.nf-menu').waitFor({ state: 'detached' });
}

async function waitLibraryPath(expected) {
  await page.waitForFunction(
    (path) => window.__noteforestTest.state().library?.path === path,
    expected,
    { timeout: 15000 },
  );
}

async function waitTabPath(from, to) {
  await page.waitForFunction(
    ({ from: oldPath, to: newPath }) =>
      window.__noteforestTest.state().tabs.some((tab) => tab.packagePath === newPath) &&
      !window.__noteforestTest.state().tabs.some((tab) => tab.packagePath === oldPath),
    { from, to },
    { timeout: 15000 },
  );
}

async function librariesFile(env) {
  return JSON.parse(
    await readFile(join(env.NOTEFOREST_APP_SUPPORT, 'libraries.json'), 'utf8'),
  );
}

describe('Library surface', () => {
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

  it('shows Library by default with a vertical section tablist, one New note, and a persisted Outline tab', async () => {
    const env = ui.isolated('tabs');
    await launch('tabs', env);
    await ui.seedDemo();

    // Activity bar: a vertical tablist + two tabs, Library selected by default.
    assert.equal(await page.locator('[data-sidebar-tabs][role="tablist"]').count(), 1);
    assert.equal(
      await page.locator('[data-sidebar-tabs]').getAttribute('aria-orientation'),
      'vertical',
    );
    // Five activity-bar entries: Library, Outline, Health, Search, Breaks.
    assert.equal(await page.locator('[data-sidebar-tabs] [role="tab"]').count(), 5);
    assert.equal(
      await page.locator('.nf-sidebar-tabs').count(),
      0,
      'the header segmented control is gone',
    );
    assert.equal(
      await page.locator('[data-sidebar-tab="library"]').getAttribute('aria-selected'),
      'true',
    );
    assert.equal(
      await page.locator('[data-sidebar-tab="library"]').getAttribute('aria-label'),
      'Library',
    );
    assert.equal(
      await page.locator('[data-sidebar-tab="outline"]').getAttribute('aria-selected'),
      'false',
    );
    assert.equal(
      await page.locator('[data-sidebar-tab="library"]').getAttribute('aria-controls'),
      'nf-sidebar-panel',
    );
    assert.equal(await page.locator('#nf-sidebar-panel').getAttribute('role'), 'tabpanel');
    assert.equal(
      await page.locator('#nf-sidebar-panel').getAttribute('aria-labelledby'),
      'nf-sidebar-tab-library',
    );
    assert.equal(
      await page.locator('[data-sidebar-panel="library"]').count(),
      1,
      'the Library panel is the default tab panel',
    );

    // Library header: name, count, one New note. The global header + is gone.
    const libraryName = await page.locator('[data-library-name]').innerText();
    assert.ok(libraryName.length > 0, 'the library name is visible');
    assert.match(await page.locator('[data-library-count]').innerText(), /^\d+$/);
    assert.equal(await page.locator('.nf-sidebar [aria-label="New note"]').count(), 1);
    assert.equal(
      await page.locator('.nf-sidebar-head [aria-label="New note"]').count(),
      0,
      'the global header + is gone',
    );

    // The one + opens an in-memory draft: no folder, recent, or lock.
    const before = await sidebarState();
    const activePath = before.library?.path ?? '';
    assert.ok(activePath.length > 0);
    const tabsBefore = before.tabs.length;
    const libraryCountBefore = before.library?.documents.length ?? 0;
    await page.locator('[data-library-new="true"]').click();
    await page.waitForFunction(
      (count) => window.__noteforestTest.state().tabs.length === count + 1,
      tabsBefore,
      { timeout: 15000 },
    );
    const draftKey = await page.evaluate(
      () => window.__noteforestTest.state().tabs.at(-1)?.packagePath ?? null,
    );
    assert.match(draftKey ?? '', /^draft:/, 'the new tab is a draft key');
    assert.equal(
      (await sidebarState()).library?.documents.length,
      libraryCountBefore,
      'the draft is not listed in the library yet',
    );

    // The first keystroke materializes it inside the active library; the tab
    // path changes without remounting the editor.
    await page.locator('.nf-editor[data-active="true"] .nf-block-prose').first().click();
    await page.keyboard.type('Draft text');
    await page.waitForFunction(
      (key) => !window.__noteforestTest.state().tabs.some((tab) => tab.packagePath === key),
      draftKey,
      { timeout: 15000 },
    );
    const created = await page.evaluate(
      () => window.__noteforestTest.state().tabs.at(-1)?.packagePath ?? null,
    );
    assert.ok(created !== null && created.startsWith(activePath), 'the note is in the active library');
    assert.equal((await stat(created)).isDirectory(), true, 'the package folder exists');
    await h.waitSaved();
    await page.waitForFunction(
      (count) => window.__noteforestTest.state().library?.documents.length === count,
      libraryCountBefore + 1,
      { timeout: 15000 },
    );
    // A selected Continuous block is the full-card ring, never a left accent bar.
    await page
      .locator('.nf-editor[data-active="true"] [data-block-card] .nf-block-prose')
      .first()
      .click();
    const selectedCard = page
      .locator('.nf-editor[data-active="true"] .nf-block-body[data-active="true"]')
      .first();
    await selectedCard.waitFor();
    const cardStyle = await selectedCard.evaluate((element) => {
      const style = getComputedStyle(element);
      return { border: style.borderInlineStartWidth, shadow: style.boxShadow };
    });
    assert.equal(cardStyle.border, '0px', 'the selected Continuous block has no left border');
    assert.match(cardStyle.shadow, /0px 0px 0px 1px inset/, 'selection is the full-card ring');
    assert.doesNotMatch(cardStyle.shadow, /(?:2|3|4)px 0px/, 'selection has no left stripe');
    await page.screenshot({ path: join(screenshotDir, 'library-tab.png') });
    await mkdir(activityArtifacts, { recursive: true });
    await page.screenshot({ path: join(activityArtifacts, 'expanded-library.png') });

    // Arrow keys move selection and focus together, automatically activating.
    await page.locator('[data-sidebar-tab="library"]').focus();
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(
      () => document.querySelector('[data-sidebar-tab="outline"]')?.getAttribute('aria-selected') === 'true',
      undefined,
      { timeout: 5000 },
    );
    assert.equal(
      await page.evaluate(() => document.activeElement?.getAttribute('data-sidebar-tab')),
      'outline',
      'focus follows the arrow key',
    );
    assert.equal(
      await page.locator('#nf-sidebar-panel').getAttribute('aria-labelledby'),
      'nf-sidebar-tab-outline',
    );
    assert.equal(await page.locator('[data-sidebar-panel="outline"]').count(), 1);
    assert.equal(
      await page.locator('[data-sidebar-tab="library"]').getAttribute('tabindex'),
      '-1',
      'the roving tabindex leaves the inactive section out of the tab order',
    );
    assert.equal(
      await page.locator('[data-sidebar-tab="outline"]').getAttribute('tabindex'),
      '0',
    );
    const focusRing = await page
      .locator('[data-sidebar-tab="outline"]')
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return { width: style.outlineWidth, style: style.outlineStyle };
      });
    assert.equal(focusRing.width, '2px', 'the focused section has a visible ring');
    assert.equal(focusRing.style, 'solid');
    // Home/End reach both ends (Breaks is the fifth entry), and arrows wrap.
    await page.keyboard.press('Home');
    await page.waitForFunction(
      () => document.querySelector('[data-sidebar-tab="library"]')?.getAttribute('aria-selected') === 'true',
      undefined,
      { timeout: 5000 },
    );
    await page.keyboard.press('End');
    await page.waitForFunction(
      () => document.querySelector('[data-sidebar-tab="breaks"]')?.getAttribute('aria-selected') === 'true',
      undefined,
      { timeout: 5000 },
    );
    assert.equal(await page.locator('[data-sidebar-panel="breaks"]').count(), 1);
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(
      () => document.querySelector('[data-sidebar-tab="library"]')?.getAttribute('aria-selected') === 'true',
      undefined,
      { timeout: 5000 },
    );
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(
      () => document.querySelector('[data-sidebar-tab="breaks"]')?.getAttribute('aria-selected') === 'true',
      undefined,
      { timeout: 5000 },
    );
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(
      () => document.querySelector('[data-sidebar-tab="search"]')?.getAttribute('aria-selected') === 'true',
      undefined,
      { timeout: 5000 },
    );
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(
      () => document.querySelector('[data-sidebar-tab="health"]')?.getAttribute('aria-selected') === 'true',
      undefined,
      { timeout: 5000 },
    );
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(
      () => document.querySelector('[data-sidebar-tab="outline"]')?.getAttribute('aria-selected') === 'true',
      undefined,
      { timeout: 5000 },
    );
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(
      () => document.querySelector('[data-sidebar-tab="library"]')?.getAttribute('aria-selected') === 'true',
      undefined,
      { timeout: 5000 },
    );
    assert.equal(
      await page.evaluate(() => document.activeElement?.getAttribute('data-sidebar-tab')),
      'library',
      'the roving focus stays inside the tablist',
    );
    // Horizontal arrows are not part of a vertical tablist and change nothing.
    await page.keyboard.press('ArrowRight');
    assert.equal(
      await page.locator('[data-sidebar-tab="outline"]').getAttribute('aria-selected'),
      'false',
      'ArrowRight does not switch the active section',
    );

    // Outline shows the active document tree; opening another document does
    // not force a tab switch.
    await page.keyboard.press('Meta+1');
    await page.waitForFunction(
      () => window.__noteforestTest.state().activeTab === window.__noteforestTest.state().tabs[0]?.packagePath,
      undefined,
      { timeout: 10000 },
    );
    await page.locator('[data-sidebar-tab="outline"]').click();
    await page.waitForSelector('[data-sidebar-panel="outline"] .nf-tree-row[data-block-id]');
    const parentId = await page.evaluate(() => {
      const current = window.__noteforestTest.structure();
      return (
        Object.values(current.blocks).find((block) =>
          JSON.stringify(block.content).includes('Take the symmetric matrix below'),
        )?.id ?? null
      );
    });
    assert.ok(parentId !== null, 'the demo parent block is active');
    const anchored = await ui.createAnchoredChild(parentId, 'symmetric');
    await page.waitForSelector(`.nf-tree-anchor-row[data-block-id="${anchored.blockId}"]`);
    const anchorRow = page.locator(`.nf-tree-anchor-row[data-block-id="${anchored.blockId}"]`);
    assert.equal(
      await anchorRow.evaluate((element) => getComputedStyle(element).borderInlineStartWidth),
      '0px',
      'the anchor row has no left accent bar',
    );
    await anchorRow.click();
    await page.waitForSelector('.nf-tree-anchor-row[data-anchor-selected="true"]');
    const shadow = await page
      .locator('.nf-tree-anchor-row[data-anchor-selected="true"]')
      .evaluate((element) => getComputedStyle(element).boxShadow);
    assert.match(shadow, /0px 0px 0px 1px inset/, 'selection is the full-row ring');
    assert.doesNotMatch(shadow, /2px 0px/, 'selection has no left stripe');
    await page.screenshot({ path: join(screenshotDir, 'outline-tab.png') });
    await page.screenshot({ path: join(activityArtifacts, 'expanded-outline.png') });

    await page.evaluate(() => window.__noteforestTest.seed('performance'));
    await page.waitForFunction(
      () => window.__noteforestTest.state().tabs.length >= 3,
      undefined,
      { timeout: 20000 },
    );
    assert.equal((await sidebarState()).sidebarTab, 'outline', 'opening a document keeps the tab');

    // The active tab persists across a relaunch.
    await h.flushSession();
    await h.quit();
    page = await ui.launch(env);
    await h.setWindowSize(1440, 900);
    await page.waitForSelector('[data-sidebar-tab="outline"][aria-selected="true"]');
    assert.equal(
      await page.locator('[data-sidebar-panel="outline"]').count(),
      1,
      'the Outline tab is restored on launch',
    );
  });

  it('shows the Outline empty state and keeps sidebar collapse unchanged', async () => {
    await launch('empty');
    await page.locator('[data-sidebar-tab="outline"]').click();
    await page.waitForSelector('[data-outline-empty="true"]');
    assert.equal(
      (await page.locator('[data-outline-empty]').innerText()).trim(),
      'Open a note to see its outline.',
    );
    await page.screenshot({ path: join(screenshotDir, 'outline-empty.png') });

    // Health is a real section in S2: the icon selects it and the panel shows
    // its no-document state (no sheet, no modal).
    await page.locator('[data-sidebar-tab="health"]').click();
    await page.waitForSelector('[data-sidebar-panel="health"]');
    assert.equal(
      await page.locator('[data-health-no-document="true"]').count(),
      1,
      'the section shows its no-document state',
    );
    assert.equal(await page.locator('[data-health-dialog="true"]').count(), 0);
    assert.equal(
      (await sidebarState()).sidebarTab,
      'health',
      'the Health icon changes the active section',
    );
    await page.locator('[data-sidebar-tab="outline"]').click();
    await page.waitForSelector('[data-sidebar-panel="outline"]');
    assert.equal(
      await page.locator('[data-sidebar-tab="outline"]').getAttribute('aria-selected'),
      'true',
    );

    // Collapse/expand keeps the rail contract and the selected tab.
    await page.keyboard.press('Meta+\\');
    await page.waitForSelector('.nf-sidebar-rail');
    assert.equal(
      await page.locator('.nf-sidebar-rail [data-activity-bar="true"]').count(),
      1,
      'the bar stays in the collapsed card',
    );
    assert.equal(
      await page.locator('[data-sidebar-tab="outline"][aria-selected="true"]').count(),
      1,
      'the collapsed bar keeps the active section',
    );
    assert.equal(
      await page.locator('.nf-sidebar-rail [data-activity-settings="true"]').count(),
      1,
    );
    // Evidence: the collapsed rail keeps the bar, the divider, and the gear.
    await mkdir(activityArtifacts, { recursive: true });
    await page.screenshot({ path: join(activityArtifacts, 'collapsed-rail-settings-divider.png') });
    // Clicking a section while collapsed expands the sidebar to that section.
    await page.locator('[data-sidebar-tab="library"]').click();
    await page.waitForSelector('[data-sidebar-panel="library"]');
    assert.equal(
      (await sidebarState()).sidebarCollapsed,
      false,
      'a section click expands the sidebar',
    );
    // Collapse again and expand from the chevron: the section chosen while
    // collapsed is the one that comes back.
    await page.locator('[aria-label="Collapse sidebar"]').click();
    await page.waitForSelector('.nf-sidebar-rail');
    await page.locator('[data-sidebar-expand="true"]').click();
    await page.waitForSelector('[data-sidebar-tab="library"][aria-selected="true"]');
    assert.equal(
      (await sidebarState()).sidebarTab,
      'library',
      'the section clicked while collapsed is the active one',
    );
  });

  it('opens a folder as a library, switches recents, keeps tabs, and follows the active tab', async () => {
    const env = ui.isolated('roots');
    await launch('roots', env);
    await ui.seedDemo();
    const libraryA = (await sidebarState()).library.path;
    const libraryB = join(tempRoot, 'roots-library-b');
    await mkdir(libraryB, { recursive: true });
    const bPackage = await writePagePackage(
      libraryB,
      'b-note',
      pageDocument({
        id: 'library-surface-b',
        title: 'B note',
        chapterTitle: 'B chapter',
        blocks: [textBlock('b1', 'B1', 'Text from library B.')],
      }),
    );

    await openSwitcher();
    assert.match(await page.locator('.nf-menu').innerText(), /Open folder as library/);
    assert.equal(
      await page
        .locator(`[data-menu-entry="library-switch-${libraryA}"] .nf-menu-check svg`)
        .count(),
      1,
      'the active library has a check',
    );
    assert.equal(
      await page.getByRole('menuitem', { name: 'Remove from recents', exact: true }).count(),
      0,
      'the dead switcher Remove from Recent item is gone (Data & About owns it)',
    );
    await page.screenshot({ path: join(screenshotDir, 'library-switcher.png') });
    // Data & About keeps the real recent-library removal.
    await page.keyboard.press('Escape');
    await page.locator('.nf-menu').waitFor({ state: 'detached' });
    await page.keyboard.press('Meta+,');
    await page.waitForSelector('[data-settings-dialog="true"]');
    await page.locator('[data-settings-nav="data"]').click();
    assert.ok(
      (await page.locator('[data-settings-library-remove]').count()) > 0,
      'Data & About still offers Remove from recents',
    );
    await page.getByRole('button', { name: 'Done' }).click();
    await openSwitcher();
    await mockFolderDialog(libraryB);
    await chooseMenu('Open folder as library…');
    await waitLibraryPath(libraryB);
    await page.waitForFunction(
      () => window.__noteforestTest.state().library?.documents.some((document) => document.title === 'B note'),
      undefined,
      { timeout: 15000 },
    );
    assert.equal((await sidebarState()).tabs.length, 1, 'the old library tab stays open');
    assert.equal((await librariesFile(env)).libraries[0].path, libraryB);

    // Open the B document; then switch back to A through the switcher.
    await page.locator('[data-library-document]', { hasText: 'B note' }).click();
    await page.waitForFunction(
      () => window.__noteforestTest.state().tabs.length === 2,
      undefined,
      { timeout: 15000 },
    );
    await h.waitSaved();
    await openSwitcher();
    await chooseMenu('roots-library');
    await waitLibraryPath(libraryA);
    assert.equal((await sidebarState()).tabs.length, 2, 'open tabs survive a library switch');

    // A document from another known library activates its library (LD-03).
    await page.evaluate((path) => window.__noteforestTest.openPath(path), bPackage);
    await waitLibraryPath(libraryB);
    const afterB = (await sidebarState()).library.libraries;
    assert.equal(afterB[0]?.path, libraryB);
    assert.equal(afterB[0]?.active, true);

    // Activating the demo tab makes library A active again.
    await page.locator('.nf-tab', { hasText: 'Linear algebra' }).click();
    await waitLibraryPath(libraryA);
    await page.screenshot({ path: join(screenshotDir, 'library-tab-recents.png') });

    // Launch restores the session's active library, not the active tab's
    // library: switch back to A while the B tab stays active, then relaunch.
    await page.locator('.nf-tab', { hasText: 'B note' }).click();
    await waitLibraryPath(libraryB);
    await openSwitcher();
    await chooseMenu('roots-library');
    await waitLibraryPath(libraryA);
    await h.flushSession();
    await h.quit();
    page = await ui.launch(env);
    await h.setWindowSize(1440, 900);
    await waitLibraryPath(libraryA);
    assert.equal(
      await page.evaluate(() => window.__noteforestTest.state().activeTab),
      bPackage,
      'the session active library wins on launch while the B tab stays active',
    );
  });

  it('creates a new library and rejects package and nested roots', async () => {
    await launch('create');
    const parent = join(tempRoot, 'new-library-parent');
    await mkdir(parent, { recursive: true });

    await openSwitcher();
    await chooseMenu('New library…');
    await page.waitForSelector('[data-new-library-dialog]');
    assert.equal(await page.locator('[data-new-library-name]').inputValue(), 'NoteForest');
    assert.equal(await page.locator('[data-new-library-create]').isDisabled(), true);
    await page.screenshot({ path: join(screenshotDir, 'new-library.png') });

    await mockFolderDialog(parent);
    await page.locator('[data-new-library-choose-parent]').click();
    await page.waitForFunction(
      (chosen) =>
        document.querySelector('[data-new-library-parent]')?.textContent?.includes(chosen) === true,
      parent,
      { timeout: 15000 },
    );
    await page.locator('[data-new-library-name]').fill('Study');
    await page.locator('[data-new-library-create]').click();
    await page.waitForSelector('[data-new-library-dialog]', { state: 'detached' });
    const study = join(parent, 'Study');
    await waitLibraryPath(study);
    assert.equal((await stat(study)).isDirectory(), true);

    // A package root is rejected with a clear message and no switch.
    const packageRoot = join(tempRoot, 'package-root');
    await mkdir(packageRoot, { recursive: true });
    await writeFile(join(packageRoot, 'document.json'), '{}');
    await openSwitcher();
    await mockFolderDialog(packageRoot);
    await chooseMenu('Open folder as library…');
    await page.getByText(/This is a document, not a library/).waitFor({ timeout: 15000 });
    assert.equal((await sidebarState()).library.path, study);

    // A folder inside a known library is a nested library and is rejected.
    const nested = join(study, 'nested');
    await mkdir(nested, { recursive: true });
    await openSwitcher();
    await mockFolderDialog(nested);
    await chooseMenu('Open folder as library…');
    await page.getByText(/That folder is inside a library/).waitFor({ timeout: 15000 });
    assert.equal((await sidebarState()).library.path, study);
  });

  it('blocks a library switch when the open document flush fails', async () => {
    const env = ui.isolated('flush');
    await launch('flush', env);
    await ui.seedDemo();
    const libraryA = (await sidebarState()).library.path;
    const demoPackage = (await sidebarState()).tabs[0].packagePath;
    const libraryB = join(tempRoot, 'flush-library-b');
    await mkdir(libraryB, { recursive: true });

    // Deterministic save failure: the file changes on disk after it was opened,
    // so the flush before the switch must refuse to overwrite it.
    const original = await readFile(join(demoPackage, 'document.json'), 'utf8');
    const changed = JSON.parse(original);
    changed.title = 'Changed outside NoteForest';
    await writeFile(join(demoPackage, 'document.json'), `${JSON.stringify(changed, null, 2)}\n`);

    await openSwitcher();
    await mockFolderDialog(libraryB);
    await chooseMenu('Open folder as library…');
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('[data-sonner-toast]')].some((element) =>
          element.textContent?.includes('changed on disk'),
        ),
      undefined,
      { timeout: 15000 },
    );
    assert.equal(
      (await sidebarState()).library.path,
      libraryA,
      'the active library did not change after the failed flush',
    );
    assert.equal(
      (await librariesFile(env)).libraries.some((entry) => entry.path === libraryB),
      false,
      'the refused library was not activated or recorded',
    );

    // Restore the fixture so the quit path is clean: discard this tab without
    // writing, then quit with no dirty documents.
    await writeFile(join(demoPackage, 'document.json'), original);
    await page.evaluate((path) => window.__noteforestTest.closePath(path), demoPackage);
  });

  it('shows the missing state, locates a moved library, and reconciles the open tab', async () => {
    const env = ui.isolated('missing');
    await launch('missing', env);
    await ui.seedDemo();
    const libraryA = (await sidebarState()).library.path;
    const demoPackage = (await sidebarState()).tabs[0].packagePath;
    await h.flushSession();
    await h.quit();

    const moved = join(tempRoot, 'missing-library-moved');
    await rename(libraryA, moved);
    page = await ui.launch(env);
    await h.setWindowSize(1440, 900);
    await page.waitForSelector('[data-library-missing="true"]');
    assert.match(await page.locator('[data-library-missing]').innerText(), /Library not found/);
    assert.equal(await page.locator('[data-library-missing-path]').innerText(), libraryA);
    await page.screenshot({ path: join(screenshotDir, 'library-missing.png') });

    // The Outline tab still renders while the library is missing.
    await page.locator('[data-sidebar-tab="outline"]').click();
    await page.waitForSelector('[data-sidebar-panel="outline"]');
    await page.locator('[data-sidebar-tab="library"]').click();

    await mockFolderDialog(moved);
    await page.locator('[data-library-locate]').click();
    await waitLibraryPath(moved);
    const movedPackage = join(moved, demoPackage.split('/').at(-1));
    await waitTabPath(demoPackage, movedPackage);
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]', {
      timeout: 15000,
    });
    assert.equal((await sidebarState()).library.missing, false);
  });

  it('removes recents from Data and shows the no-library state without recreating', async () => {
    const env = ui.isolated('data');
    await launch('data', env);
    const libraryA = (await sidebarState()).library.path;
    const libraryB = join(tempRoot, 'data-library-b');
    await mkdir(libraryB, { recursive: true });

    await openSwitcher();
    await mockFolderDialog(libraryB);
    await chooseMenu('Open folder as library…');
    await waitLibraryPath(libraryB);
    await openSwitcher();
    await chooseMenu('data-library');
    await waitLibraryPath(libraryA);

    await page.keyboard.press('Meta+,');
    await page.waitForSelector('[data-settings-dialog="true"]');
    await page.locator('[data-settings-nav="data"]').click();
    const bRow = page.locator(`[data-settings-library-row="${libraryB}"]`);
    assert.equal(await bRow.count(), 1);
    const aRow = page.locator(`[data-settings-library-row="${libraryA}"]`);
    assert.equal(
      await aRow.locator('[data-settings-library-remove]').isDisabled(),
      true,
      'the active library cannot be removed from Data',
    );
    assert.equal(await page.locator('[data-settings-library-open]').count(), 1);
    assert.equal(
      await bRow.locator('[data-settings-library-remove]').isDisabled(),
      false,
      'a non-active recent can be removed',
    );
    await bRow.locator('[data-settings-library-remove]').click();
    await page.waitForFunction(
      (path) =>
        !window.__noteforestTest.state().library?.libraries.some((entry) => entry.path === path),
      libraryB,
      { timeout: 15000 },
    );
    assert.equal((await stat(libraryB)).isDirectory(), true, 'removing a recent never deletes files');
    assert.equal((await sidebarState()).library.path, libraryA);
    await page.screenshot({ path: join(screenshotDir, 'data-libraries.png') });
    await page.getByRole('button', { name: 'Done' }).click();

    // Delete the active folder externally, refresh into the missing state, then
    // remove it from recents: the empty library state must not recreate it.
    await rm(libraryA, { recursive: true, force: true });
    await openSwitcher();
    await chooseMenu('Refresh');
    await page.waitForSelector('[data-library-missing="true"]');
    await page.locator('[data-library-remove]').click();
    await page.waitForSelector('[data-library-none="true"]');
    assert.equal((await sidebarState()).library.path, '');
    await assert.rejects(stat(libraryA));
    await page.screenshot({ path: join(screenshotDir, 'no-library.png') });
  });
});
