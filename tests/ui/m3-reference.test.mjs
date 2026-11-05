import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifactsPath, createHarness } from '../support/harness.mjs';

const tempRoot = artifactsPath('m3d1-ui');
const h = createHarness({ tempRoot });
let page;

const SOURCE_ID = 'm3d1-reference-source';
const TARGET_ID = 'm3d1-reference-target';
const SOURCE_TEXT = 'Reference source';
const TARGET_TEXT = 'Reference target';

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

function primarySnapshot(state) {
  return {
    chapters: state.chapters,
    blocks: state.blocks,
    primary: Object.values(state.branches)
      .filter((branch) => branch.role === 'primary')
      .sort((left, right) => (left.id < right.id ? -1 : 1)),
  };
}

function cardsByWidth(snapshot) {
  return new Map(snapshot.cards.map((card) => [card.id, card]));
}

async function openBlockMenu(blockId) {
  await page.locator(`[data-block-card="${blockId}"]`).click({ button: 'right' });
  await page.locator('.nf-menu').waitFor();
}

async function chooseMenuItem(name) {
  await page.getByRole('menuitem', { name }).click();
  await page.locator('.nf-menu').waitFor({ state: 'detached' });
}

async function linkReference(sourceId, targetId) {
  await openBlockMenu(sourceId);
  await chooseMenuItem(/^Link as reference/);
  await page.getByRole('dialog', { name: 'Link as reference' }).waitFor();
  await page.locator(`[data-link-target="${targetId}"]`).click();
  await page.getByRole('button', { name: 'Link', exact: true }).click();
  await page.getByRole('dialog', { name: 'Link as reference' }).waitFor({ state: 'detached' });
}

async function waitForReference(targetId, present = true) {
  await page.waitForFunction(
    ({ target, shouldExist }) => {
      const state = window.__noteforestTest.structure();
      if (state === null) return false;
      const found = Object.values(state.branches).some(
        (branch) => branch.role === 'reference' && branch.targetBlockId === target,
      );
      return found === shouldExist;
    },
    { target: targetId, shouldExist: present },
    { timeout: 10000 },
  );
}

async function waitForReferenceEdge(branchId, present = true) {
  if (!present) {
    await page.waitForSelector(`[data-reference-edge-id="${branchId}"]`, { state: 'detached' });
    return;
  }
  await page.waitForSelector(`[data-reference-edge-id="${branchId}"]`);
  await page.waitForFunction(
    (id) => {
      const group = document.querySelector(`[data-reference-edge-id="${id}"]`);
      const path = group?.querySelector('.nf-edge-reference');
      if (path === null || path === undefined) return false;
      const rect = path.getBoundingClientRect();
      return rect.width > 1 || rect.height > 1;
    },
    branchId,
    { timeout: 10000 },
  );
}

async function activePrimaryArrowCount() {
  return page.locator('.nf-editor[data-active="true"] .nf-edge-path').count();
}

async function waitForBranchRole(branchId, role, targetId) {
  await page.waitForFunction(
    ({ id, expectedRole, target }) => {
      const state = window.__noteforestTest.structure();
      const branch = state?.branches?.[id];
      return branch?.role === expectedRole && branch?.targetBlockId === target;
    },
    { id: branchId, expectedRole: role, target: targetId },
    { timeout: 10000 },
  );
}

async function waitForNoBranch(branchId) {
  await page.waitForFunction(
    (id) => {
      const state = window.__noteforestTest.structure();
      return state !== null && state.branches[id] === undefined;
    },
    branchId,
    { timeout: 10000 },
  );
}

async function waitForReferenceFrom(sourceId, targetId) {
  await page.waitForFunction(
    ({ source, target }) => {
      const state = window.__noteforestTest.structure();
      if (state === null) return false;
      return Object.values(state.branches).some(
        (branch) =>
          branch.role === 'reference' &&
          branch.source.blockId === source &&
          branch.targetBlockId === target,
      );
    },
    { source: sourceId, target: targetId },
    { timeout: 10000 },
  );
}

async function waitForNoPrimaryParent(blockId) {
  await page.waitForFunction(
    (id) => {
      const state = window.__noteforestTest.structure();
      if (state === null) return false;
      return !Object.values(state.branches).some(
        (branch) => branch.role === 'primary' && branch.targetBlockId === id,
      );
    },
    blockId,
    { timeout: 10000 },
  );
}

