import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import {
  addAnchor,
  addBranch,
  addTopLevelBlock,
  codeDoc,
  formulaDoc,
  textDoc,
} from '../support/fixtures.mjs';

const tempRoot = artifactsPath('m3e-ui');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
const {
  isolated,
  applyCommand,
  structure,
  waitForHealthChip,
  openAnchorHealthFromChip,
  openAnchorHealthFromWarning,
} = ui;
let page;

async function launch(overrides = {}) {
  page = await ui.launch(overrides);
}

const ids = {
  text: {
    source: 'm3e-source-text',
    target: 'm3e-target-text',
    anchor: 'm3e-anchor-text-ambiguous',
  },
  brokenText: {
    source: 'm3e-source-broken-text',
    target: 'm3e-target-broken-text',
    anchor: 'm3e-anchor-text-broken',
  },
  formula: {
    source: 'm3e-source-formula',
    target: 'm3e-target-formula',
    anchor: 'm3e-anchor-formula-ambiguous',
  },
  code: {
    source: 'm3e-source-code',
    target: 'm3e-target-code',
    anchor: 'm3e-anchor-code-ambiguous',
  },
  brokenCode: {
    source: 'm3e-source-broken-code',
    target: 'm3e-target-broken-code',
    anchor: 'm3e-anchor-code-broken',
  },
};

async function branchIdFor(anchorId) {
  const current = await structure();
  const branch = Object.values(current.branches).find(
    (candidate) => candidate.source.anchorId === anchorId,
  );
  assert.ok(branch !== undefined, `anchor ${anchorId} has a branch`);
  return branch.id;
}

/**
 * Five M3e anchors over the demo seed:
 * - ambiguous text, formula term, and code quote (bindings removed, same source);
 * - broken text and broken code (the quote is gone).
 * Every target block stays reachable and every branch keeps its ID.
 */
