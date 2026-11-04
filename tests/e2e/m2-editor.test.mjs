import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { _electron as electron } from 'playwright';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '../..');
const appDir = resolve(root, 'apps/desktop');
const tempRoot = resolve(root, 'artifacts/m2e-tmp');
const screenshotDir = resolve(root, 'artifacts/m2e');
const axePath = require.resolve('axe-core/axe.min.js');

let app;
let page;
const pageErrors = [];

function baseEnv(overrides = {}) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return {
    ...env,
    NOTEFOREST_LIBRARY: resolve(tempRoot, 'library'),
    NOTEFOREST_APP_SUPPORT: resolve(tempRoot, 'support'),
    NOTEFOREST_E2E: '1',
    NOTEFOREST_ALLOW_SEED: '1',
    ...overrides,
  };
}

async function launch(overrides = {}) {
  app = await electron.launch({ args: ['.'], cwd: appDir, env: baseEnv(overrides) });
  page = await app.firstWindow();
  await page.bringToFront();
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });
  await page.waitForFunction(() => window.__noteforestTest?.state().ready === true, undefined, {
    timeout: 20000,
  });
  return { app, page };
}

async function quit() {
  if (app === undefined) return;
  await app.evaluate(({ app: electronApp }) => electronApp.quit());
  await new Promise((resolveClose) => {
    const timer = setTimeout(resolveClose, 8000);
    app.once('close', () => {
      clearTimeout(timer);
      resolveClose();
    });
  });
  try {
    await app.close();
  } catch {
    // Already closed by quit.
  }
  app = undefined;
  page = undefined;
}

function resizeScreenshot(path, width, height) {
  execFileSync('sips', ['--resampleHeightWidth', String(height), String(width), path]);
}

function activeEditor() {
  return page.locator('.nf-editor[data-active="true"]');
}

async function state() {
  return page.evaluate(() => window.__noteforestTest.state());
}

async function activeRuntimeInfo() {
  const current = await state();
  return current.runtimes.find((runtime) => runtime.packagePath === current.activeTab);
}

async function waitSelected(blockId) {
  await page.waitForFunction(
    (expected) => {
      const current = window.__noteforestTest.state();
      const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
      return runtime?.selectedBlockId === expected;
    },
    blockId,
    { timeout: 10000 },
  );
}

async function waitSaved() {
  await page.waitForFunction(
    () => window.__noteforestTest.state().runtimes.every((runtime) => runtime.saveState === 'saved'),
    undefined,
    { timeout: 10000 },
  );
}

async function waitBlockCount(count) {
  await page.waitForFunction(
    (expected) => document.querySelectorAll('.nf-editor[data-active="true"] [data-block-card]').length === expected,
    count,
    { timeout: 10000 },
  );
}

async function parity() {
  return page.evaluate(() => {
    const scope = document.querySelector('.nf-editor[data-active="true"]');
    const active = window.__noteforestTest.state();
    return {
      canvas: scope === null ? 0 : scope.querySelectorAll('[data-block-card]').length,
      sidebar: document.querySelectorAll('.nf-tree-row[data-block-id]').length,
      arrows: scope === null ? 0 : scope.querySelectorAll('.nf-edge-path').length,
      trunks: scope === null ? 0 : scope.querySelectorAll('.nf-edge-trunk').length,
      canonical: active.runtimes.find((runtime) => runtime.packagePath === active.activeTab)?.blocks ?? 0,
      canvasIds: scope === null ? [] : [...scope.querySelectorAll('[data-block-card]')].map((card) => card.getAttribute('data-block-card')),
      canonicalIds: active.runtimes.find((runtime) => runtime.packagePath === active.activeTab)?.blockIds ?? [],
    };
  });
}

async function waitCanonicalBlockCount(count) {
  await page.waitForFunction(
    (expected) => {
      const active = window.__noteforestTest.state();
      const runtime = active.runtimes.find((item) => item.packagePath === active.activeTab);
      return (runtime?.blocks ?? -1) === expected;
    },
    count,
    { timeout: 10000 },
  );
}

/** Let the rAF measure pass and the edge layer settle after a layout change. */
async function waitLayout() {
  await page.waitForTimeout(700);
}

async function setWindowSize(width, height) {
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.setSize(size.width, size.height);
      window.center();
    },
    { width, height },
  );
  await page.waitForTimeout(600);
}

/**
 * Parent-relative layout snapshot: each card's x/y/width/height relative to
 * the canvas content, plus horizontal overflow. The `column` custom property is
 * intentionally gone: placement must come from the measured rects alone.
 */
async function layoutSnapshot() {
  return page.evaluate(() => {
    const scope = document.querySelector('.nf-editor[data-active="true"]');
    const root = scope?.querySelector('.nf-canvas-content');
    const scroller = scope?.querySelector('.nf-editor-scroll');
    if (root === null || root === undefined || scroller === null || scroller === undefined) {
      return null;
    }
    const rootRect = root.getBoundingClientRect();
    const cards = [...root.querySelectorAll('[data-block-card]')].map((card) => {
      const rect = card.getBoundingClientRect();
      const host = card.closest('.nf-block-inner');
      return {
        id: card.getAttribute('data-block-card'),
        depth: Number(card.getAttribute('data-depth')),
        x: Math.round((rect.left - rootRect.left) * 10) / 10,
        y: Math.round((rect.top - rootRect.top) * 10) / 10,
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
        column: host?.style.getPropertyValue('--nf-card-col') ?? '',
        text: card.textContent?.slice(0, 24) ?? '',
      };
    });
    const byDepth = new Map();
    for (const card of cards) {
      const list = byDepth.get(card.depth) ?? [];
      list.push(card);
      byDepth.set(card.depth, list);
    }
    return {
      cards,
      depths: [...byDepth.entries()]
        .sort((left, right) => left[0] - right[0])
        .map(([depth, list]) => ({
          depth,
          xs: [...new Set(list.map((card) => card.x))],
          width: Math.max(...list.map((card) => card.width)),
          count: list.length,
        })),
      scrollWidth: scroller.scrollWidth,
      clientWidth: scroller.clientWidth,
      scrollLeft: scroller.scrollLeft,
      overflow: scroller.scrollWidth - scroller.clientWidth,
      zoom: Number(scope.querySelector('.nf-canvas')?.getAttribute('data-zoom') ?? 100),
    };
  });
}

/** First-child edge and trunk geometry, in canvas coordinates. */
async function trunkSnapshot() {
  return page.evaluate(() => {
    const scope = document.querySelector('.nf-editor[data-active="true"]');
    const root = scope?.querySelector('.nf-canvas-content');
    if (root === null || root === undefined) return null;
    const rootRect = root.getBoundingClientRect();
    const firstGroup = root.querySelector('g[data-edge-id]');
    const edgePath = firstGroup?.querySelector('path');
    const childId = firstGroup?.getAttribute('data-child-id');
    const parentId = firstGroup?.getAttribute('data-parent-id');
    const child = childId ? root.querySelector(`[data-block-card="${childId}"]`) : null;
    const parent = parentId ? root.querySelector(`[data-block-card="${parentId}"]`) : null;
    const trunk = parentId
      ? root.querySelector(`.nf-edge-trunk[data-parent-id="${parentId}"]`)
      : null;
    if (edgePath === null || edgePath === undefined || child === null || parent === null) return null;
    const numbers = (value) =>
      (value ?? '')
        .split(/[^0-9.-]+/)
        .filter((part) => part.length > 0)
        .map(Number);
    const edgeNumbers = numbers(edgePath.getAttribute('d'));
    const trunkNumbers = trunk === null ? [] : numbers(trunk.getAttribute('d'));
    const pairs = (list) => {
      const points = [];
      for (let index = 0; index + 1 < list.length; index += 2) {
        points.push({ x: list[index], y: list[index + 1] });
      }
      return points;
    };
    const childRect = child.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    return {
      childId,
      parentId,
      edgePairs: pairs(edgeNumbers),
      trunkPairs: pairs(trunkNumbers),
      edgeStart: pairs(edgeNumbers)[0] ?? null,
      parentRight: Math.round(parentRect.right - rootRect.left),
      parentCenterY: Math.round((parentRect.top - rootRect.top + parentRect.height / 2) * 100) / 100,
      childLeft: Math.round(childRect.left - rootRect.left),
      childCenterY: Math.round((childRect.top - rootRect.top + childRect.height / 2) * 100) / 100,
      trunkCount: root.querySelectorAll('.nf-edge-trunk').length,
    };
  });
}


