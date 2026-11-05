import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifactsPath, createHarness } from '../support/harness.mjs';

const tempRoot = artifactsPath('m3c1-ui');
const h = createHarness({ tempRoot });
let page;

function isolated(name) {
  return {
    NOTEFOREST_LIBRARY: resolve(tempRoot, `${name}-library`),
    NOTEFOREST_APP_SUPPORT: resolve(tempRoot, `${name}-support`),
  };
}

async function launch(overrides = {}) {
  await h.launch(overrides);
  page = h.page;
}

async function applyCommand(command) {
  const result = await page.evaluate(
    (value) => window.__noteforestTest.applyStructural(value),
    command,
  );
  assert.equal(result.ok, true, result.message ?? 'structural command was rejected');
  return result;
}

async function structure() {
  return page.evaluate(() => window.__noteforestTest.structure());
}

async function waitForCalloutOffset(parentId, count) {
  await page.waitForFunction(
    ({ parentId: id, count: expected }) => {
      const card = document.querySelector(
        `.nf-editor[data-active="true"] [data-block-card="${id}"]`,
      );
      const lane = card?.closest('.nf-block-inner')?.querySelector('.nf-callout-lane');
      if (lane === null || lane === undefined) return false;
      const rows = [...lane.querySelectorAll('[data-callout-row="true"]')].filter(
        (row) => row.closest('.nf-callout-lane') === lane,
      );
      if (rows.length !== expected) return false;
      return rows.every((row) => row.style.getPropertyValue('--nf-callout-offset') !== '');
    },
    { parentId, count },
    { timeout: 10000, polling: 100 },
  );
}

async function waitForFormulaBinding(blockId, anchorId) {
  await page.waitForFunction(
    ({ blockId: id, anchorId: expected }) => {
      const card = document.querySelector(
        `.nf-editor[data-active="true"] [data-block-card="${id}"]`,
      );
      const formula = card?.querySelector('[data-anchor-kind="formula"][data-anchor-ids]');
      if (formula === null || formula === undefined) return false;
      return (formula.getAttribute('data-anchor-ids') ?? '').split(',').includes(expected);
    },
    { blockId, anchorId },
    { timeout: 10000 },
  );
}