function primaryBranchFor(state, targetId) {
  return Object.values(state.branches).find(
    (branch) => branch.role === 'primary' && branch.targetBlockId === targetId,
  );
}

function referenceBranchFrom(state, sourceId, targetId) {
  return Object.values(state.branches).find(
    (branch) =>
      branch.role === 'reference' &&
      branch.source.blockId === sourceId &&
      branch.targetBlockId === targetId,
  );
}

describe('NoteForest M3d1 reference edges', () => {
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

  it('links a shared block as a reference, shows chips and a dashed edge, and removes only the edge', async () => {
    const env = isolated('reference-edges');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    await h.waitLayout({ blocks: 7, arrows: 3 });

    const seeded = await structure();
    const chapterId = seeded.chapters[0].id;
    await applyCommand({
      type: 'block.create',
      blockId: SOURCE_ID,
      content: {
        type: 'doc',
        children: [{ type: 'paragraph', children: [{ type: 'text', text: SOURCE_TEXT }] }],
      },
      placement: { kind: 'top-level', chapterId },
    });
    await applyCommand({
      type: 'block.create',
      blockId: TARGET_ID,
      content: {
        type: 'doc',
        children: [{ type: 'paragraph', children: [{ type: 'text', text: TARGET_TEXT }] }],
      },
      placement: { kind: 'top-level', chapterId },
    });
    await page.waitForSelector(`[data-block-card="${SOURCE_ID}"]`);
    await page.waitForSelector(`[data-block-card="${TARGET_ID}"]`);
    await h.waitLayout({ blocks: 9, arrows: 3 });

    const beforeState = await structure();
    const beforeLayout = await h.layoutSnapshot();
    const beforePrimary = primarySnapshot(beforeState);
    const beforeRows = await page.locator('.nf-tree-row[data-block-id]').count();
    const beforeArrows = await activePrimaryArrowCount();
    const beforeCards = cardsByWidth(beforeLayout);

    await linkReference(SOURCE_ID, TARGET_ID);
    await waitForReference(TARGET_ID);

    const linked = await structure();
    const referenceBranches = Object.values(linked.branches).filter(
      (branch) => branch.role === 'reference',
    );
    assert.equal(referenceBranches.length, 1, 'one reference edge exists');
    const branch = referenceBranches[0];
    assert.equal(branch.source.blockId, SOURCE_ID);
    assert.equal(branch.targetBlockId, TARGET_ID);
    assert.equal(branch.source.anchorId, undefined);
    const branchId = branch.id;

    // Structural neutrality: chapter slots, block records, and every primary
    // branch are byte-identical; the shared child keeps one primary home.
    assert.deepEqual(primarySnapshot(linked), beforePrimary);
    assert.deepEqual(
      linked.chapters[0].topLevelBlockIds,
      beforeState.chapters[0].topLevelBlockIds,
      'the target keeps its top-level slot',
    );
    assert.equal(
      Object.values(linked.branches).filter(
        (candidate) => candidate.role === 'primary' && candidate.targetBlockId === TARGET_ID,
      ).length,
      0,
      'a reference never becomes a primary home',
    );

    // Source "See also" and target "Referenced by" chips carry the other
    // endpoint's title and focus it when clicked.
    const seeAlso = page.locator(`[data-see-also-branch="${branchId}"]`);
    await seeAlso.waitFor();
    assert.match((await seeAlso.textContent()) ?? '', /See also/);
    assert.match((await seeAlso.textContent()) ?? '', new RegExp(TARGET_TEXT));
    assert.equal(await seeAlso.getAttribute('data-see-also-target'), TARGET_ID);

    const referencedBy = page.locator(`[data-referenced-by-branch="${branchId}"]`);
    await referencedBy.waitFor();
    assert.match((await referencedBy.textContent()) ?? '', /Referenced by/);
    assert.match((await referencedBy.textContent()) ?? '', new RegExp(SOURCE_TEXT));
    assert.equal(await referencedBy.getAttribute('data-referenced-by-source'), SOURCE_ID);

    await seeAlso.click();
    await h.waitSelected(TARGET_ID);
    await referencedBy.click();
    await h.waitSelected(SOURCE_ID);

    // The dashed reference edge appears with an open arrowhead, and the
    // primary edge count is unchanged.
    await waitForReferenceEdge(branchId);
    const dash = await page
      .locator(`[data-reference-edge-id="${branchId}"] .nf-edge-reference`)
      .evaluate((element) => getComputedStyle(element).strokeDasharray);
    assert.notEqual(dash, 'none', 'the reference edge is dashed');
    assert.equal(
      await page.locator(`[data-reference-edge-id="${branchId}"] [data-reference-arrow="open"]`).count(),
      1,
    );
    assert.equal(await activePrimaryArrowCount(), beforeArrows, 'no primary edge was added');

    // The shared child stays one row at its primary home; the target row shows
    // the compact Shared count and references add no outline rows.
    assert.equal(await page.locator('.nf-tree-row[data-block-id]').count(), beforeRows);
    assert.equal(await page.locator(`.nf-tree-row[data-block-id="${TARGET_ID}"]`).count(), 1);
    assert.equal(
      await page.locator(`.nf-tree-row[data-block-id="${TARGET_ID}"] [data-shared-count="1"]`).count(),
      1,
    );

    // Layout-neutral differential: every card rectangle is unchanged by the
    // reference. Chips are an overlay and the dashed edge is outside the flow.
    await h.waitLayout({ blocks: 9, arrows: beforeArrows });
    const linkedLayout = await h.layoutSnapshot();
    for (const card of linkedLayout.cards) {
      const original = beforeCards.get(card.id);
      assert.ok(original !== undefined, `unexpected card ${card.id}`);
      assert.equal(card.x, original.x, `${card.id} x`);
      assert.equal(card.y, original.y, `${card.id} y`);
      assert.equal(card.width, original.width, `${card.id} width`);
      assert.equal(card.height, original.height, `${card.id} height`);
    }
    assert.equal(linkedLayout.cards.length, beforeLayout.cards.length);

    // Role-independent dedupe: the second request reuses the edge and focuses
    // the target; no duplicate edge is created.
    await linkReference(SOURCE_ID, TARGET_ID);
    const afterDuplicate = await structure();
    assert.equal(
      Object.values(afterDuplicate.branches).filter((candidate) => candidate.role === 'reference').length,
      1,
    );
    assert.deepEqual(primarySnapshot(afterDuplicate), beforePrimary);
    await h.waitSelected(TARGET_ID);

    // Reference cycles are allowed. Both dashed edges render, nothing moves,
    // and the outline still has no extra rows.
    await linkReference(TARGET_ID, SOURCE_ID);
    await waitForReference(SOURCE_ID);
    const cycle = await structure();
    assert.equal(
      Object.values(cycle.branches).filter((candidate) => candidate.role === 'reference').length,
      2,
    );
    const forward = Object.values(cycle.branches).find(
      (candidate) => candidate.role === 'reference' && candidate.targetBlockId === TARGET_ID,
    );
    const backward = Object.values(cycle.branches).find(
      (candidate) => candidate.role === 'reference' && candidate.targetBlockId === SOURCE_ID,
    );
    assert.ok(forward !== undefined && backward !== undefined);
    await waitForReferenceEdge(forward.id);
    await waitForReferenceEdge(backward.id);
    assert.equal(await page.locator('.nf-tree-row[data-block-id]').count(), beforeRows);
    assert.deepEqual(primarySnapshot(cycle), beforePrimary);
    await h.waitLayout({ blocks: 9, arrows: beforeArrows });
    const cycleLayout = await h.layoutSnapshot();
    for (const card of cycleLayout.cards) {
      const original = beforeCards.get(card.id);
      assert.ok(original !== undefined);
      assert.equal(card.x, original.x, `${card.id} x after cycle`);
      assert.equal(card.y, original.y, `${card.id} y after cycle`);
    }

    // Screenshot evidence: use the seeded tree for a long right-hand dashed
    // reference between two visible cards, plus the shared-child chips.
    await mkdir(artifactsPath('m3d1'), { recursive: true });
    const spectrumId = Object.values(seeded.blocks).find((block) =>
      JSON.stringify(block.content).includes('Spectrum'),
    )?.id;
    const characteristicId = Object.values(seeded.blocks).find((block) =>
      JSON.stringify(block.content).includes('Characteristic polynomial'),
    )?.id;
    assert.equal(typeof spectrumId, 'string');
    assert.equal(typeof characteristicId, 'string');
    await linkReference(spectrumId, characteristicId);
    await waitForReference(characteristicId);
    const evidenceBranch = Object.values((await structure()).branches).find(
      (candidate) =>
        candidate.role === 'reference' &&
        candidate.source.blockId === spectrumId &&
        candidate.targetBlockId === characteristicId,
    );
    assert.ok(evidenceBranch !== undefined);
    await waitForReferenceEdge(evidenceBranch.id);
    await page.locator(`[data-block-card="${spectrumId}"]`).scrollIntoViewIfNeeded();
    // Fit the whole branch on screen so both dashed endpoints and their chips
    // are visible in the evidence screenshot.
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await page.waitForFunction(
      () => {
        const zoom = Number(
          document.querySelector('.nf-editor[data-active="true"] .nf-canvas')?.getAttribute('data-zoom') ?? 100,
        );
        return zoom < 100;
      },
      undefined,
      { timeout: 10000 },
    );
    await page.waitForFunction(
      () => document.querySelectorAll('[data-sonner-toast]').length === 0,
      undefined,
      { timeout: 10000 },
    );
    await h.waitLayout({ blocks: 9, arrows: beforeArrows });
    await h.screenshot(artifactsPath('m3d1', 'reference-edges-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // Deleting one reference removes only the edge; the target block, its
    // primary home, and its content are untouched.
    await openBlockMenu(SOURCE_ID);
    await chooseMenuItem(new RegExp(`^Remove reference to ${TARGET_TEXT}`));
    await waitForReference(TARGET_ID, false);
    await waitForReferenceEdge(forward.id, false);

    const removed = await structure();
    assert.deepEqual(removed.blocks[TARGET_ID], linked.blocks[TARGET_ID]);
    assert.deepEqual(removed.chapters[0].topLevelBlockIds, beforeState.chapters[0].topLevelBlockIds);
    assert.equal(
      Object.values(removed.branches).filter((candidate) => candidate.targetBlockId === TARGET_ID).length,
      0,
    );
    assert.equal(await page.locator(`[data-block-card="${TARGET_ID}"]`).count(), 1);
    assert.equal(await page.locator(`[data-see-also-branch="${forward.id}"]`).count(), 0);
    assert.equal(await page.locator(`[data-referenced-by-branch="${forward.id}"]`).count(), 0);
    await h.waitLayout({ blocks: 9, arrows: beforeArrows });

    // Undo restores the same edge identity.
    await page.keyboard.press('Meta+z');
    await waitForReference(TARGET_ID);
    const restored = await structure();
    assert.deepEqual(restored.branches[forward.id], forward);
    assert.deepEqual(restored.blocks[TARGET_ID], linked.blocks[TARGET_ID]);

    await page.keyboard.press('Meta+s');
    await h.waitSaved();
  });

  it('links an anchor as a reference from the anchor menu and keeps the primary callout', async () => {
    const env = isolated('anchor-reference');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    await h.waitLayout({ blocks: 7, arrows: 3 });

    const seeded = await structure();
    const chapterId = seeded.chapters[0].id;
    const sourceId = 'm3d1-anchor-source';
    const calloutId = 'm3d1-anchor-callout';
    const referenceTargetId = seeded.chapters[0].topLevelBlockIds[0];
    assert.equal(typeof referenceTargetId, 'string');

    await applyCommand({
      type: 'block.create',
      blockId: sourceId,
      content: {
        type: 'doc',
        children: [
          { type: 'paragraph', children: [{ type: 'text', text: 'Alpha eigenvalue beta' }] },
        ],
      },
      placement: { kind: 'top-level', chapterId },
    });
    await applyCommand({
      type: 'block.create',
      blockId: calloutId,
      content: {
        type: 'doc',
        children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Callout child' }] }],
      },
      placement: { kind: 'top-level', chapterId },
    });
    await applyCommand({
      type: 'anchor.create',
      anchorId: 'm3d1-anchor',
      blockId: sourceId,
      kind: 'text',
      selector: {
        kind: 'text',
        quote: 'eigenvalue',
        prefix: 'Alpha ',
        suffix: ' beta',
        occurrenceHint: 1,
      },
      binding: { kind: 'text', ranges: [{ nodePath: [0, 0], start: 6, end: 16 }] },
      quote: 'eigenvalue',
    });
    await applyCommand({
      type: 'branch.create',
      sourceBlockId: sourceId,
      sourceAnchorId: 'm3d1-anchor',
      targetBlockId: calloutId,
      role: 'primary',
    });
    await page.waitForSelector('[data-callout-row="true"][data-anchor-id="m3d1-anchor"]');
    await h.waitLayout({ blocks: 9, arrows: 4 });
    const beforePrimary = primarySnapshot(await structure());
    const beforeLayout = await h.layoutSnapshot();

    await openBlockMenu(sourceId);
    await chooseMenuItem(/^Link “eigenvalue” as reference/);
    await page.getByRole('dialog', { name: 'Link as reference' }).waitFor();
    assert.equal(
      await page.locator('[data-link-reference-anchor="true"]').count(),
      1,
      'the picker shows the anchored origin',
    );
    await page.locator(`[data-link-target="${referenceTargetId}"]`).click();
    await page.getByRole('button', { name: 'Link', exact: true }).click();
    await page.getByRole('dialog', { name: 'Link as reference' }).waitFor({ state: 'detached' });
    await waitForReference(referenceTargetId);

    const linked = await structure();
    const reference = Object.values(linked.branches).find(
      (branch) =>
        branch.role === 'reference' &&
        branch.source.blockId === sourceId &&
        branch.targetBlockId === referenceTargetId,
    );
    assert.ok(reference !== undefined);
    assert.equal(reference.source.anchorId, 'm3d1-anchor');
    assert.equal(
      Object.values(linked.branches).filter(
        (branch) => branch.role === 'primary' && branch.source.anchorId === 'm3d1-anchor',
      ).length,
      1,
      'the anchored reference never creates a second callout edge',
    );
    assert.deepEqual(primarySnapshot(linked), beforePrimary);
    await page.waitForSelector('[data-callout-row="true"][data-anchor-id="m3d1-anchor"]');

    const seeAlso = page.locator(`[data-see-also-branch="${reference.id}"]`);
    await seeAlso.waitFor();
    assert.match((await seeAlso.textContent()) ?? '', /eigenvalue/);
    const referencedBy = page.locator(`[data-referenced-by-branch="${reference.id}"]`);
    await referencedBy.waitFor();
    assert.match((await referencedBy.textContent()) ?? '', /eigenvalue/);

    await waitForReferenceEdge(reference.id);
    assert.equal(await activePrimaryArrowCount(), 4);
    await h.waitLayout({ blocks: 9, arrows: 4 });
    const afterLayout = await h.layoutSnapshot();
    for (const card of afterLayout.cards) {
      const original = beforeLayout.cards.find((candidate) => candidate.id === card.id);
      assert.ok(original !== undefined);
      assert.equal(card.x, original.x, `${card.id} x`);
      assert.equal(card.y, original.y, `${card.id} y`);
      assert.equal(card.width, original.width, `${card.id} width`);
      assert.equal(card.height, original.height, `${card.id} height`);
    }

    await openBlockMenu(sourceId);
    await chooseMenuItem(/^Remove reference to/);
    await waitForReference(referenceTargetId, false);
    const removed = await structure();
    assert.ok(removed.blocks[referenceTargetId] !== undefined, 'the reference target is never deleted');
    assert.ok(removed.anchors['m3d1-anchor'] !== undefined, 'the anchor is kept');
    assert.deepEqual(primarySnapshot(removed), beforePrimary);
    await page.keyboard.press('Meta+s');
    await h.waitSaved();
  });

  it('makes home, moves here, and demotes with stable IDs, exact undo, and updated chips', async () => {
    const env = isolated('role-transitions');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    await h.waitLayout({ blocks: 7, arrows: 3 });

    const seeded = await structure();
    const chapterId = seeded.chapters[0].id;
    const homeParentId = 'm3d2-home-parent';
    const targetId = 'm3d2-target';
    const targetChildId = 'm3d2-target-child';
    const sourceId = 'm3d2-source';
    const movedId = 'm3d2-moved';

    const text = (value) => ({
      type: 'doc',
      children: [{ type: 'paragraph', children: [{ type: 'text', text: value }] }],
    });

    await applyCommand({
      type: 'block.create',
      blockId: homeParentId,
      content: text('Home parent'),
      placement: { kind: 'top-level', chapterId },
    });
    await applyCommand({
      type: 'block.create',
      blockId: targetId,
      content: text('Shared target'),
      placement: { kind: 'child', parentBlockId: homeParentId },
    });
    await applyCommand({
      type: 'block.create',
      blockId: targetChildId,
      content: text('Target child'),
      placement: { kind: 'child', parentBlockId: targetId },
    });
    await applyCommand({
      type: 'block.create',
      blockId: sourceId,
      content: text('Reference source'),
      placement: { kind: 'top-level', chapterId },
    });
    for (const id of [homeParentId, targetId, targetChildId, sourceId]) {
      await page.waitForSelector(`[data-block-card="${id}"]`);
    }
    await h.waitLayout({ blocks: 11, arrows: 5 });

    await linkReference(sourceId, targetId);
    await waitForReferenceFrom(sourceId, targetId);

    const beforeMakeHome = await structure();
    const promotedBefore = referenceBranchFrom(beforeMakeHome, sourceId, targetId);
    const oldPrimaryBefore = primaryBranchFor(beforeMakeHome, targetId);
    assert.ok(promotedBefore !== undefined, 'the reference edge exists');
    assert.ok(oldPrimaryBefore !== undefined, 'the target has a primary parent');
    const referenceId = promotedBefore.id;
    const oldPrimaryId = oldPrimaryBefore.id;
    const branchCount = Object.keys(beforeMakeHome.branches).length;
    const rows = await page.locator('.nf-tree-row[data-block-id]').count();
    const arrows = await activePrimaryArrowCount();
    assert.equal(arrows, 5);

    // Make home: promote the reference, demote the old primary, keep both IDs.
    await openBlockMenu(sourceId);
    assert.notEqual(
      await page.getByRole('menuitem', { name: /^Make home/ }).getAttribute('aria-disabled'),
      'true',
      'make home is enabled when the target has a primary parent',
    );
    await chooseMenuItem(/^Make home/);
    await waitForBranchRole(referenceId, 'primary', targetId);
    await waitForBranchRole(oldPrimaryId, 'reference', targetId);
    await h.waitSelected(targetId);

    const afterMakeHome = await structure();
    assert.deepEqual(afterMakeHome.blocks, beforeMakeHome.blocks, 'block records are unchanged');
    assert.deepEqual(afterMakeHome.chapters, beforeMakeHome.chapters, 'no chapter slot changed');
    assert.equal(Object.keys(afterMakeHome.branches).length, branchCount, 'no edge was added');
    assert.equal(afterMakeHome.branches[referenceId].id, referenceId);
    assert.deepEqual(afterMakeHome.branches[referenceId].source, promotedBefore.source);
    assert.equal(afterMakeHome.branches[referenceId].role, 'primary');
    assert.equal(afterMakeHome.branches[oldPrimaryId].id, oldPrimaryId);
    assert.deepEqual(afterMakeHome.branches[oldPrimaryId].source, oldPrimaryBefore.source);
    assert.equal(afterMakeHome.branches[oldPrimaryId].role, 'reference');
    assert.equal(primaryBranchFor(afterMakeHome, targetId).id, referenceId);

    // Chips follow the roles: the demoted edge becomes See also / Referenced
    // by, and the promoted edge is a primary arrow with no chip.
    await page.locator(`[data-see-also-branch="${oldPrimaryId}"]`).waitFor();
    await page.locator(`[data-referenced-by-branch="${oldPrimaryId}"]`).waitFor();
    assert.equal(await page.locator(`[data-see-also-branch="${referenceId}"]`).count(), 0);
    assert.equal(
      await page.locator(`.nf-tree-row[data-block-id="${targetId}"] [data-shared-count="1"]`).count(),
      1,
    );
    assert.equal(await page.locator('.nf-tree-row[data-block-id]').count(), rows, 'no extra row');
    await h.waitLayout({ blocks: 11, arrows });
    assert.equal(await activePrimaryArrowCount(), arrows, 'primary edge count is unchanged');

    // The See also chip exposes the same reference menu.
    await page.locator(`[data-see-also-branch="${oldPrimaryId}"]`).click({ button: 'right' });
    await page.locator('.nf-menu').waitFor();
    assert.equal(await page.getByRole('menuitem', { name: /^Make home/ }).count(), 1);
    assert.equal(await page.getByRole('menuitem', { name: /^Move here/ }).count(), 1);
    await page.keyboard.press('Escape');
    await page.locator('.nf-menu').waitFor({ state: 'detached' });

    // Screenshot evidence: the target now lives under the new home while the
    // old primary edge remains as a See also reference.
    await mkdir(artifactsPath('m3d2'), { recursive: true });
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await page.waitForFunction(
      () => {
        const zoom = Number(
          document.querySelector('.nf-editor[data-active="true"] .nf-canvas')?.getAttribute('data-zoom') ?? 100,
        );
        return zoom < 100;
      },
      undefined,
      { timeout: 10000 },
    );
    await page.waitForFunction(
      () => document.querySelectorAll('[data-sonner-toast]').length === 0,
      undefined,
      { timeout: 10000 },
    );
    await h.waitLayout({ blocks: 11, arrows });
    await h.screenshot(artifactsPath('m3d2', 'role-transitions-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // One undo restores both roles, both keys, and the old primary home.
    await page.keyboard.press('Meta+z');
    await waitForBranchRole(referenceId, 'reference', targetId);
    await waitForBranchRole(oldPrimaryId, 'primary', targetId);
    const undoneMakeHome = await structure();
    assert.deepEqual(undoneMakeHome.branches[referenceId], promotedBefore);
    assert.deepEqual(undoneMakeHome.branches[oldPrimaryId], oldPrimaryBefore);
    assert.deepEqual(undoneMakeHome.chapters, beforeMakeHome.chapters);
    await page.locator(`[data-see-also-branch="${referenceId}"]`).waitFor();
    assert.equal(await page.locator(`[data-see-also-branch="${oldPrimaryId}"]`).count(), 0);

    await page.keyboard.press('Meta+Shift+z');
    await waitForBranchRole(referenceId, 'primary', targetId);
    await waitForBranchRole(oldPrimaryId, 'reference', targetId);
    const redoneMakeHome = await structure();
    assert.deepEqual(redoneMakeHome.branches[referenceId], afterMakeHome.branches[referenceId]);
    assert.deepEqual(redoneMakeHome.branches[oldPrimaryId], afterMakeHome.branches[oldPrimaryId]);

    // Move here: promote the reference from a newly created source and retire
    // the old primary edge; undo restores that exact edge ID and order.
    await applyCommand({
      type: 'block.create',
      blockId: movedId,
      content: text('Moved source'),
      placement: { kind: 'top-level', chapterId },
    });
    await page.waitForSelector(`[data-block-card="${movedId}"]`);
    await h.waitLayout({ blocks: 12, arrows });
    await linkReference(movedId, targetId);
    await waitForReferenceFrom(movedId, targetId);
    const beforeMove = await structure();
    const moveReference = referenceBranchFrom(beforeMove, movedId, targetId);
    assert.ok(moveReference !== undefined);
    const moveBranchId = moveReference.id;

    await openBlockMenu(movedId);
    await chooseMenuItem(/^Move here/);
    await waitForBranchRole(moveBranchId, 'primary', targetId);
    await waitForNoBranch(referenceId);
    await h.waitSelected(targetId);

    const afterMove = await structure();
    assert.equal(afterMove.branches[oldPrimaryId].role, 'reference');
    assert.deepEqual(afterMove.branches[oldPrimaryId], afterMakeHome.branches[oldPrimaryId]);
    assert.equal(primaryBranchFor(afterMove, targetId).id, moveBranchId);
    assert.equal(afterMove.branches[moveBranchId].id, moveBranchId);
    assert.deepEqual(afterMove.chapters, beforeMove.chapters, 'the target was not a root');
    assert.equal(
      Object.keys(afterMove.branches).length,
      Object.keys(beforeMove.branches).length - 1,
      'the old primary edge was retired',
    );
    await h.waitLayout({ blocks: 12, arrows });

    await page.keyboard.press('Meta+z');
    await waitForBranchRole(moveBranchId, 'reference', targetId);
    await waitForBranchRole(referenceId, 'primary', targetId);
    const undoneMove = await structure();
    assert.deepEqual(undoneMove.branches[referenceId], afterMakeHome.branches[referenceId]);
    assert.deepEqual(undoneMove.branches[moveBranchId], beforeMove.branches[moveBranchId]);
    assert.deepEqual(undoneMove.chapters, beforeMove.chapters);

    await page.keyboard.press('Meta+Shift+z');
    await waitForBranchRole(moveBranchId, 'primary', targetId);
    await waitForNoBranch(referenceId);
    const redoneMove = await structure();
    assert.deepEqual(redoneMove.branches[moveBranchId], afterMove.branches[moveBranchId]);

    // Demote: the primary becomes a reference and the target becomes a root
    // directly after its former top-level source, keeping its subtree.
    await openBlockMenu(targetId);
    await chooseMenuItem(/^Demote to reference/);
    await waitForBranchRole(moveBranchId, 'reference', targetId);
    await waitForNoPrimaryParent(targetId);
    await h.waitSelected(targetId);

    const afterDemote = await structure();
    assert.equal(afterDemote.branches[moveBranchId].id, moveBranchId);
    assert.equal(afterDemote.branches[moveBranchId].role, 'reference');
    assert.equal(afterDemote.branches[moveBranchId].targetBlockId, targetId);
    const topLevelIds = afterDemote.chapters[0].topLevelBlockIds;
    const movedIndex = topLevelIds.indexOf(movedId);
    assert.ok(movedIndex >= 0, 'the former source is still top-level');
    assert.equal(topLevelIds[movedIndex + 1], targetId, 'the target follows its former root');
    assert.ok(
      Object.values(afterDemote.branches).some(
        (branch) =>
          branch.role === 'primary' &&
          branch.source.blockId === targetId &&
          branch.targetBlockId === targetChildId,
      ),
      'the target subtree moves with it',
    );
    assert.equal(
      await page.locator('.nf-tree-row[data-block-id]').count(),
      rows + 1,
      'the new top-level block adds one row, not a duplicate',
    );
    await h.waitLayout({ blocks: 12, arrows });

    // OD-7: make home on a root is disabled with an explanation.
    await openBlockMenu(homeParentId);
    const disabledHome = page.getByRole('menuitem', { name: /^Make home/ });
    assert.equal(await disabledHome.getAttribute('aria-disabled'), 'true');
    assert.match((await disabledHome.textContent()) ?? '', /root/);
    await page.keyboard.press('Escape');
    await page.locator('.nf-menu').waitFor({ state: 'detached' });

    // A reference-only block does not offer Demote to reference.
    await openBlockMenu(targetId);
    assert.equal(await page.getByRole('menuitem', { name: /^Demote to reference/ }).count(), 0);
    await page.keyboard.press('Escape');
    await page.locator('.nf-menu').waitFor({ state: 'detached' });

    await page.keyboard.press('Meta+z');
    await waitForBranchRole(moveBranchId, 'primary', targetId);
    const undoneDemote = await structure();
    assert.deepEqual(undoneDemote.branches[moveBranchId], afterMove.branches[moveBranchId]);
    assert.deepEqual(undoneDemote.chapters, afterMove.chapters);
    assert.equal(primaryBranchFor(undoneDemote, targetId).id, moveBranchId);

    await page.keyboard.press('Meta+Shift+z');
    await waitForBranchRole(moveBranchId, 'reference', targetId);
    await waitForNoPrimaryParent(targetId);
    const redoneDemote = await structure();
    assert.deepEqual(redoneDemote.chapters, afterDemote.chapters);
    assert.equal(redoneDemote.chapters[0].topLevelBlockIds[movedIndex + 1], targetId);

    await page.keyboard.press('Meta+s');
    await h.waitSaved();
  });
});
