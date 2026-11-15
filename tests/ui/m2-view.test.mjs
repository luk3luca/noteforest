import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';

const tempRoot = artifactsPath('m2f-phase5a-ui');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
const { isolated, seedDemo } = ui;
let page;

async function launch(overrides = {}) {
  page = await ui.launch(overrides);
}

async function waitZoomLabel(label) {
  await page.waitForFunction(
    (expected) => document.querySelector('[data-zoom-value]')?.textContent?.trim() === expected,
    label,
    { timeout: 10000 },
  );
}

/** The stored Focus branch anchor for the active document. */
async function focusedBlockId() {
  return page.evaluate(() => {
    const state = window.__noteforestTest.state();
    return state.activeTab === null
      ? null
      : window.__noteforestTest.viewState()[state.activeTab]?.focusBlockId ?? null;
  });
}

describe('NoteForest M2 view controls', () => {
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

  it('zooms, fits width, and focuses a branch without touching the document', async () => {
    await launch(isolated('view'));
    await h.setWindowSize(1440, 900);
    await seedDemo();

    const zoomLabel = page.locator('[data-zoom-value]');
    assert.equal((await zoomLabel.innerText()).trim(), '100%');
    await page.keyboard.press('Meta+-');
    await waitZoomLabel('90%');
    await page.keyboard.press('Meta+=');
    await waitZoomLabel('100%');
    await page.keyboard.press('Meta+=');
    await waitZoomLabel('110%');
    await page.keyboard.press('Meta+0');
    await waitZoomLabel('100%');

    // Focus the root: its ancestor chain (just itself) and all descendants stay;
    // the other top-level branches hide. The canonical document is unchanged.
    const before = await page.evaluate(() => {
      const current = window.__noteforestTest.state();
      const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
      const visible = (element) => element.getClientRects().length > 0;
      return {
        blockIds: runtime.blockIds,
        visible: [...document.querySelectorAll('.nf-editor[data-active="true"] [data-block-card]')].filter(
          visible,
        ).length,
      };
    });
    const rootCard = h.activeEditor().locator('[data-block-card][data-top-level="true"]').first();
    const rootId = await rootCard.getAttribute('data-block-card');
    await rootCard.locator('.nf-block-prose').first().click();
    await h.waitSelected(rootId);
    assert.equal(await focusedBlockId(), null);
    await page.keyboard.press('Shift+Meta+F');
    await page.waitForFunction(
      () => {
        const scope = document.querySelector('.nf-editor[data-active="true"]');
        const visible = (element) => element.getClientRects().length > 0;
        if (scope === null) return false;
        const cards = [...scope.querySelectorAll('[data-block-card]')].filter(visible).length;
        const topLevel = [...scope.querySelectorAll('[data-block-card][data-top-level="true"]')].filter(
          visible,
        ).length;
        return cards === 4 && topLevel === 1 && scope.querySelectorAll('.nf-edge-path').length === 3;
      },
      undefined,
      { timeout: 10000 },
    );
    await h.waitLayout({ blocks: 7 });
    assert.equal(await focusedBlockId(), rootId, '⇧⌘F focuses the selected root');
    const focused = await page.evaluate(() => {
      const current = window.__noteforestTest.state();
      const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
      const visible = (element) => element.getClientRects().length > 0;
      return {
        blockIds: runtime.blockIds,
        visible: [...document.querySelectorAll('.nf-editor[data-active="true"] [data-block-card]')].filter(
          visible,
        ).length,
        topLevelVisible: [
          ...document.querySelectorAll(
            '.nf-editor[data-active="true"] [data-block-card][data-top-level="true"]',
          ),
        ].filter(visible).length,
        arrows: document.querySelectorAll('.nf-editor[data-active="true"] .nf-edge-path').length,
      };
    });
    assert.equal(focused.visible, 4, 'root + two children + one grandchild stay visible');
    assert.equal(focused.topLevelVisible, 1, 'other top-level branches hide');
    assert.equal(focused.arrows, 3, 'focus keeps the branch arrows');
    assert.deepEqual(focused.blockIds, before.blockIds, 'Focus branch does not delete blocks');

    // Fit width works on the focused branch, not just the whole document.
    await page.keyboard.press('Shift+Meta+0');
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector('.nf-editor[data-active="true"] .nf-canvas')?.getAttribute('data-zoom') ??
            100,
        ) < 100,
      undefined,
      { timeout: 10000 },
    );
    await h.waitLayout({ blocks: 7 });
    const branchFit = await h.layoutSnapshot();
    assert.ok(branchFit.zoom < 100, `Fit width fits the focused branch (${branchFit.zoom}%)`);
    assert.ok(branchFit.overflow <= 1, `focused branch fits without horizontal scroll (${branchFit.overflow})`);
    assert.equal(
      await h.activeEditor().locator('.nf-edge-defect').count(),
      0,
      'zoom does not flag edge defects',
    );

    await page.keyboard.press('Shift+Meta+F');
    await page.waitForFunction(
      (expected) => {
        const scope = document.querySelector('.nf-editor[data-active="true"]');
        const visible = (element) => element.getClientRects().length > 0;
        if (scope === null) return false;
        const cards = [...scope.querySelectorAll('[data-block-card]')].filter(visible).length;
        const state = window.__noteforestTest.state();
        const focused =
          state.activeTab === null
            ? null
            : window.__noteforestTest.viewState()[state.activeTab]?.focusBlockId ?? null;
        return focused === null && cards === expected;
      },
      before.visible,
      { timeout: 10000 },
    );
    await h.waitLayout({ blocks: 7 });
    assert.equal(await focusedBlockId(), null, '⇧⌘F exits Focus branch');
    assert.equal(
      await h.activeEditor().locator('[data-block-card]:visible').count(),
      before.visible,
      'exiting focus restores the whole document',
    );

    // A deep block keeps its ancestor chain (root → parent → selected) and its
    // own descendants; sibling branches at any ancestor are hidden.
    const characteristic = h
      .activeEditor()
      .locator('[data-block-card]', { hasText: 'Characteristic polynomial' })
      .first();
    const characteristicId = await characteristic.getAttribute('data-block-card');
    await characteristic.click();
    await h.waitSelected(characteristicId);
    await page.keyboard.press('Shift+Meta+F');
    await page.waitForFunction(
      () => {
        const scope = document.querySelector('.nf-editor[data-active="true"]');
        const visible = (element) => element.getClientRects().length > 0;
        if (scope === null) return false;
        return (
          [...scope.querySelectorAll('[data-block-card]')].filter(visible).length === 3 &&
          scope.querySelectorAll('.nf-edge-path').length === 2
        );
      },
      undefined,
      { timeout: 10000 },
    );
    await h.waitLayout({ blocks: 7 });
    assert.equal(await focusedBlockId(), characteristicId, 'the deep block is the focus anchor');
    const ancestors = await page.evaluate(() => {
      const scope = document.querySelector('.nf-editor[data-active="true"]');
      const visible = (element) => element.getClientRects().length > 0;
      return {
        visible: [...scope.querySelectorAll('[data-block-card]')].filter(visible).length,
        topLevelVisible: [...scope.querySelectorAll('[data-block-card][data-top-level="true"]')].filter(
          visible,
        ).length,
        arrows: scope.querySelectorAll('.nf-edge-path').length,
        texts: [...scope.querySelectorAll('[data-block-card]')]
          .filter(visible)
          .map((card) => card.querySelector('.nf-block-prose')?.textContent?.slice(0, 24) ?? ''),
      };
    });
    assert.equal(ancestors.visible, 3, 'selected block + ancestor chain stay visible');
    assert.equal(ancestors.topLevelVisible, 1, 'only the ancestor top-level branch stays');
    assert.equal(ancestors.arrows, 2, 'the ancestor path keeps its two arrows');
    assert.ok(ancestors.texts.some((text) => text.includes('Characteristic')));
    assert.ok(!ancestors.texts.some((text) => text.includes('Spectrum')), 'sibling branch hides');
    await page.keyboard.press('Shift+Meta+F');
    await page.waitForFunction(
      () => {
        const state = window.__noteforestTest.state();
        const focused =
          state.activeTab === null
            ? null
            : window.__noteforestTest.viewState()[state.activeTab]?.focusBlockId ?? null;
        return focused === null;
      },
      undefined,
      { timeout: 10000 },
    );
    await h.waitLayout({ blocks: 7 });

    // Fit width at a narrow window with the full document: reset the focused
    // branch zoom first. The wide finite canvas keeps the demo chain going
    // right, so extend the deepest chain to give Fit real horizontal overflow
    // to resolve.
    await page.keyboard.press('Meta+0');
    await waitZoomLabel('100%');
    const deepest = h
      .activeEditor()
      .locator('[data-block-card]', { hasText: 'Take the symmetric matrix below' })
      .first();
    const deepestId = await deepest.getAttribute('data-block-card');
    assert.equal(typeof deepestId, 'string');
    await deepest.locator('.nf-block-prose').click();
    await h.waitSelected(deepestId);
    for (let index = 0; index < 5; index += 1) {
      await page.keyboard.press('Control+Enter');
      await h.waitBlockCount(8 + index);
    }
    await h.waitLayout({ blocks: 12 });
    await h.setWindowSize(960, 768);
    await h.waitLayout({ blocks: 12 });
    const beforeFit = await h.layoutSnapshot();
    assert.ok(
      beforeFit.overflow > 0,
      `the full demo overflows at the narrow window before Fit (${beforeFit.overflow})`,
    );
    await page.keyboard.press('Shift+Meta+0');
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector('.nf-editor[data-active="true"] .nf-canvas')?.getAttribute('data-zoom') ??
            100,
        ) < 100,
      undefined,
      { timeout: 10000 },
    );
    await h.waitLayout({ blocks: 12 });
    const afterFit = await h.layoutSnapshot();
    assert.ok(afterFit.zoom < 100, `Fit width zooms out (${afterFit.zoom}%)`);
    assert.ok(afterFit.overflow <= 1, `Fit width removes horizontal overflow (${afterFit.overflow})`);
    assert.equal(
      await h.activeEditor().locator('.nf-edge-defect').count(),
      0,
      'fit zoom keeps valid arrows',
    );
    await page.keyboard.press('Meta+0');
    await waitZoomLabel('100%');
    await h.quit();
  });

  it('keeps the editor geometry on the design-token variables', async () => {
    await launch(isolated('tokens'));
    await h.setWindowSize(1440, 900);
    await seedDemo();

    const geometry = await page.evaluate(() => {
      const scope = document.querySelector('.nf-editor[data-active="true"]');
      if (scope === null) return null;
      const rootStyle = getComputedStyle(document.documentElement);
      const readVar = (name) => rootStyle.getPropertyValue(name).trim();
      const styleOf = (selector) => getComputedStyle(scope.querySelector(selector));
      const canvas = styleOf('.nf-canvas');
      const chapter = styleOf('.nf-chapter');
      const group = styleOf('.nf-branch-children');
      const child = styleOf('[data-block-card]:not([data-top-level="true"])');
      const topLevel = styleOf('[data-block-card][data-top-level="true"]');
      const edge = styleOf('.nf-edge-path');
      const edgeLayer = styleOf('.nf-edge-layer');
      return {
        vars: {
          canvasMax: readVar('--nf-canvas-max'),
          canvasPadX: readVar('--nf-canvas-pad-x'),
          canvasPadTop: readVar('--nf-canvas-pad-top'),
          canvasPadBottom: readVar('--nf-canvas-pad-bottom'),
          chapterGap: readVar('--nf-chapter-gap'),
          childGap: readVar('--nf-child-gap'),
          childRowGap: readVar('--nf-child-row-gap'),
          cardPadding: readVar('--nf-card-padding'),
          cardRadius: readVar('--nf-card-radius'),
          noteRadius: readVar('--nf-note-radius'),
          childMinWidth: readVar('--nf-child-min-width'),
          childMaxWidth: readVar('--nf-child-max-width'),
          topLevelMinWidth: readVar('--nf-top-level-min-width'),
          topLevelMaxWidth: readVar('--nf-top-level-max-width'),
          edgeWidth: readVar('--nf-edge-width'),
          edgeWidthActive: readVar('--nf-edge-width-active'),
          edgeWidthMuted: readVar('--nf-edge-width-muted'),
          zEdge: readVar('--nf-z-edge'),
        },
        canvas: {
          maxWidth: canvas.maxWidth,
          paddingTop: canvas.paddingTop,
          paddingRight: canvas.paddingRight,
          paddingBottom: canvas.paddingBottom,
          paddingLeft: canvas.paddingLeft,
        },
        chapterGap: chapter.marginBottom,
        groupGap: group.marginLeft,
        child: {
          minWidth: child.minWidth,
          maxWidth: child.maxWidth,
          paddingTop: child.paddingTop,
          radius: child.borderTopLeftRadius,
        },
        topLevel: { minWidth: topLevel.minWidth, maxWidth: topLevel.maxWidth },
        edge: {
          width: Number.parseFloat(edge.strokeWidth),
          layerZ: Number.parseInt(edgeLayer.zIndex, 10),
        },
      };
    });
    assert.ok(geometry !== null);
    assert.deepEqual(geometry.vars, {
      canvasMax: '3200px',
      canvasPadX: '24px',
      canvasPadTop: '6px',
      canvasPadBottom: '8px',
      chapterGap: '28px',
      childGap: '24px',
      childRowGap: '16px',
      cardPadding: '10px',
      cardRadius: '4px',
      noteRadius: '9px',
      childMinWidth: '144px',
      childMaxWidth: '420px',
      topLevelMinWidth: '160px',
      topLevelMaxWidth: '480px',
      edgeWidth: '1.25',
      edgeWidthActive: '1.75',
      edgeWidthMuted: '1',
      zEdge: '0',
    });
    assert.deepEqual(geometry.canvas, {
      maxWidth: '3200px',
      paddingTop: '6px',
      // S2.2: the inset covers the 16 px gutter and the drag handle.
      paddingRight: '24px',
      paddingBottom: '8px',
      paddingLeft: '24px',
    });
    assert.equal(geometry.chapterGap, '28px', 'chapter gap comes from --nf-chapter-gap');
    assert.equal(geometry.groupGap, '24px', 'right group gap comes from --nf-child-gap');
    assert.deepEqual(geometry.child, {
      minWidth: '144px',
      maxWidth: '420px',
      paddingTop: '10px',
      /* The V0 visual rounds Continuous note cards; Page cards keep 4 px. */
      radius: '9px',
    });
    assert.deepEqual(geometry.topLevel, { minWidth: '160px', maxWidth: '480px' });
    assert.equal(geometry.edge.width, 1.25);
    assert.equal(geometry.edge.layerZ, 0);

    const spectrum = h
      .activeEditor()
      .locator('[data-block-card]', { hasText: 'Spectrum' })
      .first();
    const spectrumId = await spectrum.getAttribute('data-block-card');
    await spectrum.locator('.nf-block-prose').click();
    await h.waitSelected(spectrumId);
    // Stroke width transitions for 120 ms; measure the settled values.
    await page.waitForFunction(
      () => {
        const scope = document.querySelector('.nf-editor[data-active="true"]');
        const active = scope?.querySelector('.nf-edge-path.nf-edge-active');
        const muted = scope?.querySelector('.nf-edge-path.nf-edge-muted');
        if (active === null || active === undefined || muted === null || muted === undefined) {
          return false;
        }
        return (
          Number.parseFloat(getComputedStyle(active).strokeWidth) >= 1.7499 &&
          Number.parseFloat(getComputedStyle(muted).strokeWidth) <= 1.0001
        );
      },
      undefined,
      { timeout: 5000 },
    );
    const selectionEdges = await page.evaluate(() => {
      const strokeWidth = (selector) => {
        const element = document.querySelector(
          `.nf-editor[data-active="true"] ${selector}`,
        );
        return element === null ? null : Number.parseFloat(getComputedStyle(element).strokeWidth);
      };
      return {
        active: strokeWidth('.nf-edge-path.nf-edge-active'),
        muted: strokeWidth('.nf-edge-path.nf-edge-muted'),
      };
    });
    assert.ok(
      selectionEdges.active !== null && Math.abs(selectionEdges.active - 1.75) < 0.001,
      `selected edge uses --nf-edge-width-active (${selectionEdges.active})`,
    );
    assert.ok(
      selectionEdges.muted !== null && Math.abs(selectionEdges.muted - 1) < 0.001,
      `unselected edge uses --nf-edge-width-muted (${selectionEdges.muted})`,
    );

    await h.setWindowSize(960, 768);
    await h.waitLayout({ blocks: 7, arrows: 3 });
    const narrow = await page.evaluate(() => {
      const canvas = getComputedStyle(
        document.querySelector('.nf-editor[data-active="true"] .nf-canvas'),
      );
      const rootStyle = getComputedStyle(document.documentElement);
      return {
        paddingTop: canvas.paddingTop,
        paddingRight: canvas.paddingRight,
        paddingBottom: canvas.paddingBottom,
        paddingLeft: canvas.paddingLeft,
        mediumBottom: rootStyle.getPropertyValue('--nf-canvas-pad-bottom-medium').trim(),
        compactBottom: rootStyle.getPropertyValue('--nf-canvas-pad-bottom-compact').trim(),
        chapterGap: getComputedStyle(
          document.querySelector('.nf-editor[data-active="true"] .nf-chapter'),
        ).marginBottom,
      };
    });
    assert.deepEqual(narrow, {
      paddingTop: '6px',
      // 960 px wide is the medium step: 20 px lateral inset.
      paddingRight: '20px',
      paddingBottom: '8px',
      paddingLeft: '20px',
      mediumBottom: '8px',
      compactBottom: '8px',
      chapterGap: '28px',
    });
    await h.quit();
  });
});
