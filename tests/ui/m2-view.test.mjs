import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifactsPath, createHarness } from '../support/harness.mjs';

const tempRoot = artifactsPath('m2f-phase5a-ui');
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

async function waitZoomLabel(label) {
  await page.waitForFunction(
    (expected) => document.querySelector('.nf-status-zoom')?.textContent?.trim() === expected,
    label,
    { timeout: 10000 },
  );
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
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    await h.waitLayout({ blocks: 7, arrows: 3 });

    const zoomLabel = page.locator('.nf-status-zoom');
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
    const focusButton = page.locator('.nf-status-focus');
    assert.equal(await focusButton.getAttribute('aria-pressed'), 'false');
    await focusButton.click();
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
    assert.equal(await focusButton.getAttribute('aria-pressed'), 'true');
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
    await page.locator('.nf-status-view').getByRole('button', { name: 'Fit', exact: true }).click();
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

    await focusButton.click();
    await page.waitForFunction(
      (expected) => {
        const scope = document.querySelector('.nf-editor[data-active="true"]');
        const visible = (element) => element.getClientRects().length > 0;
        if (scope === null) return false;
        const cards = [...scope.querySelectorAll('[data-block-card]')].filter(visible).length;
        return (
          document.querySelector('.nf-status-focus')?.getAttribute('aria-pressed') === 'false' &&
          cards === expected
        );
      },
      before.visible,
      { timeout: 10000 },
    );
    await h.waitLayout({ blocks: 7 });
    assert.equal(await focusButton.getAttribute('aria-pressed'), 'false');
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
    await focusButton.click();
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
    await focusButton.click();
    await page.waitForFunction(
      () =>
        document.querySelector('.nf-status-focus')?.getAttribute('aria-pressed') === 'false',
      undefined,
      { timeout: 10000 },
    );
    await h.waitLayout({ blocks: 7 });

    // Fit width at 1024 with the full document: zoom drops below 100% and the
    // editor no longer needs horizontal scroll.
    await h.setWindowSize(1024, 768);
    await h.waitLayout({ blocks: 7 });
    const beforeFit = await h.layoutSnapshot();
    assert.ok(beforeFit.overflow > 0, 'the full demo overflows at 1024 before Fit');
    await page.locator('.nf-status-view').getByRole('button', { name: 'Fit', exact: true }).click();
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
});
