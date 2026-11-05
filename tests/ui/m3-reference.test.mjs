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
});
