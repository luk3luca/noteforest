import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifactsPath, createHarness } from '../support/harness.mjs';

const tempRoot = artifactsPath('m3b2c-ui');
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

async function textMatch(blockId, word) {
  const match = await page.evaluate(
    ({ blockId: id, word: expected }) => {
      const current = window.__noteforestTest.structure();
      const content = current.blocks[id]?.content;
      if (content === undefined) return null;
      const walk = (node, path) => {
        if (node.type === 'text' && typeof node.text === 'string') {
          const index = node.text.indexOf(expected);
          if (index >= 0) return { path, index, text: node.text };
        }
        for (const [childIndex, child] of (node.children ?? []).entries()) {
          const found = walk(child, [...path, childIndex]);
          if (found !== null) return found;
        }
        return null;
      };
      return walk(content, []);
    },
    { blockId, word },
  );
  assert.ok(match !== null, `"${word}" is in block ${blockId}`);
  return match;
}

async function createAnchoredChild(blockId, word) {
  const match = await textMatch(blockId, word);
  const result = await applyCommand({
    type: 'branch.createFromSelection',
    blockId,
    kind: 'text',
    binding: {
      kind: 'text',
      ranges: [{ nodePath: match.path, start: match.index, end: match.index + word.length }],
    },
    target: { kind: 'new' },
    role: 'primary',
  });
  assert.equal(typeof result.blockId, 'string');
  return result.blockId;
}

async function createDirectChild(parentId, blockId, text) {
  await applyCommand({
    type: 'block.create',
    blockId,
    content: {
      type: 'doc',
      children: [{ type: 'paragraph', children: [{ type: 'text', text }] }],
    },
    placement: { kind: 'child', parentBlockId: parentId },
  });
  await page.waitForSelector(`[data-block-card="${blockId}"]`);
  return blockId;
}

async function waitForCallouts(parentId, count) {
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
    { timeout: 10000 },
  );
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

async function waitForLaneWidth(parentId, minimum = 240) {
  await page.waitForFunction(
    ({ id, min }) => {
      const lane = document.querySelector(`[data-callout-lane="${id}"]`);
      if (lane === null) return false;
      const width = lane.getBoundingClientRect().width;
      const hostValue = Number.parseFloat(
        lane.closest('.nf-block-node')?.style.getPropertyValue('--nf-lane-width') ?? '',
      );
      return width >= min - 0.5 && Number.isFinite(hostValue) && hostValue >= min - 0.5;
    },
    { id: parentId, min: minimum },
    { timeout: 10000 },
  );
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

function parsePoints(path) {
  const numbers = (path ?? '')
    .split(/[^0-9.-]+/)
    .filter((part) => part.length > 0)
    .map(Number);
  const points = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    points.push({ x: numbers[index], y: numbers[index + 1] });
  }
  return points;
}

function lastSegment(points) {
  const end = points.at(-1);
  const before = points.at(-2);
  if (end === undefined || before === undefined) return { length: 0, horizontal: false };
  return {
    length: Math.hypot(end.x - before.x, end.y - before.y),
    horizontal: Math.abs(end.y - before.y) < 0.5,
  };
}

/** Distance from each Q control point to its adjacent line endpoints. */
function cornerOffsets(path) {
  const tokens = (path ?? '').match(/[MLQ]|-?\d+(?:\.\d+)?/g) ?? [];
  const segments = [];
  let command = 'M';
  let numbers = [];
  const flush = () => {
    if (numbers.length === 0) return;
    const points = [];
    for (let index = 0; index + 1 < numbers.length; index += 2) {
      points.push({ x: numbers[index], y: numbers[index + 1] });
    }
    segments.push({ command, points });
    numbers = [];
  };
  for (const token of tokens) {
    if (token === 'M' || token === 'L' || token === 'Q') {
      flush();
      command = token;
    } else {
      numbers.push(Number(token));
    }
  }
  flush();
  const offsets = [];
  let previous = null;
  for (const segment of segments) {
    if (segment.command === 'Q') {
      const control = segment.points[0];
      const after = segment.points[1];
      if (previous !== null && control !== undefined) {
        offsets.push(Math.hypot(previous.x - control.x, previous.y - control.y));
      }
      if (control !== undefined && after !== undefined) {
        offsets.push(Math.hypot(after.x - control.x, after.y - control.y));
      }
    }
    previous = segment.points.at(-1) ?? previous;
  }
  return offsets;
}

