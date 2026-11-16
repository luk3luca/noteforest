import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import {
  pageDocument,
  textBlock,
  writePagePackage,
} from '../support/page-fixtures.mjs';

/**
 * MB1 manual breaks (`docs/design/manual-breaks.md`).
 *
 * The paginator already honoured a hint; this suite covers what was missing:
 * the `Start on a new page` control with its four states (note start, chapter
 * start, not a row leader, enabled), the `Breaks` list with live page numbers,
 * the broken hint that keeps its row, remove, the empty state, and the Page
 * path (right-click a card in Page Edit).
 *
 * The row-leader rule is the F11 decision: a break is a cut at a row's y, so a
 * child placed beside its parent (and a mode A callout) cannot carry one. The
 * item is disabled with a one-line reason instead of silently ignored.
 */

const READ_MODE_TITLE = 'Read mode — switch to Edit to make changes';
const tempRoot = artifactsPath('manual-breaks-ui');
const screenshotDir = artifactsPath('manual-breaks');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
const { isolated } = ui;
let page;

async function launch(env) {
  page = await ui.launch(env);
  await h.setWindowSize(1440, 900);
}

async function shot(name, selector) {
  await page.locator(selector).screenshot({
    path: resolve(screenshotDir, name),
    scale: 'css',
  });
}

async function openPackage(packagePath) {
  const opened = await page.evaluate(
    (path) => window.__noteforestTest.openPath(path),
    packagePath,
  );
  assert.equal(opened, true, 'the package opens');
  await page.waitForFunction(
    (path) => window.__noteforestTest.state().activeTab === path,
    packagePath,
    { timeout: 15000 },
  );
  await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
  await h.waitSaved();
}

async function breakItem() {
  const item = page.locator('[data-menu-entry="manual-break"]');
  await item.waitFor({ state: 'visible' });
  return item;
}

async function menuText(item) {
  return (await item.innerText()).replace(/\s+/g, ' ').trim();
}

async function menuDisabled(item) {
  return (await item.getAttribute('aria-disabled')) === 'true';
}

async function closeMenu() {
  await page.keyboard.press('Escape');
  await page.locator('.nf-menu').waitFor({ state: 'detached' });
}

/** Open a block menu without moving the ProseMirror selection. */
async function openMenu(blockId) {
  await ui.openBlockMenuFromGutter(blockId);
  return breakItem();
}

async function storedIds() {
  return (await ui.structure()).manualBreakBeforeBlockIds;
}

async function setHints(packagePath, ids) {
  await page.evaluate(
    ({ path, manualBreakBeforeBlockIds }) =>
      window.__noteforestTest.setPageSettingsOverride(path, {
        manualBreakBeforeBlockIds,
      }),
    { path: packagePath, manualBreakBeforeBlockIds: ids },
  );
}

async function showBreaks() {
  await page.locator('[data-sidebar-tab="breaks"]').click();
  await page.waitForSelector('[data-sidebar-panel="breaks"]');
}

async function waitBreakRow(blockId, options = {}) {
  await page.waitForFunction(
    ({ id, page: expectedPage, broken }) => {
      const row = document.querySelector(`[data-break-row="${id}"]`);
      if (row === null) return false;
      if (broken === true && row.getAttribute('data-break-broken') !== 'true') return false;
      if (broken === false && row.getAttribute('data-break-broken') === 'true') return false;
      if (expectedPage === undefined) return row.querySelector('[data-break-page]') !== null;
      return row.querySelector('[data-break-page]')?.getAttribute('data-break-page') === String(expectedPage);
    },
    { id: blockId, page: options.page, broken: options.broken },
    { timeout: 15000 },
  );
  return page.locator(`[data-break-row="${blockId}"]`);
}

/** Two chapters, a beside child, and a labelled top-level row. */
async function writeContinuousPackage(libraryPath) {
  const document = pageDocument({
    id: 'manual-breaks-continuous',
    title: 'Manual breaks',
    chapterTitle: 'Eigenvalues',
    blocks: [
      textBlock('intro', 'Introduction', 'The note starts here.'),
      textBlock('method', 'Method', 'A short parent block.'),
      textBlock('side', 'Side child', 'Beside its parent.'),
      textBlock('third', 'Third', 'Another top-level block.'),
    ],
    branches: [
      { id: 'branch-side', sourceBlockId: 'method', targetBlockId: 'side', role: 'primary' },
    ],
  });
  document.chapters.push({
    id: 'chapter-2',
    title: 'Second chapter',
    topLevelBlockIds: ['next'],
  });
  document.blocks['next'] = textBlock(
    'next',
    'Next chapter block',
    'The second chapter starts here.',
  );
  return writePagePackage(libraryPath, 'Manual breaks', document);
}

/** Enough rows that the A4 content height needs several pages. */
async function writeLongPackage(libraryPath) {
  const blocks = Array.from({ length: 24 }, (_, index) =>
    textBlock(
      `b${index + 1}`,
      `Block ${index + 1}`,
      `Block ${index + 1} keeps a short row so the page model breaks between blocks.`,
    ),
  );
  return writePagePackage(
    libraryPath,
    'Long page note',
    pageDocument({
      id: 'manual-breaks-long',
      title: 'Long page note',
      chapterTitle: 'Long',
      blocks,
    }),
  );
}