async function buildFixture() {
  await page.evaluate(() => window.__noteforestTest.seed('demo'));
  await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
  await h.waitSaved();

  await addTopLevelBlock(ui, ids.text.source, textDoc('Alpha eigenvalue beta eigenvalue gamma'));
  await addTopLevelBlock(ui, ids.brokenText.source, textDoc('Delta missingword omega'));
  await addTopLevelBlock(ui, ids.formula.source, formulaDoc('\\lambda + \\lambda'));
  await addTopLevelBlock(ui, ids.code.source, codeDoc('eigvals = eigvals(A)'));
  await addTopLevelBlock(ui, ids.brokenCode.source, codeDoc('const x = 1;'));
  for (const target of [
    ids.text.target,
    ids.brokenText.target,
    ids.formula.target,
    ids.code.target,
    ids.brokenCode.target,
  ]) {
    await addTopLevelBlock(ui, target, textDoc(`Target for ${target}`));
  }

  await addAnchor(ui, {
    anchorId: ids.text.anchor,
    blockId: ids.text.source,
    kind: 'text',
    selector: { kind: 'text', quote: 'eigenvalue', occurrenceHint: 1 },
    binding: { kind: 'text', ranges: [{ nodePath: [0, 0], start: 6, end: 16 }] },
  });
  await addBranch(ui, {
    sourceBlockId: ids.text.source,
    sourceAnchorId: ids.text.anchor,
    targetBlockId: ids.text.target,
  });

  await addAnchor(ui, {
    anchorId: ids.brokenText.anchor,
    blockId: ids.brokenText.source,
    kind: 'text',
    selector: { kind: 'text', quote: 'missingword', occurrenceHint: 1 },
    binding: { kind: 'text', ranges: [{ nodePath: [0, 0], start: 6, end: 17 }] },
  });
  await addBranch(ui, {
    sourceBlockId: ids.brokenText.source,
    sourceAnchorId: ids.brokenText.anchor,
    targetBlockId: ids.brokenText.target,
  });

  await addAnchor(ui, {
    anchorId: ids.formula.anchor,
    blockId: ids.formula.source,
    kind: 'formula',
    selector: {
      kind: 'formula',
      form: 'term',
      latex: '\\lambda',
      latexStart: 0,
      occurrenceHint: 1,
    },
    binding: {
      kind: 'formula',
      form: 'term',
      nodePath: [0, 0],
      latex: '\\lambda',
      occurrence: 1,
    },
  });
  await addBranch(ui, {
    sourceBlockId: ids.formula.source,
    sourceAnchorId: ids.formula.anchor,
    targetBlockId: ids.formula.target,
  });

  await addAnchor(ui, {
    anchorId: ids.code.anchor,
    blockId: ids.code.source,
    kind: 'code',
    selector: {
      kind: 'code',
      quote: 'eigvals',
      form: 'range',
      startOffset: 0,
      endOffset: 7,
      lineStart: 1,
      lineEnd: 1,
      occurrenceHint: 1,
    },
    binding: { kind: 'code', nodePath: [0], startOffset: 0, endOffset: 7 },
  });
  await addBranch(ui, {
    sourceBlockId: ids.code.source,
    sourceAnchorId: ids.code.anchor,
    targetBlockId: ids.code.target,
  });

  await addAnchor(ui, {
    anchorId: ids.brokenCode.anchor,
    blockId: ids.brokenCode.source,
    kind: 'code',
    selector: {
      kind: 'code',
      quote: 'x = 1',
      form: 'range',
      startOffset: 6,
      endOffset: 11,
      lineStart: 1,
      lineEnd: 1,
      occurrenceHint: 1,
    },
    binding: { kind: 'code', nodePath: [0], startOffset: 6, endOffset: 11 },
  });
  await addBranch(ui, {
    sourceBlockId: ids.brokenCode.source,
    sourceAnchorId: ids.brokenCode.anchor,
    targetBlockId: ids.brokenCode.target,
  });

  // Remove the content bindings but keep the same source text/quote: the
  // resolver now has to choose between repeated matches or report a loss.
  await applyCommand({
    type: 'block.editContent',
    blockId: ids.text.source,
    content: textDoc('Alpha eigenvalue beta eigenvalue gamma'),
  });
  await applyCommand({
    type: 'block.editContent',
    blockId: ids.brokenText.source,
    content: textDoc('Delta omega'),
  });
  await applyCommand({
    type: 'block.editContent',
    blockId: ids.formula.source,
    content: formulaDoc('\\lambda + \\lambda'),
  });
  await applyCommand({
    type: 'block.editContent',
    blockId: ids.code.source,
    content: codeDoc('eigvals = eigvals(A)'),
  });
  await applyCommand({
    type: 'block.editContent',
    blockId: ids.brokenCode.source,
    content: codeDoc('const y = 2;'),
  });

  await waitForHealthChip(2, 3);
  await h.waitLayout({ blocks: 17, arrows: 8 });
}

function waitAnchorSelector(anchorId, check) {
  return page.waitForFunction(
    ({ anchorId: id, expected }) => {
      const current = window.__noteforestTest.structure();
      const selector = current?.anchors[id]?.selector;
      if (selector === undefined) return false;
      if (expected.latexStart !== undefined && selector.latexStart !== expected.latexStart) {
        return false;
      }
      if (expected.startOffset !== undefined && selector.startOffset !== expected.startOffset) {
        return false;
      }
      return true;
    },
    { anchorId, expected: check },
    { timeout: 10000 },
  );
}

