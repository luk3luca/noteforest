import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { addAnchor, addBranch, addTopLevelBlock, textDoc } from '../support/fixtures.mjs';

const tempRoot = artifactsPath('m3d1-ui');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
const {
  isolated,
  applyCommand,
  structure,
  seedDemo,
  openBlockMenu,
  chooseMenuItem,
  createDirectChild,
} = ui;
let page;

const SOURCE_ID = 'm3d1-reference-source';
const TARGET_ID = 'm3d1-reference-target';
const SOURCE_TEXT = 'Reference source';
const TARGET_TEXT = 'Reference target';

async function launch(overrides = {}) {
  page = await ui.launch(overrides);
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

async function fitWidthFromTopBar() {
  await page.keyboard.press('Shift+Meta+0');
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

/** Card rectangles that intersect: nothing may float over another card. */
function overlappingCards(cards) {
  const overlaps = [];
  for (let left = 0; left < cards.length; left += 1) {
    for (let right = left + 1; right < cards.length; right += 1) {
      const a = cards[left];
      const b = cards[right];
      const horizontal = a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5;
      const vertical = a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
      if (horizontal && vertical) overlaps.push(`${a.id} ∩ ${b.id}`);
    }
  }
  return overlaps;
}

/** The in-flow height one card's chrome row contributes (row + its margin). */
async function chromeRowHeights(ids) {
  return page.evaluate((blockIds) => {
    const heights = {};
    for (const id of blockIds) {
      const card = document.querySelector(
        `.nf-editor[data-active="true"] [data-block-card="${id}"]`,
      );
      const row = card?.querySelector('[data-block-chrome]');
      if (row === null || row === undefined) continue;
      heights[id] =
        row.getBoundingClientRect().height +
        (Number.parseFloat(getComputedStyle(row).marginTop) || 0);
    }
    return heights;
  }, ids);
}

/** Which cards currently render a chrome row. */
async function cardsWithChrome(cards) {
  return page.evaluate((ids) => {
    const found = new Set();
    for (const id of ids) {
      const card = document.querySelector(
        `.nf-editor[data-active="true"] [data-block-card="${id}"]`,
      );
      if (card !== null && card.querySelector('[data-block-chrome]') !== null) {
        found.add(id);
      }
    }
    return [...found];
  }, cards.map((card) => card.id));
}

/**
 * S2.2 chrome-row differential (`docs/design/card-chrome.md`).
 *
 * The reference chips are no longer an absolute overlay: they are one in-flow
 * row inside the card, so a card that gains a row grows by exactly that row.
 * Everything the old layout-neutral invariant protected still holds: the left
 * edge never moves, a card without a row keeps its size, and no card rectangle
 * intersects another (nothing floats over the next card).
 */
async function assertChromeRowGrowth(before, after, rowCards) {
  assert.equal(after.cards.length, before.cards.length, 'no card is added or removed');
  const beforeById = new Map(before.cards.map((card) => [card.id, card]));
  const rowHeights = await chromeRowHeights(rowCards);
  for (const id of rowCards) {
    assert.ok(rowHeights[id] > 0, `${id} has a chrome row`);
  }
  for (const card of after.cards) {
    const original = beforeById.get(card.id);
    assert.ok(original !== undefined, `unexpected card ${card.id}`);
    // Cards are content-driven: a row can widen the card to its chip width,
    // but the left edge never moves and a plain card is untouched.
    assert.equal(card.x, original.x, `${card.id} x`);
    const growth = Math.round((card.height - original.height) * 10) / 10;
    const rowHeight = rowHeights[card.id];
    if (rowHeight === undefined) {
      assert.equal(card.width, original.width, `${card.id} width unchanged`);
      assert.ok(Math.abs(growth) <= 0.5, `${card.id} height unchanged (${growth})`);
    } else {
      assert.ok(card.width >= original.width - 0.5, `${card.id} width never shrinks`);
      assert.ok(
        Math.abs(growth - rowHeight) <= 1,
        `${card.id} grows by its chrome row (${growth} vs ${rowHeight})`,
      );
    }
  }
  assert.deepEqual(overlappingCards(after.cards), [], 'no card floats over another card');
}

/**
 * A second reference between two cards that already carry a row can wrap the
 * row instead of adding a new one: widths and heights may only grow, a card
 * without a row is untouched, and nothing overlaps.
 */
async function assertChromeOnlyGrows(before, after) {
  assert.equal(after.cards.length, before.cards.length, 'no card is added or removed');
  const beforeById = new Map(before.cards.map((card) => [card.id, card]));
  const rowCards = new Set(await cardsWithChrome(after.cards));
  for (const card of after.cards) {
    const original = beforeById.get(card.id);
    assert.ok(original !== undefined, `unexpected card ${card.id}`);
    assert.equal(card.x, original.x, `${card.id} x`);
    if (rowCards.has(card.id)) {
      assert.ok(card.width >= original.width - 0.5, `${card.id} width never shrinks`);
      assert.ok(card.height >= original.height - 0.5, `${card.id} height never shrinks`);
    } else {
      assert.equal(card.width, original.width, `${card.id} width unchanged`);
      assert.equal(card.height, original.height, `${card.id} height unchanged`);
    }
  }
  assert.deepEqual(overlappingCards(after.cards), [], 'no card floats over another card');
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
    await seedDemo();
    await ui.showOutline();

    const seeded = await structure();
    await addTopLevelBlock(ui, SOURCE_ID, textDoc(SOURCE_TEXT));
    await addTopLevelBlock(ui, TARGET_ID, textDoc(TARGET_TEXT));
    await h.waitLayout({ blocks: 9, arrows: 3 });

    const beforeState = await structure();
    const beforeLayout = await h.layoutSnapshot();
    const beforePrimary = primarySnapshot(beforeState);
    const beforeRows = await page.locator('.nf-tree-row[data-block-id]').count();
    const beforeArrows = await activePrimaryArrowCount();

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

    // S2.2 chrome-row differential: the source and the target each gain one
    // in-card row (See also / Referenced by); nothing else changes size, and
    // no card is covered by another card.
    await h.waitLayout({ blocks: 9, arrows: beforeArrows });
    await page.waitForSelector(`[data-block-chrome="${SOURCE_ID}"]`);
    await page.waitForSelector(`[data-block-chrome="${TARGET_ID}"]`);
    const linkedLayout = await h.layoutSnapshot();
    await assertChromeRowGrowth(beforeLayout, linkedLayout, [SOURCE_ID, TARGET_ID]);

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
    // The cycle adds a second chip to two rows that already exist, so the row
    // may wrap: cards can only grow, the left edge never moves, and nothing is
    // covered by another card.
    await assertChromeOnlyGrows(linkedLayout, cycleLayout);

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
    await fitWidthFromTopBar();
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
    await seedDemo();
    await ui.showOutline();

    const seeded = await structure();
    const sourceId = 'm3d1-anchor-source';
    const calloutId = 'm3d1-anchor-callout';
    const referenceTargetId = seeded.chapters[0].topLevelBlockIds[0];
    assert.equal(typeof referenceTargetId, 'string');

    await addTopLevelBlock(ui, sourceId, textDoc('Alpha eigenvalue beta'));
    await addTopLevelBlock(ui, calloutId, textDoc('Callout child'));
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
    // Scope to the dialog: the selection bubble also carries a "Link" control and must
    // never win this click (it sits behind the modal).
    await page
      .getByRole('dialog', { name: 'Link as reference' })
      .getByRole('button', { name: 'Link', exact: true })
      .click();
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
    // The anchored reference adds one in-card row to the source and to the
    // target; both grow by exactly that row and nothing else changes.
    await page.waitForSelector(`[data-block-chrome="${sourceId}"]`);
    await page.waitForSelector(`[data-block-chrome="${referenceTargetId}"]`);
    const afterLayout = await h.layoutSnapshot();
    await assertChromeRowGrowth(beforeLayout, afterLayout, [sourceId, referenceTargetId]);

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
    await seedDemo();
    await ui.showOutline();

    const homeParentId = 'm3d2-home-parent';
    const targetId = 'm3d2-target';
    const targetChildId = 'm3d2-target-child';
    const sourceId = 'm3d2-source';
    const movedId = 'm3d2-moved';

    const text = (value) => ({
      type: 'doc',
      children: [{ type: 'paragraph', children: [{ type: 'text', text: value }] }],
    });

    await addTopLevelBlock(ui, homeParentId, text('Home parent'));
    await createDirectChild(homeParentId, targetId, 'Shared target');
    await createDirectChild(targetId, targetChildId, 'Target child');
    await addTopLevelBlock(ui, sourceId, text('Reference source'));
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
    await fitWidthFromTopBar();
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
    await addTopLevelBlock(ui, movedId, text('Moved source'));
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

  it('lists external references in the delete confirmation and mutates only on confirm', async () => {
    const env = isolated('delete-references');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await seedDemo();
    await ui.showOutline();

    const seeded = await structure();
    const chapterTitle = seeded.chapters[0].title ?? 'Untitled chapter';
    const parentId = 'm3h2-delete-parent';
    const childId = 'm3h2-delete-child';
    const sourceOneId = 'm3h2-delete-source-one';
    const sourceTwoId = 'm3h2-delete-source-two';
    const text = (value) => ({
      type: 'doc',
      children: [{ type: 'paragraph', children: [{ type: 'text', text: value }] }],
    });

    await addTopLevelBlock(ui, parentId, text('Delete parent'));
    await createDirectChild(parentId, childId, 'Delete child');
    await addTopLevelBlock(ui, sourceOneId, text('External source one'));
    await addTopLevelBlock(ui, sourceTwoId, text('External source two'));
    await h.waitLayout({ blocks: 11, arrows: 4 });

    await linkReference(sourceOneId, childId);
    await waitForReferenceFrom(sourceOneId, childId);
    await linkReference(sourceTwoId, parentId);
    await waitForReferenceFrom(sourceTwoId, parentId);

    const beforeDelete = await structure();
    const childReference = referenceBranchFrom(beforeDelete, sourceOneId, childId);
    const parentReference = referenceBranchFrom(beforeDelete, sourceTwoId, parentId);
    assert.ok(childReference !== undefined && parentReference !== undefined);
    const childReferenceId = childReference.id;
    const parentReferenceId = parentReference.id;

    const openDeleteDialog = async () => {
      await openBlockMenu(parentId);
      await chooseMenuItem(/Delete block/);
      await page.getByRole('dialog', { name: 'Delete block' }).waitFor();
      await page.locator('[data-delete-references="true"]').waitFor();
    };

    await openDeleteDialog();
    assert.equal(
      await page.locator('[data-delete-reference]').count(),
      1,
      'promote mode lists only references to the block being deleted',
    );
    const parentRow = page.locator(`[data-delete-reference="${parentReferenceId}"]`);
    await parentRow.waitFor();
    assert.equal(await parentRow.getAttribute('data-delete-reference-source'), sourceTwoId);
    assert.equal(await parentRow.getAttribute('data-delete-reference-target'), parentId);
    assert.equal(await parentRow.getAttribute('data-delete-reference-role'), 'reference');
    assert.equal(
      await page.locator(`[data-delete-reference="${childReferenceId}"]`).count(),
      0,
      'a reference to a promoted descendant survives and is not listed',
    );
    const parentRowText = (await parentRow.textContent()) ?? '';
    assert.ok(parentRowText.includes('External source two'));
    assert.ok(parentRowText.includes(chapterTitle));
    assert.match(parentRowText, /Reference/);
    assert.ok(parentRowText.includes('Delete parent'));
    assert.deepEqual(await structure(), beforeDelete, 'opening the dialog mutates nothing');

    await mkdir(artifactsPath('m3-reference'), { recursive: true });
    await h.screenshot(artifactsPath('m3-reference', 'delete-reference-disclosure-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('dialog', { name: 'Delete block' }).waitFor({ state: 'detached' });
    assert.deepEqual(await structure(), beforeDelete, 'delete cancel mutates nothing');

    // Subtree mode also lists incoming references to descendants that will be
    // deleted, but never references sourced inside the subtree.
    await openDeleteDialog();
    await page.getByRole('radio', { name: /Delete the whole subtree/ }).check();
    assert.equal(await page.locator('[data-delete-reference]').count(), 2);
    await page.locator(`[data-delete-reference="${childReferenceId}"]`).waitFor();
    assert.equal(
      await page.locator(`[data-delete-reference="${parentReferenceId}"]`).count(),
      1,
    );
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('dialog', { name: 'Delete block' }).waitFor({ state: 'detached' });
    assert.deepEqual(await structure(), beforeDelete, 'subtree cancel mutates nothing');

    // Confirm still uses the existing core delete: the external edge to the
    // deleted block disappears with it, while the promoted child and the edge
    // to that child stay. One undo restores the exact graph.
    await openDeleteDialog();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('dialog', { name: 'Delete block' }).waitFor({ state: 'detached' });
    await h.waitCanonicalBlockCount(10);
    const afterDelete = await structure();
    assert.equal(afterDelete.blocks[parentId], undefined);
    assert.ok(afterDelete.blocks[childId] !== undefined, 'the promoted child stays');
    assert.ok(afterDelete.blocks[sourceOneId] !== undefined, 'reference source one stays');
    assert.ok(afterDelete.blocks[sourceTwoId] !== undefined, 'reference source two stays');
    assert.equal(afterDelete.branches[parentReferenceId], undefined);
    assert.deepEqual(afterDelete.branches[childReferenceId], beforeDelete.branches[childReferenceId]);

    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      (branchId) => {
        const current = window.__noteforestTest.structure();
        return current?.branches?.[branchId] !== undefined;
      },
      parentReferenceId,
      { timeout: 10000 },
    );
    assert.deepEqual(await structure(), beforeDelete, 'undo restores the exact graph');
    await page.keyboard.press('Meta+s');
    await h.waitSaved();
  });

  it('keeps one in-card chrome row: state first, then references, never over an edge', async () => {
    const env = isolated('chrome-row');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await seedDemo();
    await ui.showOutline();

    const parentId = 's22-chrome-parent';
    const calloutId = 's22-chrome-callout';
    const plainId = 's22-chrome-plain';
    const referenceTargetId = 's22-chrome-reference-target';
    const anchorId = 's22-chrome-anchor';

    // A parent with a broken anchor (state) and a See also reference, a direct
    // child that becomes the callout, and a plain card with no chrome at all.
    await addTopLevelBlock(ui, parentId, textDoc('Alpha omega beta'));
    // Evidence: the same card before any state or reference exists, so the
    // before/after pair shows the one in-card row and nothing else.
    await page.locator(`[data-block-card="${parentId}"]`).waitFor();
    await page
      .locator(`[data-block-card="${parentId}"]`)
      .screenshot({ path: artifactsPath('chrome', 'card-parent-without-chrome.png') });
    await addAnchor(ui, {
      anchorId,
      blockId: parentId,
      kind: 'text',
      selector: { kind: 'text', quote: 'omega' },
      binding: { kind: 'text', ranges: [{ nodePath: [0, 0], start: 6, end: 11 }] },
    });
    await addTopLevelBlock(ui, calloutId, textDoc('Callout child'));
    await addTopLevelBlock(ui, plainId, textDoc('Plain card'));
    await addTopLevelBlock(ui, referenceTargetId, textDoc('Reference target'));
    await addBranch(ui, {
      sourceBlockId: parentId,
      sourceAnchorId: anchorId,
      targetBlockId: calloutId,
    });
    await applyCommand({
      type: 'block.editContent',
      blockId: parentId,
      content: textDoc('Alpha beta'),
    });
    await page.waitForSelector(`[data-anchor-warning="${anchorId}"]`);

    // No further commands: the two reference edges are applied directly.
    const reference = await applyCommand({
      type: 'branch.create',
      sourceBlockId: parentId,
      targetBlockId: referenceTargetId,
      role: 'reference',
    });
    assert.equal(reference.ok, true);
    const calloutReference = await applyCommand({
      type: 'branch.create',
      sourceBlockId: referenceTargetId,
      targetBlockId: calloutId,
      role: 'reference',
    });
    assert.equal(calloutReference.ok, true);
    await page.waitForSelector(`[data-see-also-target="${referenceTargetId}"]`);
    await page.waitForSelector(`[data-referenced-by-source="${referenceTargetId}"]`);

    const geometry = await page.evaluate(
      ({ parent, callout, plain }) => {
        const scope = document.querySelector('.nf-editor[data-active="true"]');
        const cardOf = (id) => scope?.querySelector(`[data-block-card="${id}"]`) ?? null;
        const box = (element) => {
          if (element === null) return null;
          const rect = element.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          };
        };
        const chips = (root) =>
          [...(root?.querySelectorAll('[data-anchor-warning], .nf-ref-chip') ?? [])].map(
            (chip) => ({
              warning: chip.hasAttribute('data-anchor-warning'),
              text: chip.textContent?.trim() ?? '',
              radius: getComputedStyle(chip).borderRadius,
              height: getComputedStyle(chip).height,
              borderWidth: getComputedStyle(chip).borderWidth,
              position: getComputedStyle(chip).position,
            }),
          );
        const card = (id) => cardOf(id);
        const row = (id) => cardOf(id)?.querySelector('[data-block-chrome]') ?? null;
        const parentCard = card(parent);
        const parentRow = row(parent);
        const calloutCard = card(callout);
        const calloutRow = row(callout);
        const plainCard = card(plain);
        // The next top-level card after the parent, in document order.
        const topLevelCards = [...(scope?.querySelectorAll('[data-block-card]') ?? [])].filter(
          (candidate) => candidate.getAttribute('data-top-level') === 'true',
        );
        const nextTopLevel =
          topLevelCards[topLevelCards.indexOf(parentCard) + 1] ?? null;
        return {
          parentCard: box(parentCard),
          parentRow: box(parentRow),
          parentRowPosition: parentRow === null ? null : getComputedStyle(parentRow).position,
          parentChips: chips(parentCard),
          calloutCard: box(calloutCard),
          calloutRow: box(calloutRow),
          calloutHead: box(calloutCard?.querySelector('.nf-callout-head') ?? null),
          calloutQuote: box(calloutCard?.querySelector('.nf-callout-quote') ?? null),
          calloutState: box(calloutCard?.querySelector('.nf-callout-state') ?? null),
          calloutRowChips: chips(calloutRow),
          calloutHeadRefChips:
            calloutCard?.querySelectorAll('.nf-callout-head .nf-ref-chip').length ?? -1,
          plainRowCount: plainCard?.querySelectorAll('[data-block-chrome]').length ?? -1,
          nextTopLevel: box(nextTopLevel),
          port: (() => {
            const button = parentCard?.querySelector('.nf-branch-port');
            if (button === null || button === undefined) return null;
            const style = getComputedStyle(button);
            return { radius: style.borderRadius, width: style.width, height: style.height };
          })(),
          addPorts: [
            ...(parentCard?.querySelectorAll('.nf-add-edge') ?? []),
          ].map((button) => getComputedStyle(button).borderRadius),
        };
      },
      { parent: parentId, callout: calloutId, plain: plainId },
    );

    // One row, inside the card box: no negative offsets, no absolute chips.
    assert.ok(geometry.parentRow !== null, 'the parent has a chrome row');
    assert.equal(geometry.parentRowPosition, 'static');
    assert.ok(
      geometry.parentRow.top >= geometry.parentCard.top - 0.5,
      'the row starts inside the card',
    );
    assert.ok(
      geometry.parentRow.bottom <= geometry.parentCard.bottom + 0.5,
      'the row ends inside the card',
    );
    assert.ok(
      geometry.parentRow.left >= geometry.parentCard.left - 0.5 &&
        geometry.parentRow.right <= geometry.parentCard.right + 0.5,
      'the row never leaves the card laterally',
    );

    // State first, then references, and every chip is a rounded rectangle.
    assert.equal(geometry.parentChips.length, 2);
    assert.equal(geometry.parentChips[0].warning, true, 'state comes first');
    assert.match(geometry.parentChips[0].text, /Lost anchor/);
    assert.match(geometry.parentChips[1].text, /See also/);
    for (const chip of geometry.parentChips) {
      assert.equal(chip.radius, '3px', 'the chip uses the control radius');
      assert.equal(chip.height, '20px', 'the chip is 20 px high');
      assert.equal(chip.borderWidth, '1px');
      assert.equal(chip.position, 'static', 'no chip is absolutely positioned');
    }

    // The row does not reach the next top-level card.
    assert.ok(geometry.nextTopLevel !== null, 'a following top-level card exists');
    assert.ok(
      geometry.parentRow.bottom <= geometry.nextTopLevel.top,
      'the row never reaches the next card',
    );

    // The callout keeps quote + its state on top and its references below.
    assert.ok(geometry.calloutHead !== null && geometry.calloutQuote !== null);
    assert.ok(geometry.calloutState !== null, 'the callout keeps its own state on top');
    assert.equal(geometry.calloutHeadRefChips, 0, 'the head holds no reference chip');
    assert.deepEqual(
      geometry.calloutRowChips.map((chip) => /Referenced by/.test(chip.text)),
      [true],
      'the callout references live in the bottom row',
    );
    assert.ok(
      geometry.calloutState.top >= geometry.calloutHead.top - 0.5 &&
        geometry.calloutState.bottom <= geometry.calloutHead.bottom + 0.5,
      'the state stays beside its quote on top',
    );
    assert.ok(
      geometry.calloutRow.top >= geometry.calloutCard.top - 0.5 &&
        geometry.calloutRow.bottom <= geometry.calloutCard.bottom + 0.5,
      'the callout row is inside the callout card',
    );
    // The quote is above the row: quote first, references last.
    assert.ok(geometry.calloutQuote.bottom <= geometry.calloutRow.top + 0.5);

    // A plain card has no row at all.
    assert.equal(geometry.plainRowCount, 0, 'a plain card has no chrome row');

    // The circular icon ports are unchanged: the branch port stays a circle
    // and the add buttons stay round icon controls.
    assert.ok(geometry.port !== null);
    assert.equal(geometry.port.radius, '999px');
    assert.equal(geometry.port.width, geometry.port.height);
    assert.deepEqual(geometry.addPorts, ['50%', '50%']);

    await page.locator(`[data-block-card="${parentId}"]`).scrollIntoViewIfNeeded();
    await page
      .locator(`[data-block-card="${parentId}"]`)
      .screenshot({ path: artifactsPath('chrome', 'card-parent-with-chrome.png') });
    await page
      .locator(`[data-block-card="${calloutId}"]`)
      .screenshot({ path: artifactsPath('chrome', 'callout-top-quote-bottom-references.png') });
    await page
      .locator(`[data-block-card="${plainId}"]`)
      .screenshot({ path: artifactsPath('chrome', 'card-plain-no-chrome.png') });

    await page.keyboard.press('Meta+s');
    await h.waitSaved();
  });
});
