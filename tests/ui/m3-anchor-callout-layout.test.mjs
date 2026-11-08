import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { artifactsPath } from '../support/harness.mjs';
import {
  GEOMETRY_STEM_MIN,
  assertNearRightAngles,
  assertNoOverlap,
  createUiSession,
  expectStem,
  parsePoints,
} from '../support/ui-session.mjs';
import { addTopLevelBlock, calloutStackFixture, textDoc } from '../support/fixtures.mjs';

const tempRoot = artifactsPath('m3b2c-ui-layout');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
const {
  isolated,
  seedDemo,
  createAnchoredChild,
  createDirectChild,
  waitForCallouts,
  waitForLaneWidth,
} = ui;
const BELOW_TRUNK_GAP = 8;
let page;

async function launch(overrides = {}) {
  page = await ui.launch(overrides);
}

async function waitForWrappedRow(parentId) {
  await page.waitForFunction(
    (id) => {
      const lane = document.querySelector(`[data-callout-lane="${id}"]`);
      if (lane === null) return false;
      return [...lane.querySelectorAll('.nf-block-node[data-below-row="true"]')].some(
        (row) => row.closest('.nf-callout-lane') === lane,
      );
    },
    parentId,
    { timeout: 10000 },
  );
}

async function waitForBelowRowCount(parentId, count) {
  await page.waitForFunction(
    ({ id, expected }) => {
      const lane = document.querySelector(`[data-callout-lane="${id}"]`);
      if (lane === null) return false;
      const rows = [...lane.querySelectorAll('.nf-block-node[data-below-row="true"]')].filter(
        (row) => row.closest('.nf-callout-lane') === lane,
      );
      return rows.length === expected;
    },
    { id: parentId, expected: count },
    { timeout: 10000 },
  );
}

async function waitForRightGroupCount(parentId, count) {
  await page.waitForFunction(
    ({ id, expected }) => {
      const group = [...document.querySelectorAll('.nf-branch-children')].find(
        (candidate) => candidate.getAttribute('data-parent-id') === id,
      );
      if (group === null || group === undefined) return expected === 0;
      const cards = [...group.querySelectorAll('[data-block-card]')].filter(
        (card) => card.closest('.nf-branch-children') === group,
      );
      return cards.length === expected;
    },
    { id: parentId, expected: count },
    { timeout: 10000 },
  );
}

/**
 * Lane, row and edge geometry for one callout parent. Path `d` strings are
 * parsed here with the shared parser so the browser side only measures.
 */
async function belowStackSnapshot(parentId, childIds) {
  const snapshot = await page.evaluate(
    ({ parentId: id, childIds: expectedChildren }) => {
      const scope = document.querySelector('.nf-editor[data-active="true"]');
      const content = scope?.querySelector('.nf-canvas-content');
      if (content === null || content === undefined) return null;
      const contentRect = content.getBoundingClientRect();
      const rel = (element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left - contentRect.left,
          top: rect.top - contentRect.top,
          right: rect.right - contentRect.left,
          bottom: rect.bottom - contentRect.top,
          width: rect.width,
          height: rect.height,
        };
      };
      const parent = rel(content.querySelector(`[data-block-card="${id}"]`));
      const lane = content.querySelector(`[data-callout-lane="${id}"]`);
      if (lane === null) return null;
      const laneWidthVar =
        lane.closest('.nf-block-node')?.style.getPropertyValue('--nf-lane-width') ?? '';
      const laneRows = [
        ...lane.querySelectorAll('[data-callout-row="true"], .nf-block-node[data-below-row="true"]'),
      ].filter((row) => row.closest('.nf-callout-lane') === lane);
      const rows = laneRows.map((row) => {
        const card = row.querySelector('[data-block-card]');
        const anchorId = row.dataset.anchorId;
        const quote = row.querySelector('.nf-callout-quote-text');
        return {
          kind: row.dataset.calloutRow === 'true' ? 'callout' : 'direct',
          anchorId: anchorId ?? null,
          childId: card?.getAttribute('data-block-card') ?? null,
          quote: quote?.textContent?.trim() ?? '',
          card: card === null ? null : rel(card),
        };
      });
      const right = expectedChildren
        .filter((childId) => rows.every((row) => row.childId !== childId))
        .map((childId) => {
          const card = content.querySelector(`[data-block-card="${childId}"]`);
          return card === null ? null : { childId, card: rel(card) };
        })
        .filter((entry) => entry !== null);
      const edges = expectedChildren
        .map((childId) => {
          const group = content.querySelector(
            `g[data-edge-id][data-child-id="${childId}"]`,
          );
          if (group === null) return null;
          const path = group.querySelector('path.nf-edge-path');
          return {
            childId,
            kind: group.getAttribute('data-edge-kind'),
            placement: group.getAttribute('data-placement'),
            arrow: group.querySelector('[data-arrow]')?.getAttribute('data-arrow-direction'),
            d: path?.getAttribute('d') ?? '',
          };
        })
        .filter((edge) => edge !== null);
      const trunks = [...content.querySelectorAll('.nf-edge-trunk')]
        .filter((trunk) => trunk.getAttribute('data-parent-id') === id)
        .map((trunk) => ({
          kind: trunk.getAttribute('data-trunk-kind'),
          placement: trunk.getAttribute('data-trunk-placement'),
          d: trunk.getAttribute('d') ?? '',
        }));
      return {
        parent,
        lane: rel(lane),
        laneWidthVar,
        contentWidth: contentRect.width,
        rows,
        right,
        edges,
        trunks,
      };
    },
    { parentId, childIds },
  );
  if (snapshot === null) return null;
  return {
    ...snapshot,
    edges: snapshot.edges.map((edge) => ({ ...edge, points: parsePoints(edge.d) })),
    trunks: snapshot.trunks.map((trunk) => ({ ...trunk, points: parsePoints(trunk.d) })),
  };
}

