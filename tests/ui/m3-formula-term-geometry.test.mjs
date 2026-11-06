import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { addTopLevelBlock } from '../support/fixtures.mjs';

const tempRoot = artifactsPath('m3c2b-ui');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
const {
  isolated,
  structure,
  seedDemo,
  openTermDialog,
  selectRange,
  waitForFormulaBinding,
} = ui;
let page;

async function launch(overrides = {}) {
  page = await ui.launch(overrides);
}

async function branchFromTerm(blockId, formulaIndex, start, length) {
  const textarea = await openTermDialog(blockId, formulaIndex);
  await selectRange(textarea, start, length);
  const button = page.locator('[data-testid="branch-from-term"]');
  await button.waitFor({ state: 'visible' });
  await button.click();
  await page.waitForSelector('.nf-textarea', { state: 'detached' });
}

async function waitForTermOverlay(blockId, anchorId) {
  await page.waitForSelector(
    `[data-block-card="${blockId}"] [data-anchor-term-ids="${anchorId}"]`,
    { timeout: 10000 },
  );
}

function termAlignment(blockId, anchorId) {
  return page.evaluate(
    ({ blockId: id, anchorId: expected }) => {
      const card = document.querySelector(`[data-block-card="${id}"]`);
      const overlay = card?.querySelector(`[data-anchor-term-ids="${expected}"]`);
      if (card === null || card === undefined || overlay === null || overlay === undefined) {
        return null;
      }
      const formulas = [...card.querySelectorAll('[data-anchor-kind="formula"][data-anchor-ids]')];
      const formula = formulas.find((candidate) =>
        (candidate.getAttribute('data-anchor-ids') ?? '').split(',').includes(expected),
      );
      if (formula === undefined) return null;
      const text = overlay.dataset['anchorTermText'] ?? '';
      const scope = formula.querySelector('.katex-html') ?? formula;
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      let current = walker.nextNode();
      let term = null;
      while (current !== null && term === null) {
        const value = current.nodeValue ?? '';
        const index = value.indexOf(text);
        if (index >= 0 && text.length > 0) {
          const range = document.createRange();
          range.setStart(current, index);
          range.setEnd(current, index + text.length);
          const rects = [...range.getClientRects()].filter(
            (rect) => rect.width > 0 && rect.height > 0,
          );
          if (rects.length > 0) {
            term = {
              left: Math.min(...rects.map((rect) => rect.left)),
              top: Math.min(...rects.map((rect) => rect.top)),
              right: Math.max(...rects.map((rect) => rect.right)),
              bottom: Math.max(...rects.map((rect) => rect.bottom)),
              width: Math.max(...rects.map((rect) => rect.right)) -
                Math.min(...rects.map((rect) => rect.left)),
              height: Math.max(...rects.map((rect) => rect.bottom)) -
                Math.min(...rects.map((rect) => rect.top)),
            };
          }
        }
        current = walker.nextNode();
      }
      if (term === null) return null;
      const overlayRect = overlay.getBoundingClientRect();
      const formulaRect = formula.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const row = document.querySelector(
        `[data-callout-row="true"][data-anchor-id="${expected}"]`,
      );
      const rowRect = row?.getBoundingClientRect() ?? null;
      return {
        overlay: {
          left: overlayRect.left,
          top: overlayRect.top,
          right: overlayRect.right,
          bottom: overlayRect.bottom,
          width: overlayRect.width,
          height: overlayRect.height,
        },
        term,
        formula: {
          left: formulaRect.left,
          right: formulaRect.right,
          top: formulaRect.top,
          bottom: formulaRect.bottom,
          width: formulaRect.width,
        },
        card: { left: cardRect.left, top: cardRect.top, right: cardRect.right, bottom: cardRect.bottom },
        rowLeft: rowRect === null ? null : rowRect.left,
        rowTop: rowRect === null ? null : rowRect.top,
      };
    },
    { blockId, anchorId },
  );
}