function assertNearRightAngles(edges, label) {
  for (const edge of edges) {
    expectNoArc(edge.path, `${label} ${edge.childId}`);
    for (const offset of cornerOffsets(edge.path)) {
      assert.ok(offset <= 4, `${label} ${edge.childId} corner rounding ${offset} <= 4`);
    }
  }
}

function expectNoArc(path, label) {
  assert.equal(/[Aa]/.test(path ?? ''), false, `${label} has no arc command`);
}

async function belowStackSnapshot(parentId, childIds) {
  return page.evaluate(
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
            points: parsePath(path?.getAttribute('d')),
          };
        })
        .filter((edge) => edge !== null);
      const trunks = [...content.querySelectorAll('.nf-edge-trunk')]
        .filter((trunk) => trunk.getAttribute('data-parent-id') === id)
        .map((trunk) => ({
          kind: trunk.getAttribute('data-trunk-kind'),
          placement: trunk.getAttribute('data-trunk-placement'),
          points: parsePath(trunk.getAttribute('d')),
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

      function parsePath(value) {
        const numbers = (value ?? '')
          .split(/[^0-9.-]+/)
          .filter((part) => part.length > 0)
          .map(Number);
        const points = [];
        for (let index = 0; index + 1 < numbers.length; index += 2) {
          points.push({ x: numbers[index], y: numbers[index + 1] });
        }
        return points;
      }
    },
    { parentId, childIds },
  );
}

function assertNoOverlap(rects, label) {
  for (let leftIndex = 0; leftIndex < rects.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < rects.length; rightIndex += 1) {
      const left = rects[leftIndex];
      const right = rects[rightIndex];
      assert.ok(
        left.right <= right.left + 0.5 ||
          right.right <= left.left + 0.5 ||
          left.bottom <= right.top + 0.5 ||
          right.bottom <= left.top + 0.5,
        `${label}: cards ${leftIndex} and ${rightIndex} do not overlap`,
      );
    }
  }
}

async function buildFixture() {
  await page.evaluate(() => window.__noteforestTest.seed('demo'));
  await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
  await h.waitSaved();
  await h.waitLayout({ blocks: 7, arrows: 3 });

  const parentCard = h
    .activeEditor()
    .locator('[data-block-card]', { hasText: 'Take the symmetric matrix below' })
    .first();
  const parentId = await parentCard.getAttribute('data-block-card');
  assert.equal(typeof parentId, 'string');

  const firstCallout = await createAnchoredChild(parentId, 'symmetric');
  await waitForCallouts(parentId, 1);
  const secondCallout = await createAnchoredChild(parentId, 'eigenvalues');
  await waitForCallouts(parentId, 2);

  const shortDirect = 'm3b2c-short-direct';
  const longDirect = 'm3b2c-long-direct';
  await createDirectChild(parentId, shortDirect, 'R');
  await createDirectChild(
    parentId,
    longDirect,
    'A deliberately long wrapped direct child whose card needs the full right column width.',
  );
  await h.waitLayout({ blocks: 11, arrows: 7 });

  const canonical = await structure();
  assert.equal(
    Object.values(canonical.branches).filter(
      (branch) => branch.source.blockId === parentId && branch.source.anchorId !== undefined,
    ).length,
    2,
    'the canonical document keeps two anchored primary branches',
  );
  assert.equal(
    Object.values(canonical.branches).filter(
      (branch) => branch.source.blockId === parentId && branch.source.anchorId === undefined,
    ).length,
    2,
    'the direct children stay normal primary branches',
  );
  return { parentId, parentCard, firstCallout, secondCallout, shortDirect, longDirect };
}

/**
 * M3g2 narrow-parent fixture: a 160 px top-level card plus one callout and two
 * direct children. The callout lane must be 240 px (its own floor), not the
 * parent width, and only the 80 px excess may push the direct-child group.
 */
