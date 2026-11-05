import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { appDir, artifactsPath, axePath, createHarness } from '../support/harness.mjs';

const tempRoot = artifactsPath('m2f-phase5c-shell-ui');
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

describe('NoteForest M2 shell, layout, and accessibility', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    // axe is injected from the app origin; the production CSP blocks inline scripts.
    await copyFile(axePath, resolve(appDir, 'out/renderer/axe.min.js'));
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('keeps the E2E window hidden so tests never steal focus', async () => {
    await launch(isolated('hidden'));
    const visible = await h.app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? null,
    );
    assert.equal(visible, false, 'the E2E window stays hidden');
  });

  it('restores per-tab scroll and focus after relaunch', async () => {
    await launch(isolated('session'));
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    const scope = h.activeEditor();
    const target = scope.locator('[data-block-card]', { hasText: 'Characteristic polynomial' }).first();
    const targetId = await target.getAttribute('data-block-card');
    await target.click();
    await h.waitSelected(targetId);
    const scroller = scope.locator('.nf-editor-scroll');
    await scroller.evaluate((element) => {
      element.scrollTop = 420;
    });
    await page.waitForFunction(
      () => (document.querySelector('.nf-editor[data-active="true"] .nf-editor-scroll')?.scrollTop ?? 0) > 0,
      undefined,
      { timeout: 10000 },
    );
    await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
    await h.flushSession();
    const before = await page.evaluate(() => {
      const state = window.__noteforestTest.state();
      const active = state.runtimes.find((runtime) => runtime.packagePath === state.activeTab);
      const scroll = document.querySelector('.nf-editor[data-active="true"] .nf-editor-scroll');
      return { selected: active?.selectedBlockId ?? null, scrollTop: scroll?.scrollTop ?? 0 };
    });
    await h.quit();
    await launch(isolated('session'));
    await page.waitForFunction(
      (expected) => {
        const state = window.__noteforestTest.state();
        const active = state.runtimes.find((runtime) => runtime.packagePath === state.activeTab);
        const scroll = document.querySelector('.nf-editor[data-active="true"] .nf-editor-scroll');
        return (
          active !== undefined &&
          active.selectedBlockId === expected.selected &&
          scroll !== null &&
          Math.abs((scroll?.scrollTop ?? 0) - expected.scrollTop) < 80
        );
      },
      before,
      { timeout: 10000 },
    );
    const after = await page.evaluate(() => {
      const state = window.__noteforestTest.state();
      const active = state.runtimes.find((runtime) => runtime.packagePath === state.activeTab);
      const scroll = document.querySelector('.nf-editor[data-active="true"] .nf-editor-scroll');
      return { selected: active?.selectedBlockId ?? null, scrollTop: scroll?.scrollTop ?? 0 };
    });
    assert.equal(after.selected, before.selected, 'selected block restored');
    assert.ok(
      Math.abs(after.scrollTop - before.scrollTop) < 80,
      `scroll restored (${after.scrollTop} vs ${before.scrollTop})`,
    );
    await h.quit();
  });

  it('opens the command palette, tree, and dialogs accessibly', async () => {
    await launch(isolated('a11y'));
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    await page.addScriptTag({ url: './axe.min.js' });

    const axeReport = [];
    const axeRun = async (label) => {
      const violations = await page.evaluate(async () => {
        const results = await window.axe.run(document, {
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
          },
        });
        return results.violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          tags: violation.tags,
          help: violation.help,
          nodes: violation.nodes.length,
          targets: violation.nodes.slice(0, 3).map((node) => node.target),
        }));
      });
      const serious = violations
        .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
        .map((violation) => ({ id: violation.id, nodes: violation.nodes }));
      assert.deepEqual(serious, [], `${label} has serious axe violations`);
      axeReport.push({
        label,
        bestPractice: violations.filter((violation) =>
          violation.tags.includes('best-practice'),
        ),
      });
    };

    await axeRun('shell');

    // 200% zoom: the sidebar yields and nothing scrolls horizontally.
    await h.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(2);
    });
    await page.waitForFunction(
      () => document.querySelector('.nf-sidebar-panel') === null,
      undefined,
      { timeout: 10000 },
    );
    const zoomState = await page.evaluate(() => ({
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      hasSidebar: document.querySelector('.nf-sidebar-panel') !== null,
    }));
    assert.equal(zoomState.hasSidebar, false, 'sidebar yields at 200% zoom');
    assert.ok(zoomState.scrollWidth <= zoomState.width, 'no horizontal overflow at 200% zoom');
    await h.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1);
    });
    await page.waitForFunction(
      () => document.querySelector('.nf-sidebar-panel') !== null,
      undefined,
      { timeout: 10000 },
    );

    await page.keyboard.press('Meta+k');
    await page.waitForSelector('.nf-palette');
    await page.waitForFunction(
      () => document.activeElement?.className === 'nf-palette-input',
      undefined,
      { timeout: 10000 },
    );
    await axeRun('command palette');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.nf-palette', { state: 'detached' });

    await page.locator('.nf-tree').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await axeRun('topic tree');

    const block = h.activeEditor().locator('[data-block-card]').first();
    await block.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /Delete block/ }).click();
    await page.waitForSelector('.nf-dialog');
    await axeRun('delete dialog');
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Best-practice findings are recorded, not gated. The hard gate stays on
    // serious/critical WCAG violations above.
    const reportDir = artifactsPath('m2f-phase5a');
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      resolve(reportDir, 'axe-best-practice.json'),
      `${JSON.stringify(axeReport, null, 2)}\n`,
    );
    await h.quit();
  });

  it('places children parent-relative and scrolls horizontally for deep branches', async () => {
    await launch(isolated('layout'));
    await h.setWindowSize(1440, 900);
    await page.locator('.nf-empty-actions .nf-button-primary').click();
    await h.waitBlockCount(1);

    // 4-level empty chain: top → f → ff → fff.
    for (let index = 0; index < 3; index += 1) {
      await page.keyboard.press('Control+Enter');
      await h.waitBlockCount(index + 2);
    }
    await h.waitLayout({ blocks: 4, arrows: 3 });
    const four = await h.layoutSnapshot();
    assert.equal(four.cards.length, 4, 'four empty blocks');
    assert.equal(four.overflow, 0, `4 levels fit at 1440 (overflow ${four.overflow})`);
    assert.deepEqual(four.depths.map((depth) => depth.depth), [0, 1, 2, 3]);
    assert.deepEqual(
      four.depths.map((depth) => depth.xs[0]),
      [0, 176, 336, 496],
      'each child starts at its own parent right edge + 16 px',
    );
    assert.ok(
      four.cards.every((card) => card.column === ''),
      'no depth-column custom property remains on the cards',
    );
    assert.ok(Math.abs((four.depths[0]?.width ?? 0) - 160) <= 1, 'empty top-level uses the 160 px minimum');
    for (const depth of four.depths.slice(1)) {
      assert.ok(Math.abs(depth.width - 144) <= 1, 'empty child uses the 144 px minimum');
    }

    // A second, wider parent places its child at its own right edge, not on a
    // shared depth-1 column.
    await page.locator('[data-chapter-add]').first().click();
    await h.waitBlockCount(5);
    await page.keyboard.type(
      'A wide top-level block whose content deliberately makes this card much wider than the empty chain minimum width.',
    );
    await h.waitEditorText('A wide top-level block');
    await h.waitLayout({ blocks: 5, arrows: 3 });
    await page.keyboard.press('Control+Enter');
    await h.waitBlockCount(6);
    await page.keyboard.type('Parent-relative child');
    await h.waitLayout({ blocks: 6, arrows: 4 });
    const withSecondParent = await h.layoutSnapshot();
    const secondParent = withSecondParent.cards.find(
      (card) => card.depth === 0 && card.text.includes('wide top-level'),
    );
    const secondChild = withSecondParent.cards.find(
      (card) => card.depth === 1 && card.text.includes('Parent-relative child'),
    );
    const firstChild = withSecondParent.cards.find(
      (card) => card.depth === 1 && card.id !== secondChild?.id,
    );
    assert.ok(secondParent !== undefined, 'the second top-level parent is measured');
    assert.ok(secondChild !== undefined, 'the second parent has its child');
    assert.ok(firstChild !== undefined, 'the first chain has a child');
    assert.ok(
      Math.abs(secondChild.x - (secondParent.x + secondParent.width + 16)) <= 1.5,
      `child group starts at parent right + 16 (${secondChild.x} vs ${secondParent.x + secondParent.width + 16})`,
    );
    assert.ok(
      Math.abs(firstChild.x - 176) <= 1.5,
      'the first empty parent still places its child at 176 px',
    );
    assert.notEqual(
      Math.round(secondChild.x),
      Math.round(firstChild.x),
      'different parents may place same-depth children at different x',
    );

    // Extend the first chain to eight levels: parent-relative placement now
    // needs horizontal scroll at 1440.
    const deepCard = h.activeEditor().locator('[data-depth="3"]').first();
    const deepId = await deepCard.getAttribute('data-block-card');
    await deepCard.click();
    assert.ok(deepId !== null);
    await h.waitSelected(deepId);
    for (let index = 0; index < 4; index += 1) {
      await page.keyboard.press('Control+Enter');
      await h.waitBlockCount(7 + index);
    }
    await h.waitLayout({ blocks: 10 });
    const deep = await h.layoutSnapshot();
    assert.equal(deep.depths.at(-1)?.depth, 7);
    assert.deepEqual(
      deep.depths.map((depth) => depth.xs[0]),
      [0, 176, 336, 496, 656, 816, 976, 1136],
      'each level follows the previous card right edge + 16 px',
    );
    assert.ok(deep.overflow > 0, `deep parent-relative chain overflows at 1440 (overflow ${deep.overflow})`);
    await h
      .activeEditor()
      .locator('.nf-editor-scroll')
      .evaluate((element) => {
        element.scrollLeft = 320;
      });
    await page.waitForFunction(
      () => (document.querySelector('.nf-editor[data-active="true"] .nf-editor-scroll')?.scrollLeft ?? 0) > 0,
      undefined,
      { timeout: 10000 },
    );
    const scrolled = await h.layoutSnapshot();
    assert.ok(scrolled.scrollLeft > 0, 'the editor scrolls horizontally');
    await h.quit();
  });
});
