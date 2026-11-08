import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { calloutStackFixture } from '../support/fixtures.mjs';

const tempRoot = artifactsPath('m3b2c-ui-stacking');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
const {
  isolated,
  applyCommand,
  structure,
  seedDemo,
  createAnchoredChild,
  createDirectChild,
  waitForCallouts,
  waitForLaneWidth,
} = ui;
let page;

async function launch(overrides = {}) {
  page = await ui.launch(overrides);
}

async function trunkState(parentId) {
  return page.evaluate((id) => {
    const scope = document.querySelector('.nf-editor[data-active="true"]');
    const read = (placement) => {
      const trunk = scope?.querySelector(
        `.nf-edge-trunk[data-parent-id="${id}"][data-trunk-placement="${placement}"]`,
      );
      return {
        className: trunk?.getAttribute('class') ?? null,
        active: trunk?.classList.contains('nf-edge-active') ?? false,
        muted: trunk?.classList.contains('nf-edge-muted') ?? false,
      };
    };
    return { right: read('right'), below: read('below') };
  }, parentId);
}

/** One anchored callout child under the demo matrix parent. */
async function textAnchorFixture() {
  await seedDemo();

  const parentCard = h
    .activeEditor()
    .locator('[data-block-card]', { hasText: 'Take the symmetric matrix below' })
    .first();
  const parentId = await parentCard.getAttribute('data-block-card');
  assert.equal(typeof parentId, 'string');
  const { blockId: childId } = await createAnchoredChild(parentId, 'symmetric');
  await waitForCallouts(parentId, 1);
  await h.waitLayout({ blocks: 8, arrows: 4 });

  const canonical = await structure();
  const anchor = Object.values(canonical.anchors).find(
    (candidate) =>
      candidate.blockId === parentId &&
      (candidate.quote ?? '').includes('symmetric'),
  );
  assert.ok(anchor !== undefined, 'the text anchor exists');
  const branch = Object.values(canonical.branches).find(
    (candidate) => candidate.source.anchorId === anchor.id,
  );
  assert.ok(branch !== undefined, 'the anchor has one outgoing branch');
  return { parentId, parentCard, childId, anchorId: anchor.id, branchId: branch.id };
}

