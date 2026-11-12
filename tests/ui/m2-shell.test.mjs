import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { appDir, artifactsPath, axePath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';

const tempRoot = artifactsPath('m2f-phase5c-shell-ui');
const screenshotDir = artifactsPath('m2-shell');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
const { isolated } = ui;
let page;

async function launch(overrides = {}) {
  page = await ui.launch(overrides);
}

/** Branch-port and add-child geometry for every visible block that has children. */
async function portGeometry() {
  return page.evaluate(() => {
    const scope = document.querySelector('.nf-editor[data-active="true"]');
    const rows = [];
    for (const card of scope?.querySelectorAll('[data-block-card]') ?? []) {
      if (card.getClientRects().length === 0) continue;
      const port = card.querySelector('[data-branch-port]');
      const add = card.querySelector('[data-add-child]');
      if (port === null || add === null) continue;
      const cardRect = card.getBoundingClientRect();
      const portRect = port.getBoundingClientRect();
      const addRect = add.getBoundingClientRect();
      const dot = port.querySelector('.nf-port-dot');
      const dotRect =
        dot === null || dot.getClientRects().length === 0 ? null : dot.getBoundingClientRect();
      rows.push({
        id: card.getAttribute('data-block-card'),
        collapsed: port.getAttribute('data-collapsed') === 'true',
        portCenter: (portRect.left + portRect.right) / 2,
        addCenter: (addRect.left + addRect.right) / 2,
        portRight: portRect.right,
        portWidth: portRect.width,
        dotLeft: dotRect?.left ?? null,
        dotRight: dotRect?.right ?? null,
        dotWidth: dotRect?.width ?? null,
        cardRight: cardRect.right,
      });
    }
    return rows;
  });
}

/** The port box and the add-child control share one vertical center line. */
function assertPortCentered(rows, label) {
  assert.ok(rows.length > 0, `${label}: at least one block has a branch port`);
  for (const row of rows) {
    assert.ok(
      Math.abs(row.portCenter - row.addCenter) <= 0.5,
      `${label}: branch-port center ${row.portCenter} vs add-child center ${row.addCenter} (${row.id})`,
    );
  }
}

describe('NoteForest M2 shell, layout, and accessibility', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    await mkdir(screenshotDir, { recursive: true });
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
    // Scroll to the real end of the canvas: the floating-shell canvas is
    // shorter than the old full-height editor, so a literal 420 clamped to the
    // maximum and the restored focus offset then sat outside the tolerance.
    const target = scope.locator('[data-block-card]').last();
    const targetId = await target.getAttribute('data-block-card');
    await target.click();
    await h.waitSelected(targetId);
    const scroller = scope.locator('.nf-editor-scroll');
    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
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

    // 200% zoom: the sidebar yields to the 48 px rail and nothing scrolls horizontally.
    await h.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(2);
    });
    await page.waitForFunction(
      () => {
        const rail = document.querySelector('.nf-sidebar-rail');
        return rail !== null && Math.abs(rail.getBoundingClientRect().width - 48) < 1;
      },
      undefined,
      { timeout: 10000 },
    );
    const zoomState = await page.evaluate(() => ({
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      hasRail: document.querySelector('.nf-sidebar-rail') !== null,
      hasFullSidebar: document.querySelector('.nf-sidebar-search') !== null,
    }));
    assert.equal(zoomState.hasFullSidebar, false, 'the expanded sidebar yields at 200% zoom');
    assert.equal(zoomState.hasRail, true, 'the sidebar stays as a 48 px rail');
    assert.ok(zoomState.scrollWidth <= zoomState.width, 'no horizontal overflow at 200% zoom');
    await h.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1);
    });
    await page.waitForFunction(
      () => document.querySelector('.nf-sidebar-search') !== null,
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
    const chainRootId = four.cards.find((card) => card.depth === 0)?.id;
    assert.ok(chainRootId !== undefined, 'the chain has one top-level root');
    assert.equal(four.cards.length, 4, 'four empty blocks');
    assert.equal(four.overflow, 0, `4 levels fit at 1440 (overflow ${four.overflow})`);
    assert.deepEqual(four.depths.map((depth) => depth.depth), [0, 1, 2, 3]);
    assert.deepEqual(
      four.depths.map((depth) => depth.xs[0]),
      [0, 184, 352, 520],
      'each child starts at its own parent right edge + 24 px',
    );
    assert.ok(
      four.cards.every((card) => card.column === ''),
      'no depth-column custom property remains on the cards',
    );
    assert.ok(Math.abs((four.depths[0]?.width ?? 0) - 160) <= 1, 'empty top-level uses the 160 px minimum');
    for (const depth of four.depths.slice(1)) {
      assert.ok(Math.abs(depth.width - 144) <= 1, 'empty child uses the 144 px minimum');
    }

    // The branch port (collapse chevron / child count) uses the same 18 px
    // circle as the add controls and shares their vertical center line.
    const expandedPorts = await portGeometry();
    assert.equal(expandedPorts.length, 3, 'three parents expose a branch port');
    assert.ok(
      expandedPorts.every((row) => row.collapsed === false),
      'the chain starts expanded',
    );
    assert.ok(
      expandedPorts.every((row) => Math.abs(row.portWidth - 18) <= 0.5),
      `expanded ports are the 18 px circle (${expandedPorts.map((row) => row.portWidth).join(', ')})`,
    );
    assertPortCentered(expandedPorts, 'expanded');
    const portStyle = await page.evaluate(() => {
      const port = document.querySelector('[data-branch-port]');
      const chevron = port?.querySelector('.nf-port-chevron');
      const style = port === null ? null : getComputedStyle(port);
      return {
        border: style?.borderTopWidth ?? null,
        borderColor: style?.borderTopColor ?? null,
        background: style?.backgroundColor ?? null,
        radius: style?.borderRadius ?? null,
        chevron:
          chevron === null || chevron === undefined
            ? null
            : {
                width: chevron.getBoundingClientRect().width,
                stroke: getComputedStyle(chevron).strokeWidth,
              },
      };
    });
    assert.deepEqual(portStyle, {
      border: '1px',
      borderColor: 'rgb(110, 115, 122)',
      background: 'rgb(32, 35, 41)',
      radius: '999px',
      chevron: { width: 12, stroke: '1.5px' },
    });
    // The circle is a hover affordance like the add controls: show it before the
    // evidence screenshot.
    const deepestParent = page.locator(`[data-block-card="${expandedPorts.at(-1).id}"]`);
    await deepestParent.hover();
    await page.waitForFunction(
      (id) => {
        const port = document.querySelector(`[data-branch-port="${id}"]`);
        return port !== null && getComputedStyle(port).opacity === '1';
      },
      expandedPorts.at(-1).id,
      { timeout: 5000 },
    );
    await h.activeEditor().screenshot({ path: join(screenshotDir, 'branch-port-expanded.png') });

    // Collapse the deepest parent: the count replaces the chevron inside the
    // same 18 px circle; the circle itself does not change size.
    await deepestParent.locator('[data-branch-port]').click();
    await page.waitForFunction(
      (id) =>
        document
          .querySelector(`[data-branch-port="${id}"]`)
          ?.getAttribute('data-collapsed') === 'true',
      expandedPorts.at(-1).id,
      { timeout: 10000 },
    );
    await h.waitLayout({ blocks: 4, arrows: 2 });
    const collapsedPorts = await portGeometry();
    assertPortCentered(collapsedPorts, 'collapsed');
    const collapsedPort = collapsedPorts.find((row) => row.collapsed);
    assert.ok(collapsedPort !== undefined, 'one port is collapsed');
    assert.ok(
      Math.abs(collapsedPort.portWidth - 18) <= 0.5,
      `the collapsed port keeps the 18 px circle (${collapsedPort.portWidth})`,
    );
    assert.ok(
      Math.abs(
        collapsedPort.dotLeft +
          collapsedPort.dotWidth / 2 -
          (collapsedPort.addCenter + 0.5),
      ) <= 1.5,
      `the count sits inside the circle (${collapsedPort.dotLeft}..${collapsedPort.dotLeft + collapsedPort.dotWidth} vs ${collapsedPort.portCenter})`,
    );
    assert.ok(
      collapsedPort.dotLeft >= collapsedPort.cardRight - 10 - 0.5,
      `the count does not overlap the card content edge (${collapsedPort.dotLeft} vs ${collapsedPort.cardRight - 10})`,
    );
    assert.equal(
      await page
        .locator(`[data-branch-port="${collapsedPort.id}"] .nf-port-dot`)
        .innerText(),
      '1',
      'the collapsed port keeps the child count',
    );
    await h.activeEditor().screenshot({ path: join(screenshotDir, 'branch-port-collapsed.png') });
    await deepestParent.locator('[data-branch-port]').click();
    await page.waitForFunction(
      (id) =>
        document
          .querySelector(`[data-branch-port="${id}"]`)
          ?.getAttribute('data-collapsed') === 'false',
      expandedPorts.at(-1).id,
      { timeout: 10000 },
    );
    await h.waitLayout({ blocks: 4, arrows: 3 });

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
      Math.abs(secondChild.x - (secondParent.x + secondParent.width + 24)) <= 1.5,
      `child group starts at parent right + 24 (${secondChild.x} vs ${secondParent.x + secondParent.width + 24})`,
    );
    assert.ok(
      Math.abs(firstChild.x - 184) <= 1.5,
      'the first empty parent still places its child at 184 px',
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
      [0, 184, 352, 520, 688, 856, 1024, 1192],
      'each level follows the previous card right edge + 24 px',
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

    // A two-digit count keeps the fixed right edge and grows left.
    const chainRoot = page.locator(`[data-block-card="${chainRootId}"]`);
    for (let index = 0; index < 9; index += 1) {
      await chainRoot.locator('[data-add-child]').click();
      await h.waitBlockCount(11 + index);
    }
    await chainRoot.locator('[data-branch-port]').click();
    await page.waitForFunction(
      (id) =>
        document
          .querySelector(`[data-branch-port="${id}"]`)
          ?.getAttribute('data-collapsed') === 'true',
      chainRootId,
      { timeout: 10000 },
    );
    const twoDigit = (await portGeometry()).find((row) => row.id === chainRootId);
    assert.ok(twoDigit !== undefined && twoDigit.collapsed, 'the root is collapsed with ten children');
    assert.ok(
      twoDigit.dotWidth > 16.5,
      `a two-digit bubble is wider than the 16 px minimum (${twoDigit.dotWidth})`,
    );
    assert.ok(
      Math.abs(twoDigit.dotRight - (twoDigit.addCenter + 8)) <= 0.5,
      `the two-digit bubble keeps the fixed right edge (${twoDigit.dotRight} vs ${twoDigit.addCenter + 8})`,
    );
    assert.ok(
      twoDigit.dotLeft < twoDigit.portRight - 16.5,
      `the two-digit bubble grows to the left (${twoDigit.dotLeft} vs ${twoDigit.portRight - 16})`,
    );
    await chainRoot.locator('[data-branch-port]').click();
    await page.waitForFunction(
      (id) =>
        document
          .querySelector(`[data-branch-port="${id}"]`)
          ?.getAttribute('data-collapsed') === 'false',
      chainRootId,
      { timeout: 10000 },
    );
    await h.quit();
  });
});