async function narrowLaneFixture(name) {
  await launch(isolated(name));
  await h.setWindowSize(1440, 900);
  await page.evaluate(() => window.__noteforestTest.seed('demo'));
  await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
  await h.waitSaved();
  await h.waitLayout({ blocks: 7, arrows: 3 });

  const canonical = await structure();
  const chapterId = canonical.chapters[0].id;
  const parentId = 'm3g2-narrow-parent';
  await applyCommand({
    type: 'block.create',
    blockId: parentId,
    content: {
      type: 'doc',
      children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Narrow' }] }],
    },
    placement: { kind: 'top-level', chapterId },
  });
  await page.waitForSelector(`[data-block-card="${parentId}"]`);
  await h.waitLayout({ blocks: 8, arrows: 3 });

  const calloutId = await createAnchoredChild(parentId, 'Narrow');
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
async function wideSafeZoneFixture(name) {
  await launch(isolated(name));
  await h.setWindowSize(1440, 900);
  await page.evaluate(() => window.__noteforestTest.seed('demo'));
  await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
  await h.waitSaved();
  await h.waitLayout({ blocks: 7, arrows: 3 });

  const canonical = await structure();
  const chapterId = canonical.chapters[0].id;
  const parentId = 'm3g3-safe-parent';
  await applyCommand({
    type: 'block.create',
    blockId: parentId,
    content: {
      type: 'doc',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: 'Safe zone probe reaches card maximum width omega',
            },
          ],
        },
      ],
    },
    placement: { kind: 'top-level', chapterId },
  });
  await page.waitForSelector(`[data-block-card="${parentId}"]`);
  await h.waitLayout({ blocks: 8, arrows: 3 });

  const calloutId = await createAnchoredChild(parentId, 'omega');
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