async function anchorVisualState(anchorId) {
  return page.evaluate((id) => {
    const scope = document.querySelector('.nf-editor[data-active="true"]');
    if (scope === null) return null;
    const idsOf = (element, attribute) =>
      (element.getAttribute(attribute) ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
    const textMark = [...scope.querySelectorAll('.nf-anchor-mark[data-anchor-ids]')].find((mark) =>
      idsOf(mark, 'data-anchor-ids').includes(id),
    );
    const formula = [...scope.querySelectorAll('.nf-formula-anchor[data-anchor-ids]')].find(
      (node) => idsOf(node, 'data-anchor-ids').includes(id),
    );
    const term = [...scope.querySelectorAll('[data-anchor-term-ids]')].find((node) =>
      idsOf(node, 'data-anchor-term-ids').includes(id),
    );
    const codeMarker = [...scope.querySelectorAll('[data-code-anchor-id]')].find(
      (node) => node.getAttribute('data-code-anchor-id') === id,
    );
    const marker = [...scope.querySelectorAll('[data-anchor-marker-id]')].find(
      (node) => node.getAttribute('data-anchor-marker-id') === id,
    );
    const callout = [...scope.querySelectorAll('[data-callout-row="true"][data-anchor-id]')].find(
      (row) => row.getAttribute('data-anchor-id') === id,
    );
    return {
      textMark: textMark !== undefined,
      idle: textMark?.getAttribute('data-anchor-idle') === 'true',
      decoration: textMark === undefined ? null : getComputedStyle(textMark).textDecorationLine,
      dotDisplay:
        textMark === undefined ? null : getComputedStyle(textMark, '::after').display,
      formulaIdle: formula?.getAttribute('data-anchor-idle') === 'true',
      formulaDotDisplay:
        formula === undefined ? null : getComputedStyle(formula, '::after').display,
      term: term !== undefined,
      codeMarker: codeMarker !== undefined,
      marker: marker !== undefined,
      callout: callout !== undefined,
    };
  }, anchorId);
}

async function waitForAnchorIdle(anchorId, idle) {
  await page.waitForFunction(
    ({ id, expected }) => {
      const scope = document.querySelector('.nf-editor[data-active="true"]');
      if (scope === null) return false;
      const mark = [...scope.querySelectorAll('.nf-anchor-mark[data-anchor-ids]')].find((node) =>
        (node.getAttribute('data-anchor-ids') ?? '')
          .split(',')
          .map((value) => value.trim())
          .includes(id),
      );
      return mark !== undefined && (mark.getAttribute('data-anchor-idle') === 'true') === expected;
    },
    { id: anchorId, expected: idle },
    { timeout: 10000 },
  );
}

describe('NoteForest M3g4/M3h1 callout stacking and active state', () => {
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

  it('paints a new anchor child above an existing direct child and re-aligns after reopen', async () => {
    const env = isolated('stacking');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await seedDemo();

    const parentCard = h
      .activeEditor()
      .locator('[data-block-card]', { hasText: 'Take the symmetric matrix below' })
      .first();
    const parentId = await parentCard.getAttribute('data-block-card');
    assert.equal(typeof parentId, 'string');

    // Product-owner order: the direct child exists first, then the anchor
    // child is added from the parent text.
    const directId = 'm3g4-direct-first';
    await createDirectChild(parentId, directId, 'Direct child already in the right group.');
    await h.waitLayout({ blocks: 8, arrows: 4 });
    const { blockId: calloutId } = await createAnchoredChild(parentId, 'symmetric');
    await waitForCallouts(parentId, 1);
    await waitForLaneWidth(parentId);
    await h.waitLayout({ blocks: 9, arrows: 5 });

    const alignment = await page.evaluate(
      ({ id }) => {
        const lane = document.querySelector(`[data-callout-lane="${id}"]`);
        if (lane === null) return null;
        const host = lane.closest('.nf-block-node');
        const rows = [...lane.querySelectorAll('[data-callout-row="true"]')].filter(
          (row) => row.closest('.nf-callout-lane') === lane,
        );
        return {
          laneWidth: Number.parseFloat(
            host?.style.getPropertyValue('--nf-lane-width') ?? '',
          ),
          offsets: rows.map((row) => row.style.getPropertyValue('--nf-callout-offset')),
        };
      },
      { id: parentId },
    );
    assert.ok(alignment !== null);
    assert.ok(
      alignment.laneWidth >= 240 && alignment.laneWidth <= 480,
      `the lane width is bounded (${alignment.laneWidth})`,
    );
    assert.ok(alignment.offsets.length > 0, 'the callout row exists');
    assert.ok(
      alignment.offsets.every((value) => value !== ''),
      'every callout row has a measured offset',
    );

    const stacking = await page.evaluate(
      ({ id, callout }) => {
        const scope = document.querySelector('.nf-editor[data-active="true"]');
        const lane = scope?.querySelector(`[data-callout-lane="${id}"]`);
        const group = [...(scope?.querySelectorAll('.nf-branch-children') ?? [])].find(
          (candidate) => candidate.getAttribute('data-parent-id') === id,
        );
        const calloutCard = scope?.querySelector(`[data-block-card="${callout}"]`);
        const card = scope?.querySelector(`[data-block-card="${id}"]`);
        if (lane === null || lane === undefined || group === null || group === undefined) {
          return null;
        }
        if (calloutCard === null || calloutCard === undefined || card === null || card === undefined) {
          return null;
        }
        const laneWrapper = lane.closest('.react-renderer.node-calloutLane');
        const groupWrapper = group.closest('.react-renderer.node-branchChildren');
        const laneRect = lane.getBoundingClientRect();
        const calloutRect = calloutCard.getBoundingClientRect();
        const groupRect = group.getBoundingClientRect();
        const hit = document.elementFromPoint(
          calloutRect.left + calloutRect.width / 2,
          calloutRect.top + calloutRect.height / 2,
        );
        return {
          hit: hit?.closest('[data-block-card]')?.getAttribute('data-block-card') ?? null,
          laneZ: Number.parseInt(getComputedStyle(laneWrapper).zIndex, 10),
          groupZ: Number.parseInt(getComputedStyle(groupWrapper).zIndex, 10),
          parentZ: Number.parseInt(getComputedStyle(card).zIndex, 10),
          edgeZ: Number.parseInt(
            getComputedStyle(scope.querySelector('.nf-edge-layer')).zIndex,
            10,
          ),
          laneRight: laneRect.right,
          groupLeft: groupRect.left,
          calloutRight: calloutRect.right,
        };
      },
      { id: parentId, callout: calloutId },
    );
    assert.ok(stacking !== null);
    assert.equal(stacking.hit, calloutId, 'the callout card is hit-testable, not covered');
    assert.equal(stacking.parentZ, 2, 'the parent card uses --nf-z-card');
    assert.equal(stacking.laneZ, 1, 'the callout lane uses --nf-z-lane');
    assert.equal(stacking.groupZ, 0, 'the right group uses --nf-z-right-group');
    assert.equal(stacking.edgeZ, 0, 'the edge layer uses --nf-z-edge');
    assert.ok(
      stacking.laneZ > stacking.groupZ,
      `the callout lane (${stacking.laneZ}) paints above the right group (${stacking.groupZ})`,
    );
    assert.ok(
      stacking.parentZ > stacking.laneZ,
      'the parent card keeps its bottom controls above the lane',
    );
    assert.ok(
      stacking.calloutRight <= stacking.groupLeft - 15.5,
      'the safe zone keeps the callout clear of the direct-child group',
    );

    await mkdir(artifactsPath('m3g4'), { recursive: true });
    await h.screenshot(artifactsPath('m3g4', 'anchor-above-direct-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // Reopen the saved document. The lane must recover its width and every row
    // offset without a resize or a new branch.
    await h.waitSaved();
    await h.quit();
    await launch(env);
    await page.waitForSelector('[data-library-document]');
    await page.getByText('Linear algebra').first().click();
    await page.waitForSelector(
      `.nf-editor[data-active="true"] [data-block-card="${parentId}"]`,
    );
    await waitForCallouts(parentId, 1);
    await waitForLaneWidth(parentId);
    await page.waitForFunction(
      (id) => {
        const lane = document.querySelector(`[data-callout-lane="${id}"]`);
        if (lane === null) return false;
        const rows = [...lane.querySelectorAll('[data-callout-row="true"]')].filter(
          (row) => row.closest('.nf-callout-lane') === lane,
        );
        const width = Number.parseFloat(
          lane.closest('.nf-block-node')?.style.getPropertyValue('--nf-lane-width') ?? '',
        );
        return (
          rows.length > 0 &&
          rows.every((row) => row.style.getPropertyValue('--nf-callout-offset') !== '') &&
          Number.isFinite(width) &&
          width >= 240 &&
          width <= 480
        );
      },
      parentId,
      { timeout: 10000 },
    );
  });

  it('highlights the shared right lead when a later child is selected', async () => {
    await launch(isolated('active-trunk'));
    await h.setWindowSize(1440, 900);
    const { parentId, shortDirect, longDirect } = await calloutStackFixture(ui);

    await h.activeEditor().locator(`[data-block-card="${shortDirect}"] .nf-block-prose`).click();
    await h.waitSelected(shortDirect);
    await h.activeEditor().locator(`[data-block-card="${longDirect}"] .nf-block-prose`).click();
    await h.waitSelected(longDirect);

    const active = await page.evaluate(
      ({ id, first, second }) => {
        const scope = document.querySelector('.nf-editor[data-active="true"]');
        const parent = scope?.querySelector(`[data-block-card="${id}"]`);
        const trunk = scope?.querySelector(
          `.nf-edge-trunk[data-parent-id="${id}"][data-trunk-placement="right"]`,
        );
        const edge = (childId) =>
          scope?.querySelector(`g[data-edge-id][data-child-id="${childId}"] path.nf-edge-path`);
        const points = (value) => {
          const numbers = (value ?? '')
            .split(/[^0-9.-]+/)
            .filter((part) => part.length > 0)
            .map(Number);
          const parsed = [];
          for (let index = 0; index + 1 < numbers.length; index += 2) {
            parsed.push({ x: numbers[index], y: numbers[index + 1] });
          }
          return parsed;
        };
        const contentRect = scope?.querySelector('.nf-canvas-content')?.getBoundingClientRect();
        const parentRect = parent?.getBoundingClientRect();
        const trunkPath = trunk?.getAttribute('d') ?? '';
        return {
          parentRight:
            parentRect === undefined || contentRect === undefined
              ? null
              : parentRect.right - contentRect.left,
          trunkClass: trunk?.getAttribute('class') ?? '',
          trunkPoints: points(trunkPath),
          firstClass: edge(first)?.getAttribute('class') ?? '',
          secondClass: edge(second)?.getAttribute('class') ?? '',
        };
      },
      { id: parentId, first: shortDirect, second: longDirect },
    );

    assert.equal(active.parentRight !== null, true);
    assert.equal(
      Math.abs((active.trunkPoints[0]?.x ?? 0) - active.parentRight) < 1,
      true,
      'the trunk owns the horizontal lead from the parent port',
    );
    assert.ok(
      active.trunkClass.includes('nf-edge-active'),
      'the shared trunk is active when the second child is selected',
    );
    assert.ok(
      active.secondClass.includes('nf-edge-active'),
      'the selected second child edge is active',
    );
    assert.ok(
      active.firstClass.includes('nf-edge-muted'),
      'the first child edge is muted while the second is selected',
    );
  });

  it('lights only the trunk for the selected child group', async () => {
    await launch(isolated('active-groups'));
    await h.setWindowSize(1440, 900);
    const { parentId, firstCallout, shortDirect } = await calloutStackFixture(ui);

    // Select an anchored callout: only the below trunk and the callout arm are
    // on the active path; the unrelated right group stays muted.
    await h.activeEditor().locator(`[data-block-card="${firstCallout}"] .nf-block-prose`).click();
    await h.waitSelected(firstCallout);
    await page.waitForFunction(
      (id) => {
        const scope = document.querySelector('.nf-editor[data-active="true"]');
        const right = scope?.querySelector(
          `.nf-edge-trunk[data-parent-id="${id}"][data-trunk-placement="right"]`,
        );
        const below = scope?.querySelector(
          `.nf-edge-trunk[data-parent-id="${id}"][data-trunk-placement="below"]`,
        );
        return (
          right !== null &&
          below !== null &&
          right.classList.contains('nf-edge-muted') &&
          below.classList.contains('nf-edge-active')
        );
      },
      parentId,
      { timeout: 10000 },
    );
    const calloutTrunks = await trunkState(parentId);
    assert.ok(calloutTrunks.below.active, 'the below trunk is active for a callout selection');
    assert.equal(calloutTrunks.below.muted, false);
    assert.ok(calloutTrunks.right.muted, 'the right trunk is muted for a callout selection');
    assert.equal(calloutTrunks.right.active, false);

    await mkdir(artifactsPath('m3h1'), { recursive: true });
    await h.screenshot(artifactsPath('m3h1', 'selected-callout-trunks-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // Select a direct child: only the right trunk and its arm are active; the
    // below group and the callout arms stay muted.
    await h.activeEditor().locator(`[data-block-card="${shortDirect}"] .nf-block-prose`).click();
    await h.waitSelected(shortDirect);
    await page.waitForFunction(
      (id) => {
        const scope = document.querySelector('.nf-editor[data-active="true"]');
        const right = scope?.querySelector(
          `.nf-edge-trunk[data-parent-id="${id}"][data-trunk-placement="right"]`,
        );
        const below = scope?.querySelector(
          `.nf-edge-trunk[data-parent-id="${id}"][data-trunk-placement="below"]`,
        );
        return (
          right !== null &&
          below !== null &&
          right.classList.contains('nf-edge-active') &&
          below.classList.contains('nf-edge-muted')
        );
      },
      parentId,
      { timeout: 10000 },
    );
    const directTrunks = await trunkState(parentId);
    assert.ok(directTrunks.right.active, 'the right trunk is active for a direct-child selection');
    assert.equal(directTrunks.right.muted, false);
    assert.ok(directTrunks.below.muted, 'the below trunk is muted for a direct-child selection');
    assert.equal(directTrunks.below.active, false);
  });

  it('removes every marker when an anchored target is deleted, and undo restores it exactly', async () => {
    await launch(isolated('idle-target'));
    await h.setWindowSize(1440, 900);
    const { parentId, parentCard, childId, anchorId } = await textAnchorFixture();
    const before = await structure();

    const active = await anchorVisualState(anchorId);
    assert.ok(active !== null);
    assert.equal(active.textMark, true);
    assert.equal(active.idle, false, 'the anchor with a branch is not idle');
    assert.match(active.decoration ?? '', /underline/);
    assert.notEqual(active.dotDisplay, 'none');
    assert.equal(active.marker, false, 'no marker button while the block is not selected');
    assert.equal(active.callout, true);
    assert.equal(active.term, false);

    await applyCommand({
      type: 'block.delete',
      blockId: childId,
      children: 'delete-subtree',
    });
    await h.waitCanonicalBlockCount(7);
    await h.waitBlockCount(7);
    await h.waitLayout({ blocks: 7, arrows: 3 });
    await waitForAnchorIdle(anchorId, true);

    const idle = await anchorVisualState(anchorId);
    assert.ok(idle !== null);
    assert.equal(idle.textMark, true, 'the binding survives as an idle anchor');
    assert.equal(idle.idle, true);
    assert.equal(idle.decoration, 'none', 'the idle anchor has no underline');
    assert.equal(idle.dotDisplay, 'none', 'the idle anchor has no dot');
    assert.equal(idle.marker, false);
    assert.equal(idle.callout, false, 'no stale callout row');
    assert.equal(idle.term, false);
    assert.equal(idle.codeMarker, false);

    const deleted = await structure();
    assert.ok(deleted.anchors[anchorId] !== undefined, 'the anchor record stays idle');
    assert.equal(
      Object.values(deleted.branches).some((branch) => branch.source.anchorId === anchorId),
      false,
      'the deleted target takes its branch with it',
    );

    await parentCard.scrollIntoViewIfNeeded();
    await h.waitLayout({ blocks: 7, arrows: 3 });
    await mkdir(artifactsPath('m3g1'), { recursive: true });
    await h.screenshot(artifactsPath('m3g1', 'idle-anchor-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    await page.keyboard.press('Meta+z');
    await h.waitCanonicalBlockCount(8);
    await h.waitBlockCount(8);
    await h.waitLayout({ blocks: 8, arrows: 4 });
    await waitForAnchorIdle(anchorId, false);

    const restored = await anchorVisualState(anchorId);
    assert.ok(restored !== null);
    assert.equal(restored.idle, false);
    assert.match(restored.decoration ?? '', /underline/);
    assert.notEqual(restored.dotDisplay, 'none');
    assert.equal(restored.callout, true);
    const undone = await structure();
    assert.deepEqual(undone.anchors, before.anchors, 'undo restores the anchor record exactly');
    assert.deepEqual(undone.branches, before.branches, 'undo restores the branch exactly');
    assert.deepEqual(
      undone.blocks[parentId].content,
      before.blocks[parentId].content,
      'undo restores the source binding exactly',
    );
  });

  it('removes the marker when the last branch is deleted, and undo restores it exactly', async () => {
    await launch(isolated('idle-branch'));
    await h.setWindowSize(1440, 900);
    const { parentId, anchorId, branchId, childId } = await textAnchorFixture();
    const before = await structure();

    await applyCommand({
      type: 'branch.delete',
      branchId,
      targetHandling: { kind: 'promote' },
    });
    await h.waitCanonicalBlockCount(8);
    await h.waitBlockCount(8);
    await h.waitLayout({ blocks: 8, arrows: 3 });
    await waitForAnchorIdle(anchorId, true);

    const idle = await anchorVisualState(anchorId);
    assert.ok(idle !== null);
    assert.equal(idle.textMark, true);
    assert.equal(idle.idle, true);
    assert.equal(idle.decoration, 'none');
    assert.equal(idle.dotDisplay, 'none');
    assert.equal(idle.callout, false);
    assert.equal(idle.marker, false);

    const deleted = await structure();
    assert.ok(deleted.anchors[anchorId] !== undefined);
    assert.ok(deleted.blocks[childId] !== undefined, 'the promoted target block survives');
    assert.equal(
      Object.values(deleted.branches).some((branch) => branch.source.anchorId === anchorId),
      false,
      'the last outgoing branch is gone',
    );

    await page.keyboard.press('Meta+z');
    await h.waitCanonicalBlockCount(8);
    await h.waitBlockCount(8);
    await h.waitLayout({ blocks: 8, arrows: 4 });
    await waitForAnchorIdle(anchorId, false);

    const restored = await anchorVisualState(anchorId);
    assert.ok(restored !== null);
    assert.equal(restored.idle, false);
    assert.equal(restored.callout, true);
    const undone = await structure();
    assert.deepEqual(undone.anchors, before.anchors, 'undo restores the anchor record exactly');
    assert.deepEqual(undone.branches, before.branches, 'undo restores the last branch exactly');
    assert.deepEqual(
      undone.blocks[parentId].content,
      before.blocks[parentId].content,
      'undo restores the source binding exactly',
    );
  });
});

describe('NoteForest continuous right-group height reservation', () => {
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

  it('does not inherit a parent reservation into a callout-only child row', async () => {
    await launch(isolated('right-group-height'));
    await h.setWindowSize(1440, 900);
    await seedDemo();

    const parentCard = h
      .activeEditor()
      .locator('[data-block-card]', { hasText: 'Take the symmetric matrix below' })
      .first();
    const parentId = await parentCard.getAttribute('data-block-card');
    assert.equal(typeof parentId, 'string');
    const nextTopCard = h
      .activeEditor()
      .locator('[data-block-card][data-top-level="true"]', { hasText: 'Trace and determinant' })
      .first();
    const nextTopId = await nextTopCard.getAttribute('data-block-card');
    assert.equal(typeof nextTopId, 'string');

    // The parent owns a right group and a callout lane. Its direct child owns
    // only a callout lane: it must not inherit the parent's reserved height.
    const childId = 'm3g4-inheritance-child';
    await createDirectChild(
      parentId,
      childId,
      'Direct child with its own anchored callout and no right group.',
    );
    const { blockId: parentCalloutId } = await createAnchoredChild(parentId, 'symmetric');
    assert.ok(parentCalloutId.length > 0);
    await waitForCallouts(parentId, 1);
    const { blockId: calloutId } = await createAnchoredChild(childId, 'anchored');
    assert.ok(calloutId.length > 0);
    await waitForCallouts(childId, 1);
    await h.waitLayout({ blocks: 10, arrows: 6 });

    const measured = await page.evaluate(
      ({ parentId: parent, childId: child, nextTopId: nextTop }) => {
        const rectOf = (element) => {
          const rect = element.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom, height: rect.height };
        };
        const parentCard = document.querySelector(`[data-block-card="${parent}"]`);
        const childCard = document.querySelector(`[data-block-card="${child}"]`);
        const nextCard = document.querySelector(`[data-block-card="${nextTop}"]`);
        if (parentCard === null || childCard === null || nextCard === null) return null;
        const parentInner = parentCard.closest('.nf-block-inner');
        const childInner = childCard.closest('.nf-block-inner');
        const childContent = childInner?.firstElementChild;
        if (parentInner === null || childInner === null || childContent === null) {
          return null;
        }
        return {
          reservation: Number.parseFloat(
            parentInner.style.getPropertyValue('--nf-right-group-height'),
          ),
          childReservation: childInner.style
            .getPropertyValue('--nf-right-group-height')
            .trim(),
          childMinHeight: Number.parseFloat(getComputedStyle(childContent).minHeight),
          parentBottom: rectOf(parentInner).bottom,
          childBottom: rectOf(childInner).bottom,
          nextTop: rectOf(nextCard).top,
        };
      },
      { parentId, childId, nextTopId },
    );
    assert.ok(measured !== null);
    assert.ok(
      Number.isFinite(measured.reservation) && measured.reservation > 0,
      `the parent reserves its right group (${measured.reservation})`,
    );
    assert.ok(
      measured.reservation < 5000,
      `the reservation stays finite (${measured.reservation})`,
    );
    assert.equal(
      measured.childReservation,
      '',
      'a callout-only child does not publish its own right-group reservation',
    );
    assert.equal(
      measured.childMinHeight,
      0,
      'a callout-only child does not inherit the parent reservation as min-height',
    );
    assert.ok(
      measured.parentBottom >= measured.childBottom,
      `the parent covers its right group (${measured.parentBottom} >= ${measured.childBottom})`,
    );
    assert.ok(
      measured.nextTop >= measured.parentBottom,
      `the next top-level block starts below the reserved group (${measured.nextTop} >= ${measured.parentBottom})`,
    );
  });
});
