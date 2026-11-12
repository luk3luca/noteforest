import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { addTopLevelBlock } from '../support/fixtures.mjs';

const tempRoot = artifactsPath('m3c2a-ui');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
const {
  isolated,
  structure,
  seedDemo,
  openTermDialog,
  selectRange,
  waitForFormulaBinding,
} = ui;
let page;

async function launch(overrides = {}) {
  page = await ui.launch(overrides);
}

describe('NoteForest M3c2a formula term anchors', () => {
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

  it('branches from a term, undoes once, shows repeated terms ambiguous, and reloads', async () => {
    const env = isolated('formula-term');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await seedDemo();

    const parentId = 'm3c2a-term-parent';
    const uniqueLatex = 'Av = \\lambda v';
    const repeatedLatex = '\\lambda + \\lambda';
    await addTopLevelBlock(ui, parentId, {
      type: 'doc',
      children: [
        { type: 'paragraph', children: [{ type: 'text', text: 'Formula term source' }] },
        { type: 'mathBlock', attrs: { latex: uniqueLatex } },
        { type: 'mathBlock', attrs: { latex: repeatedLatex } },
      ],
    });
    await h.waitLayout({ blocks: 8, arrows: 3 });
    const before = await structure();

    // The existing formula editor opens on double click; selecting a LaTeX
    // substring exposes the term action.
    const uniqueTextarea = await openTermDialog(parentId, 0);
    assert.equal(await uniqueTextarea.inputValue(), uniqueLatex);
    assert.equal(
      await page.locator('[data-testid="branch-from-term"]').count(),
      0,
      'no term action before a selection',
    );
    await selectRange(uniqueTextarea, 5, 7);
    const branchButton = page.locator('[data-testid="branch-from-term"]');
    await branchButton.waitFor({ state: 'visible' });
    assert.equal((await branchButton.textContent())?.trim(), 'Branch from term');
    await branchButton.click();
    await page.waitForSelector('.nf-textarea', { state: 'detached' });
    await h.waitCanonicalBlockCount(9);
    await h.waitBlockCount(9);
    await h.waitLayout({ blocks: 9, arrows: 4 });

    const created = await structure();
    const anchorId = Object.keys(created.anchors).find(
      (id) => created.anchors[id].kind === 'formula',
    );
    assert.equal(typeof anchorId, 'string');
    const anchor = created.anchors[anchorId];
    assert.equal(anchor.blockId, parentId);
    assert.equal(anchor.kind, 'formula');
    assert.equal(anchor.quote, '\\lambda');
    assert.equal(anchor.prefix, 'Av = ');
    assert.equal(anchor.suffix, ' v');
    assert.equal(anchor.occurrenceHint, 1);
    assert.deepEqual(anchor.selector, {
      kind: 'formula',
      form: 'term',
      latex: '\\lambda',
      latexStart: 5,
      latexPrefix: 'Av = ',
      latexSuffix: ' v',
      occurrenceHint: 1,
    });
    assert.deepEqual(
      created.blocks[parentId].content.children[1].attrs.anchorIds,
      [anchorId],
      'the term binding lives on the formula node',
    );
    const branch = Object.values(created.branches).find(
      (candidate) => candidate.source.anchorId === anchorId,
    );
    assert.equal(branch?.role, 'primary');
    assert.equal(branch?.source.blockId, parentId);
    const childId = branch?.targetBlockId;
    assert.equal(typeof childId, 'string');

    await waitForFormulaBinding(parentId, anchorId);
    const callout = page.locator(`[data-callout-row="true"][data-anchor-id="${anchorId}"]`);
    await callout.waitFor();
    const quoteChip = callout.locator('.nf-callout-quote');
    assert.equal(await quoteChip.getAttribute('data-anchor-kind'), 'formula');
    assert.equal(await quoteChip.getAttribute('data-anchor-quote'), '\\lambda');
    assert.equal(await quoteChip.getAttribute('data-anchor-state'), 'resolved');
    // The term renders inline with KaTeX, not as raw LaTeX text.
    assert.equal(await quoteChip.getAttribute('data-anchor-formula'), 'katex');
    assert.equal(await quoteChip.locator('.nf-callout-quote-formula .katex').count(), 1);
    assert.match(await quoteChip.getAttribute('title'), /\\lambda/);
    assert.equal(await quoteChip.evaluate((el) => getComputedStyle(el).borderRadius), '3px');

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

    // One ⌘Z removes the child, branch and new anchor exactly.
    await page.keyboard.press('Meta+z');
    await h.waitCanonicalBlockCount(8);
    await h.waitBlockCount(8);
    assert.deepEqual(await structure(), before);
    await page.waitForSelector('[data-anchor-kind="formula"][data-anchor-ids]', {
      state: 'detached',
    });

    // Redo keeps the anchor and branch IDs.
    await page.keyboard.press('Meta+Shift+z');
    await h.waitCanonicalBlockCount(9);
    const redone = await structure();
    assert.deepEqual(redone.anchors[anchorId], created.anchors[anchorId]);
    assert.deepEqual(redone.branches[branch.id], created.branches[branch.id]);

    // A term that occurs twice is created but immediately ambiguous: the hint
    // ranks candidates and never picks one.
    const repeatedTextarea = await openTermDialog(parentId, 1);
    await selectRange(repeatedTextarea, 0, 7);
    await page.locator('[data-testid="branch-from-term"]').click();
    await page.waitForSelector('.nf-textarea', { state: 'detached' });
    await h.waitCanonicalBlockCount(10);
    await h.waitBlockCount(10);
    await h.waitLayout({ blocks: 10, arrows: 5 });

    const repeated = await structure();
    assert.equal(Object.keys(repeated.anchors).length, 2);
    const repeatedAnchorId = Object.keys(repeated.anchors).find(
      (id) => id !== anchorId,
    );
    assert.equal(typeof repeatedAnchorId, 'string');
    assert.deepEqual(repeated.anchors[repeatedAnchorId].selector, {
      kind: 'formula',
      form: 'term',
      latex: '\\lambda',
      latexStart: 0,
      latexSuffix: ' + \\lambda',
      occurrenceHint: 1,
    });
    assert.deepEqual(
      repeated.blocks[parentId].content.children[2].attrs.anchorIds,
      [repeatedAnchorId],
    );

    const repeatedCallout = page.locator(
      `[data-callout-row="true"][data-anchor-id="${repeatedAnchorId}"]`,
    );
    await repeatedCallout.waitFor();
    const repeatedChip = repeatedCallout.locator('.nf-callout-quote');
    assert.equal(await repeatedChip.getAttribute('data-anchor-state'), 'ambiguous');
    // An ambiguous term still renders its known selector source inline and
    // keeps the warning state beside the chip.
    assert.equal(await repeatedChip.getAttribute('data-anchor-formula'), 'katex');
    assert.equal(await repeatedChip.locator('.nf-callout-quote-formula .katex').count(), 1);
    assert.equal(
      (await repeatedCallout.locator('.nf-callout-state').textContent())?.trim(),
      'Ambiguous',
    );
    const warning = page.locator(`[data-anchor-warning="${repeatedAnchorId}"]`);
    await warning.waitFor();
    assert.equal(await warning.getAttribute('data-anchor-state'), 'ambiguous');

    // Screenshot evidence: resolved term callout and ambiguous repeated term.
    await mkdir(artifactsPath('m3c2a'), { recursive: true });
    await page.locator(`[data-block-card="${parentId}"]`).scrollIntoViewIfNeeded();
    await h.waitLayout({ blocks: 10, arrows: 5 });
    await h.screenshot(artifactsPath('m3c2a', 'formula-term-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // A new formula without a node position never offers the term action.
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('.nf-palette');
    await page.locator('.nf-palette-input').fill('Insert math');
    const paletteItem = page.locator('.nf-palette-item', { hasText: 'Insert math' }).first();
    await paletteItem.waitFor({ state: 'visible' });
    await paletteItem.click();
    const insertTextarea = page.locator('.nf-textarea');
    await insertTextarea.waitFor({ state: 'visible' });
    await insertTextarea.fill('\\lambda^2');
    await insertTextarea.press('Meta+a');
    assert.equal(
      await page.locator('[data-testid="branch-from-term"]').count(),
      0,
      'inserting a new formula has no term anchor to bind',
    );
    await page.keyboard.press('Escape');
    await page.waitForSelector('.nf-textarea', { state: 'detached' });

    // Save and reload: both anchors, selectors, states and the term chips
    // survive the persisted atomic binding.
    await page.keyboard.press('Meta+s');
    await h.waitSaved();
    await h.quit();
    await launch(env);
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await waitForFormulaBinding(parentId, anchorId);
    await waitForFormulaBinding(parentId, repeatedAnchorId);
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
    const reloadedRepeated = page.locator(
      `[data-callout-row="true"][data-anchor-id="${repeatedAnchorId}"] .nf-callout-quote`,
    );
    assert.equal(await reloadedRepeated.getAttribute('data-anchor-state'), 'ambiguous');
    const reloadedUnique = page.locator(
      `[data-callout-row="true"][data-anchor-id="${anchorId}"] .nf-callout-quote`,
    );
    assert.equal(await reloadedUnique.getAttribute('data-anchor-state'), 'resolved');

    // Selecting the callout focuses the parent and exposes the real marker
    // buttons over both formula nodes; the repeated term keeps its warning.
    await reloadedUnique.click();
    await page.waitForSelector(`[data-anchor-marker-id="${anchorId}"]`);
    await page.waitForSelector(
      `[data-anchor-marker-id="${repeatedAnchorId}"][data-anchor-state="ambiguous"]`,
    );

    await page.keyboard.press('Meta+s');
    await h.waitSaved();
  });
});