describe('NoteForest M3c1 whole-formula anchors', () => {
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

  it('branches from a block formula, undoes once, reuses the anchor, and reloads', async () => {
    const env = isolated('formula-anchor');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    await h.waitLayout({ blocks: 7, arrows: 3 });

    const seeded = await structure();
    const chapterId = seeded.chapters[0].id;
    const parentId = 'm3c1-formula-parent';
    const latex = 'E = mc^2';
    await applyCommand({
      type: 'block.create',
      blockId: parentId,
      content: {
        type: 'doc',
        children: [
          { type: 'paragraph', children: [{ type: 'text', text: 'Formula source' }] },
          { type: 'mathBlock', attrs: { latex } },
        ],
      },
      placement: { kind: 'top-level', chapterId },
    });
    await page.waitForSelector(`[data-block-card="${parentId}"]`);
    await h.waitLayout({ blocks: 8, arrows: 3 });
    const before = await structure();

    const sourceFormula = page.locator(
      `[data-block-card="${parentId}"] [data-type="block-math"].tiptap-mathematics-render`,
    );
    await sourceFormula.waitFor();
    await sourceFormula.click();
    await page.waitForFunction(
      (id) => {
        const card = document.querySelector(
          `.nf-editor[data-active="true"] [data-block-card="${id}"]`,
        );
        return (
          card?.querySelector('.tiptap-mathematics-render.ProseMirror-selectednode') !== null &&
          card?.querySelector('.tiptap-mathematics-render.ProseMirror-selectednode') !== undefined
        );
      },
      parentId,
      { timeout: 10000 },
    );
    await h.waitSelected(parentId);

    // ⌘⇧Return creates the whole-formula anchor, child and branch in one step.
    await page.keyboard.press('Meta+Shift+Enter');
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
    assert.equal(anchor.quote, latex);
    assert.deepEqual(anchor.selector, { kind: 'formula', form: 'whole', latex });
    const childBranch = Object.values(created.branches).find(
      (branch) => branch.source.anchorId === anchorId,
    );
    assert.equal(childBranch?.role, 'primary');
    assert.equal(childBranch?.source.blockId, parentId);
    const childId = childBranch?.targetBlockId;
    assert.equal(typeof childId, 'string');

    // The formula node carries the atomic binding; the callout chip shows the
    // truncated LaTeX and keeps the lane/routing projection from M3b2a.
    await waitForFormulaBinding(parentId, anchorId);
    const callout = page.locator(`[data-callout-row="true"][data-anchor-id="${anchorId}"]`);
    await callout.waitFor();
    const quoteChip = callout.locator('.nf-callout-quote');
    assert.equal(await quoteChip.getAttribute('data-anchor-kind'), 'formula');
    assert.equal(await quoteChip.getAttribute('data-anchor-quote'), latex);
    assert.equal(
      (await quoteChip.locator('.nf-callout-quote-text').textContent())?.trim(),
      latex,
    );
    assert.equal(await quoteChip.getAttribute('data-anchor-state'), 'resolved');
    await waitForCalloutOffset(parentId, 1);

    // The child is focused and editable immediately after the branch.
    await page.waitForFunction(
      (expected) => {
        const current = window.__noteforestTest.state();
        const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
        if (runtime?.selectedBlockId !== expected) return false;
        const node = window.getSelection()?.anchorNode;
        if (node === null || node === undefined) return false;
        const element = node instanceof Element ? node : node.parentElement;
        return element?.closest('[data-block-card]')?.getAttribute('data-block-card') === expected;
      },
      childId,
      { timeout: 10000 },
    );

    // One ⌘Z removes branch, child and the new anchor exactly.
    await page.keyboard.press('Meta+z');
    await h.waitCanonicalBlockCount(8);
    await h.waitBlockCount(8);
    assert.deepEqual(
      await page.evaluate(() => window.__noteforestTest.structure()),
      before,
      'undo restores the source content and removes every created record',
    );
    await page.waitForSelector('[data-anchor-kind="formula"][data-anchor-ids]', {
      state: 'detached',
    });

    // Redo restores the same IDs and focuses the child again.
    await page.keyboard.press('Meta+Shift+z');
    await h.waitCanonicalBlockCount(9);
    const redone = await structure();
    assert.deepEqual(Object.keys(redone.blocks).sort(), Object.keys(created.blocks).sort());
    assert.deepEqual(Object.keys(redone.anchors).sort(), Object.keys(created.anchors).sort());
    assert.deepEqual(Object.keys(redone.branches).sort(), Object.keys(created.branches).sort());
    assert.deepEqual(redone.anchors[anchorId], created.anchors[anchorId]);
    assert.equal(redone.branches[childBranch.id]?.source.anchorId, anchorId);

    // The floating toolbar reuses the exact formula anchor instead of creating
    // a second one; undo keeps the anchor and the original child.
    const formula = page.locator(
      `[data-block-card="${parentId}"] [data-type="block-math"].tiptap-mathematics-render`,
    );
    await formula.click();
    await page.waitForSelector(
      '[data-testid="selection-toolbar"] [data-action="branch-from-selection"]',
    );
    await page.locator('[data-action="branch-from-selection"]').click();
    await h.waitCanonicalBlockCount(10);
    await h.waitBlockCount(10);
    const reused = await structure();
    assert.deepEqual(Object.keys(reused.anchors), [anchorId]);
    assert.equal(
      Object.values(reused.branches).filter(
        (branch) => branch.source.anchorId === anchorId,
      ).length,
      2,
      'the toolbar reuses the existing formula anchor',
    );
    await page.keyboard.press('Meta+z');
    await h.waitCanonicalBlockCount(9);
    await h.waitBlockCount(9);
    const afterReuseUndo = await structure();
    assert.deepEqual(Object.keys(afterReuseUndo.anchors), [anchorId]);
    assert.ok(afterReuseUndo.blocks[childId] !== undefined, 'the original child survives');

    // Branch once more; the new child is focused, so type immediately. This is
    // the M3c1 authoring contract, exercised through the toolbar path.
    await formula.click();
    await page.waitForSelector(
      '[data-testid="selection-toolbar"] [data-action="branch-from-selection"]',
    );
    await page.locator('[data-action="branch-from-selection"]').click();
    await h.waitCanonicalBlockCount(10);
    await h.waitBlockCount(10);
    const typedStructure = await structure();
    const typedBranch = Object.values(typedStructure.branches).find(
      (branch) => branch.source.anchorId === anchorId && branch.targetBlockId !== childId,
    );
    const typedChildId = typedBranch?.targetBlockId;
    assert.equal(typeof typedChildId, 'string');
    await h.waitSelected(typedChildId);
    await page.keyboard.type('Formula child note');
    await h.waitEditorText('Formula child note');
    await page.keyboard.press('Meta+s');
    await h.waitSaved();

    // Reload: the whole-formula anchor, both branches, the child text and the
    // callout placement all survive the persisted binding.
    await h.quit();
    await launch(env);
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitEditorText('Formula child note');
    await waitForFormulaBinding(parentId, anchorId);
    await page.waitForFunction(
      (id) =>
        document.querySelectorAll(`[data-callout-lane="${id}"] [data-callout-row="true"]`)
          .length === 2,
      parentId,
      { timeout: 10000 },
    );
    const reloaded = await structure();
    assert.equal(reloaded.anchors[anchorId]?.kind, 'formula');
    assert.deepEqual(reloaded.anchors[anchorId]?.selector, {
      kind: 'formula',
      form: 'whole',
      latex,
    });
    assert.equal(reloaded.branches[childBranch.id]?.source.anchorId, anchorId);
    assert.equal(
      Object.values(reloaded.branches).filter(
        (branch) => branch.source.anchorId === anchorId,
      ).length,
      2,
      'reload keeps both branches on the reused anchor',
    );
    assert.match(JSON.stringify(reloaded.blocks[typedChildId]?.content), /Formula child note/);
    assert.equal(
      await page
        .locator(`[data-parent-id="${parentId}"] [data-block-card="${childId}"]`)
        .count(),
      1,
      'the anchored child keeps its callout placement after reload',
    );

    // Selected anchor state: the formula highlights and its real marker button
    // is reachable when the parent block is the selection.
    const reloadedCallout = page.locator(
      `[data-callout-row="true"][data-anchor-id="${anchorId}"]`,
    ).first();
    await reloadedCallout.locator('.nf-callout-quote').click();
    await page.waitForSelector(`[data-anchor-marker-id="${anchorId}"]`);
    await page.waitForFunction(
      ({ blockId, anchorId: expected }) => {
        const card = document.querySelector(
          `.nf-editor[data-active="true"] [data-block-card="${blockId}"]`,
        );
        const formulaNode = card?.querySelector('[data-anchor-kind="formula"][data-anchor-ids]');
        if (formulaNode === null || formulaNode === undefined) return false;
        if (formulaNode.getAttribute('data-anchor-selected') !== 'true') return false;
        const marker = card.querySelector(`[data-anchor-marker-id="${expected}"]`);
        return marker !== null && marker.getAttribute('data-anchor-state') === 'resolved';
      },
      { blockId: parentId, anchorId },
      { timeout: 10000 },
    );
    const marker = page.locator(`[data-anchor-marker-id="${anchorId}"]`);
    assert.match(await marker.getAttribute('aria-label'), /E = mc\^2/);

    await mkdir(artifactsPath('m3c1'), { recursive: true });
    await page.locator(`[data-block-card="${parentId}"]`).scrollIntoViewIfNeeded();
    await h.waitLayout({ blocks: 10, arrows: 5 });
    await h.screenshot(artifactsPath('m3c1', 'formula-anchor-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    await page.keyboard.press('Meta+s');
    await h.waitSaved();
  });
});
