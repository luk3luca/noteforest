import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import {
  pageDocument,
  paragraph,
  textBlock,
  writePagePackage,
} from '../support/page-fixtures.mjs';

/**
 * Find surface (docs/design/find-bar.md): the toolbar cluster (`⌘F`) and the
 * sidebar Search view.
 *
 * Both are the same VS Code widget minus the toggles: query, count (`1 of 4` /
 * "No results"), previous/next, close. The engine searches the open note (block
 * text, code, LaTeX, anchor quotes, branch labels, chapter titles; literal,
 * case-insensitive, one result per occurrence, 100 cap), marks every match in
 * Continuous and rings the block in Page, and Escape restores the selection
 * saved when the cluster opened. The sidebar Search is the browsing
 * presentation: the same query/results/current, grouped by chapter, with one
 * two-line snippet per occurrence.
 */

const tempRoot = artifactsPath('find-bar-ui');
const screenshotDir = artifactsPath('find-surface-v2');
const v3ScreenshotDir = artifactsPath('find-v3');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
const { isolated, applyCommand } = ui;
let page;

async function launch(overrides = {}) {
  page = await ui.launch(overrides);
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
    { timeout: 10000 },
  );
  await page.waitForSelector('.nf-editor[data-active="true"]');
  await h.waitSaved();
  return packagePath;
}

/**
 * One chapter with:
 * - a chapter title that matches `eigen`;
 * - three top-level blocks with `eigen` in the text and one code block;
 * - a parent whose descendants are only reachable after expanding it;
 * - anchors (one live text anchor, one stale stored quote) and a branch label;
 * - 30 filler blocks so Page spans several pages and Continuous scrolls.
 */
function findDocument() {
  const blocks = [
    textBlock('alpha', 'Alpha', 'A scalar λ is an eigenvalue of A.'),
    textBlock('beta', 'Beta', 'An eigenvector satisfies Av = λv for some λ.'),
    // F3 hierarchy: one block without a label and one with a real label, both
    // carrying the words the grouping and whole-word cases search.
    {
      id: 'plain',
      content: {
        type: 'doc',
        children: [paragraph('An unlabelled block mentions mille and fine words.')],
      },
    },
    textBlock('metodo', 'Metodo', 'A labelled block mentions fine words too.'),
    {
      id: 'lines',
      label: 'Lines',
      content: { type: 'doc', children: [paragraph('come'), paragraph('qui')] },
    },
    {
      id: 'code',
      label: 'Code',
      content: {
        type: 'doc',
        children: [
          {
            type: 'codeBlock',
            attrs: { text: 'eigen = 1', language: 'ts' },
            children: [{ type: 'text', text: 'eigen = 1' }],
          },
        ],
      },
    },
    {
      id: 'formula',
      label: 'Formula',
      content: {
        type: 'doc',
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'text', text: 'The identity ' },
              { type: 'inlineMath', attrs: { latex: '\\sigma(A)' } },
              { type: 'text', text: ' names the spectrum.' },
            ],
          },
        ],
      },
    },
    textBlock('parent', 'Parent', 'A parent block with no needle in it.'),
    textBlock('hidden', 'Hidden', 'A hidden needle line below the parent.'),
    textBlock('hidden-deep', 'Hidden deep', 'A deeper needle line in the branch.'),
    textBlock('stale', 'Stale', 'The stored quote is gone from this text.'),
    // Long enough that the two-line clamp has to clip it in the sidebar.
    textBlock(
      'long',
      'Long',
      'A deliberately long sentence about eigenvalues keeps going well past the two-line clamp so the sidebar snippet has to be clipped instead of growing its row without a bound. It mentions the eigenvalue once more near the end for good measure.',
    ),
    ...Array.from({ length: 60 }, (_, index) =>
      textBlock(
        `filler-${index + 1}`,
        `Filler ${index + 1}`,
        'A short top-level block used to derive a page boundary between cards.',
      ),
    ),
    // The late block lands on a later Page: enough blocks precede it.
    textBlock(
      'late',
      'Late',
      'The quokka sentence sits near the end of the note.',
    ),
  ];
  return pageDocument({
    id: 'find-fixture',
    title: 'Find fixture',
    chapterTitle: 'Eigenvalues chapter',
    blocks,
    anchors: [
      {
        id: 'anchor-alpha',
        blockId: 'alpha',
        kind: 'text',
        selector: { kind: 'text', quote: 'eigenvalue' },
        quote: 'eigenvalue',
      },
      {
        id: 'anchor-stale',
        blockId: 'stale',
        kind: 'text',
        selector: { kind: 'text', quote: 'lost needle phrase' },
        quote: 'lost needle phrase',
      },
    ],
    branches: [
      { id: 'branch-alpha-beta', sourceBlockId: 'alpha', targetBlockId: 'beta' },
      { id: 'branch-parent-hidden', sourceBlockId: 'parent', targetBlockId: 'hidden' },
      { id: 'branch-hidden-deep', sourceBlockId: 'hidden', targetBlockId: 'hidden-deep' },
      {
        id: 'branch-alpha-anchor',
        sourceBlockId: 'alpha',
        sourceAnchorId: 'anchor-alpha',
        targetBlockId: 'formula',
      },
      {
        id: 'branch-label',
        sourceBlockId: 'beta',
        targetBlockId: 'parent',
        role: 'reference',
        label: 'eigen bridge',
      },
    ],
  });
}

async function findState() {
  return page.evaluate(() => {
    const current = window.__noteforestTest.state();
    return {
      open: current.findOpen,
      query: current.findQuery,
      index: current.findIndex,
      total: current.findTotal,
      truncated: current.findTruncated,
      results: current.findResults,
      selected:
        current.runtimes.find((item) => item.packagePath === current.activeTab)
          ?.selectedBlockId ?? null,
    };
  });
}

function findBar() {
  return page.locator('[data-find-bar="true"]');
}

/** Open the bar with ⌘F, type, and wait for the debounced scan to settle. */
async function openAndType(query) {
  await page.keyboard.press('Meta+f');
  await findBar().waitFor({ timeout: 10000 });
  await page.locator('.nf-find-input').fill(query);
  await page.waitForFunction(
    (expected) => window.__noteforestTest.state().findQuery === expected,
    query,
    { timeout: 10000 },
  );
  await page.waitForFunction(
    (expected) => {
      const state = window.__noteforestTest.state();
      return state.findOpen && state.findResults.length > 0 && expected;
    },
    query.length > 0,
    { timeout: 10000 },
  );
}

async function waitForIndex(expected) {
  await page.waitForFunction(
    (value) => window.__noteforestTest.state().findIndex === value,
    expected,
    { timeout: 10000 },
  );
}

async function countText() {
  return (await page.locator('.nf-find-count').textContent())?.trim() ?? '';
}

