import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { addTopLevelBlock } from '../support/fixtures.mjs';

const tempRoot = artifactsPath('m3c3a-ui');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
const { isolated, structure, seedDemo } = ui;
let page;

const CODE_TEXT =
  "values = eigvals(A) + eigvals(B)  # stable eigenvalues of the symmetric matrix\nprint('done')";
const FIRST_LINE = CODE_TEXT.split('\n')[0];

async function launch(overrides = {}) {
  page = await ui.launch(overrides);
}

function codePre(parentId) {
  return page.locator(`[data-block-card="${parentId}"] pre[data-anchor-kind="code"]`).first();
}

async function selectCodeCharacters(parentId, count, skip = 0) {
  const pre = codePre(parentId);
  await pre.waitFor();
  // A previous wide selection may have scrolled the <pre>; reset it so the
  // click lands at the first character, then move by keyboard from line start.
  await pre.evaluate((element) => {
    element.scrollLeft = 0;
  });
  await pre.locator('code').click({ position: { x: 2, y: 8 } });
  await page.keyboard.press('Home');
  for (let index = 0; index < skip; index += 1) {
    await page.keyboard.press('ArrowRight');
  }
  await page.keyboard.down('Shift');
  for (let index = 0; index < count; index += 1) {
    await page.keyboard.press('ArrowRight');
  }
  await page.keyboard.up('Shift');
  // Keyboard selection updates the DOM first; ProseMirror syncs the text
  // selection on the next selectionchange. The Branch bubble is the visible
  // signal that the editor state is ready, not a fixed delay.
  await page
    .locator('[data-testid="selection-toolbar"] [data-action="branch-from-selection"]')
    .waitFor({ state: 'visible', timeout: 10000 });
}

async function waitForCodeBinding(parentId, anchorId) {
  await page.waitForFunction(
    ({ blockId, anchorId: expected }) => {
      const card = document.querySelector(
        `.nf-editor[data-active="true"] [data-block-card="${blockId}"]`,
      );
      const blocks = card?.querySelectorAll('pre[data-anchor-kind="code"][data-anchor-ids]');
      if (blocks === null || blocks === undefined) return false;
      return [...blocks].some((block) =>
        (block.getAttribute('data-anchor-ids') ?? '').split(',').includes(expected),
      );
    },
    { blockId: parentId, anchorId },
    { timeout: 10000 },
  );
}

async function waitForCodeMarker(anchorId) {
  await page.waitForFunction(
    (expected) => {
      const marker = document.querySelector(`[data-code-anchor-id="${expected}"]`);
      if (marker === null) return false;
      const rect = marker.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    },
    anchorId,
    { timeout: 10000 },
  );
}

async function waitForCodeHighlight(anchorId) {
  await page.waitForFunction(
    (expected) => {
      const highlight = document.querySelector(`[data-code-anchor-range="${expected}"]`);
      if (highlight === null) return false;
      const rect = highlight.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    },
    anchorId,
    { timeout: 10000 },
  );
}

