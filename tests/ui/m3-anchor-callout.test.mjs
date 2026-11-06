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
      snapshot.lane.right <= snapshot.parent.right + 0.5,
      'the lane stays within the parent card width',
    );

    // Both direct children fit to the right at 1440.
    assert.deepEqual(
      snapshot.right.map((entry) => entry.childId).sort(),
      [shortDirect, longDirect].sort(),
    );
    for (const entry of snapshot.right) {
      assert.ok(
        entry.card.left >= snapshot.parent.right + 15 &&
          entry.card.left <= snapshot.parent.right + 18,
        `direct child ${entry.childId} sits one gap right of the parent`,
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
        row.card.left >= snapshot.parent.left + 24 - 0.5,
        `row ${index} is indented at least 24 px from the parent card`,
      );
      assert.ok(
        row.card.right <= snapshot.lane.right + 0.5 &&
          row.card.right <= snapshot.parent.right + 0.5,
        `row ${index} stays inside the lane and parent bounds`,
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
    assert.ok(snapshot.lane.right <= snapshot.parent.right + 0.5);

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
        row.card.left >= snapshot.parent.left + 24 - 0.5,
        `row ${index} is indented at least 24 px from the parent card`,
      );
      assert.ok(
        row.card.right <= snapshot.lane.right + 0.5 &&
          row.card.right <= snapshot.parent.right + 0.5,
        `row ${index} stays inside the lane and parent bounds`,
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

    await mkdir(artifactsPath('m3g1'), { recursive: true });
    await h.screenshot(artifactsPath('m3g1', 'below-stack-960x900.png'), {
      width: 960,
      height: 900,
    });
  });

  it('clamps a far-right anchor to the card content left without overflow', async () => {
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
      row.card.left >= snapshot.parent.left + 24 - 0.5,
      'the clamped callout falls back to the indented row origin',
    );
    assert.ok(
      row.card.right <= snapshot.lane.right + 0.5 &&
        row.card.right <= snapshot.parent.right + 0.5,
      'the clamped callout never overflows the lane or card',
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
