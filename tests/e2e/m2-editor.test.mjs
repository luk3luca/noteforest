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
const tempRoot = resolve(root, 'artifacts/m2c-tmp');
const screenshotDir = resolve(root, 'artifacts/m2c');
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
      const path = group?.querySelector('path');
      const childId = group?.getAttribute('data-child-id');
      const child = childId === null || childId === undefined ? null : root.querySelector(`[data-block-card="${childId}"]`);
      const parentId = group?.getAttribute('data-parent-id');
      const parent = parentId === null || parentId === undefined ? null : root.querySelector(`[data-block-card="${parentId}"]`);
      if (path === null || child === null || parent === null) return null;
      const numbers = (path.getAttribute('d') ?? '')
        .split(/[^0-9.-]+/)
        .filter((part) => part.length > 0)
        .map(Number);
      const endX = numbers.at(-2) ?? 0;
      const endY = numbers.at(-1) ?? 0;
      const childRect = child.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      return {
        endX,
        endY,
        childLeft: childRect.left - rootRect.left,
        childCenterY: childRect.top - rootRect.top + childRect.height / 2,
        parentRight: parentRect.right - rootRect.left,
        marker: path.getAttribute('marker-end'),
      };
    });
    assert.ok(edgeCheck !== null, 'edge measurements available');
    assert.ok(edgeCheck.parentRight < edgeCheck.endX, 'arrow travels forward to the child');
    assert.ok(edgeCheck.endX < edgeCheck.childLeft, 'arrowhead stops before the child card');
    assert.ok(Math.abs(edgeCheck.endY - edgeCheck.childCenterY) < 2, 'arrow enters the child side');
    assert.match(edgeCheck.marker ?? '', /arrow/);

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

    // Collapse the root branch: its subtree and arrows disappear.
    const rootCard = scope.locator('[data-block-card][data-top-level="true"]').first();
    await rootCard.hover();
    await rootCard.locator('.nf-collapse').click();
    await page.waitForTimeout(700);
    assert.equal(await scope.locator('.nf-edge-path').count(), 0, 'collapsed subtree edges hidden');
    assert.equal(await scope.locator('[data-block-card]:visible').count(), 4);
    await rootCard.locator('.nf-collapse').click();
    await page.waitForTimeout(700);
    assert.equal(await scope.locator('.nf-edge-path').count(), 3);
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
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('.nf-palette');
    await page.getByRole('option', { name: /Block type: Heading 2/ }).click();
    await page.waitForTimeout(400);
    assert.equal(await activeEditor().locator('.nf-block-prose h2').count(), 1);
    assert.equal(
      await activeEditor().locator(`[data-block-card="${rootId}"]`).count(),
      1,
      'heading change keeps the block ID',
    );
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('.nf-palette');
    await page.getByRole('option', { name: /Block type: Text/ }).click();
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

    // Add top-level block and chapter from the canvas.
    const beforeTopLevel = (await parity()).canvas;
    await page.locator('[data-canvas-action="add-top-level"]').click();
    await page.waitForTimeout(600);
    assert.equal((await parity()).canvas, beforeTopLevel + 1, 'canvas adds a top-level block');
    await page.locator('[data-canvas-action="add-chapter"]').click();
    await page.waitForFunction(
      () => document.querySelectorAll('.nf-tree-chapter-row').length === 2,
      undefined,
      { timeout: 10000 },
    );
    await page.waitForTimeout(400);
    const afterChapter = await parity();
    assert.equal(afterChapter.canvas, beforeTopLevel + 2, 'canvas adds a chapter with its first block');
    assert.equal(afterChapter.sidebar, afterChapter.canvas, 'sidebar follows canvas chapter creation');
    assert.deepEqual(pageErrors, [], `renderer errors: ${pageErrors.join('; ')}`);
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

    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.setSize(1024, 768);
      window.center();
    });
    await page.waitForTimeout(700);
    await page.screenshot({ path: resolve(screenshotDir, 'shell-1024x768.png') });
    await page.keyboard.press('Meta+1');
    await page.waitForTimeout(600);
    await page.screenshot({ path: resolve(screenshotDir, 'trunk-3-children-1024x768.png') });
    for (const file of [
      'empty-1440x900.png',
      'shell-1440x900.png',
      'palette-1440x900.png',
      'selected-path-1440x900.png',
      'two-tabs-1440x900.png',
      'trunk-3-children-1440x900.png',
      'density-1440x900.png',
      'chapter-inline-1440x900.png',
    ]) {
      resizeScreenshot(resolve(screenshotDir, file), 1440, 900);
    }
    for (const file of ['shell-1024x768.png', 'trunk-3-children-1024x768.png']) {
      resizeScreenshot(resolve(screenshotDir, file), 1024, 768);
    }
    await quit();
  });
});
