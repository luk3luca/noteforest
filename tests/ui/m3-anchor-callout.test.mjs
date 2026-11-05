import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifactsPath, createHarness } from '../support/harness.mjs';

const tempRoot = artifactsPath('m3b2a-ui');
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

function movesForward(points) {
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].x < points[index - 1].x - 0.5) return false;
    if (points[index].y < points[index - 1].y - 0.5) return false;
  }
  return true;
}

async function calloutSnapshot(parentId, childIds, directId) {
  return page.evaluate(
    ({ parentId: id, childIds: expectedChildren, directId: direct }) => {
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
      const rows = [...lane.querySelectorAll('[data-callout-row="true"]')]
        .filter((row) => row.closest('.nf-callout-lane') === lane)
        .map((row) => {
          const card = row.querySelector('[data-block-card]');
          const anchorId = row.dataset.anchorId;
          const mark = [...content.querySelectorAll('.nf-anchor-mark[data-anchor-ids]')].find(
            (candidate) =>
              (candidate.dataset.anchorIds ?? '').split(',').includes(anchorId ?? ''),
          );
          const dot = row.querySelector('.nf-callout-dot');
          const leader = row.querySelector('.nf-callout-leader');
          const quote = row.querySelector('.nf-callout-quote-text');
          const prose = card.querySelector('.nf-block-prose');
          return {
            anchorId,
            childId: card.getAttribute('data-block-card'),
            quote: quote?.textContent?.trim() ?? '',
            editable: prose?.isContentEditable ?? false,
            canBranch: card.querySelector('[data-add-child]') !== null,
            clamped: row.dataset.calloutClamped,
            offset: Number.parseFloat(row.style.getPropertyValue('--nf-callout-offset')),
            card: rel(card),
            anchorLeft: mark === undefined ? null : rel(mark).left,
            dotAria: dot?.getAttribute('aria-hidden') ?? null,
            leaderAria: leader?.getAttribute('aria-hidden') ?? null,
            leaderWidth: leader === null ? 0 : Number.parseFloat(getComputedStyle(leader).width),
          };
        });
      const directElement = content.querySelector(`[data-block-card="${direct}"]`);
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
            points: path === null ? [] : path.getAttribute('d'),
          };
        })
        .filter((edge) => edge !== null);
      return {
        parent,
        lane: rel(lane),
        rows,
        direct: directElement === null ? null : rel(directElement),
        edges,
      };
    },
    { parentId, childIds, directId },
  );
}