async function waitForTermAlignment(blockId, anchorId) {
  await page.waitForFunction(
    ({ blockId: id, anchorId: expected }) => {
      const card = document.querySelector(`[data-block-card="${id}"]`);
      const overlay = card?.querySelector(`[data-anchor-term-ids="${expected}"]`);
      if (card === null || card === undefined || overlay === null || overlay === undefined) {
        return false;
      }
      const formulas = [...card.querySelectorAll('[data-anchor-kind="formula"][data-anchor-ids]')];
      const formula = formulas.find((candidate) =>
        (candidate.getAttribute('data-anchor-ids') ?? '').split(',').includes(expected),
      );
      if (formula === undefined) return false;
      const text = overlay.dataset['anchorTermText'] ?? '';
      const scope = formula.querySelector('.katex-html') ?? formula;
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      let current = walker.nextNode();
      let termRect = null;
      while (current !== null && termRect === null) {
        const value = current.nodeValue ?? '';
        const index = value.indexOf(text);
        if (index >= 0 && text.length > 0) {
          const range = document.createRange();
          range.setStart(current, index);
          range.setEnd(current, index + text.length);
          const rects = [...range.getClientRects()].filter(
            (rect) => rect.width > 0 && rect.height > 0,
          );
          if (rects.length > 0) {
            termRect = {
              left: Math.min(...rects.map((rect) => rect.left)),
              top: Math.min(...rects.map((rect) => rect.top)),
              width:
                Math.max(...rects.map((rect) => rect.right)) -
                Math.min(...rects.map((rect) => rect.left)),
              height:
                Math.max(...rects.map((rect) => rect.bottom)) -
                Math.min(...rects.map((rect) => rect.top)),
            };
          }
        }
        current = walker.nextNode();
      }
      if (termRect === null) return false;
      const overlayRect = overlay.getBoundingClientRect();
      return (
        Math.abs(overlayRect.left - termRect.left) <= 2 &&
        Math.abs(overlayRect.top - termRect.top) <= 2 &&
        Math.abs(overlayRect.width - termRect.width) <= 2.5 &&
        Math.abs(overlayRect.height - termRect.height) <= 2.5
      );
    },
    { blockId, anchorId },
    { timeout: 10000 },
  );
}

function markerPosition(blockId, anchorId) {
  return page.evaluate(
    ({ blockId: id, anchorId: expected }) => {
      const card = document.querySelector(`[data-block-card="${id}"]`);
      if (card === null || card === undefined) return null;
      const button = card.querySelector(`[data-anchor-marker-id="${expected}"]`);
      if (button === null || button === undefined) return null;
      const rect = button.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, centerX: rect.left + rect.width / 2 };
    },
    { blockId, anchorId },
  );
}

async function waitForMarker(blockId, anchorId) {
  await page.waitForSelector(
    `[data-block-card="${blockId}"] [data-anchor-marker-id="${anchorId}"]`,
    { timeout: 10000 },
  );
}