async function hits() {
  return page.locator('.nf-find-hit').evaluateAll((elements) =>
    elements.map((element) => ({
      text: (element.textContent ?? '').trim(),
      current: element.hasAttribute('data-find-current'),
      shadow: getComputedStyle(element).boxShadow,
    })),
  );
}

async function scrollTop() {
  return page
    .locator('.nf-editor[data-active="true"] .nf-editor-scroll')
    .evaluate((element) => element.scrollTop);
}

async function activePage() {
  return page
    .locator('.nf-editor[data-active="true"] .nf-page-view')
    .evaluate((element) => Number(element.getAttribute('data-current-page') ?? '0'));
}

/** The sidebar Search section: tab → panel → field. */
async function openSearchSection() {
  await page.locator('[data-sidebar-tab="outline"]').click();
  await page.waitForSelector('[data-sidebar-panel="outline"]');
  await page.locator('[data-sidebar-tab="search"]').click();
  await page.waitForSelector('[data-sidebar-panel="search"]');
  await page.waitForSelector('[data-search-input="true"]');
}

function searchInput() {
  return page.locator('[data-search-input="true"]');
}

async function typeInSearch(query) {
  const before = await page.evaluate(() => window.__noteforestTest.state().findTotal);
  await searchInput().fill(query);
  await page.waitForFunction(
    ({ expected, previous }) => {
      const state = window.__noteforestTest.state();
      if (state.findQuery !== expected) return false;
      if (expected.length === 0) return state.findResults.length === 0;
      // The scan is debounced: wait for the result set this query produced,
      // not for the one the previous query left behind.
      return state.findResults.length > 0 && state.findTotal !== previous;
    },
    { expected: query, previous: before },
    { timeout: 10000 },
  );
}

async function searchRows() {
  return page.locator('[data-search-row]').evaluateAll((elements) =>
    elements.map((element) => ({
      index: Number(element.getAttribute('data-search-row') ?? '-1'),
      current: element.getAttribute('data-search-current') === 'true',
      kind: element.getAttribute('data-search-kind'),
      field: element.getAttribute('data-search-field'),
      text: element.textContent ?? '',
      background: getComputedStyle(element).backgroundColor,
    })),
  );
}

/** Card geometry and colours for one occurrence row. */
async function rowCard(locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const results = document.querySelector('[data-search-results]');
    if (results === null) return null;
    const box = element.getBoundingClientRect();
    const resultsBox = results.getBoundingClientRect();
    return {
      borderWidth: style.borderTopWidth,
      borderColor: style.borderTopColor,
      radius: style.borderTopLeftRadius,
      background: style.backgroundColor,
      boxShadow: style.boxShadow,
      left: box.left - resultsBox.left,
    };
  });
}

/** Type in the toolbar input and wait for the shared query to settle (sync). */
async function fillFind(query) {
  await page.locator('.nf-find-input').fill(query);
  await page.waitForFunction(
    (expected) => window.__noteforestTest.state().findQuery === expected,
    query,
    { timeout: 10000 },
  );
}