describe('NoteForest M3 callout lane', () => {
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

  it('stacks anchored callouts below the parent before a direct child, with forward edges', async () => {
    await launch(isolated('callout'));
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

    const firstCallout = await createAnchoredChild(parentId, 'symmetric');
    await waitForCallouts(parentId, 1);
    const secondCallout = await createAnchoredChild(parentId, 'eigenvalues');
    await waitForCallouts(parentId, 2);

    const directId = 'm3b2a-direct-child';
    await applyCommand({
      type: 'block.create',
      blockId: directId,
      content: {
        type: 'doc',
        children: [
          { type: 'paragraph', children: [{ type: 'text', text: 'Direct child after the lane' }] },
        ],
      },
      placement: { kind: 'child', parentBlockId: parentId },
    });
    await page.waitForSelector(`[data-block-card="${directId}"]`);
    await page.waitForSelector(`[data-callout-row="true"][data-anchor-id]`);

    const canonical = await structure();
    assert.equal(
      Object.values(canonical.branches).filter(
        (branch) => branch.source.blockId === parentId && branch.source.anchorId !== undefined,
      ).length,
      2,
      'the canonical document keeps two anchored primary branches',
    );
    assert.ok(
      Object.values(canonical.branches).some(
        (branch) =>
          branch.source.blockId === parentId &&
          branch.source.anchorId === undefined &&
          branch.targetBlockId === directId,
      ),
      'the direct child is still a normal primary branch',
    );

    await h.waitLayout({ blocks: 10, arrows: 6 });
    const snapshot = await calloutSnapshot(
      parentId,
      [firstCallout, secondCallout, directId],
      directId,
    );
    assert.ok(snapshot !== null);
    assert.equal(snapshot.rows.length, 2);
    assert.equal(snapshot.rows[0].childId, firstCallout);
    assert.equal(snapshot.rows[1].childId, secondCallout);
    assert.deepEqual(
      snapshot.rows.map((row) => row.quote),
      ['symmetric', 'eigenvalues'],
      'callouts follow anchor position order',
    );
    assert.equal(snapshot.rows[0].clamped, 'false');
    assert.equal(snapshot.rows[1].clamped, 'false');

    // Callout card 0 is below the parent card and aligned near its anchor.
    assert.ok(
      snapshot.rows[0].card.top >= snapshot.parent.bottom - 0.5,
      `callout top ${snapshot.rows[0].card.top} is below the parent ${snapshot.parent.bottom}`,
    );
    for (const row of snapshot.rows) {
      assert.equal(row.dotAria, 'true', 'the connector dot is decorative');
      assert.equal(row.leaderAria, 'true', 'the dotted leader is decorative');
      assert.equal(row.editable, true, 'the callout body stays editable');
      assert.equal(row.canBranch, true, 'the callout stays branchable');
      assert.ok(row.leaderWidth > 0, 'the dotted leader is visible');
      assert.ok(row.anchorLeft !== null);
      const delta = row.card.left - row.anchorLeft;
      assert.ok(
        delta >= 12 && delta <= 20,
        `callout left is near its anchor (${delta}px gap)`,
      );
      assert.ok(
        row.card.right <= snapshot.parent.right + 0.5,
        'the callout does not overflow the parent card',
      );
    }
    // Multiple callouts stack deterministically without overlap.
    assert.ok(
      snapshot.rows[1].card.top >= snapshot.rows[0].card.bottom + 8,
      'the second callout stacks below the first',
    );
    for (const row of snapshot.rows) {
      assert.ok(
        row.card.bottom <= snapshot.direct.top + 0.5,
        'the direct child sits after the callout lane',
      );
    }
    assert.ok(
      snapshot.direct.top >= snapshot.rows[1].card.bottom + 8,
      'the direct child is below the last callout',
    );
    assert.ok(
      snapshot.direct.top >= snapshot.lane.bottom - 0.5,
      'the direct group starts after the lane',
    );
    assert.ok(
      !(
        snapshot.parent.left < snapshot.rows[0].card.right &&
        snapshot.rows[0].card.left < snapshot.parent.right &&
        snapshot.parent.top < snapshot.rows[0].card.bottom &&
        snapshot.rows[0].card.top < snapshot.parent.bottom
      ),
      'the callout never overlaps the parent card',
    );

    // Edges: one parent → callout and one parent → direct child, all forward.
    const byChild = new Map(snapshot.edges.map((edge) => [edge.childId, edge]));
    for (const [childId, kind] of [
      [firstCallout, 'callout'],
      [secondCallout, 'callout'],
      [directId, 'direct'],
    ]) {
      const edge = byChild.get(childId);
      assert.ok(edge !== undefined, `edge for ${childId}`);
      assert.equal(edge.kind, kind);
      assert.equal(edge.placement, 'below');
      assert.equal(edge.arrow, 'down', 'the arrow enters the below-placement card');
      const points = parsePoints(edge.points);
      assert.ok(points.length >= 2);
      const start = points[0];
      const end = points.at(-1);
      assert.ok(end.y > start.y, `edge ${childId} runs forward (downward)`);
      assert.ok(
        start.y >= snapshot.parent.bottom - 0.5,
        `edge ${childId} starts at the parent side, not across the card`,
      );
      assert.ok(
        points.every((point) => point.x >= snapshot.parent.left - 0.5),
        `edge ${childId} never loops left across the parent`,
      );
      assert.ok(movesForward(points), `edge ${childId} never U-turns`);
    }

    await parentCard.scrollIntoViewIfNeeded();
    await h.waitLayout({ blocks: 10, arrows: 6 });
    await mkdir(artifactsPath('m3b2a'), { recursive: true });
    await h.screenshot(artifactsPath('m3b2a', 'callout-lane-1440x900.png'), {
      width: 1440,
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
    const parentId = 'm3b2a-clamp-parent';
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

    const snapshot = await calloutSnapshot(parentId, [calloutId], calloutId);
    assert.ok(snapshot !== null);
    assert.equal(snapshot.rows.length, 1);
    const row = snapshot.rows[0];
    assert.equal(row.clamped, 'true', 'the far-right anchor uses the clamped lane offset');
    assert.ok(row.anchorLeft !== null);
    assert.ok(
      row.anchorLeft > snapshot.parent.left + 120,
      'the anchor really is far to the right of the card',
    );
    assert.ok(
      row.card.left >= snapshot.parent.left + 9.5 &&
        row.card.left <= snapshot.parent.left + 12,
      'the clamped callout falls back to the card content left',
    );
    assert.ok(
      row.card.right <= snapshot.parent.right + 0.5,
      'the clamped callout never overflows the card',
    );
    assert.ok(
      row.offset <= 12,
      'the clamped offset is the content left, not the anchor offset',
    );
    assert.ok(row.leaderWidth > 0, 'the connector dot still has a leader');
    assert.equal(row.dotAria, 'true');
    assert.equal(row.leaderAria, 'true');

    await page.locator(`[data-callout-row="true"][data-anchor-id="${row.anchorId}"]`).scrollIntoViewIfNeeded();
    await h.waitLayout({ blocks: 9, arrows: 4 });
    await mkdir(artifactsPath('m3b2a'), { recursive: true });
    await h.screenshot(artifactsPath('m3b2a', 'callout-clamp-1440x900.png'), {
      width: 1440,
      height: 900,
    });
  });
});