/** Center a card in the scroll viewport so screenshots show its below stack. */
async function centerOn(blockId, blocks = 11, arrows = 7) {
  await page.evaluate((id) => {
    const card = document.querySelector(
      `.nf-editor[data-active="true"] [data-block-card="${id}"]`,
    );
    card?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }, blockId);
  await h.waitLayout({ blocks, arrows });
}

/**
 * M3g2 narrow-parent fixture: a 160 px top-level card plus one callout and two
 * direct children. The callout lane must be 240 px (its own floor), not the
 * parent width, and only the 80 px excess may push the direct-child group.
 */
async function narrowLaneFixture() {
  await seedDemo();

  const parentId = 'm3g2-narrow-parent';
  await addTopLevelBlock(ui, parentId, textDoc('Narrow'));
  await h.waitLayout({ blocks: 8, arrows: 3 });

  const { blockId: calloutId } = await createAnchoredChild(parentId, 'Narrow');
  await waitForCallouts(parentId, 1);
  await waitForLaneWidth(parentId);

  const shortDirect = 'm3g2-lane-short-direct';
  const longDirect = 'm3g2-lane-long-direct';
  await createDirectChild(parentId, shortDirect, 'R');
  await createDirectChild(
    parentId,
    longDirect,
    'A deliberately long direct child whose card needs the full right column width.',
  );
  await h.waitLayout({ blocks: 11, arrows: 7 });
  return { parentId, calloutId, shortDirect, longDirect };
}

/**
 * M3g3 safe-zone fixture: a near-max-width top-level card whose last word is
 * the anchor. The anchor is far right, so the callout must be capped at
 * parent.left + 160 and stop 16 px before the direct group. The two long direct
 * children fit right at 1440 and wrap below at 960.
 */
async function wideSafeZoneFixture() {
  await seedDemo();

  const parentId = 'm3g3-safe-parent';
  await addTopLevelBlock(
    ui,
    parentId,
    textDoc('Safe zone probe reaches card maximum width omega'),
  );
  await h.waitLayout({ blocks: 8, arrows: 3 });

  const { blockId: calloutId } = await createAnchoredChild(parentId, 'omega');
  await waitForCallouts(parentId, 1);
  await waitForLaneWidth(parentId, 300);

  const firstDirect = 'm3g3-safe-direct-a';
  const secondDirect = 'm3g3-safe-direct-b';
  const longText =
    'A deliberately long direct child whose card needs the full right column width.';
  await createDirectChild(parentId, firstDirect, longText);
  await createDirectChild(parentId, secondDirect, longText);
  await h.waitLayout({ blocks: 11, arrows: 7 });
  return { parentId, calloutId, firstDirect, secondDirect };
}

