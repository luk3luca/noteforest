import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createHarness } from './harness.mjs';

/**
 * Shared UI-session mechanics.
 *
 * Every UI file needs the same Electron launch, isolated library, structural
 * command bridge and DOM probe. Those are mechanics, not scenarios: this module
 * owns them so each test file states only what its flow does. The factory keeps
 * state per file (no module-level app/page), and a helper fails loudly when it
 * is used before `launch()` or when the renderer rejects a command.
 */
export function createUiSession({ tempRoot }) {
  const harness = createHarness({ tempRoot });
  let page;

  function current() {
    if (page === undefined) throw new Error('UI session: launch() before using the page');
    return page;
  }

  /** Isolated library and app-support paths for one test. */
  function isolated(name) {
    return {
      NOTEFOREST_LIBRARY: resolve(tempRoot, `${name}-library`),
      NOTEFOREST_APP_SUPPORT: resolve(tempRoot, `${name}-support`),
    };
  }

  async function launch(overrides = {}) {
    await harness.launch(overrides);
    page = harness.page;
    return page;
  }

  async function applyCommand(command) {
    const result = await current().evaluate(
      (value) => window.__noteforestTest.applyStructural(value),
      command,
    );
    assert.equal(result.ok, true, result.message ?? 'structural command was rejected');
    return result;
  }

  /** Switch the expanded sidebar to the Outline tab (L1). */
  async function showOutline() {
    await current().locator('[data-sidebar-tab="outline"]').click();
    await current().waitForSelector('[data-sidebar-panel="outline"]');
  }

  /** Switch the expanded sidebar to the Library tab (L1). */
  async function showLibrary() {
    await current().locator('[data-sidebar-tab="library"]').click();
    await current().waitForSelector('[data-sidebar-panel="library"]');
  }

  async function structure() {
    return current().evaluate(() => window.__noteforestTest.structure());
  }

  /** Seed the demo document and wait for its 7 blocks / 3 arrows to settle. */
  async function seedDemo() {
    await current().evaluate(() => window.__noteforestTest.seed('demo'));
    await current().waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await harness.waitSaved();
    await harness.waitLayout({ blocks: 7, arrows: 3 });
  }

  /**
   * Right-click the card. This moves the ProseMirror selection, which the
   * gutter variant below deliberately avoids.
   */
  async function openBlockMenu(blockId) {
    await current()
      .locator(`.nf-editor[data-active="true"] [data-block-card="${blockId}"]`)
      .click({ button: 'right' });
    await current().locator('.nf-menu').waitFor();
  }

  /**
   * Native keyboard activation of the gutter button (detail 0) opens the same
   * menu path without moving the ProseMirror selection.
   */
  async function openBlockMenuFromGutter(blockId) {
    await current().locator(`[data-block-actions="${blockId}"]`).evaluate((button) => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    });
    await current().getByRole('menu').waitFor({ state: 'visible' });
  }

  async function chooseMenuItem(name) {
    await current().getByRole('menuitem', { name }).click();
    await current().locator('.nf-menu').waitFor({ state: 'detached' });
  }

  /** First text occurrence of `word` in a block, as a ProseMirror node path. */
  async function textMatch(blockId, word) {
    const match = await current().evaluate(
      ({ blockId: id, word: expected }) => {
        const currentStructure = window.__noteforestTest.structure();
        const content = currentStructure.blocks[id]?.content;
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

  /**
   * Create a new primary child anchored to the first `word` occurrence in
   * `blockId`, and resolve the created child, anchor and branch IDs.
   */
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
    const created = await structure();
    const branch = Object.values(created.branches).find(
      (candidate) =>
        candidate.source.blockId === blockId &&
        candidate.source.anchorId !== undefined &&
        candidate.targetBlockId === result.blockId,
    );
    assert.ok(branch !== undefined, `anchor child ${result.blockId} has a primary branch`);
    assert.equal(typeof branch.source.anchorId, 'string');
    return { blockId: result.blockId, anchorId: branch.source.anchorId, branchId: branch.id };
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
    await current().waitForSelector(`[data-block-card="${blockId}"]`);
    return blockId;
  }

  /** Callout rows under a parent, each with a measured --nf-callout-offset. */
  async function waitForCallouts(parentId, count, options = {}) {
    await current().waitForFunction(
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
      { timeout: 10000, ...options },
    );
  }

  /** The callout lane and its host --nf-lane-width variable both reach `minimum`. */
  async function waitForLaneWidth(parentId, minimum = 240) {
    await current().waitForFunction(
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

  /** The formula node in `blockId` carries the atomic anchor binding. */
  async function waitForFormulaBinding(blockId, anchorId) {
    await current().waitForFunction(
      ({ blockId: id, anchorId: expected }) => {
        const card = document.querySelector(
          `.nf-editor[data-active="true"] [data-block-card="${id}"]`,
        );
        const formulas = card?.querySelectorAll('[data-anchor-kind="formula"][data-anchor-ids]');
        if (formulas === null || formulas === undefined) return false;
        return [...formulas].some((formula) =>
          (formula.getAttribute('data-anchor-ids') ?? '').split(',').includes(expected),
        );
      },
      { blockId, anchorId },
      { timeout: 10000 },
    );
  }

  /** Double-click a block formula to open the existing LaTeX term dialog. */
  async function openTermDialog(blockId, formulaIndex) {
    const formula = current()
      .locator(
        `[data-block-card="${blockId}"] [data-type="block-math"].tiptap-mathematics-render`,
      )
      .nth(formulaIndex);
    await formula.waitFor();
    await formula.dblclick();
    const textarea = current().locator('.nf-textarea');
    await textarea.waitFor({ state: 'visible' });
    return textarea;
  }

  /** Select `length` UTF-16 units at `start` with real keyboard events. */
  async function selectRange(textarea, start, length) {
    await textarea.press('Home');
    for (let index = 0; index < start; index += 1) await textarea.press('ArrowRight');
    for (let index = 0; index < length; index += 1) await textarea.press('Shift+ArrowRight');
  }

  /** Health chip counts; a zero total means the chip must be absent. */
  async function waitForHealthChip(broken, ambiguous, { timeout = 10000 } = {}) {
    await current().waitForFunction(
      ({ expectedBroken, expectedAmbiguous }) => {
        const chip = document.querySelector('[data-anchor-health-chip]');
        if (expectedBroken + expectedAmbiguous === 0) return chip === null;
        return (
          chip !== null &&
          chip.getAttribute('data-health-broken') === String(expectedBroken) &&
          chip.getAttribute('data-health-ambiguous') === String(expectedAmbiguous)
        );
      },
      { expectedBroken: broken, expectedAmbiguous: ambiguous },
      { timeout },
    );
  }

  async function openAnchorHealthFromChip() {
    await current().locator('[data-anchor-health-chip]').click();
    await current().waitForSelector('[data-anchor-health="true"]');
  }

  async function openAnchorHealthFromWarning(anchorId) {
    await current().locator(`[data-anchor-warning="${anchorId}"]`).click();
    await current().waitForSelector(`[data-health-detail="${anchorId}"]`);
  }

  return {
    harness,
    isolated,
    launch,
    applyCommand,
    structure,
    seedDemo,
    showOutline,
    showLibrary,
    openBlockMenu,
    openBlockMenuFromGutter,
    chooseMenuItem,
    textMatch,
    createAnchoredChild,
    createDirectChild,
    waitForCallouts,
    waitForLaneWidth,
    waitForFormulaBinding,
    openTermDialog,
    selectRange,
    waitForHealthChip,
    openAnchorHealthFromChip,
    openAnchorHealthFromWarning,
    get page() {
      return page;
    },
  };
}

/** Minimum final stem (horizontal arrow arm) in px. */
export const GEOMETRY_STEM_MIN = 12;

/** Parse an SVG path `d` into absolute point pairs. */
export function parsePoints(path) {
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

export function lastSegment(points) {
  const end = points.at(-1);
  const before = points.at(-2);
  if (end === undefined || before === undefined) return { length: 0, horizontal: false };
  return {
    length: Math.hypot(end.x - before.x, end.y - before.y),
    horizontal: Math.abs(end.y - before.y) < 0.5,
  };
}

/** Distance from each Q control point to its adjacent line endpoints. */
export function cornerOffsets(path) {
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

export function expectNoArc(path, label) {
  assert.equal(/[Aa]/.test(path ?? ''), false, `${label} has no arc command`);
}

export function assertNearRightAngles(edges, label) {
  for (const edge of edges) {
    expectNoArc(edge.path, `${label} ${edge.childId}`);
    for (const offset of cornerOffsets(edge.path)) {
      assert.ok(offset <= 4, `${label} ${edge.childId} corner rounding ${offset} <= 4`);
    }
  }
}

export function expectStem(points, minimum) {
  const segment = lastSegment(points);
  assert.equal(segment.horizontal, true, 'final stem is horizontal');
  assert.ok(segment.length >= minimum - 0.5, `final stem is at least ${minimum} px`);
}

/** Pairwise card separation; touching edges are allowed within 0.5 px. */
export function assertNoOverlap(rects, label) {
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