/** Fire several structural keydowns before any IPC round-trip can finish. */
async function rapidKeydowns(key, count, options = {}) {
  const sequence = Array.from({ length: count }, () => ({ key, options }));
  await rapidKeySequence(sequence);
}

async function rapidKeySequence(sequence) {
  await page.evaluate(
    (events) => {
      const target = document.querySelector('.nf-editor[data-active="true"] .nf-prosemirror');
      if (target === null) throw new Error('no active editor');
      for (const event of events) {
        target.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: event.key,
            code: event.key === 'Enter' ? 'Enter' : event.key,
            bubbles: true,
            cancelable: true,
            ...event.options,
          }),
        );
      }
    },
    sequence.map((entry) => ({ key: entry.key, options: entry.options ?? {} })),
  );
}

describe('NoteForest M2 editor shell', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    await mkdir(screenshotDir, { recursive: true });
    await copyFile(axePath, resolve(appDir, 'out/renderer/axe.min.js'));
  });

  afterEach(async () => {
    await quit();
  });

  after(async () => {
    assert.deepEqual(pageErrors, [], `renderer errors: ${pageErrors.join('; ')}`);
  });

  it('creates documents, edits blocks, branches, reparents, reorders and restores', async () => {
    await launch();

    await page.waitForSelector('.nf-empty-state');
    assert.match(await page.locator('.nf-empty-title').innerText(), /NoteForest/);

    await page.locator('.nf-empty-actions .nf-button-primary').click();
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await waitBlockCount(1);
    assert.equal((await state()).tabs.length, 1);

    const firstPath = (await state()).tabs[0].packagePath;
    await page.keyboard.type('Root block');
    await page.waitForTimeout(120);
    assert.equal(await page.locator('.nf-tab-dot').count(), 1, 'dirty dot appears while typing');
    await waitSaved();
    assert.equal(await page.locator('.nf-tab-dot').count(), 0, 'dirty dot clears after autosave');

    await page.keyboard.press('Control+Enter');
    await waitBlockCount(2);
    await page.keyboard.type('Child block');
    await waitSaved();

    const edges = activeEditor().locator('.nf-edge-path');
    assert.equal(await edges.count(), 1, 'one primary arrow for one child');
    const edgeCheck = await page.evaluate(() => {
      const root = document.querySelector('.nf-editor[data-active="true"] .nf-canvas-content');
      if (root === null) return null;
      const rootRect = root.getBoundingClientRect();
      const group = root.querySelector('g[data-edge-id]');
      const path = group?.querySelector('.nf-edge-path');
      const arrow = group?.querySelector('.nf-edge-arrow');
      const childId = group?.getAttribute('data-child-id');
      const child = childId === null || childId === undefined ? null : root.querySelector(`[data-block-card="${childId}"]`);
      const parentId = group?.getAttribute('data-parent-id');
      const parent = parentId === null || parentId === undefined ? null : root.querySelector(`[data-block-card="${parentId}"]`);
      if (path === null || path === undefined || child === null || parent === null) return null;
      const numbers = (value) =>
        (value ?? '')
          .split(/[^0-9.-]+/)
          .filter((part) => part.length > 0)
          .map(Number);
      const pairs = (list) => {
        const points = [];
        for (let index = 0; index + 1 < list.length; index += 2) {
          points.push({ x: list[index], y: list[index + 1] });
        }
        return points;
      };
      const edgeNumbers = numbers(path.getAttribute('d'));
      const arrowNumbers = numbers(arrow?.getAttribute('d'));
      const childRect = child.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      const edgePoints = pairs(edgeNumbers);
      const arrowPoints = pairs(arrowNumbers);
      const last = edgePoints.at(-1);
      const before = edgePoints.at(-2);
      return {
        endX: last?.x ?? 0,
        endY: last?.y ?? 0,
        finalStem: last !== undefined && before !== undefined ? last.x - before.x : 0,
        finalHorizontal: last !== undefined && before !== undefined ? Math.abs(last.y - before.y) < 0.5 : false,
        childLeft: childRect.left - rootRect.left,
        childCenterY: childRect.top - rootRect.top + childRect.height / 2,
        parentRight: parentRect.right - rootRect.left,
        marker: path.getAttribute('marker-end'),
        arrowPoints,
        arrowDirection: arrow?.getAttribute('data-arrow-direction') ?? '',
      };
    });
    assert.ok(edgeCheck !== null, 'edge measurements available');
    assert.ok(edgeCheck.parentRight < edgeCheck.endX, 'arrow travels forward to the child');
    assert.ok(edgeCheck.endX < edgeCheck.childLeft, 'arrowhead stops before the child card');
    assert.ok(Math.abs(edgeCheck.endY - edgeCheck.childCenterY) < 2, 'arrow enters the child side');
    assert.equal(edgeCheck.marker, null, 'no scaling SVG marker');
    assert.equal(edgeCheck.arrowDirection, 'right');
    assert.equal(edgeCheck.arrowPoints.length, 3, 'fixed polygon arrowhead');
    assert.ok(edgeCheck.finalHorizontal, 'final segment into the child is horizontal');
    assert.ok(edgeCheck.finalStem >= 12, `final stem is at least 12 px (${edgeCheck.finalStem})`);
    const [arrowTip, arrowTop, arrowBottom] = edgeCheck.arrowPoints;
    assert.ok(arrowTip !== undefined && arrowTop !== undefined && arrowBottom !== undefined);
    assert.equal(Math.abs(arrowTip.x - arrowTop.x), 6, 'arrowhead length is fixed');
    assert.equal(Math.abs(arrowTop.y - arrowBottom.y), 6, 'arrowhead width is fixed');
    assert.ok(arrowTip.x > arrowTop.x, 'arrowhead points right');

    // Add a sibling to the child; it gets its own arrow.
    await page.keyboard.press('Alt+Enter');
    await waitBlockCount(3);
    await page.keyboard.type('Sibling block');
    await waitSaved();
    assert.equal(await edges.count(), 2, 'two children, two arrows');

    // Reorder the sibling up with the keyboard and check the DOM order.
    await activeEditor().locator('[data-block-card]', { hasText: 'Sibling block' }).first().click();
    await page.keyboard.press('Alt+ArrowUp');
    await page.waitForTimeout(700);
    const labelsInDom = await activeEditor().locator('[data-block-card] .nf-block-prose').allTextContents();
    assert.ok(labelsInDom.findIndex((text) => text.includes('Sibling block')) < labelsInDom.findIndex((text) => text.includes('Child block')));

    // Drag the first child onto its sibling and check the reading order.
    const dragCards = activeEditor().locator('[data-block-card][data-top-level="false"]');
    const dragSource = dragCards.nth(0);
    const dragTarget = dragCards.nth(1);
    const handle = dragSource.locator('.nf-gutter-handle');
    await handle.hover();
    const handleBox = await handle.boundingBox();
    const targetBox = await dragTarget.boundingBox();
    if (handleBox !== null && targetBox !== null) {
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height * 0.8, {
        steps: 10,
      });
      await page.mouse.up();
      await page.waitForTimeout(800);
    }
    const draggedOrder = await activeEditor()
      .locator('[data-block-card][data-top-level="false"] .nf-block-prose')
      .allTextContents();
    assert.ok(
      draggedOrder.findIndex((text) => text.includes('Sibling block')) >
        draggedOrder.findIndex((text) => text.includes('Child block')),
      'drag reorders sibling blocks',
    );

    // Reparent the sibling to the top level through Move to…
    const siblingCard = activeEditor().locator('[data-block-card]', { hasText: 'Sibling block' }).first();
    await siblingCard.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /Move to/ }).click();
    await page.getByRole('option', { name: /Top level/ }).click();
    await page.getByRole('button', { name: 'Move', exact: true }).click();
    await page.waitForTimeout(900);
    await waitSaved();
    assert.equal(await edges.count(), 1, 'reparenting removes the incoming arrow');
    const topLevelFlags = await activeEditor()
      .locator('[data-block-card]')
      .evaluateAll((cards) => cards.map((card) => card.getAttribute('data-top-level')));
    assert.ok(topLevelFlags.filter((flag) => flag === 'true').length >= 2, 'moved block is top-level');

    // Detach the remaining child branch.
    const childCard = activeEditor().locator('[data-block-card]', { hasText: 'Child block' }).first();
    await childCard.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /Detach from parent/ }).click();
    await page.waitForTimeout(900);
    await waitSaved();
    assert.equal(await edges.count(), 0, 'detaching promotes the target and removes the arrow');

    // Rename document.
    await page.locator('.nf-document-title').click();
    await page.locator('.nf-dialog').getByRole('textbox', { name: 'Name' }).fill('M2 notes');
    await page.locator('.nf-dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await waitSaved();
    assert.equal((await state()).tabs[0].title, 'M2 notes');

    // Second document + tab switching.
    await page.locator('.nf-new-note').click();
    await page.waitForTimeout(900);
    await page.waitForFunction(() => window.__noteforestTest.state().tabs.length === 2);
    await page.keyboard.type('Second document text');
    await page.waitForTimeout(200);
    assert.equal(
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isDocumentEdited()),
      true,
      'native dirty state is set',
    );
    await page.keyboard.press('Meta+w');
    await page.waitForSelector('.nf-dialog');
    assert.match(await page.locator('.nf-dialog-title').innerText(), /Close tab/);
    await page.locator('.nf-dialog').getByRole('button', { name: 'Cancel' }).click();
    assert.equal((await state()).tabs.length, 2, 'cancel keeps the tab');
    await waitSaved();
    assert.equal(
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isDocumentEdited()),
      false,
      'native dirty state clears after save',
    );

    await page.keyboard.press('Meta+1');
    await page.waitForTimeout(250);
    assert.equal((await state()).activeTab, firstPath);
    assert.match(await activeEditor().locator('.nf-block-prose').first().innerText(), /Root block/);
    await page.keyboard.press('Meta+2');
    await page.waitForTimeout(250);
    assert.notEqual((await state()).activeTab, firstPath);

    // Close the active tab with Cmd+W; the window must stay open.
    await page.keyboard.press('Meta+w');
    await page.waitForTimeout(900);
    assert.equal((await state()).tabs.length, 1, 'Cmd+W closes a tab, not the window');
    assert.equal(await page.locator('.nf-app').count(), 1);
    await page.keyboard.press('Meta+Shift+t');
    await page.waitForTimeout(900);
    assert.equal((await state()).tabs.length, 2, 'reopen closed tab');
    await page.keyboard.press('Meta+1');
    await page.waitForTimeout(500);

    const beforeQuit = await state();
    await quit();
    await launch();
    const restored = await state();
    assert.equal(restored.tabs.length, 2, 'tabs restored after relaunch');
    assert.equal(restored.activeTab, beforeQuit.activeTab, 'active tab restored');
    assert.equal(restored.runtimes.length, 2);
    const allText = await activeEditor().locator('.nf-block-prose').allTextContents();
    assert.ok(allText.some((text) => text.includes('Root block')), 'content restored');
    assert.equal(await page.locator('.nf-editor[data-active="true"] .nf-edge-path').count(), 0);
    await quit();
  });

  it('keeps the arrow invariant for the demo tree and supports collapse', async () => {
    await launch();
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await waitSaved();
    const scope = activeEditor();
    assert.equal(await scope.locator('.nf-edge-path').count(), 3);
    assert.equal(await scope.locator('.nf-edge-defect').count(), 0, 'no layout defects in the demo tree');

    // Collapse the root branch from the branch port: its subtree and arrows
    // disappear, the dot with the count stays, and no footer is added.
    const rootCard = scope.locator('[data-block-card][data-top-level="true"]').first();
    const heightBefore = (await rootCard.boundingBox())?.height ?? 0;
    await rootCard.hover();
    await rootCard.locator('[data-branch-port]').click();
    await page.waitForTimeout(700);
    assert.equal(await scope.locator('.nf-edge-path').count(), 0, 'collapsed subtree edges hidden');
    assert.equal(await scope.locator('[data-block-card]:visible').count(), 4);
    assert.equal(await scope.locator('.nf-block-meta').count(), 0, 'no in-flow collapse footer');
    const heightCollapsed = (await rootCard.boundingBox())?.height ?? 0;
    assert.ok(Math.abs(heightCollapsed - heightBefore) < 0.5, 'collapse changes no card height');
    assert.equal(await rootCard.locator('[data-branch-port]').getAttribute('aria-expanded'), 'false');
    assert.equal(
      (await rootCard.locator('.nf-port-dot').innerText()).trim(),
      '2',
      'collapsed dot shows the direct child count',
    );
    await rootCard.locator('[data-branch-port]').click();
    await page.waitForTimeout(700);
    assert.equal(await scope.locator('.nf-edge-path').count(), 3);
    assert.equal(await rootCard.locator('[data-branch-port]').getAttribute('aria-expanded'), 'true');
    await quit();
  });

  it('restores per-tab scroll and focus after relaunch', async () => {
    await launch();
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await waitSaved();
    const scope = activeEditor();
    await scope
      .locator('[data-block-card]', { hasText: 'Characteristic polynomial' })
      .first()
      .click();
    const scroller = scope.locator('.nf-editor-scroll');
    await scroller.evaluate((element) => {
      element.scrollTop = 420;
    });
    await page.waitForTimeout(5600);
    const before = await page.evaluate(() => {
      const state = window.__noteforestTest.state();
      const active = state.runtimes.find((runtime) => runtime.packagePath === state.activeTab);
      const scroll = document.querySelector('.nf-editor[data-active="true"] .nf-editor-scroll');
      return { selected: active?.selectedBlockId ?? null, scrollTop: scroll?.scrollTop ?? 0 };
    });
    await quit();
    await launch();
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => {
      const state = window.__noteforestTest.state();
      const active = state.runtimes.find((runtime) => runtime.packagePath === state.activeTab);
      const scroll = document.querySelector('.nf-editor[data-active="true"] .nf-editor-scroll');
      return { selected: active?.selectedBlockId ?? null, scrollTop: scroll?.scrollTop ?? 0 };
    });
    assert.equal(after.selected, before.selected, 'selected block restored');
    assert.ok(Math.abs(after.scrollTop - before.scrollTop) < 80, `scroll restored (${after.scrollTop} vs ${before.scrollTop})`);
    await quit();
  });

  it('opens the command palette, tree, and dialogs accessibly', async () => {
    await launch();
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await page.addScriptTag({ url: './axe.min.js' });

    const axeRun = async (label) => {
      const violations = await page.evaluate(async () => {
        const results = await window.axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
        });
        return results.violations
          .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
          .map((violation) => ({ id: violation.id, nodes: violation.nodes.length }));
      });
      assert.deepEqual(violations, [], `${label} has serious axe violations`);
    };

    await axeRun('shell');

    // 200% zoom: the sidebar yields and nothing scrolls horizontally.
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(2);
    });
    await page.waitForTimeout(400);
    const zoomState = await page.evaluate(() => ({
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      hasSidebar: document.querySelector('.nf-sidebar-panel') !== null,
    }));
    assert.equal(zoomState.hasSidebar, false, 'sidebar yields at 200% zoom');
    assert.ok(zoomState.scrollWidth <= zoomState.width, 'no horizontal overflow at 200% zoom');
    await page.screenshot({ path: resolve(screenshotDir, 'zoom-200.png') });
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1);
    });
    await page.waitForTimeout(300);

    await page.keyboard.press('Meta+k');
    await page.waitForSelector('.nf-palette');
    assert.equal(await page.evaluate(() => document.activeElement?.className), 'nf-palette-input');
    await axeRun('command palette');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.nf-palette').count(), 0);

    await page.locator('.nf-tree').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await axeRun('topic tree');

    const block = activeEditor().locator('[data-block-card]').first();
    await block.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /Delete block/ }).click();
    await page.waitForSelector('.nf-dialog');
    await axeRun('delete dialog');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await quit();
  });

  it('measures the 300-block editor and the 1,000-block collapse report', async () => {
    await launch();
    const started = Date.now();
    await page.evaluate(() => window.__noteforestTest.seed('performance'));
    await page.waitForFunction(
      () => document.querySelectorAll('.nf-editor[data-active="true"] [data-block-card]').length >= 300,
      undefined,
      { timeout: 20000 },
    );
    const initialRenderMs = Date.now() - started;
    assert.ok(initialRenderMs < 1500, `initial render ${initialRenderMs} ms`);

    const scope = activeEditor();
    await scope.locator('[data-block-card] p').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type('x');
    await page.waitForTimeout(1000);
    for (let index = 0; index < 6; index += 1) {
      await page.keyboard.press('Meta+.');
      await page.waitForTimeout(250);
    }
    for (let index = 0; index < 4; index += 1) {
      await page.keyboard.press('Control+Enter');
      await page.waitForTimeout(500);
    }
    const perf = await page.evaluate(() => window.__noteforestTest.perf());
    const fullRebuildSamples = await page.evaluate(() => window.__noteforestTest.benchmarkReflow(6));
    assert.ok(perf.edge.p95 < 8, `edge routing p95 ${perf.edge.p95} ms`);
    assert.ok(perf.measure.p95 < 8, `measurement p95 ${perf.measure.p95} ms`);
    assert.ok(perf.reflow.p95 < 50, `structural reflow p95 ${perf.reflow.p95} ms`);

    const scroll = await page.evaluate(async () => {
      const scroller = document.querySelector('.nf-editor[data-active="true"] .nf-editor-scroll');
      if (scroller === null) return { fps: 0 };
      const frames = [];
      let last = performance.now();
      let running = true;
      const tick = (now) => {
        frames.push(now - last);
        last = now;
        if (running) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      for (let index = 0; index < 90; index += 1) {
        scroller.scrollTop += 48;
        await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
      }
      running = false;
      const average = frames.reduce((total, value) => total + value, 0) / Math.max(1, frames.length);
      return { fps: Math.round(1000 / average), averageFrameMs: average };
    });

    await quit();
    await launch();
    const thousandStarted = Date.now();
    await page.evaluate(() => window.__noteforestTest.seed('performance-1000'));
    await page.waitForFunction(
      () => document.querySelectorAll('.nf-editor[data-active="true"] [data-block-card]').length >= 1000,
      undefined,
      { timeout: 30000 },
    );
    const thousandRenderMs = Date.now() - thousandStarted;
    const thousandScope = activeEditor();
    await thousandScope.locator('[data-block-card] p').first().click();
    await page.keyboard.press('Meta+.');
    await page.waitForTimeout(800);
    const thousandCards = await thousandScope.locator('[data-block-card]:visible').count();
    const thousandPerf = await page.evaluate(() => window.__noteforestTest.perf());
    const thousandFullRebuildSamples = await page.evaluate(() => window.__noteforestTest.benchmarkReflow(4));

    const report = {
      measuredAt: new Date().toISOString(),
      initialRenderMs,
      thousandRenderMs,
      thousandVisibleCardsAfterCollapse: thousandCards,
      thousandPerf,
      fullRebuildSamples,
      thousandFullRebuildSamples,
      perf,
      scroll,
    };
    await writeFile(resolve(screenshotDir, 'performance.json'), `${JSON.stringify(report, null, 2)}\n`);
    await quit();
  });

  it('serializes rapid structural creation and keeps canvas, sidebar and arrows in parity', async () => {
    await launch({
      NOTEFOREST_LIBRARY: resolve(tempRoot, 'rapid-library'),
      NOTEFOREST_APP_SUPPORT: resolve(tempRoot, 'rapid-support'),
    });
    await page.waitForSelector('.nf-empty-state');
    await page.locator('.nf-empty-actions .nf-button-primary').click();
    await waitBlockCount(1);
    await page.keyboard.type('Root block');
    await waitSaved();

    // Three Control+Enter presses before the first IPC round-trip can finish.
    await rapidKeydowns('Enter', 3, { ctrlKey: true });
    await waitBlockCount(4);
    await page.waitForTimeout(900);
    const created = await parity();
    assert.equal(created.canvas, 4, 'four blocks in the canvas');
    assert.equal(created.sidebar, 4, 'four blocks in the sidebar');
    assert.equal(created.canonical, 4, 'four blocks in the canonical document');
    assert.equal(created.arrows, 3, 'three arrows for three children');
    assert.equal(created.trunks, 1, 'one shared trunk for three children');

    // Every created child is deletable; deleting each one keeps parity.
    for (let remaining = 3; remaining > 0; remaining -= 1) {
      const children = activeEditor().locator('[data-block-card][data-top-level="false"]');
      await page.waitForFunction(
        (expected) => document.querySelectorAll('.nf-editor[data-active="true"] [data-block-card][data-top-level="false"]').length === expected,
        remaining,
        { timeout: 10000 },
      );
      await children.last().click({ button: 'right' });
      await page.getByRole('menuitem', { name: /Delete block/ }).click();
      await page.getByRole('button', { name: 'Delete', exact: true }).click();
      await waitCanonicalBlockCount(remaining);
      await waitBlockCount(remaining);
      await page.waitForTimeout(200);
      const current = await parity();
      assert.equal(current.canvas, remaining, `canvas loses one block (${remaining} left)`);
      assert.equal(current.sidebar, remaining, 'sidebar stays in parity');
      assert.equal(current.canonical, remaining, 'canonical document stays in parity');
      assert.equal(current.arrows, remaining - 1, 'arrows stay in parity');
    }

    // Create, type, undo/redo text, and delete without an orphan.
    await activeEditor().locator('[data-block-card]').first().click();
    await page.keyboard.press('Control+Enter');
    await waitBlockCount(2);
    await page.keyboard.type('Undo me');
    await page.waitForTimeout(300);
    await page.keyboard.press('Meta+z');
    await page.waitForTimeout(300);
    await page.keyboard.press('Meta+Shift+z');
    await page.waitForTimeout(300);
    let afterUndo = await parity();
    assert.equal(afterUndo.canvas, afterUndo.canonical, 'undo/redo keeps the canonical count');
    await page.keyboard.press('Meta+z');
    await page.waitForTimeout(300);
    await page.keyboard.press('Meta+Shift+z');
    await page.waitForTimeout(300);
    afterUndo = await parity();
    assert.equal(afterUndo.sidebar, afterUndo.canvas, 'sidebar matches after undo/redo');
    await activeEditor().locator('[data-block-card][data-top-level="false"]').last().click({ button: 'right' });
    await page.getByRole('menuitem', { name: /Delete block/ }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.waitForTimeout(600);
    const final = await parity();
    assert.equal(final.canvas, 1);
    assert.equal(final.sidebar, 1);
    assert.equal(final.canonical, 1);
    assert.equal(final.arrows, 0);

    // Child + sibling in quick succession, then a tab round-trip.
    await activeEditor().locator('[data-block-card]').first().click();
    await rapidKeySequence([
      { key: 'Enter', options: { ctrlKey: true } },
      { key: 'Enter', options: { altKey: true } },
    ]);
    await waitBlockCount(3);
    await waitCanonicalBlockCount(3);
    await page.waitForTimeout(700);
    const quick = await parity();
    assert.deepEqual(
      { canvas: quick.canvas, sidebar: quick.sidebar, canonical: quick.canonical },
      { canvas: 3, sidebar: 3, canonical: 3 },
      'quick child + sibling stays in parity',
    );
    assert.ok(quick.arrows >= 1 && quick.arrows <= 2, 'the quick blocks keep their arrows');

    // A second document and a tab round-trip do not resurrect a phantom block.
    await page.keyboard.press('Meta+n');
    await page.waitForFunction(() => window.__noteforestTest.state().tabs.length === 2);
    await page.waitForTimeout(500);
    await page.keyboard.press('Meta+1');
    await page.waitForTimeout(500);
    const returned = await parity();
    assert.equal(returned.canvas, 3);
    assert.equal(returned.sidebar, 3);
    assert.equal(returned.canonical, 3);
    assert.deepEqual(pageErrors, [], `renderer errors: ${pageErrors.join('; ')}`);
    await quit();
  });

  it('applies the M2c keyboard, heading, chapter and landscape model', async () => {
    await launch({
      NOTEFOREST_LIBRARY: resolve(tempRoot, 'keyboard-library'),
      NOTEFOREST_APP_SUPPORT: resolve(tempRoot, 'keyboard-support'),
    });
    await page.locator('.nf-empty-actions .nf-button-primary').click();
    await waitBlockCount(1);
    const orientation = (await state()).runtimes[0]?.orientation;
    assert.equal(orientation, 'landscape', 'new documents default to A4 landscape');

    // Markdown heading, Enter escapes it inside the same block.
    await page.keyboard.type('# Quantum notes');
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-block-prose h1');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Body text');
    await page.waitForTimeout(200);
    assert.equal((await parity()).canvas, 1, 'Enter at the end of a heading stays in the block');
    assert.equal(await activeEditor().locator('.nf-block-prose h1').count(), 1);
    assert.equal(await activeEditor().locator('.nf-block-prose p').count(), 1);

    // Shift+Enter is a hard break.
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('second line');
    assert.equal(await activeEditor().locator('.nf-block-prose br').count(), 1, 'Shift+Enter inserts a hard break');

    // Option+Enter sibling, Control+Enter child.
    await page.keyboard.press('Alt+Enter');
    await waitBlockCount(2);
    await page.keyboard.press('Control+Enter');
    await waitBlockCount(3);
    await waitLayout();
    assert.equal(await activeEditor().locator('.nf-edge-path').count(), 1, 'the child key creates an arrow');

    // Tab in a normal paragraph never creates a child.
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    assert.equal((await parity()).canvas, 3, 'Tab in a paragraph does not create a block');
    const focusInEditor = await page.evaluate(() => {
      const active = document.activeElement;
      return active !== null && active.closest('.nf-prosemirror') !== null;
    });
    assert.equal(focusInEditor, true, 'Tab keeps focus in the editor');

    // Tab in a list is native indent, not a block.
    await page.keyboard.type('- first item');
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-block-prose ul');
    await page.keyboard.press('Enter');
    await page.keyboard.type('second item');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    assert.equal((await parity()).canvas, 3, 'Tab in a list does not create a block');
    assert.equal(await activeEditor().locator('.nf-block-prose ul ul').count(), 1, 'Tab nests the list item');

    // Palette block-type control can always escape a heading without changing
    // the block identity.
    const rootCard = activeEditor().locator('[data-block-card]').first();
    const rootId = await rootCard.getAttribute('data-block-card');
    await rootCard.locator('.nf-block-prose').first().click();
    assert.ok(rootId !== null);
    await waitSelected(rootId);
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('.nf-palette');
    await page.getByRole('option', { name: /Block type: Heading 2/ }).click();
    await page.waitForSelector('.nf-palette', { state: 'detached' });
    await page.waitForFunction(
      () => document.querySelectorAll('.nf-editor[data-active="true"] .nf-block-prose h2').length === 1,
      undefined,
      { timeout: 10000 },
    );
    assert.equal(await activeEditor().locator('.nf-block-prose h2').count(), 1);
    assert.equal(
      await activeEditor().locator(`[data-block-card="${rootId}"]`).count(),
      1,
      'heading change keeps the block ID',
    );
    // Let the palette finish restoring focus before the next global shortcut.
    await page.waitForTimeout(450);
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('.nf-palette');
    await page.getByRole('option', { name: /Block type: Text/ }).click();
    await page.waitForSelector('.nf-palette', { state: 'detached' });
    await page.waitForTimeout(400);
    assert.equal(await activeEditor().locator('.nf-block-prose h1, .nf-block-prose h2, .nf-block-prose h3').count(), 0);

    // Inline chapter title edit and sidebar sync.
    await page.locator('.nf-chapter-title').click();
    const chapterInput = page.locator('.nf-chapter-title-input');
    await chapterInput.fill('Linear systems');
    await chapterInput.press('Enter');
    await page.waitForTimeout(500);
    assert.equal(
      (await page.locator('.nf-tree-chapter-row .nf-tree-label').first().innerText()).trim(),
      'Linear systems',
      'sidebar chapter title follows the canvas edit',
    );

    // Add a top-level block to the selected chapter, from that chapter's row.
    const beforeTopLevel = (await parity()).canvas;
    const beforeChapters = (await activeRuntimeInfo()).chapterList;
    await page.locator('[data-chapter-add]').first().click();
    await page.waitForTimeout(700);
    assert.equal((await parity()).canvas, beforeTopLevel + 1, 'canvas adds a top-level block');
    const afterTopLevel = (await activeRuntimeInfo()).chapterList;
    assert.equal(
      afterTopLevel[0]?.blocks,
      (beforeChapters[0]?.blocks ?? 0) + 1,
      'the new block belongs to the chapter whose row was clicked',
    );

    // Add chapter: it is inserted after the active chapter and its title is focused.
    await page.locator('[data-canvas-action="add-chapter"]').click();
    await page.waitForFunction(
      () => document.querySelectorAll('.nf-tree-chapter-row').length === 2,
      undefined,
      { timeout: 10000 },
    );
    await page.waitForTimeout(700);
    const afterChapter = await parity();
    assert.equal(afterChapter.canvas, beforeTopLevel + 2, 'canvas adds a chapter with its first block');
    assert.equal(afterChapter.sidebar, afterChapter.canvas, 'sidebar follows canvas chapter creation');
    assert.equal(
      await page.evaluate(() => document.activeElement?.className),
      'nf-chapter-title-input',
      'the new chapter title is focused',
    );
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    assert.deepEqual(pageErrors, [], `renderer errors: ${pageErrors.join('; ')}`);
    await quit();
  });

  it('places children parent-relative and scrolls horizontally for deep branches', async () => {
    await launch({
      NOTEFOREST_LIBRARY: resolve(tempRoot, 'parent-relative-library'),
      NOTEFOREST_APP_SUPPORT: resolve(tempRoot, 'parent-relative-support'),
    });
    await setWindowSize(1440, 900);
    await page.locator('.nf-empty-actions .nf-button-primary').click();
    await waitBlockCount(1);

    // 4-level empty chain: top → f → ff → fff.
    for (let index = 0; index < 3; index += 1) {
      await page.keyboard.press('Control+Enter');
      await page.waitForTimeout(500);
    }
    await waitLayout();
    const four = await layoutSnapshot();
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
    await page.screenshot({ path: resolve(screenshotDir, 'four-level-1440x900.png') });
    resizeScreenshot(resolve(screenshotDir, 'four-level-1440x900.png'), 1440, 900);

    // A second, wider parent places its child at its own right edge, not on a
    // shared depth-1 column.
    await page.locator('[data-chapter-add]').first().click();
    await waitLayout();
    await page.keyboard.type(
      'A wide top-level block whose content deliberately makes this card much wider than the empty chain minimum width.',
    );
    await waitLayout();
    await page.keyboard.press('Control+Enter');
    await waitLayout();
    await page.keyboard.type('Parent-relative child');
    await waitLayout();
    const withSecondParent = await layoutSnapshot();
    const secondParent = withSecondParent.cards.find((card) => card.depth === 0 && card.text.includes('wide top-level'));
    const secondChild = withSecondParent.cards.find((card) => card.depth === 1 && card.text.includes('Parent-relative child'));
    const firstChild = withSecondParent.cards.find((card) => card.depth === 1 && card.id !== secondChild?.id);
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
    const deepCard = activeEditor().locator('[data-depth="3"]').first();
    const deepId = await deepCard.getAttribute('data-block-card');
    await deepCard.click();
    assert.ok(deepId !== null);
    await waitSelected(deepId);
    for (let index = 0; index < 4; index += 1) {
      await page.keyboard.press('Control+Enter');
      await page.waitForTimeout(500);
    }
    await waitLayout();
    const deep = await layoutSnapshot();
    assert.equal(deep.depths.at(-1)?.depth, 7);
    assert.deepEqual(
      deep.depths.map((depth) => depth.xs[0]),
      [0, 176, 336, 496, 656, 816, 976, 1136],
      'each level follows the previous card right edge + 16 px',
    );
    assert.ok(deep.overflow > 0, `deep parent-relative chain overflows at 1440 (overflow ${deep.overflow})`);
    await activeEditor()
      .locator('.nf-editor-scroll')
      .evaluate((element) => {
        element.scrollLeft = 320;
      });
    await page.waitForTimeout(400);
    const scrolled = await layoutSnapshot();
    assert.ok(scrolled.scrollLeft > 0, 'the editor scrolls horizontally');
    await page.screenshot({ path: resolve(screenshotDir, 'deep-branch-scroll-1440x900.png') });
    resizeScreenshot(resolve(screenshotDir, 'deep-branch-scroll-1440x900.png'), 1440, 900);
    await quit();
  });

  it('swaps the add-child and collapse controls without changing card height', async () => {
    await launch({
      NOTEFOREST_LIBRARY: resolve(tempRoot, 'controls-library'),
      NOTEFOREST_APP_SUPPORT: resolve(tempRoot, 'controls-support'),
    });
    await setWindowSize(1440, 900);
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await waitSaved();

    const rootCard = activeEditor().locator('[data-block-card][data-top-level="true"]').first();
    await rootCard.hover();
    await waitLayout();
    const cardBox = await rootCard.boundingBox();
    const addBox = await rootCard.locator('[data-add-child]').boundingBox();
    const portBox = await rootCard.locator('[data-branch-port]').boundingBox();
    const siblingBox = await rootCard.locator('[data-add-sibling]').boundingBox();
    const handleBox = await rootCard.locator('.nf-gutter-handle').boundingBox();
    assert.ok(cardBox !== null && addBox !== null && portBox !== null && siblingBox !== null && handleBox !== null);

    assert.ok(
      Math.abs(addBox.x + addBox.width / 2 - (cardBox.x + cardBox.width)) < 1.5,
      'add-child sits at the right edge',
    );
    assert.ok(
      Math.abs(addBox.y + addBox.height / 2 - (cardBox.y + cardBox.height / 2)) < 1.5,
      'add-child sits at the vertical center',
    );
    assert.ok(
      Math.abs(portBox.x + portBox.width / 2 - (cardBox.x + cardBox.width)) < 1.5,
      'collapse sits at the right edge too',
    );
    assert.ok(portBox.y < addBox.y, 'collapse is top-right, above the add-child button');
    assert.ok(
      portBox.y + portBox.height <= addBox.y ||
        addBox.y + addBox.height <= portBox.y ||
        portBox.x + portBox.width <= addBox.x ||
        addBox.x + addBox.width <= portBox.x,
      'collapse and add-child do not overlap',
    );
    assert.ok(
      Math.abs(siblingBox.x + siblingBox.width / 2 - (cardBox.x + cardBox.width / 2)) < 1.5,
      'add-sibling stays at the bottom edge center',
    );
    assert.ok(
      Math.abs(siblingBox.y + siblingBox.height / 2 - (cardBox.y + cardBox.height)) < 1.5,
      'add-sibling straddles the bottom edge',
    );
    assert.ok(handleBox.x < cardBox.x, 'drag handle stays in the left gutter');

    // Collapse: no footer, no height change, dot + count, aria-expanded.
    const heightBefore = cardBox.height;
    await rootCard.locator('[data-branch-port]').click();
    await waitLayout();
    const heightCollapsed = (await rootCard.boundingBox())?.height ?? 0;
    assert.ok(Math.abs(heightCollapsed - heightBefore) < 0.5, 'collapse adds no card height');
    assert.equal(await activeEditor().locator('.nf-block-meta').count(), 0, 'no in-flow collapse footer');
    assert.equal(await rootCard.locator('[data-branch-port]').getAttribute('aria-expanded'), 'false');
    assert.equal((await rootCard.locator('.nf-port-dot').innerText()).trim(), '2');
    assert.equal(await activeEditor().locator('.nf-edge-path').count(), 0, 'children and edges hidden');
    await page.screenshot({ path: resolve(screenshotDir, 'controls-1440x900.png') });
    resizeScreenshot(resolve(screenshotDir, 'controls-1440x900.png'), 1440, 900);
    await rootCard.locator('[data-branch-port]').click();
    await waitLayout();
    assert.equal(await rootCard.locator('[data-branch-port]').getAttribute('aria-expanded'), 'true');
    await quit();
  });

  it('zooms, fits width, and focuses a branch without touching the document', async () => {
    await launch({
      NOTEFOREST_LIBRARY: resolve(tempRoot, 'view-library'),
      NOTEFOREST_APP_SUPPORT: resolve(tempRoot, 'view-support'),
    });
    await setWindowSize(1440, 900);
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await waitSaved();

    const zoomLabel = page.locator('.nf-status-zoom');
    assert.equal((await zoomLabel.innerText()).trim(), '100%');
    await page.keyboard.press('Meta+-');
    await page.waitForTimeout(250);
    assert.equal((await zoomLabel.innerText()).trim(), '90%');
    await page.keyboard.press('Meta+=');
    await page.waitForTimeout(250);
    assert.equal((await zoomLabel.innerText()).trim(), '100%');
    await page.keyboard.press('Meta+=');
    await page.waitForTimeout(250);
    assert.equal((await zoomLabel.innerText()).trim(), '110%');
    await page.keyboard.press('Meta+0');
    await page.waitForTimeout(250);
    assert.equal((await zoomLabel.innerText()).trim(), '100%');

    // Focus the root: its ancestor chain (just itself) and all descendants stay;
    // the other top-level branches hide. The canonical document is unchanged.
    const before = await page.evaluate(() => {
      const current = window.__noteforestTest.state();
      const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
      const visible = (element) => element.getClientRects().length > 0;
      return {
        blockIds: runtime.blockIds,
        visible: [...document.querySelectorAll('.nf-editor[data-active="true"] [data-block-card]')].filter(visible).length,
      };
    });
    const rootCard = activeEditor().locator('[data-block-card][data-top-level="true"]').first();
    await rootCard.locator('.nf-block-prose').first().click();
    await page.waitForTimeout(300);
    const focusButton = page.locator('.nf-status-focus');
    assert.equal(await focusButton.getAttribute('aria-pressed'), 'false');
    await focusButton.click();
    await waitLayout();
    assert.equal(await focusButton.getAttribute('aria-pressed'), 'true');
    const focused = await page.evaluate(() => {
      const current = window.__noteforestTest.state();
      const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
      const visible = (element) => element.getClientRects().length > 0;
      return {
        blockIds: runtime.blockIds,
        visible: [...document.querySelectorAll('.nf-editor[data-active="true"] [data-block-card]')].filter(visible).length,
        topLevelVisible: [...document.querySelectorAll('.nf-editor[data-active="true"] [data-block-card][data-top-level="true"]')].filter(visible).length,
        arrows: document.querySelectorAll('.nf-editor[data-active="true"] .nf-edge-path').length,
      };
    });
    assert.equal(focused.visible, 4, 'root + two children + one grandchild stay visible');
    assert.equal(focused.topLevelVisible, 1, 'other top-level branches hide');
    assert.equal(focused.arrows, 3, 'focus keeps the branch arrows');
    assert.deepEqual(focused.blockIds, before.blockIds, 'Focus branch does not delete blocks');
    await page.screenshot({ path: resolve(screenshotDir, 'focus-branch-1440x900.png') });
    resizeScreenshot(resolve(screenshotDir, 'focus-branch-1440x900.png'), 1440, 900);

    // Fit width works on the focused branch, not just the whole document.
    await page.locator('.nf-status-view').getByRole('button', { name: 'Fit', exact: true }).click();
    await waitLayout();
    const branchFit = await layoutSnapshot();
    assert.ok(branchFit.zoom < 100, `Fit width fits the focused branch (${branchFit.zoom}%)`);
    assert.ok(branchFit.overflow <= 1, `focused branch fits without horizontal scroll (${branchFit.overflow})`);
    assert.equal(await activeEditor().locator('.nf-edge-defect').count(), 0, 'zoom does not flag edge defects');

    await focusButton.click();
    await waitLayout();
    assert.equal(await focusButton.getAttribute('aria-pressed'), 'false');
    assert.equal(
      await activeEditor().locator('[data-block-card]:visible').count(),
      before.visible,
      'exiting focus restores the whole document',
    );

    // A deep block keeps its ancestor chain (root → parent → selected) and its
    // own descendants; sibling branches at any ancestor are hidden.
    await activeEditor()
      .locator('[data-block-card]', { hasText: 'Characteristic polynomial' })
      .first()
      .click();
    await page.waitForTimeout(300);
    await focusButton.click();
    await waitLayout();
    const ancestors = await page.evaluate(() => {
      const scope = document.querySelector('.nf-editor[data-active="true"]');
      const visible = (element) => element.getClientRects().length > 0;
      return {
        visible: [...scope.querySelectorAll('[data-block-card]')].filter(visible).length,
        topLevelVisible: [...scope.querySelectorAll('[data-block-card][data-top-level="true"]')].filter(visible).length,
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
    await page.screenshot({ path: resolve(screenshotDir, 'focus-ancestors-1440x900.png') });
    resizeScreenshot(resolve(screenshotDir, 'focus-ancestors-1440x900.png'), 1440, 900);
    await focusButton.click();
    await waitLayout();

    // Fit width at 1024 with the full document: zoom drops below 100% and the
    // editor no longer needs horizontal scroll.
    await setWindowSize(1024, 768);
    await waitLayout();
    const beforeFit = await layoutSnapshot();
    assert.ok(beforeFit.overflow > 0, 'the full demo overflows at 1024 before Fit');
    await page.locator('.nf-status-view').getByRole('button', { name: 'Fit', exact: true }).click();
    await waitLayout();
    const afterFit = await layoutSnapshot();
    assert.ok(afterFit.zoom < 100, `Fit width zooms out (${afterFit.zoom}%)`);
    assert.ok(afterFit.overflow <= 1, `Fit width removes horizontal overflow (${afterFit.overflow})`);
    assert.equal(await activeEditor().locator('.nf-edge-defect').count(), 0, 'fit zoom keeps valid arrows');
    await page.screenshot({ path: resolve(screenshotDir, 'fit-width-1024x768.png') });
    resizeScreenshot(resolve(screenshotDir, 'fit-width-1024x768.png'), 1024, 768);
    await page.keyboard.press('Meta+0');
    await page.waitForTimeout(300);
    assert.equal((await zoomLabel.innerText()).trim(), '100%');
    await quit();
  });

  it('keeps the trunk continuous and Backspace non-destructive', async () => {
    await launch({
      NOTEFOREST_LIBRARY: resolve(tempRoot, 'trunk-library'),
      NOTEFOREST_APP_SUPPORT: resolve(tempRoot, 'trunk-support'),
    });
    await setWindowSize(1440, 900);
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await waitSaved();

    const rootCard = activeEditor().locator('[data-block-card][data-top-level="true"]').first();
    await rootCard.hover();
    await rootCard.locator('[data-add-child]').click();
    await page.waitForTimeout(600);
    await page.keyboard.type('Third child');
    await waitLayout();

    const trunk = await trunkSnapshot();
    assert.ok(trunk !== null, 'trunk geometry available');
    assert.equal(trunk.trunkCount, 1, 'one shared trunk for three children');
    assert.equal(trunk.edgeStart.x, trunk.parentRight, 'the first branch starts at the parent port');
    assert.ok(Math.abs(trunk.edgeStart.y - trunk.parentCenterY) < 1, 'at the parent branch port');
    const junction = trunk.trunkPairs[0];
    assert.ok(junction !== undefined, 'the trunk has a start point');
    assert.ok(
      trunk.edgePairs.some(
        (point) => Math.abs(point.x - junction.x) < 0.2 && Math.abs(point.y - junction.y) < 0.2,
      ),
      'the first branch path passes through the trunk junction',
    );
    assert.ok(Math.abs(junction.y - trunk.childCenterY) < 1.5, 'the trunk starts at the T-junction');
    assert.ok(junction.x > trunk.parentRight && junction.x < trunk.childLeft);
    const edgeEnd = trunk.edgePairs.at(-1);
    assert.ok(edgeEnd !== undefined);
    assert.ok(edgeEnd.x < trunk.childLeft, 'the arrowhead stops before the child');
    assert.ok(Math.abs(edgeEnd.y - trunk.childCenterY) < 1.5, 'the arrow enters at the child side');

    // Plain Backspace on an empty child keeps it and moves the caret up.
    const workedCard = activeEditor().locator('[data-block-card]', { hasText: 'Worked example' }).first();
    const workedId = await workedCard.getAttribute('data-block-card');
    await workedCard.click();
    const before = (await activeRuntimeInfo()).blocks;
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(700);
    const childId = (await activeRuntimeInfo()).selectedBlockId;
    assert.ok(childId !== null && childId !== workedId, 'the new child block is focused');
    assert.equal((await activeRuntimeInfo()).blocks, before + 1);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(700);
    assert.equal((await activeRuntimeInfo()).blocks, before + 1, 'Backspace never deletes an empty block');
    assert.equal((await activeRuntimeInfo()).selectedBlockId, workedId, 'the caret moves to the previous block');

    // Cmd+Backspace is the destructive path.
    await activeEditor().locator(`[data-block-card="${childId}"]`).click();
    await page.waitForTimeout(300);
    assert.equal(
      (await activeRuntimeInfo()).selectedBlockId,
      childId,
      'clicking the empty child selects it before deleting',
    );
    await page.keyboard.press('Meta+Backspace');
    await page.waitForTimeout(900);
    assert.equal((await activeRuntimeInfo()).blocks, before, 'Cmd+Backspace deletes the block');
    assert.equal(await activeEditor().locator(`[data-block-card="${childId}"]`).count(), 0);

    // Backspace inside a table cell edits text, never the cell or the block.
    const table = activeEditor().locator('.nf-block-prose table').first();
    const rows = await table.locator('tr').count();
    const cells = await table.locator('td, th').count();
    const beforeTable = (await activeRuntimeInfo()).blocks;
    await table.locator('td').first().click();
    await page.keyboard.press('End');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(700);
    assert.equal(
      (await activeRuntimeInfo()).blocks,
      beforeTable,
      'Backspace in a table cell never deletes the block',
    );
    assert.equal(await activeEditor().locator('.nf-block-prose table').count(), 1);
    assert.equal(await activeEditor().locator('.nf-block-prose table tr').count(), rows);
    assert.equal(await activeEditor().locator('.nf-block-prose table td, .nf-block-prose table th').count(), cells);
    await quit();
  });

  it('adds top-level blocks to the selected chapter and chapters after the active one', async () => {
    await launch({
      NOTEFOREST_LIBRARY: resolve(tempRoot, 'chapters-library'),
      NOTEFOREST_APP_SUPPORT: resolve(tempRoot, 'chapters-support'),
    });
    await setWindowSize(1440, 900);
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await waitSaved();

    const initial = (await activeRuntimeInfo()).chapterList;
    assert.equal(initial.length, 1);
    const firstChapterId = initial[0].id;
    const firstBlocks = initial[0].blocks;

    // Append a second chapter; its title is focused.
    await page.locator('[data-canvas-action="add-chapter"]').click();
    await page.waitForFunction(
      () => document.querySelectorAll('.nf-tree-chapter-row').length === 2,
      undefined,
      { timeout: 10000 },
    );
    await waitLayout();
    assert.equal(
      await page.evaluate(() => document.activeElement?.className),
      'nf-chapter-title-input',
      'the new chapter title is focused',
    );
    await page.keyboard.press('Escape');
    await waitLayout();
    const two = (await activeRuntimeInfo()).chapterList;
    assert.equal(two.length, 2);
    const lastChapterId = two[1].id;

    // Select a block in chapter 1 and add a top-level block from that
    // chapter's row: it must not go to the last chapter.
    await activeEditor().locator('[data-block-card]').first().click();
    await page.locator(`[data-chapter-add="${firstChapterId}"]`).click();
    await waitLayout();
    const afterBlock = (await activeRuntimeInfo()).chapterList;
    assert.equal(afterBlock[0].blocks, firstBlocks + 1, 'the block joins the selected chapter');
    assert.equal(afterBlock[1].blocks, two[1].blocks, 'the other chapter is untouched');

    // "Add chapter" inserts after the active chapter, not at the end.
    await page.locator('[data-canvas-action="add-chapter"]').click();
    await page.waitForFunction(
      () => {
        const current = window.__noteforestTest.state();
        const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
        return (runtime?.chapters ?? 0) === 3;
      },
      undefined,
      { timeout: 10000 },
    );
    await waitLayout();
    const three = (await activeRuntimeInfo()).chapterList;
    assert.equal(three.length, 3);
    assert.equal(three[0].id, firstChapterId);
    assert.equal(three[2].id, lastChapterId, 'the existing last chapter stays last');
    assert.notEqual(three[1].id, lastChapterId, 'the new chapter sits after the active chapter');
    const focusedChapter = await page.evaluate(
      () => document.activeElement?.closest('[data-chapter-id]')?.getAttribute('data-chapter-id') ?? null,
    );
    assert.equal(focusedChapter, three[1].id, 'the new chapter title is focused');
    await page.keyboard.press('Escape');
    await quit();
  });

  it('captures the required screenshots', async () => {
    const shotsRoot = resolve(tempRoot, 'screenshots');
    await rm(shotsRoot, { recursive: true, force: true });
    await mkdir(shotsRoot, { recursive: true });
    await launch({
      NOTEFOREST_LIBRARY: resolve(shotsRoot, 'library'),
      NOTEFOREST_APP_SUPPORT: resolve(shotsRoot, 'support'),
    });
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.setSize(1440, 900);
      window.center();
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(screenshotDir, 'empty-1440x900.png') });

    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await waitSaved();

    // Give the first top-level block a third child so the shared trunk is visible.
    const rootCard = activeEditor().locator('[data-block-card][data-top-level="true"]').first();
    await rootCard.hover();
    await rootCard.locator('[data-add-child]').click();
    await page.waitForTimeout(600);
    await page.keyboard.type('Third child');
    await waitSaved();
    const rootId = await rootCard.getAttribute('data-block-card');
    assert.equal(
      await activeEditor().locator(`.nf-edge-trunk[data-parent-id="${rootId}"]`).count(),
      1,
      'one shared trunk for three children',
    );
    await page.screenshot({ path: resolve(screenshotDir, 'trunk-3-children-1440x900.png') });
    await page.screenshot({ path: resolve(screenshotDir, 'density-1440x900.png') });
    await page.screenshot({ path: resolve(screenshotDir, 'chosen-arrows-1440x900.png') });

    // Collapse costs no height and leaves a dot with the child count.
    await rootCard.hover();
    await rootCard.locator('[data-branch-port]').click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: resolve(screenshotDir, 'collapse-dot-1440x900.png') });
    await rootCard.locator('[data-branch-port]').click();
    await page.waitForTimeout(700);

    // A second document so the shell reads as a real session.
    await page.locator('.nf-new-note').click();
    await page.waitForTimeout(900);
    await page.locator('.nf-document-title').click();
    await page.locator('.nf-dialog').getByRole('textbox', { name: 'Name' }).fill('Reading notes');
    await page.locator('.nf-dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(700);
    await page.keyboard.type('A second note with its own blocks.');
    await waitSaved();
    await page.keyboard.press('Meta+1');
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(screenshotDir, 'shell-1440x900.png') });

    await page.keyboard.press('Meta+k');
    await page.waitForSelector('.nf-palette');
    await page.waitForTimeout(250);
    await page.screenshot({ path: resolve(screenshotDir, 'palette-1440x900.png') });
    await page.keyboard.press('Escape');

    // Select a deep block to light the active path.
    await activeEditor()
      .locator('[data-block-card]', { hasText: 'Characteristic polynomial' })
      .first()
      .click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(screenshotDir, 'selected-path-1440x900.png') });

    // Inline chapter title editing.
    await page.locator('.nf-chapter-title').first().click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: resolve(screenshotDir, 'chapter-inline-1440x900.png') });
    await page.locator('.nf-chapter-title-input').press('Escape');

    await page.keyboard.press('Meta+2');
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(screenshotDir, 'two-tabs-1440x900.png') });

    // Return to the document and align the horizontal scroll for the 1024 shot.
    await page.keyboard.press('Meta+1');
    await page.waitForTimeout(600);
    await activeEditor()
      .locator('.nf-editor-scroll')
      .evaluate((element) => {
        element.scrollLeft = 0;
      });
    await page.waitForTimeout(300);
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.setSize(1024, 768);
      window.center();
    });
    await page.waitForTimeout(700);
    await page.screenshot({ path: resolve(screenshotDir, 'shell-1024x768.png') });
    await activeEditor()
      .locator('.nf-editor-scroll')
      .evaluate((element) => {
        element.scrollLeft = 0;
      });
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(screenshotDir, 'trunk-3-children-1024x768.png') });
    await page.screenshot({ path: resolve(screenshotDir, 'chosen-arrows-1024x768.png') });
    for (const file of [
      'empty-1440x900.png',
      'shell-1440x900.png',
      'palette-1440x900.png',
      'selected-path-1440x900.png',
      'two-tabs-1440x900.png',
      'trunk-3-children-1440x900.png',
      'density-1440x900.png',
      'chosen-arrows-1440x900.png',
      'collapse-dot-1440x900.png',
      'chapter-inline-1440x900.png',
    ]) {
      resizeScreenshot(resolve(screenshotDir, file), 1440, 900);
    }
    for (const file of [
      'shell-1024x768.png',
      'trunk-3-children-1024x768.png',
      'chosen-arrows-1024x768.png',
    ]) {
      resizeScreenshot(resolve(screenshotDir, file), 1024, 768);
    }
    await quit();
  });
});