describe('NoteForest M3b2c/M3g callout layout and geometry', () => {
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

  it('keeps direct children right while every below-stack arrow enters from the left at 1440', async () => {
    await launch(isolated('wide'));
    await h.setWindowSize(1440, 900);
    const { parentId, parentCard, firstCallout, secondCallout, shortDirect, longDirect } =
      await calloutStackFixture(ui);

    await parentCard.scrollIntoViewIfNeeded();
    await h.waitLayout({ blocks: 11, arrows: 7 });
    const snapshot = await belowStackSnapshot(parentId, [
      firstCallout,
      secondCallout,
      shortDirect,
      longDirect,
    ]);
    assert.ok(snapshot !== null);

    // Two callouts remain below the parent, in anchor order.
    assert.deepEqual(
      snapshot.rows.map((row) => `${row.kind}:${row.childId}`),
      [`callout:${firstCallout}`, `callout:${secondCallout}`],
    );
    assert.deepEqual(
      snapshot.rows.map((row) => row.quote),
      ['symmetric', 'eigenvalues'],
    );
    assert.ok(
      snapshot.lane.top >= snapshot.parent.bottom - 0.5,
      'the below stack starts below the parent card',
    );
    assert.ok(
      Math.abs(snapshot.lane.left - snapshot.parent.left) <= 0.5,
      'the lane starts at the parent card left',
    );
    assert.ok(
      snapshot.lane.width >= 240 - 0.5 && snapshot.lane.width <= 480 + 0.5,
      'the lane keeps its independent 240–480 px bounds',
    );
    assert.ok(
      Number.parseFloat(snapshot.laneWidthVar) >= 240 &&
        Number.parseFloat(snapshot.laneWidthVar) <= 480,
      'the lane width variable is bounded',
    );

    // Both direct children fit to the right at 1440.
    assert.deepEqual(
      snapshot.right.map((entry) => entry.childId).sort(),
      [shortDirect, longDirect].sort(),
    );
    const expectedRightGroup =
      Math.max(snapshot.parent.right, snapshot.lane.right) + 24;
    for (const entry of snapshot.right) {
      assert.ok(
        entry.card.left >= expectedRightGroup - 1 &&
          entry.card.left <= expectedRightGroup + 1,
        `direct child ${entry.childId} starts at max(parent.right, lane.right) + gap`,
      );
      assert.ok(
        entry.card.top < snapshot.rows[0].card.bottom,
        'the right group is beside the parent, not after the lane',
      );
    }
    const byChild = new Map(snapshot.edges.map((edge) => [edge.childId, edge]));
    for (const [childId, kind] of [
      [firstCallout, 'callout'],
      [secondCallout, 'callout'],
    ]) {
      const edge = byChild.get(childId);
      assert.ok(edge !== undefined, `edge for ${childId}`);
      assert.equal(edge.kind, kind);
      assert.equal(edge.placement, 'below');
      assert.equal(edge.arrow, 'right');
    }
    for (const childId of [shortDirect, longDirect]) {
      const edge = byChild.get(childId);
      assert.ok(edge !== undefined, `edge for ${childId}`);
      assert.equal(edge.kind, 'direct');
      assert.equal(edge.placement, 'right');
      assert.equal(edge.arrow, 'right');
    }

    // The shared right trunk leaves the parent with a visible horizontal lead
    // instead of hugging the card edge.
    const rightTrunk = snapshot.trunks.find(
      (entry) => entry.kind === 'trunk' && entry.placement === 'right',
    );
    assert.ok(rightTrunk !== undefined, 'one shared right trunk');
    const rightLaneX = Math.max(...rightTrunk.points.map((point) => point.x));
    const rightLead = rightLaneX - snapshot.parent.right;
    assert.ok(
      rightLead >= 8 && rightLead <= 14,
      `the right trunk leaves a horizontal lead (${rightLead} px)`,
    );
    const firstRightEdge = snapshot.edges.find(
      (edge) =>
        edge.kind === 'direct' &&
        Math.abs((edge.points[0]?.x ?? 0) - rightLaneX) < 1,
    );
    assert.ok(firstRightEdge !== undefined, 'the first right child arm starts at the trunk');
    assert.ok(
      firstRightEdge.points.every((point) => point.x >= rightLaneX - 0.5),
      'the first right arm starts at the shared trunk, not the parent port',
    );

    // One shared trunk for the two callout rows, with a left-entry arm each.
    const belowTrunks = snapshot.trunks.filter(
      (trunk) => trunk.kind === 'trunk' && trunk.placement === 'below',
    );
    assert.equal(belowTrunks.length, 1, 'one shared below trunk');
    assert.equal(snapshot.trunks.filter((trunk) => trunk.kind === 'bus').length, 0);
    const trunk = belowTrunks[0];
    assert.ok(trunk !== undefined);
    const trunkStart = trunk.points[0];
    const trunkEnd = trunk.points.at(-1);
    if (trunkStart === undefined || trunkEnd === undefined) throw new Error('missing trunk');
    assert.ok(
      Math.abs(trunkStart.y - (snapshot.parent.bottom + BELOW_TRUNK_GAP)) < 1,
      'trunk starts one gap below the parent bottom',
    );
    assert.ok(
      Math.abs(trunkEnd.y - (snapshot.rows.at(-1).card.top + snapshot.rows.at(-1).card.height / 2)) <
        1.5,
      'trunk ends at the last row center',
    );
    assert.ok(
      trunkStart.x >= snapshot.parent.left + 8 &&
        trunkStart.x <= snapshot.parent.left + 16,
      'trunk starts a few px inside the parent card, not left of it',
    );
    assert.ok(
      trunkStart.x < Math.min(...snapshot.rows.map((row) => row.card.left)) - 11,
      'trunk stays left of every indented row, clear of the cards',
    );
    for (const [index, row] of snapshot.rows.entries()) {
      const edge = byChild.get(row.childId);
      assert.ok(edge !== undefined);
      const points = edge.points;
      const end = points.at(-1);
      if (end === undefined) throw new Error('missing edge end');
      assert.ok(
        row.card.left >= snapshot.lane.left + 26 - 0.5,
        `row ${index} is indented with the trunk from the lane left`,
      );
      assert.ok(
        row.card.right <= snapshot.lane.right + 0.5,
        `row ${index} stays inside the lane bounds`,
      );
      assert.ok(Math.abs(points[0]?.x - trunkStart.x) < 1, `row ${index} arm starts at the trunk`);
      assert.ok(Math.abs(end.x - (row.card.left - 2)) < 1, `row ${index} arrow tip at the left edge`);
      assert.ok(
        Math.abs(end.y - (row.card.top + row.card.height / 2)) < 1,
        `row ${index} arm at its center Y`,
      );
      expectStem(points, GEOMETRY_STEM_MIN);
      assert.ok(
        points.every((point) => point.x <= end.x + 0.5),
        `row ${index} never routes backwards`,
      );
    }
    assert.equal(byChild.get(longDirect)?.placement, 'right');
    assertNearRightAngles(snapshot.edges, '1440');

    assertNoOverlap(
      [
        snapshot.parent,
        ...snapshot.rows.map((row) => row.card),
        ...snapshot.right.map((entry) => entry.card),
      ],
      '1440 layout',
    );
    await parentCard.scrollIntoViewIfNeeded();
    await h.waitLayout({ blocks: 11, arrows: 7 });
    await mkdir(artifactsPath('m3g1'), { recursive: true });
    await h.screenshot(artifactsPath('m3g1', 'below-stack-1440x900.png'), {
      width: 1440,
      height: 900,
    });
  });

  it('stacks a callout child below its callout instead of over the outer direct column', async () => {
    await launch(isolated('nested-callout'));
    await h.setWindowSize(1440, 900);
    const { parentId, firstCallout, secondCallout, shortDirect, longDirect } =
      await calloutStackFixture(ui);

    const nestedId = 'm3g5-nested-child';
    await createDirectChild(firstCallout, nestedId, 'ciao');
    await h.waitLayout({ blocks: 12, arrows: 8 });
    await waitForBelowRowCount(firstCallout, 1);
    await h.waitLayout({ blocks: 12, arrows: 8 });

    const geometry = await page.evaluate(
      ({ calloutId, nested, outerDirect }) => {
        const scope = document.querySelector('.nf-editor[data-active="true"]');
        const card = (id) => scope?.querySelector(`[data-block-card="${id}"]`) ?? null;
        const rect = (element) => {
          if (element === null) return null;
          const bounds = element.getBoundingClientRect();
          return {
            left: bounds.left,
            right: bounds.right,
            top: bounds.top,
            bottom: bounds.bottom,
            width: bounds.width,
            height: bounds.height,
          };
        };
        const calloutCard = card(calloutId);
        const nestedCard = card(nested);
        const nestedLane = nestedCard?.closest('.nf-callout-lane');
        const directCards = outerDirect.map((id) => ({ id, rect: rect(card(id)) }));
        const outside = directCards.filter((entry) => entry.rect !== null);
        const overlaps = outside.filter((entry) => {
          const other = entry.rect;
          return (
            other !== null &&
            nestedCard !== null &&
            (() => {
              const nestedRect = rect(nestedCard);
              return (
                nestedRect !== null &&
                nestedRect.left < other.right &&
                nestedRect.right > other.left &&
                nestedRect.top < other.bottom &&
                nestedRect.bottom > other.top
              );
            })()
          );
        });
        return {
          callout: rect(calloutCard),
          nested: rect(nestedCard),
          nestedLane: nestedLane?.getAttribute('data-callout-lane') ?? null,
          direct: outside,
          overlaps: overlaps.map((entry) => entry.id),
        };
      },
      { calloutId: firstCallout, nested: nestedId, outerDirect: [shortDirect, longDirect] },
    );

    assert.ok(geometry.callout !== null && geometry.nested !== null);
    assert.equal(
      geometry.nestedLane,
      firstCallout,
      'the nested child is inside its callout lane, not the outer right group',
    );
    assert.ok(
      geometry.nested.top >= geometry.callout.bottom - 0.5,
      `the nested child starts below the callout (${geometry.nested.top} >= ${geometry.callout.bottom})`,
    );
    assert.ok(
      geometry.nested.left >= geometry.callout.left + 26 - 1,
      'the nested child keeps the shared row indent',
    );
    assert.deepEqual(
      geometry.overlaps,
      [],
      `the nested child does not overlap the outer direct children (${geometry.overlaps.join(', ')})`,
    );

    await mkdir(artifactsPath('m3g5'), { recursive: true });
    await h.screenshot(artifactsPath('m3g5', 'nested-anchor-child-1440x900.png'), {
      width: 1440,
      height: 900,
    });
  });

  it('keeps direct children right on the wide canvas, with one shared callout trunk', async () => {
    await launch(isolated('narrow'));
    await h.setWindowSize(1440, 900);
    const { parentId, parentCard, firstCallout, secondCallout, shortDirect, longDirect } =
      await calloutStackFixture(ui);

    await h.setWindowSize(960, 900);
    await waitForRightGroupCount(parentId, 2);
    await waitForCallouts(parentId, 2);
    await h.waitLayout({ blocks: 11, arrows: 7 });
    await parentCard.scrollIntoViewIfNeeded();
    await h.waitLayout({ blocks: 11, arrows: 7 });
    const snapshot = await belowStackSnapshot(parentId, [
      firstCallout,
      secondCallout,
      shortDirect,
      longDirect,
    ]);
    assert.ok(snapshot !== null);

    // The wide finite canvas keeps both direct children in the right column;
    // only the anchored callouts use the below lane.
    assert.deepEqual(
      snapshot.rows.map((row) => `${row.kind}:${row.childId}`),
      [`callout:${firstCallout}`, `callout:${secondCallout}`],
    );
    assert.deepEqual(
      snapshot.right.map((entry) => entry.childId),
      [shortDirect, longDirect],
    );
    assert.ok(
      Math.abs(snapshot.lane.left - snapshot.parent.left) <= 0.5,
      'the lane starts at the parent card left',
    );
    assert.ok(
      snapshot.lane.width >= 240 - 0.5 && snapshot.lane.width <= 480 + 0.5,
      'the lane keeps its independent bounds',
    );
    const expectedRightGroup =
      Math.max(snapshot.parent.right, snapshot.lane.right) + 24;
    for (const entry of snapshot.right) {
      assert.ok(
        entry.card.left >= expectedRightGroup - 1 && entry.card.left <= expectedRightGroup + 1,
        'each direct child starts at max(parent.right, lane.right) + gap',
      );
    }

    const byChild = new Map(snapshot.edges.map((edge) => [edge.childId, edge]));
    for (const childId of [shortDirect, longDirect]) {
      assert.equal(byChild.get(childId)?.placement, 'right');
      assert.equal(byChild.get(childId)?.arrow, 'right');
    }
    assert.equal(byChild.get(firstCallout)?.placement, 'below');
    assert.equal(byChild.get(secondCallout)?.placement, 'below');

    // One shared below trunk for the two callout rows.
    const trunks = snapshot.trunks.filter(
      (trunk) => trunk.kind === 'trunk' && trunk.placement === 'below',
    );
    assert.equal(trunks.length, 1, 'one shared below trunk for the callouts');
    const trunk = trunks[0];
    assert.ok(trunk !== undefined);
    const trunkStart = trunk.points[0];
    if (trunkStart === undefined) throw new Error('missing trunk start');
    assert.ok(
      Math.abs(trunkStart.y - (snapshot.parent.bottom + BELOW_TRUNK_GAP)) < 1,
    );
    assert.ok(
      trunkStart.x >= snapshot.parent.left + 8 && trunkStart.x <= snapshot.parent.left + 16,
      'the trunk starts inside the parent card',
    );
    for (const [index, row] of snapshot.rows.entries()) {
      const edge = byChild.get(row.childId);
      assert.ok(edge !== undefined);
      const end = edge.points.at(-1);
      if (end === undefined) throw new Error('missing edge end');
      assert.ok(
        row.card.left >= snapshot.lane.left + 26 - 0.5,
        `row ${index} is indented with the trunk from the lane left`,
      );
      assert.ok(
        row.card.right <= snapshot.lane.right + 0.5,
        `row ${index} stays inside the lane bounds`,
      );
      assert.ok(Math.abs(edge.points[0]?.x - trunkStart.x) < 1, `row ${index} arm starts at the trunk`);
      assert.ok(Math.abs(end.x - (row.card.left - 2)) < 1, `row ${index} enters from the left`);
      assert.ok(
        Math.abs(end.y - (row.card.top + row.card.height / 2)) < 1,
        `row ${index} arm at its center Y`,
      );
      assert.equal(edge.arrow, 'right');
      expectStem(edge.points, GEOMETRY_STEM_MIN);
    }
    assertNoOverlap(
      [
        snapshot.parent,
        ...snapshot.rows.map((row) => row.card),
        ...snapshot.right.map((entry) => entry.card),
      ],
      'wide canvas layout',
    );
  });

  it('caps a far-right anchor at the safe zone without overflow', async () => {
    await launch(isolated('clamp'));
    await h.setWindowSize(1440, 900);
    await seedDemo();

    const parentId = 'm3b2c-clamp-parent';
    await addTopLevelBlock(ui, parentId, textDoc('Clamp probe alpha omega'));
    await h.waitLayout({ blocks: 8, arrows: 3 });

    const { blockId: calloutId } = await createAnchoredChild(parentId, 'omega');
    await waitForCallouts(parentId, 1);
    await waitForLaneWidth(parentId);
    await h.waitLayout({ blocks: 9, arrows: 4 });

    const snapshot = await belowStackSnapshot(parentId, [calloutId]);
    assert.ok(snapshot !== null);
    assert.equal(snapshot.rows.length, 1);
    const row = snapshot.rows[0];
    if (row === undefined || row.card === null) throw new Error('missing callout row');
    const anchorLeft = await page.evaluate((id) => {
      const content = document.querySelector('.nf-editor[data-active="true"] .nf-canvas-content');
      const contentRect = content.getBoundingClientRect();
      const mark = [...content.querySelectorAll('.nf-anchor-mark[data-anchor-ids], [data-anchor-ids]')].find(
        (candidate) =>
          (candidate.dataset.anchorIds ?? '').split(',').includes(id),
      );
      return mark === undefined ? null : mark.getBoundingClientRect().left - contentRect.left;
    }, row.anchorId);
    const clamped = await page.evaluate((id) => {
      const rowElement = document.querySelector(
        `[data-callout-lane="${id}"] .nf-block-node[data-callout-row="true"]`,
      );
      return rowElement?.dataset.calloutClamped ?? null;
    }, parentId);
    assert.equal(clamped, 'true', 'the far-right anchor uses the clamped lane offset');
    assert.ok(anchorLeft !== null);
    assert.ok(anchorLeft > snapshot.parent.left + 120, 'the anchor really is far right');
    assert.ok(
      row.card.left >= snapshot.lane.left + 26 - 0.5,
      'the clamped callout falls back to the indented row origin',
    );
    assert.ok(
      row.card.right <= snapshot.lane.right + 0.5,
      'the clamped callout never overflows the lane',
    );
    const edge = snapshot.edges[0];
    assert.ok(edge !== undefined);
    // A single row still starts from the in-card trunk on the parent's bottom
    // edge; its vertical segment is the trunk, then one right-pointing arm.
    const start = edge.points[0];
    assert.ok(start !== undefined);
    assert.ok(
      Math.abs(start.y - (snapshot.parent.bottom + BELOW_TRUNK_GAP)) < 1,
    );
    assert.ok(start.x >= snapshot.parent.left + 8 && start.x <= snapshot.parent.left + 16);
    assert.equal(edge.arrow, 'right');
    expectStem(edge.points, GEOMETRY_STEM_MIN);
  });

  it('wraps direct children after the callout when the safe zone is under 240 px', async () => {
    await launch(isolated('lane'));
    await h.setWindowSize(1440, 900);
    const { parentId, calloutId, shortDirect, longDirect } = await narrowLaneFixture();
    const parentCard = h.activeEditor().locator(`[data-block-card="${parentId}"]`);
    await parentCard.scrollIntoViewIfNeeded();
    await waitForBelowRowCount(parentId, 2);
    await h.waitLayout({ blocks: 11, arrows: 7 });
    await waitForLaneWidth(parentId);

    // --- 1440: 160 px parent, 240 px lane. The 214 px usable width cannot
    // hold the 240 px callout minimum, so both direct children wrap below.
    const wide = await belowStackSnapshot(parentId, [calloutId, shortDirect, longDirect]);
    assert.ok(wide !== null);
    assert.ok(
      Math.abs(wide.parent.width - 160) <= 1,
      `the parent keeps its 160 px card width (${wide.parent.width})`,
    );
    assert.ok(
      Math.abs(wide.lane.width - 240) <= 1,
      `the lane floor is 240 px, not the parent width (${wide.lane.width})`,
    );
    assert.ok(
      Math.abs(wide.lane.left - wide.parent.left) <= 0.5,
      'the lane is aligned with the parent card left',
    );
    assert.ok(
      Math.abs(Number.parseFloat(wide.laneWidthVar) - wide.lane.width) <= 0.5,
      'the host lane-width variable matches the measured lane',
    );
    assert.deepEqual(
      wide.rows.map((row) => `${row.kind}:${row.childId}`),
      [`callout:${calloutId}`, `direct:${shortDirect}`, `direct:${longDirect}`],
      'the callout comes first, then both direct children in branch order',
    );
    assert.deepEqual(wide.right, [], 'no direct child sits beside the callout at 1440');
    const wideCallout = wide.rows[0];
    if (wideCallout === undefined || wideCallout.card === null) {
      throw new Error('missing callout row');
    }
    assert.ok(
      wideCallout.card.left - wide.parent.left <= 160 + 0.5,
      'the callout never starts farther than 160 px from the parent left',
    );
    assert.ok(
      wideCallout.card.left - wide.lane.left >= 26 - 0.5,
      'the callout card is indented with the trunk, not flush with the 160 px parent',
    );
    for (const [index, row] of wide.rows.entries()) {
      if (row.card === null) throw new Error(`missing row card ${index}`);
      assert.ok(
        row.card.left - wide.lane.left >= 26 - 0.5,
        `row ${index} is indented with the shared below trunk`,
      );
      assert.ok(
        row.card.right <= wide.lane.right + 0.5,
        `row ${index} stays inside the 240 px lane`,
      );
    }
    // The callout edge starts at the trunk inset inside the parent card and
    // reaches the indented row's left edge with a full stem.
    const wideCalloutEdge = wide.edges.find((edge) => edge.childId === calloutId);
    assert.ok(wideCalloutEdge !== undefined);
    assert.ok(
      Math.abs(wideCalloutEdge.points[0]?.x - (wide.parent.left + 12)) <= 1,
      'the callout arm starts at the parent left + 12 px trunk inset',
    );
    const wideTrunk = wide.trunks.find(
      (trunk) => trunk.kind === 'trunk' && trunk.placement === 'below',
    );
    assert.ok(wideTrunk !== undefined, 'one shared below trunk for all rows');
    const wideTrunkStart = wideTrunk.points[0];
    if (wideTrunkStart === undefined) throw new Error('missing trunk start');
    assert.ok(
      Math.abs(wideTrunkStart.x - (wide.parent.left + 12)) <= 1,
      'the below trunk starts at the parent left + 12 px inset',
    );
    assert.ok(
      Math.abs(wideTrunkStart.y - (wide.parent.bottom + BELOW_TRUNK_GAP)) <= 1,
      'the below trunk starts one gap below the parent bottom edge',
    );
    assert.equal(
      wide.trunks.filter((trunk) => trunk.kind === 'trunk' && trunk.placement === 'below')
        .length,
      1,
      'one shared below trunk for the callout and both wrapped children',
    );
    for (const edge of wide.edges) {
      assert.equal(edge.placement, 'below');
      assert.equal(edge.arrow, 'right');
      expectStem(edge.points, GEOMETRY_STEM_MIN);
    }
    assertNearRightAngles(wide.edges, 'narrow safe zone 1440');
    assertNoOverlap(
      [wide.parent, ...wide.rows.map((row) => row.card)],
      'narrow safe zone 1440 layout',
    );

    await parentCard.scrollIntoViewIfNeeded();
    await centerOn(parentId);
    await mkdir(artifactsPath('m3g3'), { recursive: true });
    await h.screenshot(artifactsPath('m3g3', 'narrow-safe-zone-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // --- 960: the same wrap holds; no child column appears beside the lane.
    await h.setWindowSize(960, 900);
    await waitForBelowRowCount(parentId, 2);
    await h.waitLayout({ blocks: 11, arrows: 7 });
    await parentCard.scrollIntoViewIfNeeded();
    await h.waitLayout({ blocks: 11, arrows: 7 });
    const narrow = await belowStackSnapshot(parentId, [calloutId, shortDirect, longDirect]);
    assert.ok(narrow !== null);
    assert.ok(
      Math.abs(narrow.lane.width - 240) <= 1,
      `the lane floor stays 240 px at 960 (${narrow.lane.width})`,
    );
    assert.deepEqual(
      narrow.rows.map((row) => `${row.kind}:${row.childId}`),
      [`callout:${calloutId}`, `direct:${shortDirect}`, `direct:${longDirect}`],
      'the same callout-first below stack holds at 960',
    );
    assert.deepEqual(narrow.right, [], 'no direct child sits beside the callout at 960');
    const narrowCallout = narrow.rows[0];
    if (narrowCallout === undefined || narrowCallout.card === null) {
      throw new Error('missing callout row at 960');
    }
    assert.ok(
      narrowCallout.card.left - narrow.parent.left <= 160 + 0.5,
      'the callout offset cap holds at 960',
    );
    for (const [index, row] of narrow.rows.entries()) {
      if (row.card === null) throw new Error(`missing row card at 960: ${index}`);
      assert.ok(
        row.card.left - narrow.lane.left >= 26 - 0.5,
        `row ${index} is indented with the shared below trunk at 960`,
      );
      assert.ok(
        row.card.right <= narrow.lane.right + 0.5,
        `row ${index} stays inside the lane at 960`,
      );
      assert.ok(
        row.card.right <= narrow.contentWidth + 1,
        `row ${index} stays inside the available canvas width at 960`,
      );
    }
    const belowTrunks = narrow.trunks.filter(
      (trunk) => trunk.kind === 'trunk' && trunk.placement === 'below',
    );
    assert.equal(belowTrunks.length, 1, 'one shared below trunk at 960');
    const trunk = belowTrunks[0];
    assert.ok(trunk !== undefined);
    const trunkStart = trunk.points[0];
    if (trunkStart === undefined) throw new Error('missing trunk start');
    assert.ok(Math.abs(trunkStart.x - (narrow.parent.left + 12)) <= 1);
    assert.ok(
      Math.abs(trunkStart.y - (narrow.parent.bottom + BELOW_TRUNK_GAP)) <= 1,
    );
    assert.ok(
      trunkStart.x < Math.min(...narrow.rows.map((row) => row.card.left)) - 11,
      'the trunk stays left of every indented row',
    );
    assert.equal(
      narrow.trunks.filter((trunkItem) => trunkItem.kind === 'bus').length,
      0,
      'no bottom bus',
    );
    assertNearRightAngles(narrow.edges, 'narrow safe zone 960');
    assertNoOverlap(
      [narrow.parent, ...narrow.rows.map((row) => row.card)],
      'narrow safe zone 960 layout',
    );

    await parentCard.scrollIntoViewIfNeeded();
    await centerOn(parentId);
    await h.screenshot(artifactsPath('m3g3', 'narrow-safe-zone-960x900.png'), {
      width: 960,
      height: 900,
    });
  });

  it('caps a far-right anchor at 160 px and keeps 16 px before the right group', async () => {
    await launch(isolated('safe-zone'));
    await h.setWindowSize(1440, 900);
    const { parentId, calloutId, firstDirect, secondDirect } = await wideSafeZoneFixture();
    const parentCard = h.activeEditor().locator(`[data-block-card="${parentId}"]`);
    await parentCard.scrollIntoViewIfNeeded();
    await waitForRightGroupCount(parentId, 2);
    await h.waitLayout({ blocks: 11, arrows: 7 });

    // --- 1440: near-max-width parent, both long direct children right.
    const wide = await belowStackSnapshot(parentId, [calloutId, firstDirect, secondDirect]);
    assert.ok(wide !== null);
    assert.ok(
      wide.parent.width >= 300,
      `the parent is wide enough for the right group (${wide.parent.width})`,
    );
    assert.deepEqual(
      wide.rows.map((row) => `${row.kind}:${row.childId}`),
      [`callout:${calloutId}`],
      'only the callout is below at 1440',
    );
    assert.deepEqual(
      wide.right.map((entry) => entry.childId).sort(),
      [firstDirect, secondDirect].sort(),
      'both direct children stay right at 1440',
    );
    const calloutRow = wide.rows[0];
    if (calloutRow === undefined || calloutRow.card === null) {
      throw new Error('missing callout row');
    }
    const anchorLeft = await page.evaluate((id) => {
      const content = document.querySelector('.nf-editor[data-active="true"] .nf-canvas-content');
      const contentRect = content.getBoundingClientRect();
      const mark = [...content.querySelectorAll('[data-anchor-ids]')].find((candidate) =>
        (candidate.dataset.anchorIds ?? '').split(',').includes(id),
      );
      return mark === undefined ? null : mark.getBoundingClientRect().left - contentRect.left;
    }, calloutRow.anchorId);
    assert.ok(anchorLeft !== null);
    assert.ok(
      anchorLeft > wide.parent.left + 160,
      `the measured anchor is farther right than the 160 px cap (${anchorLeft})`,
    );
    assert.ok(
      calloutRow.card.left - wide.parent.left <= 160 + 0.5,
      `the callout left is capped at 160 px (${calloutRow.card.left - wide.parent.left})`,
    );
    const rightGroupLeft = Math.min(...wide.right.map((entry) => entry.card.left));
    assert.ok(
      calloutRow.card.right <= rightGroupLeft - 16 + 0.5,
      `the callout right stops 16 px before the right group (${calloutRow.card.right} <= ${rightGroupLeft - 16})`,
    );
    assert.ok(
      calloutRow.card.right <= wide.lane.right + 0.5,
      'the callout never overflows the lane',
    );
    const clamped = await page.evaluate((id) => {
      const rowElement = document.querySelector(
        `[data-callout-lane="${id}"] .nf-block-node[data-callout-row="true"]`,
      );
      return rowElement?.dataset.calloutClamped ?? null;
    }, parentId);
    assert.equal(clamped, 'true', 'the far-right anchor uses the safe-zone clamp');
    // The callout lane precedes the right group in DOM order.
    const laneBeforeGroup = await page.evaluate((id) => {
      const lane = document.querySelector(`[data-callout-lane="${id}"]`);
      const group = [...document.querySelectorAll('.nf-branch-children')].find(
        (candidate) => candidate.getAttribute('data-parent-id') === id,
      );
      if (lane === null || group === null || group === undefined) return false;
      return (lane.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    }, parentId);
    assert.equal(laneBeforeGroup, true, 'the callout lane comes before the right group');
    const calloutEdge = wide.edges.find((edge) => edge.childId === calloutId);
    assert.ok(calloutEdge !== undefined);
    assert.equal(calloutEdge.placement, 'below');
    assert.equal(calloutEdge.arrow, 'right');
    expectStem(calloutEdge.points, GEOMETRY_STEM_MIN);
    assertNoOverlap(
      [
        wide.parent,
        calloutRow.card,
        ...wide.right.map((entry) => entry.card),
      ],
      'safe zone 1440 layout',
    );
    assertNearRightAngles(wide.edges, 'safe zone 1440');

    await parentCard.scrollIntoViewIfNeeded();
    await centerOn(parentId);
    await mkdir(artifactsPath('m3g3'), { recursive: true });
    await h.screenshot(artifactsPath('m3g3', 'wide-safe-zone-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // --- 960: the wide canvas still keeps both direct children in the right
    // column; only the callout stays below in its lane.
    await h.setWindowSize(960, 900);
    await waitForRightGroupCount(parentId, 2);
    await waitForCallouts(parentId, 1);
    await h.waitLayout({ blocks: 11, arrows: 7 });
    await parentCard.scrollIntoViewIfNeeded();
    await h.waitLayout({ blocks: 11, arrows: 7 });
    const narrow = await belowStackSnapshot(parentId, [calloutId, firstDirect, secondDirect]);
    assert.ok(narrow !== null);
    assert.deepEqual(
      narrow.rows.map((row) => `${row.kind}:${row.childId}`),
      [`callout:${calloutId}`],
      'the callout is the only below row at 960',
    );
    assert.deepEqual(
      narrow.right.map((entry) => entry.childId),
      [firstDirect, secondDirect],
      'both direct children stay in the right column at 960',
    );
    const narrowCallout = narrow.rows[0];
    if (narrowCallout === undefined || narrowCallout.card === null) {
      throw new Error('missing callout row at 960');
    }
    assert.ok(
      narrowCallout.card.left - narrow.parent.left <= 160 + 0.5,
      'the callout offset cap holds at 960',
    );
    assert.ok(
      narrowCallout.card.top >= narrow.parent.bottom - 0.5,
      'the callout is below the parent card',
    );
    const expectedRightGroup =
      Math.max(narrow.parent.right, narrow.lane.right) + 24;
    for (const entry of narrow.right) {
      assert.ok(
        entry.card.left >= expectedRightGroup - 1 && entry.card.left <= expectedRightGroup + 1,
        'the right group starts after the callout lane at 960',
      );
    }
    assertNearRightAngles(narrow.edges, 'safe zone 960');
    assertNoOverlap(
      [narrow.parent, narrowCallout.card, ...narrow.right.map((entry) => entry.card)],
      'safe zone 960 layout',
    );

    await parentCard.scrollIntoViewIfNeeded();
    await centerOn(parentId);
    await h.screenshot(artifactsPath('m3g3', 'wide-safe-zone-960x900.png'), {
      width: 960,
      height: 900,
    });
  });
});