describe('M3e anchor repair and health', () => {
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

  it('lists health rows, filters by state, and navigates to the anchor block', async () => {
    await launch(isolated('health-list'));
    await h.setWindowSize(1440, 900);
    await buildFixture();

    const initial = await h.state();
    assert.equal(initial.dialog, null, 'no modal opens on load');

    const chip = page.locator('[data-anchor-health-chip]');
    await chip.waitFor();
    assert.equal(await chip.getAttribute('data-health-broken'), '2');
    assert.equal(await chip.getAttribute('data-health-ambiguous'), '3');
    assert.match((await chip.textContent()) ?? '', /5 anchors need repair/);

    await openAnchorHealthFromChip();
    assert.equal(await page.locator('[data-health-anchor]').count(), 5);

    const textRow = page.locator(`[data-health-anchor="${ids.text.anchor}"]`);
    const textRowText = (await textRow.textContent()) ?? '';
    assert.match(textRowText, /Ambiguous anchor/);
    assert.match(textRowText, /eigenvalue/);
    assert.match(textRowText, /Alpha eigenvalue beta eigenvalue gamma/);
    assert.match(textRowText, /1 branch/);

    await page.locator('[data-health-filter="broken"]').click();
    assert.equal(await page.locator('[data-health-anchor]').count(), 2);
    assert.deepEqual(
      await page.locator('[data-health-anchor]').evaluateAll((rows) =>
        rows.map((row) => row.getAttribute('data-health-state')),
      ),
      ['broken', 'broken'],
    );
    await page.locator('[data-health-filter="ambiguous"]').click();
    assert.equal(await page.locator('[data-health-anchor]').count(), 3);
    assert.deepEqual(
      await page.locator('[data-health-anchor]').evaluateAll((rows) =>
        rows.map((row) => row.getAttribute('data-health-state')),
      ),
      ['ambiguous', 'ambiguous', 'ambiguous'],
    );
    await page.locator('[data-health-filter="all"]').click();
    assert.equal(await page.locator('[data-health-anchor]').count(), 5);

    await mkdir(artifactsPath('m3e'), { recursive: true });
    await h.screenshot(artifactsPath('m3e', 'anchor-health-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    await page.locator(`[data-health-navigate="${ids.text.anchor}"]`).click();
    await page.waitForSelector('[data-anchor-health="true"]', { state: 'detached' });
    await page.waitForFunction(
      ({ blockId, anchorId }) => {
        const current = window.__noteforestTest.state();
        const runtime = current.runtimes.find(
          (item) => item.packagePath === current.activeTab,
        );
        return (
          runtime?.selectedBlockId === blockId &&
          runtime?.selectedAnchor?.anchorId === anchorId
        );
      },
      { blockId: ids.text.source, anchorId: ids.text.anchor },
      { timeout: 10000 },
    );
    const highlighted = await page
      .locator(`[data-block-card="${ids.text.target}"]`)
      .getAttribute('data-anchor-branch-selected');
    assert.equal(highlighted, 'true');
  });

  it('repairs ambiguous formula and code candidates with stable IDs and one undo', async () => {
    await launch(isolated('health-candidates'));
    await h.setWindowSize(1440, 900);
    await buildFixture();

    const formulaBranch = await branchIdFor(ids.formula.anchor);
    const codeBranch = await branchIdFor(ids.code.anchor);
    const before = await structure();
    const formulaBranchBefore = before.branches[formulaBranch];
    const codeBranchBefore = before.branches[codeBranch];
    assert.deepEqual(before.anchors[ids.formula.anchor].selector.latexStart, 0);
    assert.deepEqual(before.anchors[ids.code.anchor].selector.startOffset, 0);

    await openAnchorHealthFromChip();
    await page.locator(`[data-health-repair="${ids.formula.anchor}"]`).click();
    await page.waitForSelector(`[data-health-detail="${ids.formula.anchor}"]`);
    assert.equal(await page.locator('[data-health-candidate]').count(), 2);
    const candidateText = (await page.locator('[data-health-candidate="1"]').textContent()) ?? '';
    assert.match(candidateText, /occurrence 2/);
    assert.match(candidateText, /lambda/);

    // Selecting a candidate only previews the repair. The document is still
    // byte-identical until Confirm, and Cancel leaves it that way.
    await page.locator('[data-health-candidate="1"]').click();
    await page.waitForSelector('[data-health-preview="true"]');
    const previewText = (await page.locator('[data-health-preview="true"]').textContent()) ?? '';
    assert.match(previewText, /Before/);
    assert.match(previewText, /After/);
    assert.match(previewText, /Formula term · occurrence 1/);
    assert.match(previewText, /Formula term · occurrence 2/);
    assert.match(previewText, /Term binding · occurrence 2/);
    assert.match(previewText, new RegExp(ids.formula.anchor));
    assert.match(previewText, new RegExp(ids.formula.target));
    assert.equal(
      await page.locator(`[data-health-preview-branch="${formulaBranch}"]`).count(),
      1,
    );
    assert.equal(
      await page.locator(`[data-health-preview-target="${ids.formula.target}"]`).count(),
      1,
    );
    assert.deepEqual(await structure(), before, 'candidate selection does not mutate');
    await mkdir(artifactsPath('m3-repair'), { recursive: true });
    await h.screenshot(artifactsPath('m3-repair', 'anchor-repair-preview-1440x900.png'), {
      width: 1440,
      height: 900,
    });
    await page.locator('[data-health-preview-cancel="true"]').click();
    await page.waitForSelector('[data-health-preview="true"]', { state: 'detached' });
    assert.deepEqual(await structure(), before, 'cancel does not mutate');
    assert.equal(await page.locator('[data-health-detail]').count(), 1, 'detail stays open');

    await page.locator('[data-health-candidate="1"]').click();
    await page.waitForSelector('[data-health-preview="true"]');
    await page.locator('[data-health-preview-confirm="true"]').click();
    await page.waitForSelector('[data-anchor-health="true"]', { state: 'detached' });
    await waitAnchorSelector(ids.formula.anchor, { latexStart: 10 });

    const formulaRepaired = await structure();
    assert.deepEqual(formulaRepaired.branches[formulaBranch], formulaBranchBefore);
    assert.ok(formulaRepaired.blocks[ids.formula.target] !== undefined);
    assert.equal(formulaRepaired.anchors[ids.formula.anchor].id, ids.formula.anchor);
    assert.equal(formulaRepaired.anchors[ids.formula.anchor].selector.occurrenceHint, 2);

    await page.keyboard.press('Meta+z');
    await waitAnchorSelector(ids.formula.anchor, { latexStart: 0 });
    const formulaUndone = await structure();
    assert.deepEqual(formulaUndone.anchors[ids.formula.anchor].selector, before.anchors[ids.formula.anchor].selector);
    assert.deepEqual(formulaUndone.branches[formulaBranch], formulaBranchBefore);

    await openAnchorHealthFromChip();
    await page.locator(`[data-health-repair="${ids.code.anchor}"]`).click();
    await page.waitForSelector(`[data-health-detail="${ids.code.anchor}"]`);
    assert.equal(await page.locator('[data-health-candidate]').count(), 2);
    const codeCandidate = (await page.locator('[data-health-candidate="1"]').textContent()) ?? '';
    assert.match(codeCandidate, /lines 1–1/);
    assert.match(codeCandidate, /eigvals/);
    await page.locator('[data-health-candidate="1"]').click();
    await page.waitForSelector('[data-health-preview="true"]');
    assert.equal(await page.locator('[data-health-preview-origin]').getAttribute('data-health-preview-origin'), 'candidate');
    await page.locator('[data-health-preview-confirm="true"]').click();
    await page.waitForSelector('[data-anchor-health="true"]', { state: 'detached' });
    await waitAnchorSelector(ids.code.anchor, { startOffset: 10 });

    const codeRepaired = await structure();
    assert.deepEqual(codeRepaired.branches[codeBranch], codeBranchBefore);
    assert.ok(codeRepaired.blocks[ids.code.target] !== undefined);
    assert.equal(codeRepaired.anchors[ids.code.anchor].selector.occurrenceHint, 2);

    await page.keyboard.press('Meta+z');
    await waitAnchorSelector(ids.code.anchor, { startOffset: 0 });
    const codeUndone = await structure();
    assert.deepEqual(codeUndone.anchors[ids.code.anchor].selector, before.anchors[ids.code.anchor].selector);
    assert.deepEqual(codeUndone.branches[codeBranch], codeBranchBefore);
  });

  it('keeps copy/fallback states, keeps broken, attaches, and deletes one branch without deleting targets', async () => {
    await launch(isolated('health-actions'));
    await h.setWindowSize(1440, 900);
    await buildFixture();

    const brokenTextWarning = page.locator(`[data-anchor-warning="${ids.brokenText.anchor}"]`);
    await brokenTextWarning.waitFor();
    assert.equal(await brokenTextWarning.getAttribute('data-anchor-state'), 'broken');
    assert.equal((await brokenTextWarning.textContent())?.trim(), 'Lost anchor');

    const ambiguousTextWarning = page.locator(`[data-anchor-warning="${ids.text.anchor}"]`);
    await ambiguousTextWarning.waitFor();
    assert.equal(await ambiguousTextWarning.getAttribute('data-anchor-state'), 'ambiguous');
    assert.equal((await ambiguousTextWarning.textContent())?.trim(), 'Ambiguous anchor');

    const ambiguousFormulaCallout = page.locator(
      `[data-callout-row="true"][data-anchor-id="${ids.formula.anchor}"] .nf-callout-state`,
    );
    await ambiguousFormulaCallout.waitFor();
    assert.equal(await ambiguousFormulaCallout.getAttribute('data-anchor-state'), 'ambiguous');
    assert.equal((await ambiguousFormulaCallout.textContent())?.trim(), 'Ambiguous');

    const brokenCodeCallout = page.locator(
      `[data-callout-row="true"][data-anchor-id="${ids.brokenCode.anchor}"] .nf-callout-state`,
    );
    await brokenCodeCallout.waitFor();
    assert.equal(await brokenCodeCallout.getAttribute('data-anchor-state'), 'broken');
    assert.equal((await brokenCodeCallout.textContent())?.trim(), 'Lost anchor');

    for (const target of [
      ids.text.target,
      ids.brokenText.target,
      ids.formula.target,
      ids.code.target,
      ids.brokenCode.target,
    ]) {
      assert.equal(
        await page.locator(`[data-block-card="${target}"]`).count(),
        1,
        `broken/ambiguous fallback keeps target ${target} visible`,
      );
    }

    const beforeKeep = await structure();
    await openAnchorHealthFromWarning(ids.brokenText.anchor);
    await page.locator('[data-health-action="keep-broken"]').click();
    await page.waitForSelector('[data-anchor-health="true"]', { state: 'detached' });
    assert.deepEqual(await structure(), beforeKeep, 'keep broken never mutates the document');
    assert.equal(await page.locator('[data-anchor-health-chip]').count(), 1);
    assert.equal(
      await page
        .locator('[data-anchor-health-chip]')
        .getAttribute('data-health-broken'),
      '2',
      'keep broken does not hide the warning or health count',
    );

    await openAnchorHealthFromWarning(ids.brokenCode.anchor);
    await page.locator('[data-health-action="attach"]').click();
    await page.waitForSelector('[data-health-confirm="attach"]');
    await page.locator('[data-health-confirm-action="attach"]').click();
    await page.waitForSelector('[data-anchor-health="true"]', { state: 'detached' });
    await page.waitForFunction(
      ({ anchorId, targetId }) => {
        const current = window.__noteforestTest.structure();
        const branch = Object.values(current?.branches ?? {}).find(
          (candidate) => candidate.targetBlockId === targetId,
        );
        return (
          current?.anchors?.[anchorId] === undefined &&
          branch !== undefined &&
          branch.source.anchorId === undefined &&
          current?.blocks?.[targetId] !== undefined
        );
      },
      { anchorId: ids.brokenCode.anchor, targetId: ids.brokenCode.target },
      { timeout: 10000 },
    );
    await waitForHealthChip(1, 3);

    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      (anchorId) => {
        const current = window.__noteforestTest.structure();
        return current?.anchors?.[anchorId] !== undefined;
      },
      ids.brokenCode.anchor,
      { timeout: 10000 },
    );
    await waitForHealthChip(2, 3);
    const afterAttachUndo = await structure();
    const restoredBranch = Object.values(afterAttachUndo.branches).find(
      (candidate) => candidate.source.anchorId === ids.brokenCode.anchor,
    );
    assert.ok(restoredBranch !== undefined);
    assert.ok(afterAttachUndo.blocks[ids.brokenCode.target] !== undefined);

    const branchBeforeDelete = await branchIdFor(ids.brokenText.anchor);
    await openAnchorHealthFromWarning(ids.brokenText.anchor);
    await page.locator('[data-health-action="delete-branch"]').click();
    await page.waitForSelector('[data-health-confirm="delete-branch"]');
    await page.locator('[data-health-confirm-action="delete-branch"]').click();
    await page.waitForSelector('[data-anchor-health="true"]', { state: 'detached' });
    await page.waitForFunction(
      ({ branchId, targetId }) => {
        const current = window.__noteforestTest.structure();
        return (
          current?.branches?.[branchId] === undefined &&
          current?.blocks?.[targetId] !== undefined
        );
      },
      { branchId: branchBeforeDelete, targetId: ids.brokenText.target },
      { timeout: 10000 },
    );
    const afterDelete = await structure();
    assert.ok(afterDelete.anchors[ids.brokenText.anchor] !== undefined, 'anchor stays idle');
    assert.ok(afterDelete.blocks[ids.brokenText.target] !== undefined, 'target is never deleted');
    await waitForHealthChip(1, 3);

    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      (branchId) => {
        const current = window.__noteforestTest.structure();
        return current?.branches?.[branchId] !== undefined;
      },
      branchBeforeDelete,
      { timeout: 10000 },
    );
    await waitForHealthChip(2, 3);
  });

  it('relinks a broken text anchor from the editor selection', async () => {
    await launch(isolated('health-relink'));
    await h.setWindowSize(1440, 900);
    await buildFixture();

    const branchId = await branchIdFor(ids.brokenText.anchor);
    const prose = page
      .locator(
        `[data-block-card="${ids.brokenText.source}"] .nf-block-prose p`,
      )
      .first();
    assert.equal((await prose.textContent())?.trim(), 'Delta omega');
    await prose.click({ position: { x: 2, y: 8 } });
    await page.keyboard.press('Home');
    for (let index = 0; index < 6; index += 1) await page.keyboard.press('ArrowRight');
    await page.keyboard.down('Shift');
    for (let index = 0; index < 5; index += 1) await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page
      .locator(
        '[data-testid="selection-toolbar"] [data-action="branch-from-selection"]',
      )
      .waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(
      await page.evaluate(() => window.getSelection()?.toString() ?? ''),
      'omega',
    );

    await openAnchorHealthFromWarning(ids.brokenText.anchor);
    const beforeRelink = await structure();
    await page.locator('[data-health-action="relink"]').click();
    await page.waitForSelector('[data-health-preview="true"]');
    assert.equal(
      await page.locator('[data-health-preview="true"]').getAttribute('data-health-preview-origin'),
      'selection',
    );
    const relinkPreview = (await page.locator('[data-health-preview="true"]').textContent()) ?? '';
    assert.match(relinkPreview, /missingword/);
    assert.match(relinkPreview, /omega/);
    assert.match(relinkPreview, new RegExp(ids.brokenText.anchor));
    assert.equal(
      await page.locator(`[data-health-preview-branch="${branchId}"]`).count(),
      1,
    );
    assert.deepEqual(await structure(), beforeRelink, 'relink preview does not mutate');
    await page.locator('[data-health-preview-cancel="true"]').click();
    await page.waitForSelector('[data-health-preview="true"]', { state: 'detached' });
    assert.deepEqual(await structure(), beforeRelink, 'relink cancel does not mutate');
    assert.equal(
      (await structure()).anchors[ids.brokenText.anchor].selector.quote,
      'missingword',
    );

    await page.locator('[data-health-action="relink"]').click();
    await page.waitForSelector('[data-health-preview="true"]');
    await page.locator('[data-health-preview-confirm="true"]').click();
    await page.waitForSelector('[data-anchor-health="true"]', { state: 'detached' });
    await page.waitForFunction(
      (anchorId) => {
        const current = window.__noteforestTest.structure();
        return current?.anchors?.[anchorId]?.selector?.quote === 'omega';
      },
      ids.brokenText.anchor,
      { timeout: 10000 },
    );

    const repaired = await structure();
    assert.equal(
      repaired.branches[branchId]?.source.anchorId,
      ids.brokenText.anchor,
    );
    assert.ok(repaired.blocks[ids.brokenText.target] !== undefined);
    await page
      .locator(`[data-anchor-warning="${ids.brokenText.anchor}"]`)
      .waitFor({ state: 'detached', timeout: 10000 });
  });
});