describe('NoteForest M3c3a code range anchors', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('branches from a code range, undoes once, warns on repeated quotes, and reloads', async () => {
    const env = isolated('code-anchor');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await seedDemo();

    const parentId = 'm3c3a-code-parent';
    await addTopLevelBlock(ui, parentId, {
      type: 'doc',
      children: [
        { type: 'paragraph', children: [{ type: 'text', text: 'Code range source' }] },
        {
          type: 'codeBlock',
          attrs: { language: 'python' },
          children: [{ type: 'text', text: CODE_TEXT }],
        },
      ],
    });
    await h.waitLayout({ blocks: 8, arrows: 3 });
    const before = await structure();

    // Select the first line with real keyboard events inside the editable code
    // block, then use the M3 branch shortcut.
    await selectCodeCharacters(parentId, FIRST_LINE.length);
    await page.keyboard.press('Meta+Shift+Enter');
    await h.waitCanonicalBlockCount(9);
    await h.waitBlockCount(9);
    await h.waitLayout({ blocks: 9, arrows: 4 });

    const created = await structure();
    const anchorId = Object.keys(created.anchors).find(
      (id) => created.anchors[id].kind === 'code',
    );
    assert.equal(typeof anchorId, 'string');
    const anchor = created.anchors[anchorId];
    assert.equal(anchor.blockId, parentId);
    assert.equal(anchor.kind, 'code');
    assert.equal(anchor.quote, FIRST_LINE);
    assert.equal(anchor.occurrenceHint, 1);
    assert.deepEqual(anchor.selector, {
      kind: 'code',
      quote: FIRST_LINE,
      form: 'range',
      suffix: "\nprint('done')",
      occurrenceHint: 1,
      startOffset: 0,
      endOffset: FIRST_LINE.length,
      lineStart: 1,
      lineEnd: 1,
    });
    assert.deepEqual(
      created.blocks[parentId].content.children[1].attrs.anchorIds,
      [anchorId],
      'the code range binds through anchorIds on the codeBlock node',
    );
    const branch = Object.values(created.branches).find(
      (candidate) => candidate.source.anchorId === anchorId,
    );
    assert.equal(branch?.role, 'primary');
    assert.equal(branch?.source.blockId, parentId);
    const childId = branch?.targetBlockId;
    assert.equal(typeof childId, 'string');

    await waitForCodeBinding(parentId, anchorId);
    const pre = codePre(parentId);
    assert.equal(await pre.getAttribute('data-anchor-kind'), 'code');
    await waitForCodeMarker(anchorId);
    const marker = page.locator(`[data-code-anchor-id="${anchorId}"]`);
    assert.equal(await marker.getAttribute('data-code-anchor-line'), '1');
    const markerBox = await marker.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    assert.ok(markerBox.width > 0 && markerBox.height > 0, 'the gutter marker is visible');

    const highlights = page.locator(`[data-code-anchor-range="${anchorId}"]`);
    assert.ok((await highlights.count()) >= 1, 'the first selected line is highlighted');
    await waitForCodeHighlight(anchorId);
    const firstHighlight = await highlights.first().evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    assert.ok(
      firstHighlight.width > 0 && firstHighlight.height > 0,
      'the code range highlight has a visible rectangle',
    );

    const callout = page.locator(`[data-callout-row="true"][data-anchor-id="${anchorId}"]`);
    await callout.waitFor();
    const quoteChip = callout.locator('.nf-callout-quote');
    assert.equal(await quoteChip.getAttribute('data-anchor-kind'), 'code');
    // The callout data attribute is the display quote: whitespace is collapsed
    // and capped for the chip, while the canonical selector keeps the exact
    // multi-line code source.
    const displayQuote = await quoteChip.getAttribute('data-anchor-quote');
    assert.ok(displayQuote.startsWith(FIRST_LINE.replace(/\s+/g, ' ').trim().slice(0, 40)));
    assert.ok(displayQuote.endsWith('…'), 'the callout quote is capped');
    assert.equal(await quoteChip.getAttribute('data-anchor-state'), 'resolved');
    const chipText = (await quoteChip.locator('.nf-callout-quote-text').textContent())?.trim();
    assert.ok(chipText.length < FIRST_LINE.length, 'the code quote chip is truncated');
    assert.ok(chipText.endsWith('…'), 'the truncated code quote ends with an ellipsis');

    // The child is focused after the branch.
    await page.waitForFunction(
      (expected) => {
        const current = window.__noteforestTest.state();
        const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
        return runtime?.selectedBlockId === expected;
      },
      childId,
      { timeout: 10000 },
    );

    // One ⌘Z removes the child, branch and new anchor exactly; redo keeps IDs.
    await page.keyboard.press('Meta+z');
    await h.waitCanonicalBlockCount(8);
    await h.waitBlockCount(8);
    assert.deepEqual(await structure(), before);
    await page.waitForSelector(`[data-code-anchor-id="${anchorId}"]`, { state: 'detached' });

    await page.keyboard.press('Meta+Shift+z');
    await h.waitCanonicalBlockCount(9);
    const redone = await structure();
    assert.deepEqual(redone.anchors[anchorId], created.anchors[anchorId]);
    assert.deepEqual(redone.branches[branch.id], created.branches[branch.id]);
    await waitForCodeMarker(anchorId);

    // A repeated quote is created but immediately ambiguous: the offset and
    // context hints rank the candidates and never pick one.
    await selectCodeCharacters(parentId, 'eigvals'.length, FIRST_LINE.indexOf('eigvals'));
    await page.keyboard.press('Meta+Shift+Enter');
    await h.waitCanonicalBlockCount(10);
    await h.waitBlockCount(10);
    await h.waitLayout({ blocks: 10, arrows: 5 });

    const repeated = await structure();
    assert.equal(Object.keys(repeated.anchors).length, 2);
    const repeatedAnchorId = Object.keys(repeated.anchors).find((id) => id !== anchorId);
    assert.equal(typeof repeatedAnchorId, 'string');
    const codePoints = Array.from(CODE_TEXT);
    const secondStart = FIRST_LINE.indexOf('eigvals');
    const secondEnd = secondStart + 'eigvals'.length;
    const secondPrefix = codePoints
      .slice(Math.max(0, secondStart - 32), secondStart)
      .join('');
    const secondSuffix = codePoints.slice(secondEnd, secondEnd + 32).join('');
    assert.deepEqual(repeated.anchors[repeatedAnchorId].selector, {
      kind: 'code',
      quote: 'eigvals',
      form: 'range',
      ...(secondPrefix.length === 0 ? {} : { prefix: secondPrefix }),
      suffix: secondSuffix,
      occurrenceHint: 1,
      startOffset: secondStart,
      endOffset: secondEnd,
      lineStart: 1,
      lineEnd: 1,
    });
    assert.deepEqual(
      repeated.blocks[parentId].content.children[1].attrs.anchorIds.sort(),
      [anchorId, repeatedAnchorId].sort(),
    );

    const repeatedCallout = page.locator(
      `[data-callout-row="true"][data-anchor-id="${repeatedAnchorId}"]`,
    );
    await repeatedCallout.waitFor();
    const repeatedChip = repeatedCallout.locator('.nf-callout-quote');
    assert.equal(await repeatedChip.getAttribute('data-anchor-state'), 'ambiguous');
    assert.equal(
      (await repeatedChip.locator('.nf-callout-quote-text').textContent())?.trim(),
      'eigvals',
    );
    assert.equal(
      (await repeatedCallout.locator('.nf-callout-state').textContent())?.trim(),
      'Ambiguous',
    );
    const warning = page.locator(`[data-anchor-warning="${repeatedAnchorId}"]`);
    await warning.waitFor();
    assert.equal(await warning.getAttribute('data-anchor-state'), 'ambiguous');
    assert.equal((await warning.textContent())?.trim(), 'Ambiguous anchor');
    // Ambiguous code anchors keep their callout and warning but do not pretend
    // to have one precise range highlight.
    assert.equal(
      await page.locator(`[data-code-anchor-range="${repeatedAnchorId}"]`).count(),
      0,
    );

    // Screenshot evidence: resolved code range plus ambiguous repeated quote.
    await mkdir(artifactsPath('m3c3a'), { recursive: true });
    await page.locator(`[data-callout-lane="${parentId}"]`).scrollIntoViewIfNeeded();
    await h.waitLayout({ blocks: 10, arrows: 5 });
    await h.screenshot(artifactsPath('m3c3a', 'code-anchor-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // Save and reload: both anchors, selectors, states and markers survive.
    await page.keyboard.press('Meta+s');
    await h.waitSaved();
    await h.quit();
    await launch(env);
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await waitForCodeBinding(parentId, anchorId);
    await waitForCodeBinding(parentId, repeatedAnchorId);
    await waitForCodeMarker(anchorId);
    await page.waitForFunction(
      (id) =>
        document.querySelectorAll(`[data-callout-lane="${id}"] [data-callout-row="true"]`)
          .length === 2,
      parentId,
      { timeout: 10000 },
    );

    const reloaded = await structure();
    assert.deepEqual(reloaded.anchors[anchorId], created.anchors[anchorId]);
    assert.deepEqual(reloaded.anchors[repeatedAnchorId], repeated.anchors[repeatedAnchorId]);
    assert.equal(Object.keys(reloaded.branches).length, Object.keys(repeated.branches).length);
    assert.equal(
      await page
        .locator(`[data-callout-row="true"][data-anchor-id="${repeatedAnchorId}"] .nf-callout-quote`)
        .getAttribute('data-anchor-state'),
      'ambiguous',
    );

    // The code block stays an editable prose surface after reload: a fresh
    // keyboard selection still reaches the code text and its gutter marker.
    await selectCodeCharacters(parentId, 'values'.length);
    assert.equal(
      await page.evaluate(() => window.getSelection()?.toString() ?? ''),
      'values',
    );
    assert.equal(
      await codePre(parentId).evaluate((element) =>
        element.closest('[contenteditable]')?.getAttribute('contenteditable'),
      ),
      'true',
    );

    await page.keyboard.press('Meta+s');
    await h.waitSaved();
  });
});