async function pageCount() {
  return page
    .locator('.nf-page-view')
    .evaluate((element) => Number(element.getAttribute('data-page-count') ?? '0'));
}

async function waitPageCountAbove(minimum) {
  await page.waitForFunction(
    (expected) => {
      const view = document.querySelector('.nf-page-view');
      if (view === null) return false;
      return Number(view.getAttribute('data-page-count') ?? '0') > expected;
    },
    minimum,
    { timeout: 15000 },
  );
}

describe('Manual breaks', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(screenshotDir, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('offers the break only to a row leader and keeps the hint across a reload', async () => {
    const env = isolated('menu');
    const fixture = await writeContinuousPackage(env.NOTEFOREST_LIBRARY);
    await launch(env);
    await openPackage(fixture);

    // A top-level row leader: enabled and unchecked.
    let item = await openMenu('method');
    assert.equal(await menuDisabled(item), false, 'a row leader can start a page');
    assert.equal(await item.getAttribute('data-menu-checked'), null);
    assert.match(await menuText(item), /Start on a new page/);
    assert.doesNotMatch(await menuText(item), /Only the block|chapter|already starts/);
    await shot('menu-enabled.png', '.nf-menu');

    // Toggling writes the per-document override only; the global default stays [].
    await item.click();
    await page.locator('.nf-menu').waitFor({ state: 'detached' });
    await page.waitForFunction(
      () => window.__noteforestTest.structure().manualBreakBeforeBlockIds.length === 1,
    );
    assert.deepEqual(await storedIds(), ['method']);
    const settings = await page.evaluate(() => window.__noteforestTest.settings());
    assert.deepEqual(
      settings.app.page.manualBreakBeforeBlockIds,
      [],
      'the global break list is never written',
    );
    const entry = settings.documentSettings.find(
      (candidate) => candidate.packagePath === fixture,
    );
    assert.deepEqual(entry?.page?.manualBreakBeforeBlockIds, ['method']);

    // The check state is the stored hint.
    item = await openMenu('method');
    assert.equal(await item.getAttribute('data-menu-checked'), 'true');
    assert.match(await menuText(item), /Start on a new page/);
    await shot('menu-checked.png', '.nf-menu');
    await closeMenu();

    // First block of the note.
    item = await openMenu('intro');
    assert.equal(await menuDisabled(item), true);
    assert.match(await menuText(item), /The note already starts here\./);
    await closeMenu();

    // First block of a later chapter.
    item = await openMenu('next');
    assert.equal(await menuDisabled(item), true);
    assert.match(await menuText(item), /A chapter always starts a new page\./);
    await closeMenu();

    // A child placed beside its parent shares the row: not offered (F11).
    item = await openMenu('side');
    assert.equal(await menuDisabled(item), true);
    assert.match(await menuText(item), /Only the block that starts a row can begin a page\./);
    await shot('menu-disabled-row.png', '.nf-menu');
    await closeMenu();

    // An anchored callout in the lane is the same case: it can sit at the
    // parent's y in Page mode A, so Continuous never offers the item on it.
    const callout = await ui.createAnchoredChild('intro', 'note');
    await page.waitForSelector(`[data-block-card="${callout.blockId}"]`);
    item = await openMenu(callout.blockId);
    assert.equal(await menuDisabled(item), true);
    assert.match(await menuText(item), /Only the block that starts a row can begin a page\./);
    await closeMenu();

    // Read mode: the item stays in the menu, disabled, with the one Read reason.
    await page.locator('[data-block-card="method"] [data-block-prose], [data-block-card="method"] .nf-block-prose').first().click();
    await ui.ensureInteractionMode('read');
    await ui.showOutline();
    await page.locator('.nf-tree-row[data-block-id="method"]').click({ button: 'right' });
    item = await breakItem();
    assert.equal(await menuDisabled(item), true);
    assert.match(await menuText(item), new RegExp(READ_MODE_TITLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await closeMenu();
    await ui.ensureInteractionMode('edit');

    // A real restart re-reads the durable per-document settings.
    await h.quit();
    await launch(env);
    await page.waitForFunction(
      (path) => window.__noteforestTest.state().activeTab === path,
      fixture,
      { timeout: 15000 },
    );
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    item = await openMenu('method');
    assert.equal(await item.getAttribute('data-menu-checked'), 'true', 'the hint survived the reload');
    assert.notEqual(await item.getAttribute('aria-disabled'), 'true');
    await closeMenu();
  });

  it('lists every hint in document order, navigates, warns, and removes', async () => {
    const env = isolated('list');
    const fixture = await writeContinuousPackage(env.NOTEFOREST_LIBRARY);
    await launch(env);
    await openPackage(fixture);

    // `method` is a row leader (healthy); `side` sits beside its parent, which a
    // density change can produce from a hint created earlier. Both stay listed.
    await setHints(fixture, ['side', 'method']);
    await page.waitForFunction(
      () => window.__noteforestTest.structure().manualBreakBeforeBlockIds.length === 2,
    );
    await showBreaks();

    const methodRow = await waitBreakRow('method', { broken: false, page: 2 });
    const sideRow = await waitBreakRow('side', { broken: true, page: 2 });
    assert.equal(
      await page.locator('[data-breaks-count]').innerText(),
      '2',
      'the header counts stored hints, broken ones included',
    );
    const rows = await page
      .locator('[data-break-row]')
      .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-break-row')));
    assert.deepEqual(rows, ['method', 'side'], 'document order, not array order');

    // Healthy row: Page N · title, no second line. A hint makes its block start
    // the next page, so `method` is on page 2.
    assert.match(await methodRow.innerText(), /Page 2 · Method/);
    assert.doesNotMatch(await methodRow.innerText(), /Can.t be honoured/);
    assert.equal(await methodRow.getAttribute('data-break-broken'), null);

    // Broken row: one line of reason, the paginator/row-leader message in title.
    assert.match(await sideRow.innerText(), /Can’t be honoured here\./);
    const sideTitle = await sideRow.locator('[data-break-open="side"]').getAttribute('title');
    assert.match(sideTitle ?? '', /Only the block that starts a row can begin a page\./);
    await shot('breaks-list.png', '.nf-sidebar');

    // Navigation selects the block in Continuous.
    await methodRow.locator('[data-break-open="method"]').click();
    await h.waitSelected('method');

    // Remove is a hover control and writes the override without that id.
    await sideRow.hover();
    await sideRow.locator('[data-break-remove="side"]').click();
    await page.waitForFunction(
      () => window.__noteforestTest.structure().manualBreakBeforeBlockIds.length === 1,
    );
    assert.deepEqual(await storedIds(), ['method']);
    await page.locator('[data-break-row="side"]').waitFor({ state: 'detached' });

    // The list is navigable in Read but Remove is disabled.
    await ui.ensureInteractionMode('read');
    const remove = page.locator('[data-break-remove="method"]');
    assert.equal(await remove.isDisabled(), true, 'Remove is disabled in Read');
    await page.locator('[data-break-open="method"]').click();
    await h.waitSelected('method');
    await ui.ensureInteractionMode('edit');

    // Removing the last hint shows the one-line empty state.
    await page.locator('[data-break-row="method"]').hover();
    await page.locator('[data-break-remove="method"]').click();
    await page.waitForFunction(
      () => window.__noteforestTest.structure().manualBreakBeforeBlockIds.length === 0,
    );
    const empty = page.locator('[data-breaks-empty="true"]');
    await empty.waitFor();
    assert.equal(
      await empty.innerText(),
      'No manual breaks. Start a block on a new page from its menu.',
    );
    assert.equal(await page.locator('[data-breaks-count]').innerText(), '0');
    await shot('breaks-empty.png', '.nf-sidebar');
  });

  it('turns the Page to the break and follows the live pagination', async () => {
    const env = isolated('page');
    const fixture = await writeLongPackage(env.NOTEFOREST_LIBRARY);
    await launch(env);
    await openPackage(fixture);

    await page.keyboard.press('Meta+3');
    await page.waitForSelector('.nf-page-view');
    await page.waitForFunction(
      () => {
        const view = document.querySelector('.nf-page-view');
        return view !== null && Number(view.getAttribute('data-page-count') ?? '0') > 1;
      },
      undefined,
      { timeout: 15000 },
    );
    const before = await pageCount();

    // Page Edit: the card menu carries the one page-settings item.
    await page.locator('[data-fragment-block="b4"]').click({ button: 'right' });
    const item = await breakItem();
    assert.equal(await menuDisabled(item), false, 'a top-level Page row can start a page');
    assert.equal(await item.getAttribute('data-menu-checked'), null);
    await item.click();
    await page.locator('.nf-menu').waitFor({ state: 'detached' });
    await page.waitForFunction(
      () => window.__noteforestTest.structure().manualBreakBeforeBlockIds.length === 1,
    );
    assert.deepEqual(await storedIds(), ['b4']);
    await waitPageCountAbove(before);
    const after = await pageCount();
    assert.ok(after > before, `the break adds a page (${before} -> ${after})`);

    // The list shows the new page from the same pagination.
    await showBreaks();
    const row = await waitBreakRow('b4', { page: 2, broken: false });
    assert.match(await row.innerText(), /Page 2 · Block 4/);
    await shot('page-after-break.png', '.nf-page-view');

    // Clicking the row turns the Page to that page.
    await row.locator('[data-break-open="b4"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector('.nf-page-view')?.getAttribute('data-current-page') === '2',
      undefined,
      { timeout: 15000 },
    );

    // Page Read disables the item with the one Read reason.
    await ui.ensureInteractionMode('read');
    await page.locator('[data-fragment-block="b4"]').click({ button: 'right' });
    const readItem = await breakItem();
    assert.equal(await menuDisabled(readItem), true);
    assert.match(await menuText(readItem), /Read mode/);
    await closeMenu();
  });
});