describe('NoteForest M3c2b formula term geometry', () => {
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

  it('puts the term marker and leader on the KaTeX term and falls back for a repeated term', async () => {
    const env = isolated('formula-term-geometry');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await seedDemo();

    const parentId = 'm3c2b-geometry-parent';
    const simpleLatex = 'x + y = z';
    const repeatedLatex = 'x + x = 2x';
    await addTopLevelBlock(ui, parentId, {
      type: 'doc',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: 'Formula geometry source line wide enough that the callout lane does not clamp the term leader to the card edge.',
            },
          ],
        },
        { type: 'mathBlock', attrs: { latex: simpleLatex } },
        { type: 'mathBlock', attrs: { latex: repeatedLatex } },
      ],
    });
    await h.waitLayout({ blocks: 8, arrows: 3 });

    // Unique simple term `x` in `x + y = z`.
    await branchFromTerm(parentId, 0, 0, 1);
    await h.waitCanonicalBlockCount(9);
    await h.waitBlockCount(9);
    await h.waitLayout({ blocks: 9, arrows: 4 });

    const xStructure = await structure();
    const xAnchorId = Object.keys(xStructure.anchors).find(
      (id) => xStructure.anchors[id].quote === 'x',
    );
    assert.equal(typeof xAnchorId, 'string');
    assert.equal(xStructure.anchors[xAnchorId].selector.latexStart, 0);
    await waitForFormulaBinding(parentId, xAnchorId);
    await waitForTermOverlay(parentId, xAnchorId);
    await waitForTermAlignment(parentId, xAnchorId);

    const xGeometry = await termAlignment(parentId, xAnchorId);
    assert.notEqual(xGeometry, null);
    assert.ok(
      xGeometry.overlay.left >= xGeometry.term.left - 2 &&
        xGeometry.overlay.left <= xGeometry.term.left + 2,
      `highlight starts at the term: ${JSON.stringify(xGeometry)}`,
    );
    assert.ok(
      Math.abs(xGeometry.overlay.width - xGeometry.term.width) <= 2.5,
      'highlight width equals the rendered x glyph',
    );
    assert.ok(
      xGeometry.formula.width > xGeometry.term.width + 30,
      'the term geometry is not the whole formula rectangle',
    );
    assert.equal(
      await page.locator(`[data-anchor-term-text="x"][data-anchor-term-ids="${xAnchorId}"]`).count(),
      1,
    );

    // A second unique term `z` on the same formula must get its own rect and
    // its own callout offset: the leader starts at the term, not the formula.
    await branchFromTerm(parentId, 0, 8, 1);
    await h.waitCanonicalBlockCount(10);
    await h.waitBlockCount(10);
    await h.waitLayout({ blocks: 10, arrows: 5 });
    const zStructure = await structure();
    const zAnchorId = Object.keys(zStructure.anchors).find(
      (id) => id !== xAnchorId && zStructure.anchors[id].quote === 'z',
    );
    assert.equal(typeof zAnchorId, 'string');
    await waitForFormulaBinding(parentId, zAnchorId);
    await waitForTermOverlay(parentId, zAnchorId);
    await waitForTermAlignment(parentId, zAnchorId);

    const zGeometry = await termAlignment(parentId, zAnchorId);
    assert.notEqual(zGeometry, null);
    const xAfterZ = await termAlignment(parentId, xAnchorId);
    assert.notEqual(xAfterZ, null);
    assert.ok(
      zGeometry.overlay.left > xAfterZ.overlay.left + 30,
      'the z highlight is to the right of the x highlight',
    );
    assert.ok(zGeometry.rowLeft !== null && xAfterZ.rowLeft !== null);
    const rowShift = zGeometry.rowLeft - xAfterZ.rowLeft;
    const termShift = zGeometry.overlay.left - xAfterZ.overlay.left;
    // Block math is centered and both terms sit beyond the 160 px anchor cap,
    // so the two callouts now share the capped lane offset. The term rectangle
    // still owns the highlight; only the row position is bounded (M3g3).
    assert.ok(termShift > 30, 'the two term rectangles are still distinct');
    assert.ok(
      Math.abs(rowShift) <= 2,
      `far-right term callouts share the 160 px cap (rows ${rowShift}, terms ${termShift})`,
    );
    assert.ok(
      zGeometry.rowLeft - zGeometry.card.left <= 160 + 2,
      'the far-right term callout never starts farther than 160 px from the card left',
    );
    assert.ok(
      xAfterZ.rowLeft - xAfterZ.card.left <= 160 + 2,
      'the first far-right term callout is capped as well',
    );

    // Repeated term: no unique rendered match, so no term overlay. The formula
    // rectangle remains the marker/leader fallback and the quote chip warns.
    await branchFromTerm(parentId, 1, 0, 1);
    await h.waitCanonicalBlockCount(11);
    await h.waitBlockCount(11);
    await h.waitLayout({ blocks: 11, arrows: 6 });
    const repeatedStructure = await structure();
    const repeatedAnchorId = Object.keys(repeatedStructure.anchors).find(
      (id) => id !== xAnchorId &&
        repeatedStructure.anchors[id].selector.latexStart === 0 &&
        repeatedStructure.anchors[id].quote === 'x',
    );
    assert.equal(typeof repeatedAnchorId, 'string');
    assert.notEqual(repeatedAnchorId, xAnchorId);
    await waitForFormulaBinding(parentId, repeatedAnchorId);
    await page.waitForSelector(
      `[data-callout-row="true"][data-anchor-id="${repeatedAnchorId}"]`,
    );
    assert.equal(
      await page.locator(
        `[data-block-card="${parentId}"] [data-anchor-term-ids="${repeatedAnchorId}"]`,
      ).count(),
      0,
      'a repeated term falls back to the formula rectangle',
    );
    const repeatedChip = page.locator(
      `[data-callout-row="true"][data-anchor-id="${repeatedAnchorId}"] .nf-callout-quote`,
    );
    assert.equal(await repeatedChip.getAttribute('data-anchor-state'), 'ambiguous');
    assert.equal(await repeatedChip.getAttribute('data-anchor-quote'), 'x');
    const repeatedWarning = page.locator(`[data-anchor-warning="${repeatedAnchorId}"]`);
    await repeatedWarning.waitFor();
    assert.equal(await repeatedWarning.getAttribute('data-anchor-state'), 'ambiguous');

    // Selecting the resolved x anchor puts the real marker button on the term.
    await page
      .locator(`[data-callout-row="true"][data-anchor-id="${xAnchorId}"] .nf-callout-quote`)
      .click();
    await waitForMarker(parentId, xAnchorId);
    const xMarker = await markerPosition(parentId, xAnchorId);
    assert.notEqual(xMarker, null);
    assert.ok(
      Math.abs(xMarker.centerX - (xGeometry.term.left + xGeometry.term.width)) <= 10,
      `marker sits at the x term edge (${JSON.stringify(xMarker)} vs ${JSON.stringify(xGeometry.term)})`,
    );
    assert.equal(
      await page
        .locator(`[data-anchor-term-ids="${xAnchorId}"][data-anchor-selected="true"]`)
        .count(),
      1,
      'the selected term is highlighted',
    );

    // Selecting the ambiguous anchor falls back to the formula rectangle.
    await page
      .locator(
        `[data-callout-row="true"][data-anchor-id="${repeatedAnchorId}"] .nf-callout-quote`,
      )
      .click();
    await waitForMarker(parentId, repeatedAnchorId);
    const repeatedMarker = await markerPosition(parentId, repeatedAnchorId);
    assert.notEqual(repeatedMarker, null);
    const repeatedFormula = await page.evaluate(
      ({ blockId, anchorId }) => {
        const card = document.querySelector(`[data-block-card="${blockId}"]`);
        const formulas = [...card.querySelectorAll('[data-anchor-kind="formula"][data-anchor-ids]')];
        const formula = formulas.find((candidate) =>
          (candidate.getAttribute('data-anchor-ids') ?? '').split(',').includes(anchorId),
        );
        const rect = formula.getBoundingClientRect();
        return { right: rect.right, left: rect.left, width: rect.width };
      },
      { blockId: parentId, anchorId: repeatedAnchorId },
    );
    assert.ok(
      Math.abs(repeatedMarker.centerX - (repeatedFormula.right + 6)) <= 10,
      'the ambiguous marker uses the formula rectangle',
    );

    // Zoom and resize recompute the overlay from live rects; the term
    // highlight stays on the glyph and never overlaps the callout lane.
    await page.keyboard.press('Meta+=');
    await page.keyboard.press('Meta+=');
    await page.waitForFunction(
      () => document.querySelector('.nf-canvas')?.getAttribute('data-zoom') === '120',
      undefined,
      { timeout: 5000 },
    );
    await waitForTermAlignment(parentId, xAnchorId);
    const zoomed = await termAlignment(parentId, xAnchorId);
    assert.notEqual(zoomed, null);
    assert.ok(
      zoomed.overlay.left >= zoomed.card.left - 1 &&
        zoomed.overlay.right <= zoomed.card.right + 1 &&
        zoomed.overlay.top >= zoomed.card.top - 1 &&
        zoomed.overlay.bottom <= zoomed.card.bottom + 1,
      'zoomed term overlay stays inside its card',
    );
    assert.ok(
      zoomed.rowTop !== null && zoomed.overlay.bottom <= zoomed.rowTop + 1,
      'zoomed term overlay does not overlap the callout lane',
    );
    await page
      .locator(`[data-block-card="${parentId}"]`)
      .scrollIntoViewIfNeeded();
    await h.setWindowSize(1180, 760);
    await waitForTermAlignment(parentId, xAnchorId);
    await waitForTermAlignment(parentId, zAnchorId);
    const resized = await termAlignment(parentId, xAnchorId);
    assert.notEqual(resized, null);
    assert.ok(
      resized.overlay.bottom <= resized.card.bottom + 1 &&
        resized.rowTop !== null &&
        resized.overlay.bottom <= resized.rowTop + 1 &&
        resized.overlay.right <= resized.card.right + 1,
      'resized overlay stays inside the card and above the callout lane',
    );

    // Screenshot evidence at the default window and zoom.
    await page.keyboard.press('Meta+0');
    await h.setWindowSize(1440, 900);
    await page.waitForFunction(
      () => document.querySelector('.nf-canvas')?.getAttribute('data-zoom') === '100',
      undefined,
      { timeout: 5000 },
    );
    await waitForTermAlignment(parentId, xAnchorId);
    await waitForTermAlignment(parentId, zAnchorId);
    await page
      .locator(`[data-callout-row="true"][data-anchor-id="${xAnchorId}"] .nf-callout-quote`)
      .click();
    await waitForMarker(parentId, xAnchorId);
    await mkdir(artifactsPath('m3c2b'), { recursive: true });
    await page.locator(`[data-block-card="${parentId}"]`).scrollIntoViewIfNeeded();
    await h.waitLayout({ blocks: 11, arrows: 6 });
    await h.screenshot(artifactsPath('m3c2b', 'formula-term-geometry-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // Reload rebuilds the same IDs and visual state from live KaTeX DOM; no
    // coordinates were stored.
    await page.keyboard.press('Meta+s');
    await h.waitSaved();
    await h.quit();
    await launch(env);
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await waitForFormulaBinding(parentId, xAnchorId);
    await waitForFormulaBinding(parentId, zAnchorId);
    await waitForFormulaBinding(parentId, repeatedAnchorId);
    await waitForTermOverlay(parentId, xAnchorId);
    await waitForTermOverlay(parentId, zAnchorId);
    await waitForTermAlignment(parentId, xAnchorId);
    await waitForTermAlignment(parentId, zAnchorId);
    assert.equal(
      await page.locator(
        `[data-block-card="${parentId}"] [data-anchor-term-ids="${repeatedAnchorId}"]`,
      ).count(),
      0,
    );
    const reloaded = await structure();
    assert.deepEqual(reloaded.anchors[xAnchorId], xStructure.anchors[xAnchorId]);
    assert.deepEqual(reloaded.anchors[zAnchorId], zStructure.anchors[zAnchorId]);
    assert.deepEqual(reloaded.anchors[repeatedAnchorId], repeatedStructure.anchors[repeatedAnchorId]);
    assert.equal(
      await page
        .locator(
          `[data-callout-row="true"][data-anchor-id="${repeatedAnchorId}"] .nf-callout-quote`,
        )
        .getAttribute('data-anchor-state'),
      'ambiguous',
    );

    await page.keyboard.press('Meta+s');
    await h.waitSaved();
  });
});
