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
 * Phase 6 find bar (`⌘F`, docs/design/find-bar.md).
 *
 * The bar is the VS Code widget minus the toggles: query, `1 of 4`,
 * previous/next, close. It searches the open note (block text, code, LaTeX,
 * anchor quotes, branch labels, chapter titles; literal, case-insensitive, one
 * result per occurrence, 100 cap), marks every match in Continuous and rings the
 * block in Page, and Escape restores the selection saved when it opened.
 */

const tempRoot = artifactsPath('find-bar-ui');
const screenshotDir = artifactsPath('find-bar');
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

describe('find bar (⌘F)', () => {
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

    // The bar is exactly query + count + previous/next + close.
    assert.equal(
      await page
        .locator('[data-find-bar="true"] input, [data-find-bar="true"] button')
        .count(),
      4,
      'one input and three buttons',
    );
    assert.equal(await page.locator('[data-find-bar="true"] [role="menu"]').count(), 0);
    assert.equal(await page.locator('[data-find-bar="true"] input[type="checkbox"]').count(), 0);
    assert.equal(
      await page.locator('.nf-find-count').getAttribute('aria-live'),
      'polite',
    );

    // Geometry: 360 × 40, 10 px from the canvas top-right corner, floating over
    // the note (the canvas flow and the Page zoom never change).
    const geometry = await page.evaluate(() => {
      const bar = document.querySelector('[data-find-bar="true"]');
      const panel = document.querySelector('.nf-canvas-panel');
      if (bar === null || panel === null) return null;
      const barBox = bar.getBoundingClientRect();
      const panelBox = panel.getBoundingClientRect();
      const style = getComputedStyle(bar);
      return {
        width: barBox.width,
        height: barBox.height,
        insetRight: panelBox.right - 1 - barBox.right,
        insetTop: barBox.top - (panelBox.top + 1),
        position: style.position,
        radius: style.borderTopLeftRadius,
      };
    });
    assert.ok(geometry !== null);
    assert.equal(Math.round(geometry.width), 360);
    assert.equal(Math.round(geometry.height), 40);
    assert.ok(Math.abs(geometry.insetRight - 10) <= 0.5, `right inset ${geometry.insetRight}`);
    assert.ok(Math.abs(geometry.insetTop - 44) <= 0.5, `top offset ${geometry.insetTop}`);
    assert.equal(geometry.position, 'absolute');
    assert.equal(geometry.radius, '8px');

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
      'nf-find-button',
      'Tab leaves the input',
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