async function textAnchorFixture(name) {
  await launch(isolated(name));
  await h.setWindowSize(1440, 900);
  await page.evaluate(() => window.__noteforestTest.seed('demo'));
  await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
  await h.waitSaved();
  await h.waitLayout({ blocks: 7, arrows: 3 });

  const parentCard = h
    .activeEditor()
    .locator('[data-block-card]', { hasText: 'Take the symmetric matrix below' })
    .first();
  const parentId = await parentCard.getAttribute('data-block-card');
  assert.equal(typeof parentId, 'string');
  const childId = await createAnchoredChild(parentId, 'symmetric');
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

describe('NoteForest M3b2c below-stack routing', () => {
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
      await buildFixture();

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
      Math.max(snapshot.parent.right, snapshot.lane.right) + 16;
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
    assert.ok(Math.abs(trunkStart.y - snapshot.parent.bottom) < 1, 'trunk starts at parent bottom');
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

  it('wraps a direct child after the callouts at a narrow width, with one shared trunk', async () => {
    await launch(isolated('narrow'));
    await h.setWindowSize(1440, 900);
    const { parentId, parentCard, firstCallout, secondCallout, shortDirect, longDirect } =
      await buildFixture();

    await h.setWindowSize(960, 900);
    await waitForWrappedRow(parentId);
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

    // Callouts first, then the wrapped long direct child; the short child fits.
    assert.deepEqual(
      snapshot.rows.map((row) => `${row.kind}:${row.childId}`),
      [`callout:${firstCallout}`, `callout:${secondCallout}`, `direct:${longDirect}`],
    );
    assert.deepEqual(
      snapshot.right.map((entry) => entry.childId),
      [shortDirect],
    );
    assert.ok(
      Math.abs(snapshot.lane.left - snapshot.parent.left) <= 0.5,
      'the lane starts at the parent card left at 960',
    );
    assert.ok(
      snapshot.lane.width >= 240 - 0.5 && snapshot.lane.width <= 480 + 0.5,
      'the lane keeps its independent bounds at 960',
    );
    const expectedRightGroup =
      Math.max(snapshot.parent.right, snapshot.lane.right) + 16;
    const shortCard = snapshot.right[0]?.card;
    assert.ok(shortCard !== undefined);
    assert.ok(
      shortCard.left >= expectedRightGroup - 1 && shortCard.left <= expectedRightGroup + 1,
      'the remaining direct child starts at max(parent.right, lane.right) + gap',
    );

    const byChild = new Map(snapshot.edges.map((edge) => [edge.childId, edge]));
    assert.equal(byChild.get(shortDirect)?.placement, 'right');
    assert.equal(byChild.get(shortDirect)?.arrow, 'right');
    assert.equal(byChild.get(longDirect)?.placement, 'below');
    assert.equal(byChild.get(longDirect)?.arrow, 'right');

    // One trunk across three rows: two callouts and the wrapped direct child.
    const trunks = snapshot.trunks.filter(
      (trunk) => trunk.kind === 'trunk' && trunk.placement === 'below',
    );
    assert.equal(trunks.length, 1, 'one shared below trunk for all rows');
    const trunk = trunks[0];
    assert.ok(trunk !== undefined);
    const trunkStart = trunk.points[0];
    if (trunkStart === undefined) throw new Error('missing trunk start');
    assert.ok(Math.abs(trunkStart.y - snapshot.parent.bottom) < 1);
    assert.ok(
      trunkStart.x >= snapshot.parent.left + 8 && trunkStart.x <= snapshot.parent.left + 16,
      'the trunk starts inside the parent card at 960 as well',
    );
    assert.ok(
      trunkStart.x < Math.min(...snapshot.rows.map((row) => row.card.left)) - 11,
      'the trunk never crosses a row card',
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
      'narrow layout',
    );
    assert.equal(
      snapshot.trunks.filter((trunkItem) => trunkItem.kind === 'bus').length,
      0,
      'no bottom bus',
    );
    assertNearRightAngles(snapshot.edges, '960');

    await mkdir(artifactsPath('m3g1'), { recursive: true });
    await h.screenshot(artifactsPath('m3g1', 'below-stack-960x900.png'), {
      width: 960,
      height: 900,
    });
  });

  it('caps a far-right anchor at the safe zone without overflow', async () => {
    await launch(isolated('clamp'));
    await h.setWindowSize(1440, 900);
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    await h.waitLayout({ blocks: 7, arrows: 3 });

    const canonical = await structure();
    const chapterId = canonical.chapters[0].id;
    const parentId = 'm3b2c-clamp-parent';
    await applyCommand({
      type: 'block.create',
      blockId: parentId,
      content: {
        type: 'doc',
        children: [
          { type: 'paragraph', children: [{ type: 'text', text: 'Clamp probe alpha omega' }] },
        ],
      },
      placement: { kind: 'top-level', chapterId },
    });
    await page.waitForSelector(`[data-block-card="${parentId}"]`);
    await h.waitLayout({ blocks: 8, arrows: 3 });

    const calloutId = await createAnchoredChild(parentId, 'omega');
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
    assert.ok(Math.abs(start.y - snapshot.parent.bottom) < 1);
    assert.ok(start.x >= snapshot.parent.left + 8 && start.x <= snapshot.parent.left + 16);
    assert.equal(edge.arrow, 'right');
    expectStem(edge.points, GEOMETRY_STEM_MIN);
  });

  it('wraps direct children after the callout when the safe zone is under 240 px', async () => {
    const { parentId, calloutId, shortDirect, longDirect } = await narrowLaneFixture('lane');
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
      Math.abs(wideTrunkStart.y - wide.parent.bottom) <= 1,
      'the below trunk starts on the parent bottom edge',
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
    assert.ok(Math.abs(trunkStart.y - narrow.parent.bottom) <= 1);
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
    const { parentId, calloutId, firstDirect, secondDirect } =
      await wideSafeZoneFixture('safe-zone');
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

    // --- 960: the long direct children no longer fit right; they wrap below
    // after the callout and share its trunk.
    await h.setWindowSize(960, 900);
    await waitForBelowRowCount(parentId, 2);
    await waitForRightGroupCount(parentId, 0);
    await h.waitLayout({ blocks: 11, arrows: 7 });
    await parentCard.scrollIntoViewIfNeeded();
    await h.waitLayout({ blocks: 11, arrows: 7 });
    const narrow = await belowStackSnapshot(parentId, [calloutId, firstDirect, secondDirect]);
    assert.ok(narrow !== null);
    assert.deepEqual(
      narrow.rows.map((row) => `${row.kind}:${row.childId}`),
      [`callout:${calloutId}`, `direct:${firstDirect}`, `direct:${secondDirect}`],
      'the callout comes before both wrapped direct children at 960',
    );
    assert.deepEqual(narrow.right, [], 'the right group is empty at 960');
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
    }
    const belowTrunks = narrow.trunks.filter(
      (trunk) => trunk.kind === 'trunk' && trunk.placement === 'below',
    );
    assert.equal(belowTrunks.length, 1, 'one shared below trunk at 960');
    assertNearRightAngles(narrow.edges, 'safe zone 960');
    assertNoOverlap(
      [narrow.parent, ...narrow.rows.map((row) => row.card)],
      'safe zone 960 layout',
    );

    await parentCard.scrollIntoViewIfNeeded();
    await centerOn(parentId);
    await h.screenshot(artifactsPath('m3g3', 'wide-safe-zone-960x900.png'), {
      width: 960,
      height: 900,
    });
  });

  it('removes every marker when an anchored target is deleted, and undo restores it exactly', async () => {
    const { parentId, parentCard, childId, anchorId } = await textAnchorFixture('idle-target');
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
    const { parentId, anchorId, branchId, childId } = await textAnchorFixture('idle-branch');
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

const GEOMETRY_STEM_MIN = 12;

function expectStem(points, minimum) {
  const segment = lastSegment(points);
  assert.equal(segment.horizontal, true, 'final stem is horizontal');
  assert.ok(segment.length >= minimum - 0.5, `final stem is at least ${minimum} px`);
}