describe('find bar (⌘F)', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(screenshotDir, { recursive: true });
    await mkdir(v3ScreenshotDir, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('opens with ⌘F, counts occurrences and closes with Escape', async () => {
    const env = isolated('count');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await openPackage(env, 'Find count', findDocument());

    // ⌘F opens the bar and focuses/selects the query field.
    await page.keyboard.press('Meta+f');
    await findBar().waitFor();
    assert.equal(await page.evaluate(() => window.__noteforestTest.state().findOpen), true);
    assert.equal(
      await page.evaluate(() => document.activeElement?.className ?? ''),
      'nf-find-input',
      'the query owns focus',
    );

    // The bar is exactly query + whole-word toggle + count + previous/next + close.
    assert.equal(
      await page
        .locator('[data-find-bar="true"] input, [data-find-bar="true"] button')
        .count(),
      5,
      'one input and four buttons',
    );
    assert.equal(await page.locator('[data-find-bar="true"] [role="menu"]').count(), 0);
    assert.equal(await page.locator('[data-find-bar="true"] input[type="checkbox"]').count(), 0);
    assert.equal(
      await page.locator('.nf-find-count').getAttribute('aria-live'),
      'polite',
    );

    // Geometry: one 28 px cluster inside the 34 px canvas toolbar, after the
    // history group and before the layout/mode controls. No card, no shadow,
    // no absolute overlay: the toolbar row height does not change.
    const geometry = await page.evaluate(() => {
      const bar = document.querySelector('[data-find-bar="true"]');
      const header = document.querySelector('[data-canvas-header="true"]');
      const undo = document.querySelector('[data-header-undo="true"]');
      const layoutButton = document.querySelector('[data-view-layout="continuous"]');
      if (bar === null || header === null || undo === null || layoutButton === null) {
        return null;
      }
      const barBox = bar.getBoundingClientRect();
      const headerBox = header.getBoundingClientRect();
      const undoBox = undo.getBoundingClientRect();
      const layoutBox = layoutButton.getBoundingClientRect();
      const style = getComputedStyle(bar);
      return {
        width: barBox.width,
        height: barBox.height,
        headerHeight: headerBox.height,
        insideHeader: barBox.top >= headerBox.top && barBox.bottom <= headerBox.bottom,
        centered:
          Math.abs(barBox.top + barBox.height / 2 - (headerBox.top + headerBox.height / 2)) <= 1,
        afterHistory: barBox.left > undoBox.right,
        beforeLayout: barBox.right < layoutBox.left,
        position: style.position,
        boxShadow: style.boxShadow,
        overflow: style.overflow,
      };
    });
    assert.ok(geometry !== null);
    assert.equal(Math.round(geometry.height), 28, 'the cluster is 28 px');
    assert.equal(Math.round(geometry.headerHeight), 34, 'the toolbar row keeps its height');
    assert.equal(geometry.insideHeader, true, 'the cluster is inside the toolbar');
    assert.equal(geometry.centered, true, 'the cluster is vertically centred');
    assert.equal(geometry.afterHistory, true, 'it sits after undo/redo');
    assert.equal(geometry.beforeLayout, true, 'it sits before the layout/mode controls');
    assert.equal(geometry.position, 'static', 'no floating overlay');
    assert.equal(geometry.boxShadow, 'none', 'no shadow');
    assert.ok(geometry.width <= 360, `cluster width ${geometry.width} stays within 360`);
    assert.ok(geometry.width > 240, `cluster width ${geometry.width} keeps the field usable`);
    // The note is never covered: the cluster lives in the header, above the
    // editor scroll container.
    const overlap = await page.evaluate(() => {
      const bar = document.querySelector('[data-find-bar="true"]');
      const scroll = document.querySelector(
        '.nf-editor[data-active="true"] .nf-editor-scroll',
      );
      if (bar === null || scroll === null) return null;
      const barBox = bar.getBoundingClientRect();
      const scrollBox = scroll.getBoundingClientRect();
      return { overlapsNote: barBox.bottom > scrollBox.top + 0.5 };
    });
    assert.ok(overlap !== null);
    assert.equal(overlap.overlapsNote, false, 'the cluster never covers the note');

    await page.locator('.nf-find-input').fill('eigen');
    await page.waitForFunction(
      () => window.__noteforestTest.state().findResults.length > 0,
      undefined,
      { timeout: 10000 },
    );
    const state = await findState();
    // Reading order: the chapter title, then `alpha` (twice: text + its anchor
    // hit is one occurrence per occurrence, so one), `beta` (heading text).
    assert.ok(state.results.length >= 4, 'at least four occurrences');
    assert.equal(state.results[0].kind, 'chapter');
    assert.equal(state.results.filter((result) => result.field === 'text').length >= 2, true);
    assert.equal(await countText(), `1 of ${state.results.length}`);
    assert.equal(await findBar().count(), 1);

    await h.screenshot(resolve(screenshotDir, 'bar-with-results.png'), {
      width: 1440,
      height: 900,
    });

    // No match: the count says so and both arrows are disabled.
    await page.locator('.nf-find-input').fill('xyzzy');
    await page.waitForFunction(
      () => {
        const current = window.__noteforestTest.state();
        return current.findQuery === 'xyzzy' && current.findResults.length === 0;
      },
      undefined,
      { timeout: 10000 },
    );
    assert.equal(await countText(), 'No results');
    assert.equal(await page.locator('[data-find-next="true"]').isDisabled(), true);
    assert.equal(await page.locator('[data-find-previous="true"]').isDisabled(), true);
    assert.equal((await hits()).length, 0);

    await h.screenshot(resolve(screenshotDir, 'no-results.png'), {
      width: 1440,
      height: 900,
    });

    // Escape closes, clears the marks, and keeps the last query for the session.
    await page.keyboard.press('Escape');
    await findBar().waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.__noteforestTest.state().findOpen), false);
    assert.equal((await hits()).length, 0, 'closing clears the decoration');
    await page.keyboard.press('Meta+f');
    await findBar().waitFor();
    assert.equal(await page.locator('.nf-find-input').inputValue(), 'xyzzy');
    assert.equal(
      await page.evaluate(() => {
        const input = document.querySelector('.nf-find-input');
        return input instanceof HTMLInputElement
          ? input.selectionStart === 0 && input.selectionEnd === input.value.length
          : false;
      }),
      true,
      'the query is selected on open',
    );
  });

  it('marks every match and only the current one strongly', async () => {
    const env = isolated('highlight');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await openPackage(env, 'Find highlight', findDocument());
    await openAndType('eigen');

    const state = await findState();
    const textResults = state.results.filter(
      (result) => result.field === 'text' || result.field === 'code',
    );
    // A chapter-title hit is first: it has no text node, so the current block's
    // own selection ring is its only Continuous cue and no word is marked.
    assert.equal(state.results[0].field, 'chapter');
    assert.equal(state.index, 0, 'the first occurrence is current on a query change');
    const decorationsAtChapter = await hits();
    assert.equal(
      decorationsAtChapter.filter((decoration) => decoration.current).length,
      0,
      'a chapter title has no word to mark',
    );

    // Move to the first text-node hit: exactly one mark is now current.
    await page.locator('.nf-find-input').press('Enter');
    await waitForIndex(1);
    const decorations = await hits();
    assert.equal(decorations.length, textResults.length, 'one mark per text-node match');
    assert.equal(
      decorations.filter((decoration) => decoration.current).length,
      1,
      'exactly one current mark',
    );
    const all = decorations.map((decoration) => decoration.text.toLowerCase());
    assert.ok(all.every((value) => value.startsWith('eigen')));
    const current = decorations.find((decoration) => decoration.current);
    assert.ok(current !== undefined);
    assert.notEqual(
      current.shadow,
      decorations.find((decoration) => !decoration.current)?.shadow,
      'the current mark is visually stronger',
    );
    assert.equal(await countText(), `2 of ${state.results.length}`);

    // Enter / arrows / ⌘G move through the occurrences in document order.
    await page.locator('.nf-find-input').press('Shift+Enter');
    await waitForIndex(0);
    await page.keyboard.press('Meta+g');
    await waitForIndex(1);
    await page.keyboard.press('Meta+Shift+g');
    await waitForIndex(0);
    await page.locator('.nf-find-input').press('ArrowDown');
    await waitForIndex(1);
    await page.locator('.nf-find-input').press('ArrowUp');
    await waitForIndex(0);
    await page.locator('.nf-find-input').press('End');
    await waitForIndex(state.results.length - 1);
    await page.locator('.nf-find-input').press('Home');
    await waitForIndex(0);

    // Tab leaves the bar (focus moves on without closing it).
    await page.keyboard.press('Tab');
    assert.equal(
      await page.evaluate(() => document.activeElement?.className ?? ''),
      'nf-whole-word',
      'Tab leaves the input for the next cluster control',
    );
    assert.equal(await findBar().count(), 1, 'Tab does not close the bar');
  });

  it('scrolls to a hit, selects its block and expands collapsed ancestors', async () => {
    const env = isolated('collapsed');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await openPackage(env, 'Find collapsed', findDocument());

    // Collapse the parent: the needle lives only in its descendants.
    await page.locator('[data-branch-port="parent"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-branch-port="parent"]')?.getAttribute('data-collapsed') ===
        'true',
      undefined,
      { timeout: 10000 },
    );
    assert.equal(
      await page
        .locator('[data-block-card="hidden"]')
        .evaluate((element) => element.getClientRects().length > 0),
      false,
      'the collapsed child card is not visible',
    );

    await openAndType('needle');
    const state = await findState();
    assert.ok(state.results.length >= 3, 'collapsed blocks are searchable');
    // The stale stored quote is an Anchor result on the record.
    assert.equal(
      state.results.some((result) => result.kind === 'anchor' && result.field === 'quote'),
      true,
    );

    // Navigate to the first descendant hit by pressing next until the view
    // reveals the hidden branch.
    const target = state.results.findIndex((result) => result.blockId === 'hidden');
    assert.ok(target >= 0);
    for (let index = 1; index <= target; index += 1) {
      await page.locator('.nf-find-input').press('Enter');
    }
    await waitForIndex(target);
    await page.waitForFunction(
      () =>
        document.querySelector('[data-branch-port="parent"]')?.getAttribute('data-collapsed') ===
        'false',
      undefined,
      { timeout: 10000 },
    );
    await page.waitForSelector('[data-block-card="hidden"]');
    const after = await findState();
    assert.equal(after.selected, 'hidden');
    await page
      .locator('[data-block-card="hidden"]')
      .waitFor({ state: 'visible', timeout: 10000 });
    await h.screenshot(resolve(screenshotDir, 'collapsed-hit.png'), {
      width: 1440,
      height: 900,
    });
  });

  it('goes to the page that holds the hit and rings the block (Page)', async () => {
    const env = isolated('page');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await openPackage(env, 'Find page', findDocument());

    // Page Read: the bar floats, the page keeps its zoom.
    await page.keyboard.press('Meta+3');
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view[data-ready="true"]');
    const firstPage = await activePage();
    assert.equal(firstPage, 1);
    const zoomBefore = await page
      .locator('.nf-editor[data-active="true"] .nf-page-sheet-wrap')
      .getAttribute('data-page-zoom');

    await openAndType('quokka');
    const state = await findState();
    assert.equal(state.results.length, 1);
    await page.waitForFunction(
      () => Number(
        document.querySelector('.nf-page-view')?.getAttribute('data-current-page') ?? '0',
      ) > 1,
      undefined,
      { timeout: 10000 },
    );
    const pageNumber = await activePage();
    assert.ok(pageNumber > firstPage, 'the view moved to the hit page');
    assert.equal(
      await page.locator('.nf-page-view').getAttribute('data-current-page'),
      String(pageNumber),
    );
    // The block is ringed on the page; no word highlight is added there.
    const fragment = page.locator(
      '[data-find-current="true"][data-fragment-block="late"]',
    );
    assert.equal(await fragment.count(), 1, 'the hit block is ringed');
    assert.ok(
      Number(await fragment.getAttribute('data-fragment-page')) === pageNumber,
      'the ring sits on the page the view moved to',
    );
    // The dashed Page-local ring, not the solid selection outline.
    const outline = await fragment.evaluate((element) => getComputedStyle(element).outlineStyle);
    assert.equal(outline, 'dashed');
    assert.equal(await page.locator('.nf-page-view .nf-find-hit').count(), 0);
    assert.equal((await findState()).selected, 'late');
    assert.equal(
      await page
        .locator('.nf-editor[data-active="true"] .nf-page-sheet-wrap')
        .getAttribute('data-page-zoom'),
      zoomBefore,
      'the page keeps its zoom',
    );

    await h.screenshot(resolve(screenshotDir, 'page.png'), {
      width: 1440,
      height: 900,
    });

    // Escape returns focus to the page surface and clears the ring.
    await page.keyboard.press('Escape');
    await findBar().waitFor({ state: 'detached' });
    await page.waitForFunction(
      () => document.querySelector('[data-find-current="true"]') === null,
      undefined,
      { timeout: 10000 },
    );
  });

  it('works in Read mode as navigation only', async () => {
    const env = isolated('read');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await openPackage(env, 'Find read', findDocument());
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      () =>
        document.querySelector('.nf-editor[data-active="true"]')?.getAttribute(
          'data-interaction-mode',
        ) === 'read',
      undefined,
      { timeout: 10000 },
    );

    await openAndType('eigen');
    const state = await findState();
    assert.ok(state.results.length >= 4);
    await page.locator('.nf-find-input').press('Enter');
    await waitForIndex(1);
    assert.ok((await hits()).length > 0, 'Read mode still marks the matches');
    assert.notEqual(
      await page.locator('[data-block-card="alpha"]').getAttribute('data-active'),
      'true',
      'Read navigation does not open an editing affordance',
    );
    await h.screenshot(resolve(screenshotDir, 'read.png'), {
      width: 1440,
      height: 900,
    });
    // No editing chrome: the selection toolbar never appears in Read.
    assert.equal(await page.locator('.nf-selection-toolbar').count(), 0);
    const editorReadonly = await page
      .locator('.nf-editor[data-active="true"] .nf-prosemirror')
      .getAttribute('aria-readonly');
    assert.equal(editorReadonly, 'true');
  });

  it('does nothing when no note is open', async () => {
    const env = isolated('empty');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await page.waitForSelector('.nf-empty-state');
    await page.keyboard.press('Meta+f');
    // No bar, no overlay, no renderer error: the shortcut is a no-op.
    assert.equal(await findBar().count(), 0);
    assert.equal(await page.evaluate(() => window.__noteforestTest.state().findOpen), false);
    assert.equal(await page.evaluate(() => document.activeElement?.tagName ?? ''), 'BODY');
  });

  it('restores the selection saved when the bar opened', async () => {
    const env = isolated('restore');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await openPackage(env, 'Find restore', findDocument());

    // Select `beta` with a real block selection, then find and jump away.
    await page.locator('[data-block-card="beta"]').click();
    await h.waitSelected('beta');
    await openAndType('quokka');
    await page.waitForFunction(
      () => window.__noteforestTest.state().findResults.length === 1,
      undefined,
      { timeout: 10000 },
    );
    await page.waitForFunction(
      () => {
        const current = window.__noteforestTest.state();
        const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
        return runtime?.selectedBlockId === 'late';
      },
      undefined,
      { timeout: 10000 },
    );

    await page.keyboard.press('Escape');
    await findBar().waitFor({ state: 'detached' });
    const restored = await findState();
    assert.equal(restored.selected, 'beta', 'the pre-find selection comes back');
    const focusInEditor = await page.evaluate(() => {
      const active = document.activeElement;
      const scope = document.querySelector('.nf-editor[data-active="true"] .nf-prosemirror');
      return active !== null && scope !== null && scope.contains(active);
    });
    assert.equal(focusInEditor, true, 'focus returns to the editor');
  });

  it('shows the shared find surface in the sidebar Search section', async () => {
    const env = isolated('search');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await openPackage(env, 'Find search', findDocument());

    // The activity bar lists Search fourth, after Health.
    const tabs = await page
      .locator('[data-sidebar-tab]')
      .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-sidebar-tab')));
    assert.deepEqual(tabs, ['library', 'outline', 'health', 'search']);

    await openSearchSection();
    assert.equal(await page.evaluate(() => window.__noteforestTest.state().sidebarTab), 'search');
    assert.equal(
      await page.locator('[data-sidebar-tab="search"]').getAttribute('aria-selected'),
      'true',
    );

    // F3: no activity-bar icon is filled in any state. Lucide is stroke-only, so
    // a fill turns the outline into a blob; the active state is the 1.9 stroke,
    // surface-2 and text-1 instead.
    const iconFills = await page
      .locator('[data-sidebar-tab] svg')
      .evaluateAll((elements) => elements.map((element) => element.getAttribute('fill')));
    assert.deepEqual(iconFills, ['none', 'none', 'none', 'none']);
    const activeStroke = await page
      .locator('[data-sidebar-tab="search"] svg')
      .getAttribute('stroke-width');
    assert.equal(activeStroke, '1.9', 'the active icon keeps the heavier stroke');
    const inactiveStroke = await page
      .locator('[data-sidebar-tab="library"] svg')
      .getAttribute('stroke-width');
    assert.equal(inactiveStroke, '1.5', 'an inactive icon keeps the resting stroke');
    assert.equal(
      (await page.locator('[data-sidebar-panel="search"] .nf-search-title').textContent())?.trim(),
      'Search',
    );
    // 28 px field; idle copy and a 0 count before a query.
    assert.equal(
      Math.round(
        await page
          .locator('.nf-search-field')
          .evaluate((element) => element.getBoundingClientRect().height),
      ),
      28,
    );
    assert.equal((await page.locator('[data-search-count]').textContent())?.trim(), '0');
    assert.equal(await page.locator('[data-search-idle="true"]').count(), 1);
    // The view replaces the Outline while it is active.
    assert.equal(await page.locator('[data-sidebar-panel="search"] .nf-tree').count(), 0);

    await typeInSearch('eigen');
    const state = await findState();
    assert.ok(state.results.length >= 4, 'the shared engine found the occurrences');
    assert.equal(state.index, 0, 'the first occurrence is current');

    // Chapter group → block title → one row per occurrence.
    const groups = await page.locator('[data-search-group-label]').allTextContents();
    assert.deepEqual(groups, ['Chapter 1 · Eigenvalues chapter']);
    const blocks = await page.locator('[data-search-block-title]').allTextContents();
    assert.ok(blocks.includes('Alpha'), `block titles: ${JSON.stringify(blocks)}`);
    assert.ok(blocks.includes('Beta'), `block titles: ${JSON.stringify(blocks)}`);
    const rows = await searchRows();
    assert.equal(rows.length, state.results.length, 'one row per occurrence');
    assert.equal(rows.filter((row) => row.current).length, 1, 'exactly one current row');
    assert.equal(rows[0].current, true);
    const currentRow = rows.find((row) => row.current);
    const restingRow = rows.find((row) => !row.current);
    assert.ok(currentRow !== undefined && restingRow !== undefined);
    assert.notEqual(currentRow.background, restingRow.background, 'the current row is filled');

    // Two-line snippet with the match emphasised; code snippets are mono.
    const firstSnippet = page.locator('[data-search-row]').first().locator('.nf-search-snippet');
    assert.equal(
      ((await firstSnippet.locator('b.nf-search-match').textContent()) ?? '').toLowerCase(),
      'eigen',
    );
    const shape = await firstSnippet.evaluate((element) => {
      const style = getComputedStyle(element);
      const lineHeight = Number.parseFloat(style.lineHeight);
      return {
        clamp: style.webkitLineClamp,
        overflow: style.overflow,
        height: element.getBoundingClientRect().height,
        lineHeight,
        font: style.fontFamily,
      };
    });
    assert.equal(shape.clamp, '2', 'the snippet clamps to two lines');
    assert.equal(shape.overflow, 'hidden');
    assert.ok(
      shape.height <= shape.lineHeight * 2 + 2,
      `the snippet renders at most two lines (${shape.height} <= ${shape.lineHeight * 2})`,
    );
    // A long occurrence wraps and is clipped at two lines, not one and not three.
    const longRow = page.locator('[data-search-row]', { hasText: 'deliberately long sentence' });
    assert.equal(await longRow.count(), 1);
    const clamped = await longRow.locator('.nf-search-snippet').evaluate((element) => {
      const style = getComputedStyle(element);
      const lineHeight = Number.parseFloat(style.lineHeight);
      return { height: element.getBoundingClientRect().height, lineHeight };
    });
    assert.ok(clamped.height > clamped.lineHeight, 'the long snippet wraps past one line');
    assert.ok(
      clamped.height <= clamped.lineHeight * 2 + 2,
      `the long snippet is clipped at two lines (${clamped.height} <= ${clamped.lineHeight * 2})`,
    );
    const codeRow = page.locator('[data-search-row][data-search-field="code"]').first();
    assert.equal(await codeRow.count(), 1, 'the code occurrence has a row');
    const codeFont = await codeRow
      .locator('.nf-search-snippet')
      .evaluate((element) => getComputedStyle(element).fontFamily);
    assert.notEqual(codeFont, shape.font, 'code snippets use the mono face');
    assert.match(codeFont, /JetBrains Mono|ui-monospace/);

    // The count is the occurrences, shared with the toolbar cluster.
    assert.equal(
      (await page.locator('[data-search-count]').textContent())?.trim(),
      `1 of ${state.results.length}`,
    );
    await h.screenshot(resolve(screenshotDir, 'sidebar-search.png'), {
      width: 1440,
      height: 900,
    });

    // Clicking a later occurrence makes it current and moves the note there.
    const target = state.results.findIndex((result) => result.blockId === 'beta');
    assert.ok(target > 0);
    await page.locator(`[data-search-row="${target}"]`).click();
    await page.waitForFunction(
      (expected) => window.__noteforestTest.state().findIndex === expected,
      target,
      { timeout: 10000 },
    );
    await h.waitSelected('beta');
    const afterClick = await searchRows();
    assert.equal(afterClick[target].current, true);
    assert.equal(afterClick.filter((row) => row.current).length, 1);
    assert.equal(
      (await hits()).filter((decoration) => decoration.current).length,
      1,
      'the clicked occurrence is the one strong mark',
    );

    // ⌘F opens the toolbar cluster on the same query and count.
    await page.keyboard.press('Meta+f');
    await findBar().waitFor();
    assert.equal(await page.locator('.nf-find-input').inputValue(), 'eigen');
    assert.equal(
      await countText(),
      (await page.locator('[data-search-count]').textContent())?.trim(),
      'both surfaces show the same occurrence',
    );

    // Typing in the toolbar updates the sidebar list (and the reverse above).
    await page.locator('.nf-find-input').fill('quokka');
    await page.waitForFunction(
      () => {
        const current = window.__noteforestTest.state();
        return current.findQuery === 'quokka' && current.findResults.length === 1;
      },
      undefined,
      { timeout: 10000 },
    );
    assert.equal(await searchInput().inputValue(), 'quokka');
    assert.equal((await searchRows()).length, 1);
    assert.equal((await page.locator('[data-search-count]').textContent())?.trim(), '1 of 1');
    await h.screenshot(resolve(screenshotDir, 'shared-state.png'), {
      width: 1440,
      height: 900,
    });

    // Closing the section returns to the section it came from and keeps the
    // cluster's query/results; Esc then closes the cluster and the marks.
    await page.locator('[data-search-close="true"]').click();
    await page.waitForSelector('[data-sidebar-panel="outline"]');
    assert.equal(await page.evaluate(() => window.__noteforestTest.state().sidebarTab), 'outline');
    assert.equal(await page.evaluate(() => window.__noteforestTest.state().findQuery), 'quokka');
    assert.equal(await findBar().count(), 1);
    await page.keyboard.press('Escape');
    await findBar().waitFor({ state: 'detached' });
    await page.waitForFunction(
      () => window.__noteforestTest.state().findResults.length === 0,
      undefined,
      { timeout: 10000 },
    );
    assert.equal((await hits()).length, 0, 'closing the last surface clears the decoration');
  });

  it('shows label-only headings, chapter rules and card rows', async () => {
    const env = isolated('hierarchy');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await openPackage(env, 'Find hierarchy', findDocument());

    await openSearchSection();
    await typeInSearch('fine');
    const state = await findState();
    assert.equal(state.results.length, 2, 'one hit in the unlabelled block and one in Metodo');

    // Only a real block label is a heading; the unlabelled block has none and
    // its first content line lives only inside the snippet.
    const titles = await page.locator('[data-search-block-title]').allTextContents();
    assert.deepEqual(titles, ['Metodo']);
    const plainBlock = page.locator('[data-search-block="plain"]');
    assert.equal(await plainBlock.locator('[data-search-block-title]').count(), 0);
    assert.equal(await plainBlock.getAttribute('role'), null, 'no group without a label');
    assert.equal(await plainBlock.getAttribute('aria-label'), null);
    const metodoBlock = page.locator('[data-search-block="metodo"]');
    assert.equal(await metodoBlock.getAttribute('role'), 'group');
    assert.equal(await metodoBlock.getAttribute('aria-label'), 'Metodo');

    // The heading is not a button, not focusable, has no hover and does nothing.
    const heading = page.locator('[data-search-block-title]').first();
    assert.equal(await heading.evaluate((element) => element.tagName), 'DIV');
    assert.equal(await heading.evaluate((element) => element.getAttribute('tabindex')), null);
    const indexBeforeHeading = await page.evaluate(
      () => window.__noteforestTest.state().findIndex,
    );
    await heading.click();
    assert.equal(
      await page.evaluate(() => window.__noteforestTest.state().findIndex),
      indexBeforeHeading,
      'clicking the block label does nothing',
    );

    // Chapter opener: a 1 px rule, the chapter occurrence count at the right,
    // and the same non-interactive contract.
    const chapterHead = page.locator(
      '[data-search-chapter="chapter-1"] .nf-search-chapter-head',
    );
    assert.equal(
      await chapterHead.evaluate((element) => getComputedStyle(element).borderTopWidth),
      '1px',
    );
    assert.equal(
      (await page.locator('[data-search-chapter-count]').textContent())?.trim(),
      '2',
    );
    assert.equal(await chapterHead.evaluate((element) => element.tagName), 'DIV');
    assert.equal(await chapterHead.evaluate((element) => element.getAttribute('tabindex')), null);
    const indexBeforeChapter = await page.evaluate(
      () => window.__noteforestTest.state().findIndex,
    );
    await page.locator('[data-search-group-label]').click();
    assert.equal(
      await page.evaluate(() => window.__noteforestTest.state().findIndex),
      indexBeforeChapter,
      'clicking the chapter rule does nothing',
    );

    // Cards: 12 px from the panel edge, 1 px outline, radius 4, a 3 px gap.
    const rows = page.locator('[data-search-row]');
    const resting = await rowCard(rows.nth(1));
    assert.ok(resting !== null);
    assert.equal(resting.borderWidth, '1px');
    assert.equal(resting.radius, '4px');
    assert.ok(
      Math.abs(resting.left - 12) <= 0.5,
      `the card is indented 12 px (got ${resting.left})`,
    );

    await h.screenshot(resolve(v3ScreenshotDir, 'sidebar-labelled-unlabelled.png'), {
      width: 1440,
      height: 900,
    });

    // Hover changes border and background; the current card adds the accent
    // border plus the 1 px ring and keeps aria-selected.
    await rows.nth(1).hover();
    const hovered = await rowCard(rows.nth(1));
    assert.ok(hovered !== null);
    assert.notEqual(hovered.background, resting.background);
    assert.notEqual(hovered.borderColor, resting.borderColor);

    await rows.nth(1).click();
    await page.waitForFunction(
      () => window.__noteforestTest.state().findIndex === 1,
      undefined,
      { timeout: 10000 },
    );
    const currentRow = page.locator('[data-search-current="true"]');
    assert.equal(await currentRow.count(), 1);
    assert.equal(await currentRow.getAttribute('aria-selected'), 'true');
    const current = await rowCard(currentRow);
    assert.ok(current !== null);
    assert.match(current.boxShadow, /rgb/);
    assert.notEqual(current.background, resting.background);
    assert.notEqual(current.borderColor, resting.borderColor);
    await h.screenshot(resolve(v3ScreenshotDir, 'sidebar-current-card.png'), {
      width: 1440,
      height: 900,
    });

    // Two cards in one block keep a 3 px gap (the long block has two matches).
    await searchInput().fill('eigen');
    await page.waitForFunction(
      () => {
        const current = window.__noteforestTest.state();
        return current.findQuery === 'eigen' && current.findTotal >= 4;
      },
      undefined,
      { timeout: 10000 },
    );
    const sameBlockRows = page.locator('[data-search-block="long"] [data-search-row]');
    assert.ok((await sameBlockRows.count()) >= 2);
    const gap = await sameBlockRows.evaluateAll((elements) => {
      const first = elements[0]?.getBoundingClientRect();
      const second = elements[1]?.getBoundingClientRect();
      return first === undefined || second === undefined ? null : second.top - first.bottom;
    });
    assert.ok(gap !== null && Math.abs(gap - 3) <= 0.5, `3 px between cards (got ${gap})`);
  });

  it('shares one normalized query mode and the ab toggle across both surfaces', async () => {
    const env = isolated('query-mode');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await openPackage(env, 'Find query mode', findDocument());

    await openSearchSection();
    await typeInSearch('come');
    assert.equal(await page.evaluate(() => window.__noteforestTest.state().findTotal), 1);

    // The input keeps what the user typed, trailing spaces included; only the
    // matching is normalized. A line break inside the block matches one space.
    await searchInput().fill('come  ');
    await page.waitForFunction(
      () => window.__noteforestTest.state().findQuery === 'come  ',
      undefined,
      { timeout: 10000 },
    );
    assert.equal(await searchInput().inputValue(), 'come  ');
    assert.equal(await page.evaluate(() => window.__noteforestTest.state().findTotal), 1);

    await searchInput().fill('come   qui');
    await page.waitForFunction(
      () => {
        const current = window.__noteforestTest.state();
        return (
          current.findQuery === 'come   qui' &&
          current.findTotal === 1 &&
          current.findResults[0]?.snippet === 'come qui'
        );
      },
      undefined,
      { timeout: 10000 },
    );
    const lineResult = await page.evaluate(
      () => window.__noteforestTest.state().findResults[0],
    );
    assert.equal(lineResult.blockId, 'lines');
    assert.equal(lineResult.snippet, 'come qui');
    // One occurrence across two paragraphs: both lines are marked, and both
    // carry the current marker because they are the same match.
    assert.equal((await hits()).length, 2);
    assert.equal((await hits()).filter((decoration) => decoration.current).length, 2);
    assert.match(
      await page.locator('[data-search-row="0"] .nf-search-snippet').textContent(),
      /come\s+qui/,
    );

    // The toolbar cluster opens on the same query and shows the shared toggle
    // whenever the bar is open, even before a query.
    await page.keyboard.press('Meta+f');
    await findBar().waitFor();
    assert.equal(await page.locator('.nf-find-input').inputValue(), 'come   qui');
    const toggle = page.locator('[data-find-whole-word="true"]');
    assert.equal((await toggle.textContent())?.trim(), 'ab');
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    assert.equal(await toggle.getAttribute('title'), 'Match whole words');
    const toggleBox = await toggle.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { width: box.width, height: box.height };
    });
    assert.equal(Math.round(toggleBox.width), 22);
    assert.equal(Math.round(toggleBox.height), 22);

    await fillFind('eigen');
    await page.waitForFunction(
      () => {
        const current = window.__noteforestTest.state();
        return current.findQuery === 'eigen' && current.findTotal >= 4;
      },
      undefined,
      { timeout: 10000 },
    );
    const wideTotal = await page.evaluate(
      () => window.__noteforestTest.state().findTotal,
    );

    // Toolbar on -> the sidebar toggle and count follow. Whole-word `eigen`
    // keeps the code token and the `eigen bridge` label.
    await toggle.click();
    await page.waitForFunction(
      () => {
        const current = window.__noteforestTest.state();
        return current.findTotal === 2;
      },
      undefined,
      { timeout: 10000 },
    );
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    assert.equal(
      await page.locator('[data-search-whole-word="true"]').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(
      (await page.locator('[data-search-count]').textContent())?.trim(),
      '1 of 2',
    );
    await h.screenshot(resolve(v3ScreenshotDir, 'toggle-on.png'), {
      width: 1440,
      height: 900,
    });

    // Sidebar off -> the toolbar and the count follow.
    await page.locator('[data-search-whole-word="true"]').click();
    await page.waitForFunction(
      (expected) => window.__noteforestTest.state().findTotal === expected,
      wideTotal,
      { timeout: 10000 },
    );
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');

    await fillFind('il');
    await page.waitForFunction(
      () => {
        const current = window.__noteforestTest.state();
        return current.findQuery === 'il' && current.findTotal === 1;
      },
      undefined,
      { timeout: 10000 },
    );
    await toggle.click();
    await page.waitForFunction(
      () => window.__noteforestTest.state().findTotal === 0,
      undefined,
      { timeout: 10000 },
    );
    assert.equal(
      (await page.locator('[data-search-count]').textContent())?.trim(),
      '0',
    );

    // Esc, then ⌘F keeps both the query and the shared toggle.
    await page.locator('.nf-find-input').focus();
    await page.keyboard.press('Escape');
    await findBar().waitFor({ state: 'detached' });
    await page.keyboard.press('Meta+f');
    await findBar().waitFor();
    assert.equal(await page.locator('.nf-find-input').inputValue(), 'il');
    assert.equal(
      await page.locator('[data-find-whole-word="true"]').getAttribute('aria-pressed'),
      'true',
    );

    await page.locator('[data-find-whole-word="true"]').click();
    await page.waitForFunction(
      () => window.__noteforestTest.state().findTotal === 1,
      undefined,
      { timeout: 10000 },
    );
    await h.screenshot(resolve(v3ScreenshotDir, 'toggle-off.png'), {
      width: 1440,
      height: 900,
    });
  });

  it('jumps from a sidebar row in Page and in Continuous Read', async () => {
    const env = isolated('search-modes');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await openPackage(env, 'Find search modes', findDocument());

    // Page (Read): clicking a row turns to the page and rings the block.
    await page.keyboard.press('Meta+3');
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view[data-ready="true"]');
    await openSearchSection();
    await typeInSearch('quokka');
    assert.equal(await page.evaluate(() => window.__noteforestTest.state().findResults.length), 1);
    await page.locator('[data-search-row="0"]').click();
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector('.nf-page-view')?.getAttribute('data-current-page') ?? '0',
        ) > 1,
      undefined,
      { timeout: 10000 },
    );
    const pageNumber = await activePage();
    const fragment = page.locator('[data-find-current="true"][data-fragment-block="late"]');
    assert.equal(await fragment.count(), 1, 'the hit block is ringed on its page');
    assert.equal(
      Number(await fragment.getAttribute('data-fragment-page')),
      pageNumber,
      'the ring sits on the page the view moved to',
    );
    assert.equal(await page.locator('.nf-page-view .nf-find-hit').count(), 0);
    await h.screenshot(resolve(screenshotDir, 'page.png'), { width: 1440, height: 900 });

    // Continuous Read: the same row click marks the matches and selects the block.
    await page.locator('[data-view-layout="continuous"]').click();
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-prosemirror');
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      () =>
        document.querySelector('.nf-editor[data-active="true"]')?.getAttribute(
          'data-interaction-mode',
        ) === 'read',
      undefined,
      { timeout: 10000 },
    );
    await typeInSearch('needle');
    const state = await findState();
    const target = state.results.findIndex((result) => result.blockId === 'hidden');
    assert.ok(target >= 0, 'the collapsed descendant is searchable');
    await page.locator(`[data-search-row="${target}"]`).click();
    await page.waitForFunction(
      (expected) => window.__noteforestTest.state().findIndex === expected,
      target,
      { timeout: 10000 },
    );
    await h.waitSelected('hidden');
    assert.equal(
      (await hits()).filter((decoration) => decoration.current).length,
      1,
      'Read mode still marks the current match',
    );
    assert.equal(await page.locator('.nf-selection-toolbar').count(), 0, 'no editing chrome in Read');
    await h.screenshot(resolve(screenshotDir, 'read.png'), { width: 1440, height: 900 });
  });

  it('keeps every toolbar control at the minimum window width', async () => {
    const env = isolated('narrow');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await openPackage(env, 'Find narrow', findDocument());
    await page.keyboard.press('Meta+3');
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view[data-ready="true"]');
    await page.keyboard.press('Meta+f');
    await findBar().waitFor();
    const wideInput = await page
      .locator('.nf-find-input')
      .evaluate((element) => element.getBoundingClientRect().width);

    // The app's minimum window: 960 × 640.
    await h.setWindowSize(960, 640);
    await page.waitForFunction(
      () => window.innerWidth <= 960,
      undefined,
      { timeout: 10000 },
    );
    const layout = await page.evaluate(() => {
      const header = document.querySelector('[data-canvas-header="true"]');
      const bar = document.querySelector('[data-find-bar="true"]');
      const input = document.querySelector('.nf-find-input');
      const controls = [
        ...document.querySelectorAll(
          '[data-canvas-header="true"] [data-header-undo], [data-canvas-header="true"] [data-header-redo], [data-canvas-header="true"] [data-find-count], [data-canvas-header="true"] [data-find-previous], [data-canvas-header="true"] [data-find-next], [data-canvas-header="true"] [data-find-close], [data-canvas-header="true"] [data-view-layout], [data-canvas-header="true"] [data-view-interaction], [data-canvas-header="true"] [data-page-nav]',
        ),
      ];
      if (header === null || bar === null || input === null) return null;
      const headerBox = header.getBoundingClientRect();
      return {
        headerHeight: headerBox.height,
        overflow: header.scrollWidth - header.clientWidth,
        inputWidth: input.getBoundingClientRect().width,
        barWidth: bar.getBoundingClientRect().width,
        controlCount: controls.length,
        hidden: controls
          .map((element) => {
            const box = element.getBoundingClientRect();
            return {
              label: element.getAttribute('aria-label') ?? element.getAttribute('data-find-count') ?? '',
              inside:
                box.left >= headerBox.left - 0.5 && box.right <= headerBox.right + 0.5 && box.width > 0,
            };
          })
          .filter((entry) => !entry.inside),
      };
    });
    assert.ok(layout !== null);
    assert.equal(Math.round(layout.headerHeight), 34, 'the row height never changes');
    assert.equal(layout.controlCount, 12, 'all header controls are mounted');
    assert.deepEqual(layout.hidden, [], 'no header control is clipped or hidden');
    assert.equal(layout.overflow <= 1, true, `header overflows by ${layout.overflow} px`);
    assert.ok(
      layout.inputWidth < wideInput,
      `the input shrank (${layout.inputWidth} < ${wideInput}) before the controls`,
    );
    assert.ok(layout.barWidth < 360, 'the cluster shrank with the input');
    await h.screenshot(resolve(screenshotDir, 'narrow-toolbar.png'), {
      width: 960,
      height: 640,
    });
  });

  it('shows the no-document and Markdown states without results', async () => {
    const env = isolated('search-states');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await page.waitForSelector('.nf-empty-state');
    await openSearchSection();
    assert.equal(
      (await page.locator('[data-search-no-document="true"]').textContent())?.trim(),
      'Open a note to search.',
    );
    assert.equal(await searchInput().isDisabled(), true);
    assert.equal((await page.locator('[data-search-count]').textContent())?.trim(), '0');
    assert.equal(await page.locator('[data-search-row]').count(), 0);
    // ⌘F does nothing without a note.
    await page.keyboard.press('Meta+f');
    assert.equal(await findBar().count(), 0);
    await h.screenshot(resolve(screenshotDir, 'no-document.png'), {
      width: 1440,
      height: 900,
    });

    // A Markdown guest file is out of scope for find in v1.
    await mkdir(env.NOTEFOREST_LIBRARY, { recursive: true });
    const markdownPath = join(env.NOTEFOREST_LIBRARY, 'guest.md');
    await writeFile(markdownPath, '# Guest\n\nA markdown note.\n', 'utf8');
    const opened = await page.evaluate(
      (target) => window.__noteforestTest.openPath(target),
      markdownPath,
    );
    assert.equal(opened, true, 'the guest file opens');
    await page.waitForFunction(
      (target) => window.__noteforestTest.state().activeTab === target,
      markdownPath,
      { timeout: 10000 },
    );
    await page.waitForSelector('.nf-markdown-editor[data-active="true"]');
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-search-no-document="true"]')
          ?.textContent?.includes('Search is available in notes.') === true,
      undefined,
      { timeout: 10000 },
    );
    assert.equal(await searchInput().isDisabled(), true);
    assert.equal(await page.locator('[data-search-row]').count(), 0);
    await page.keyboard.press('Meta+f');
    assert.equal(await findBar().count(), 0);
    await h.screenshot(resolve(screenshotDir, 'markdown.png'), {
      width: 1440,
      height: 900,
    });
  });

  it('keeps the callout quote, state and reference chips at 20 px', async () => {
    const env = isolated('chips');
    await launch(env);
    await h.setWindowSize(1440, 900);
    const packagePath = await openPackage(env, 'Find chips', findDocument());

    // A live callout chip (anchored child) and its broken state later.
    const created = await ui.createAnchoredChild('alpha', 'eigenvalue');
    await page.waitForSelector(`[data-block-card="${created.blockId}"]`);
    // A reference chip on the source card.
    await applyCommand({
      type: 'branch.create',
      sourceBlockId: 'parent',
      targetBlockId: 'late',
      role: 'reference',
    });
    await page.waitForSelector('[data-block-card="parent"] .nf-ref-chip');

    const measure = async () =>
      page.evaluate(() => {
        const quote = document.querySelector('.nf-callout-quote');
        const ref = document.querySelector('.nf-ref-chip');
        const box = (element) =>
          element === null
            ? null
            : {
                height: element.getBoundingClientRect().height,
                fontSize: getComputedStyle(element).fontSize,
              };
        return { quote: box(quote), ref: box(ref) };
      });

    const resting = await measure();
    assert.ok(resting.quote !== null, 'the callout quote chip is rendered');
    assert.ok(resting.ref !== null, 'the reference chip is rendered');
    assert.ok(
      Math.abs(resting.quote.height - 20) <= 0.5,
      `quote chip height ${resting.quote.height} is 20`,
    );
    assert.equal(resting.quote.fontSize, '11px');
    assert.ok(
      Math.abs(resting.ref.height - 20) <= 0.5,
      `reference chip height ${resting.ref.height} is 20`,
    );
    assert.equal(resting.ref.fontSize, '10.5px');

    // Break the anchor: the state chip appears on the callout row and shares
    // the 20 px height.
    await applyCommand({
      type: 'block.editContent',
      blockId: 'alpha',
      content: {
        type: 'doc',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'The quoted word moved away.' }],
          },
        ],
      },
    });
    await page.waitForSelector(`[data-block-card="${created.blockId}"] .nf-callout-state`);
    const stateChip = await page.evaluate(() => {
      const element = document.querySelector('.nf-callout-state');
      return element === null
        ? null
        : {
            height: element.getBoundingClientRect().height,
            fontSize: getComputedStyle(element).fontSize,
          };
    });
    assert.ok(stateChip !== null);
    assert.ok(
      Math.abs(stateChip.height - 20) <= 0.5,
      `state chip height ${stateChip.height} is 20`,
    );
    assert.equal(stateChip.fontSize, '10.5px');

    assert.equal(
      await page.evaluate(() => window.__noteforestTest.state().activeTab),
      packagePath,
    );
  });
});
