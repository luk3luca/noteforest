import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  appDir,
  artifactsPath,
  axePath,
  createHarness,
  delay,
  waitUntil,
} from '../support/harness.mjs';

const tempRoot = artifactsPath('m2e-tmp');
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

async function waitTabCount(count) {
  await page.waitForFunction(
    (expected) => window.__noteforestTest.state().tabs.length === expected,
    count,
    { timeout: 10000 },
  );
}

/** The Outline tab is not the default sidebar surface (L1). */
async function showOutline() {
  await page.locator('[data-sidebar-tab="outline"]').click();
  await page.waitForSelector('[data-sidebar-panel="outline"]');
}

async function waitActiveTab(packagePath) {
  await page.waitForFunction(
    (expected) => window.__noteforestTest.state().activeTab === expected,
    packagePath,
    { timeout: 10000 },
  );
}

async function waitZoomLabel(label) {
  await page.waitForFunction(
    (expected) => document.querySelector('[data-zoom-value]')?.textContent?.trim() === expected,
    label,
    { timeout: 10000 },
  );
}

async function waitFocusRestored() {
  await page.waitForFunction(
    () => document.activeElement?.closest('.nf-prosemirror') !== null,
    undefined,
    { timeout: 10000 },
  );
}

async function waitWindowCount(count) {
  await waitUntil(
    async () =>
      (await h.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)) === count,
    `${count} window(s)`,
  );
}

async function closeMainWindow() {
  await h.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.close();
  });
}

async function waitProcessExit() {
  const child = h.app.process();
  await waitUntil(
    () => child.exitCode !== null || child.signalCode !== null,
    'app process exit',
    10000,
  );
}

async function createDocumentWithText(value) {
  await page.waitForSelector('.nf-empty-state');
  await page.locator('.nf-empty-actions .nf-button-primary').click();
  await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
  await h.waitBlockCount(1);
  await page.keyboard.type(value);
  await h.waitEditorText(value);
  await h.waitNativeEdited(true);
}

/**
 * Replace the native close/quit dialog with a controllable one so the timeout
 * and error paths can be exercised without a human. Every call is recorded, and
 * the test resolves it explicitly (0 = Retry, 1 = Cancel).
 */
async function mockCloseDialogs() {
  await h.app.evaluate(({ dialog }) => {
    globalThis.__nfCloseDialogs = [];
    globalThis.__nfCloseDialogResolvers = [];
    dialog.showMessageBox = (_window, options) => {
      globalThis.__nfCloseDialogs.push(options);
      return new Promise((resolve) => {
        globalThis.__nfCloseDialogResolvers.push(resolve);
      });
    };
  });
}

async function waitCloseDialog() {
  await waitUntil(
    async () => (await h.app.evaluate(() => globalThis.__nfCloseDialogs?.length ?? 0)) > 0,
    'native close dialog',
  );
  return h.app.evaluate(() => globalThis.__nfCloseDialogs.at(-1));
}

async function answerCloseDialog(response) {
  await h.app.evaluate((_electron, choice) => {
    const resolve = globalThis.__nfCloseDialogResolvers.shift();
    if (resolve === undefined) throw new Error('no pending close dialog');
    resolve({ response: choice, checkboxChecked: false });
  }, response);
}

/** Make the package folder read-only so the atomic save fails with EACCES. */
async function setPackageWritable(packagePath, writable) {
  await chmod(packagePath, writable ? 0o755 : 0o555);
}

async function activeSaveInfo() {
  return page.evaluate(() => {
    const current = window.__noteforestTest.state();
    return current.runtimes.find((item) => item.packagePath === current.activeTab) ?? null;
  });
}

async function waitSaveFailure(code) {
  await page.waitForFunction(
    (expected) => {
      const current = window.__noteforestTest.state();
      const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
      return (
        runtime?.saveState === 'error' &&
        (expected === undefined || runtime.saveFailure?.code === expected)
      );
    },
    code,
    { timeout: 10000 },
  );
}

async function waitSaveAttempts(count) {
  await page.waitForFunction(
    (expected) => {
      const current = window.__noteforestTest.state();
      const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
      return (runtime?.saveFailure?.attempt ?? 0) >= expected;
    },
    count,
    { timeout: 12000 },
  );
}

async function mockSaveCopyDialog(filePath) {
  await h.app.evaluate(({ dialog }, target) => {
    globalThis.__nfSaveDialogs = [];
    dialog.showSaveDialog = async (_window, options) => {
      globalThis.__nfSaveDialogs.push(options);
      return { canceled: false, filePath: target };
    };
  }, filePath);
}

/** Click a native application-menu item by ID through its real IPC path. */
async function invokeAppMenu(id) {
  await h.app.evaluate(
    ({ Menu, BrowserWindow }, menuId) => {
      const item = Menu.getApplicationMenu()?.getMenuItemById(menuId);
      if (item === null || item === undefined) throw new Error(`missing menu item ${menuId}`);
      item.click(item, BrowserWindow.getAllWindows()[0], undefined);
    },
    id,
  );
}

/** Wait for the active runtime's undo/redo routing state. */
async function waitHistoryState(expected) {
  await page.waitForFunction(
    (want) => {
      const current = window.__noteforestTest.state();
      const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
      if (runtime === undefined) return false;
      return Object.entries(want).every(([key, value]) => runtime[key] === value);
    },
    expected,
    { timeout: 10000 },
  );
}

/** Block ID whose own body (not descendants) contains the given text. */
async function blockIdWithText(text) {
  return page.evaluate((needle) => {
    const current = window.__noteforestTest.state();
    const entry = window.__noteforestTest
      .editorJson()
      .find((item) => item.packagePath === current.activeTab);
    const textOf = (node) => {
      if (node.type === 'text') return node.text ?? '';
      return (node.content ?? []).map(textOf).join('');
    };
    const walk = (node) => {
      if (node.type === 'branchBlock') {
        const body = node.content?.[0];
        if (body !== undefined && textOf(body).includes(needle)) {
          return node.attrs.blockId;
        }
        for (const child of node.content?.[1]?.content ?? []) {
          const found = walk(child);
          if (found !== null) return found;
        }
        return null;
      }
      for (const child of node.content ?? []) {
        const found = walk(child);
        if (found !== null) return found;
      }
      return null;
    };
    return walk(entry.json);
  }, text);
}

function blockCard(blockId) {
  return h.activeEditor().locator(`[data-block-card="${blockId}"]`);
}

async function focusBlockEnd(text) {
  const id = await blockIdWithText(text);
  assert.ok(id !== null, `no block contains ${text}`);
  await blockCard(id).locator('.nf-block-prose').first().click();
  await page.keyboard.press('End');
  await h.waitSelected(id);
  return id;
}

/** Canonical structure that destructive undo must restore exactly. */
function storedStructure(document) {
  return {
    blocks: document.blocks,
    branches: document.branches,
    chapters: document.chapters,
    anchors: document.anchors,
  };
}

/** Delete one block through the real context menu and confirmation dialog. */
async function deleteBlockThroughDialog(text, mode = 'promote') {
  const id = await blockIdWithText(text);
  assert.ok(id !== null, `no block contains ${text}`);
  await blockCard(id).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Delete block/ }).click();
  if (mode === 'delete-subtree') {
    await page.getByRole('radio', { name: /Delete the whole subtree/ }).check();
  }
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  return id;
}

async function detachBlockThroughMenu(text) {
  const id = await blockIdWithText(text);
  assert.ok(id !== null, `no block contains ${text}`);
  await blockCard(id).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Detach from parent' }).click();
  return id;
}

/** Move a child one level up through the real block context menu. */
async function outdentBlockThroughMenu(text) {
  const id = await blockIdWithText(text);
  assert.ok(id !== null, `no block contains ${text}`);
  await blockCard(id).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Outdent' }).click();
  return id;
}

/** Move a block under an existing parent through the real "Move to…" dialog. */
async function moveBlockThroughDialog(text, parentTitle) {
  const id = await blockIdWithText(text);
  assert.ok(id !== null, `no block contains ${text}`);
  await blockCard(id).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move to…' }).click();
  await page.waitForSelector('.nf-dialog');
  await page.getByRole('option', { name: parentTitle }).click();
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await page.waitForSelector('.nf-dialog', { state: 'detached' });
  return id;
}

/** Add a chapter with its first block and type into that block. */
async function addChapterWithBlock(text) {
  await page.locator('[data-canvas-action="add-chapter"]').click();
  await page.waitForFunction(
    () => {
      const current = window.__noteforestTest.state();
      const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
      return (
        (runtime?.chapters ?? 0) === 2 &&
        (runtime?.chapterList.at(-1)?.blockIds.length ?? 0) === 1
      );
    },
    undefined,
    { timeout: 10000 },
  );
  await page.waitForFunction(
    () => document.activeElement?.className === 'nf-chapter-title-input',
    undefined,
    { timeout: 10000 },
  );
  await page.keyboard.press('Escape');
  const blockId = await page.evaluate(() => {
    const current = window.__noteforestTest.state();
    const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
    return runtime?.chapterList.at(-1)?.blockIds[0] ?? null;
  });
  assert.ok(blockId !== null, 'the new chapter has a first block');
  await blockCard(blockId).locator('.nf-block-prose').first().click();
  await page.keyboard.type(text);
  await h.waitEditorText(text);
  return blockId;
}

/** Exact canonical structural records of the active document (no disk wait). */
async function canonicalStructure() {
  return page.evaluate(() => window.__noteforestTest.structure());
}

async function readDiskDocument(packagePath) {
  return JSON.parse(await readFile(resolve(packagePath, 'document.json'), 'utf8'));
}

/** Rewrite document.json behind the app's back; returns the exact bytes. */
async function modifyDocumentOnDisk(packagePath, mutate) {
  const document = await readDiskDocument(packagePath);
  mutate(document);
  const bytes = Buffer.from(JSON.stringify(document, null, 2), 'utf8');
  await writeFile(resolve(packagePath, 'document.json'), bytes);
  return bytes;
}

function setFirstBlockText(document, value) {
  const blockId = Object.keys(document.blocks)[0];
  if (blockId === undefined) throw new Error('document has no blocks');
  document.blocks[blockId].content = {
    type: 'doc',
    children: [
      {
        type: 'paragraph',
        children: [{ type: 'text', text: value }],
      },
    ],
  };
}

function activeSaveBanner() {
  return page.locator('.nf-main-column [data-save-failure="true"]');
}

describe('NoteForest M2 editor shell', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    // axe is injected from the app origin; an inline script is blocked by the
    // production CSP, and weakening the CSP for a test is not acceptable.
    await copyFile(axePath, resolve(appDir, 'out/renderer/axe.min.js'));
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('creates documents, edits blocks, branches, reparents, reorders and restores', async () => {
    await launch(isolated('lifecycle'));
    let firstPath = await (async () => {
      await page.waitForSelector('.nf-empty-state');
      assert.match(await page.locator('.nf-empty-title').innerText(), /NoteForest/);
      await page.locator('.nf-empty-actions .nf-button-primary').click();
      await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
      await h.waitBlockCount(1);
      return (await h.state()).tabs[0].packagePath;
    })();
    assert.equal((await h.state()).tabs.length, 1);

    await page.keyboard.type('Root block');
    await page.waitForSelector('.nf-tab-dot');
    assert.equal(await page.locator('.nf-tab-dot').count(), 1, 'dirty dot appears while typing');
    await h.waitSaved();
    await page.waitForSelector('.nf-tab-dot', { state: 'detached' });
    assert.equal(await page.locator('.nf-tab-dot').count(), 0, 'dirty dot clears after autosave');
    // The first keystroke materialized the draft; the tab key is now the package.
    firstPath = (await h.state()).tabs[0].packagePath;
    assert.doesNotMatch(firstPath, /^draft:/, 'the note has a real package path');

    await page.keyboard.press('Control+Enter');
    await h.waitBlockCount(2);
    await page.keyboard.type('Child block');
    await h.waitSaved();

    const edges = h.activeEditor().locator('.nf-edge-path');
    await h.waitEdges(1);
    assert.equal(await edges.count(), 1, 'one primary arrow for one child');
    const edgeCheck = await page.evaluate(() => {
      const root = document.querySelector('.nf-editor[data-active="true"] .nf-canvas-content');
      if (root === null) return null;
      const rootRect = root.getBoundingClientRect();
      const group = root.querySelector('g[data-edge-id]');
      const path = group?.querySelector('.nf-edge-path');
      const arrow = group?.querySelector('.nf-edge-arrow');
      const childId = group?.getAttribute('data-child-id');
      const child =
        childId === null || childId === undefined
          ? null
          : root.querySelector(`[data-block-card="${childId}"]`);
      const parentId = group?.getAttribute('data-parent-id');
      const parent =
        parentId === null || parentId === undefined
          ? null
          : root.querySelector(`[data-block-card="${parentId}"]`);
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
        finalHorizontal:
          last !== undefined && before !== undefined ? Math.abs(last.y - before.y) < 0.5 : false,
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
    await h.waitBlockCount(3);
    await page.keyboard.type('Sibling block');
    await h.waitSaved();
    await h.waitEdges(2);
    assert.equal(await edges.count(), 2, 'two children, two arrows');

    // Reorder the sibling up with the keyboard and check the DOM order.
    await h.activeEditor().locator('[data-block-card]', { hasText: 'Sibling block' }).first().click();
    await page.keyboard.press('Alt+ArrowUp');
    await page.waitForFunction(() => {
      const labels = [
        ...document.querySelectorAll(
          '.nf-editor[data-active="true"] [data-block-card] .nf-block-prose',
        ),
      ].map((node) => node.textContent ?? '');
      return (
        labels.findIndex((text) => text.includes('Sibling block')) <
        labels.findIndex((text) => text.includes('Child block'))
      );
    });
    const labelsInDom = await h
      .activeEditor()
      .locator('[data-block-card] .nf-block-prose')
      .allTextContents();
    assert.ok(
      labelsInDom.findIndex((text) => text.includes('Sibling block')) <
        labelsInDom.findIndex((text) => text.includes('Child block')),
    );

    // Drag the first child onto its sibling and check the reading order.
    const dragCards = h.activeEditor().locator('[data-block-card][data-top-level="false"]');
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
      await page.waitForFunction(() => {
        const labels = [
          ...document.querySelectorAll(
            '.nf-editor[data-active="true"] [data-block-card][data-top-level="false"] .nf-block-prose',
          ),
        ].map((node) => node.textContent ?? '');
        return (
          labels.findIndex((text) => text.includes('Sibling block')) >
          labels.findIndex((text) => text.includes('Child block'))
        );
      });
    }
    const draggedOrder = await h
      .activeEditor()
      .locator('[data-block-card][data-top-level="false"] .nf-block-prose')
      .allTextContents();
    assert.ok(
      draggedOrder.findIndex((text) => text.includes('Sibling block')) >
        draggedOrder.findIndex((text) => text.includes('Child block')),
      'drag reorders sibling blocks',
    );

    // Reparent the sibling to the top level through Move to…
    const siblingCard = h
      .activeEditor()
      .locator('[data-block-card]', { hasText: 'Sibling block' })
      .first();
    await siblingCard.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /Move to/ }).click();
    await page.getByRole('option', { name: /Top level/ }).click();
    await page.getByRole('button', { name: 'Move', exact: true }).click();
    await h.waitEdges(1);
    await h.waitSaved();
    assert.equal(await edges.count(), 1, 'reparenting removes the incoming arrow');
    const topLevelFlags = await h
      .activeEditor()
      .locator('[data-block-card]')
      .evaluateAll((cards) => cards.map((card) => card.getAttribute('data-top-level')));
    assert.ok(
      topLevelFlags.filter((flag) => flag === 'true').length >= 2,
      'moved block is top-level',
    );

    // Detach the remaining child branch.
    const childCard = h
      .activeEditor()
      .locator('[data-block-card]', { hasText: 'Child block' })
      .first();
    await childCard.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /Detach from parent/ }).click();
    await h.waitEdges(0);
    await h.waitSaved();
    assert.equal(await edges.count(), 0, 'detaching promotes the target and removes the arrow');

    // Rename document from the tab context menu (V0 removed the title row).
    await page.locator('.nf-tab[data-active="true"]').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Rename document…' }).click();
    await page.locator('.nf-dialog').getByRole('textbox', { name: 'Name' }).fill('M2 notes');
    await page.locator('.nf-dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await h.waitSaved();
    assert.equal((await h.state()).tabs[0].title, 'M2 notes');

    // Second document + tab switching.
    await page.locator('[data-library-new="true"]').click();
    await waitTabCount(2);
    await page.keyboard.type('Second document text');
    await h.waitNativeEdited(true);
    assert.equal(
      await h.app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isDocumentEdited(),
      ),
      true,
      'native dirty state is set',
    );
    await page.keyboard.press('Meta+w');
    await page.waitForSelector('.nf-dialog');
    assert.match(await page.locator('.nf-dialog-title').innerText(), /Close tab/);
    await page.locator('.nf-dialog').getByRole('button', { name: 'Cancel' }).click();
    assert.equal((await h.state()).tabs.length, 2, 'cancel keeps the tab');
    await h.waitSaved();
    await h.waitNativeEdited(false);
    assert.equal(
      await h.app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isDocumentEdited(),
      ),
      false,
      'native dirty state clears after save',
    );

    await page.keyboard.press('Meta+1');
    await waitActiveTab(firstPath);
    assert.equal((await h.state()).activeTab, firstPath);
    assert.match(await h.activeEditor().locator('.nf-block-prose').first().innerText(), /Root block/);
    await page.keyboard.press('Control+Tab');
    await page.waitForFunction(
      (expected) => window.__noteforestTest.state().activeTab !== expected,
      firstPath,
      { timeout: 10000 },
    );
    assert.notEqual((await h.state()).activeTab, firstPath);

    // Close the active tab with Cmd+W; the window must stay open.
    await page.keyboard.press('Meta+w');
    await waitTabCount(1);
    assert.equal((await h.state()).tabs.length, 1, 'Cmd+W closes a tab, not the window');
    assert.equal(await page.locator('.nf-app').count(), 1);
    await page.keyboard.press('Meta+Shift+t');
    await waitTabCount(2);
    assert.equal((await h.state()).tabs.length, 2, 'reopen closed tab');
    await page.keyboard.press('Meta+1');
    await waitActiveTab(firstPath);

    await h.flushSession();
    const beforeQuit = await h.state();
    await h.quit();
    await launch(isolated('lifecycle'));
    const restored = await h.state();
    assert.equal(restored.tabs.length, 2, 'tabs restored after relaunch');
    assert.equal(restored.activeTab, beforeQuit.activeTab, 'active tab restored');
    assert.equal(restored.runtimes.length, 2);
    await h.waitEditorText('Root block');
    const allText = await h.activeEditor().locator('.nf-block-prose').allTextContents();
    assert.ok(allText.some((text) => text.includes('Root block')), 'content restored');
    assert.equal(await page.locator('.nf-editor[data-active="true"] .nf-edge-path').count(), 0);
    await h.quit();
  });

  it('keeps the demo tree arrows, collapse, controls, trunk and Backspace non-destructive', async () => {
    await launch(isolated('demo-tree'));
    await h.setWindowSize(1440, 900);
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    await h.waitEdges(3);
    await h.waitLayout({ blocks: 7, arrows: 3 });
    const scope = h.activeEditor();
    assert.equal(await scope.locator('.nf-edge-path').count(), 3);
    assert.equal(
      await scope.locator('.nf-edge-defect').count(),
      0,
      'no layout defects in the demo tree',
    );

    const rootCard = scope.locator('[data-block-card][data-top-level="true"]').first();
    await rootCard.hover();
    await h.waitLayout({ blocks: 7, arrows: 3 });
    const cardBox = await rootCard.boundingBox();
    const addBox = await rootCard.locator('[data-add-child]').boundingBox();
    const portBox = await rootCard.locator('[data-branch-port]').boundingBox();
    const siblingBox = await rootCard.locator('[data-add-sibling]').boundingBox();
    const handleBox = await rootCard.locator('.nf-gutter-handle').boundingBox();
    assert.ok(
      cardBox !== null && addBox !== null && portBox !== null && siblingBox !== null && handleBox !== null,
    );

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
    await h.waitEdges(0);
    await h.waitLayout({ blocks: 7, arrows: 0 });
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
    await h.waitEdges(3);
    assert.equal(await scope.locator('.nf-edge-path').count(), 3);
    assert.equal(await rootCard.locator('[data-branch-port]').getAttribute('aria-expanded'), 'true');

    // Add a third child so the shared trunk is visible, then verify the
    // parent-relative start and the T-junction.
    await rootCard.hover();
    await rootCard.locator('[data-add-child]').click();
    await h.waitBlockCount(8);
    await page.keyboard.type('Third child');
    await h.waitSaved();
    await h.waitEdges(4);
    await h.waitLayout({ blocks: 8, arrows: 4 });

    const trunk = await h.trunkSnapshot();
    assert.ok(trunk !== null, 'trunk geometry available');
    assert.equal(trunk.trunkCount, 1, 'one shared trunk for three children');
    const trunkStart = trunk.trunkPairs[0];
    assert.ok(trunkStart !== undefined, 'the trunk has a start point');
    assert.equal(trunkStart.x, trunk.parentRight, 'the trunk starts at the parent port');
    assert.ok(Math.abs(trunkStart.y - trunk.parentCenterY) < 1, 'at the parent branch port');
    assert.ok(
      trunk.edgeStart.x > trunk.parentRight && trunk.edgeStart.x < trunk.childLeft,
      'the child arm starts from the shared trunk, not the card port',
    );
    assert.ok(
      Math.abs(trunk.edgeStart.y - trunk.childCenterY) < 1.5,
      'the child arm starts at its own row center',
    );
    assert.ok(
      trunk.trunkPairs.some(
        (point) =>
          Math.abs(point.x - trunk.edgeStart.x) < 0.2 &&
          point.y >= Math.min(trunk.edgeStart.y, trunk.parentCenterY) - 0.2 &&
          point.y <= Math.max(trunk.edgeStart.y, trunk.parentCenterY) + 0.2,
      ),
      'the trunk covers the child arm junction',
    );
    const edgeEnd = trunk.edgePairs.at(-1);
    assert.ok(edgeEnd !== undefined);
    assert.ok(edgeEnd.x < trunk.childLeft, 'the arrowhead stops before the child');
    assert.ok(Math.abs(edgeEnd.y - trunk.childCenterY) < 1.5, 'the arrow enters at the child side');

    // Plain Backspace on an empty child keeps it and moves the caret up.
    const workedCard = scope.locator('[data-block-card]', { hasText: 'Worked example' }).first();
    const workedId = await workedCard.getAttribute('data-block-card');
    await workedCard.click();
    await h.waitSelected(workedId);
    const before = (await h.activeRuntimeInfo()).blocks;
    await page.keyboard.press('Control+Enter');
    await h.waitBlockCount(before + 1);
    const childId = (await h.activeRuntimeInfo()).selectedBlockId;
    assert.ok(childId !== null && childId !== workedId, 'the new child block is focused');
    assert.equal((await h.activeRuntimeInfo()).blocks, before + 1);
    await page.keyboard.press('Backspace');
    await h.waitSelected(workedId);
    assert.equal((await h.activeRuntimeInfo()).blocks, before + 1, 'Backspace never deletes an empty block');
    assert.equal((await h.activeRuntimeInfo()).selectedBlockId, workedId, 'the caret moves to the previous block');

    // Cmd+Backspace is the destructive path.
    await h.activeEditor().locator(`[data-block-card="${childId}"]`).click();
    await h.waitSelected(childId);
    await page.keyboard.press('Meta+Backspace');
    await h.waitCanonicalBlockCount(before);
    await h.waitBlockCount(before);
    assert.equal((await h.activeRuntimeInfo()).blocks, before, 'Cmd+Backspace deletes the block');
    assert.equal(await h.activeEditor().locator(`[data-block-card="${childId}"]`).count(), 0);

    // Backspace inside a table cell edits text, never the cell or the block.
    const table = h.activeEditor().locator('.nf-block-prose table').first();
    const rows = await table.locator('tr').count();
    const cells = await table.locator('td, th').count();
    const beforeTable = (await h.activeRuntimeInfo()).blocks;
    await table.locator('td').first().click();
    await page.keyboard.press('End');
    await page.keyboard.press('Backspace');
    await page.waitForFunction(
      (expected) => {
        const current = window.__noteforestTest.state();
        const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
        return runtime?.blocks === expected;
      },
      beforeTable,
      { timeout: 10000 },
    );
    assert.equal(
      (await h.activeRuntimeInfo()).blocks,
      beforeTable,
      'Backspace in a table cell never deletes the block',
    );
    assert.equal(await h.activeEditor().locator('.nf-block-prose table').count(), 1);
    assert.equal(await h.activeEditor().locator('.nf-block-prose table tr').count(), rows);
    assert.equal(
      await h.activeEditor().locator('.nf-block-prose table td, .nf-block-prose table th').count(),
      cells,
    );
    await h.quit();
  });



  it('keeps the editor, card controls, context menu, and tabs keyboard reachable', async () => {
    await launch(isolated('keyboard-a11y'));
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    await h.waitLayout({ blocks: 7, arrows: 3 });

    // Save-state changes are announced through a polite live region.
    const saveStatus = page.locator('.nf-statusbar [role="status"]');
    assert.equal(await saveStatus.getAttribute('aria-live'), 'polite');
    assert.equal((await saveStatus.innerText()).trim(), 'Saved');
    const rootCard = h.activeEditor().locator('[data-block-card][data-top-level="true"]').first();
    const rootId = await rootCard.getAttribute('data-block-card');
    assert.ok(rootId !== null);
    await rootCard.locator('.nf-block-prose').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type('!');
    await page.waitForFunction(
      () =>
        document.querySelector('.nf-statusbar [data-save-state]')?.getAttribute('data-save-state') ===
        'unsaved',
      undefined,
      { timeout: 10000 },
    );
    assert.equal((await saveStatus.innerText()).trim(), 'Unsaved changes');
    await h.waitSaved();
    assert.equal((await saveStatus.innerText()).trim(), 'Saved');

    // Tab leaves the contenteditable body, Shift+Tab returns, and every card
    // control between the body and the branch port is a visible tab stop.
    await rootCard.locator('.nf-block-prose').first().click();
    await page.keyboard.press('Tab');
    await page.waitForFunction(
      () => document.activeElement?.isContentEditable !== true,
      undefined,
      { timeout: 10000 },
    );
    const firstStop = await page.evaluate(() => {
      const element = document.activeElement;
      return {
        inEditor: element?.closest('.nf-editor[data-active="true"]') !== null,
        outline: element === null ? '' : getComputedStyle(element).outline,
      };
    });
    assert.equal(firstStop.inEditor, true, 'the first stop is a card control in the editor');
    assert.match(firstStop.outline, /solid 2px/, 'the focused card control has a visible focus ring');

    await page.keyboard.press('Shift+Tab');
    await page.waitForFunction(
      () => document.activeElement?.isContentEditable === true,
      undefined,
      { timeout: 10000 },
    );

    const controlPath = [];
    for (let index = 0; index < 8; index += 1) {
      await page.keyboard.press('Tab');
      const current = await page.evaluate(() => {
        const element = document.activeElement;
        return {
          chapter: element?.classList.contains('nf-chapter-title') === true,
          handle: element?.hasAttribute('data-block-actions') === true,
          addChild: element?.hasAttribute('data-add-child') === true,
          addSibling: element?.hasAttribute('data-add-sibling') === true,
          port: element?.hasAttribute('data-branch-port') === true,
        };
      });
      if (current.chapter) controlPath.push('chapter');
      else if (current.handle) controlPath.push('handle');
      else if (current.addChild) controlPath.push('add-child');
      else if (current.addSibling) controlPath.push('add-sibling');
      else if (current.port) controlPath.push('port');
      else controlPath.push('other');
      if (current.port) break;
    }
    assert.deepEqual(
      controlPath,
      ['chapter', 'handle', 'add-child', 'add-sibling', 'port'],
      'the card controls are reachable in focus order',
    );

    // Activate the branch port with Space: collapse, then expand.
    assert.equal(
      await page.locator(`[data-branch-port="${rootId}"]`).getAttribute('aria-expanded'),
      'true',
    );
    await page.keyboard.press('Space');
    await page.waitForFunction(
      (id) =>
        document.querySelector(`[data-branch-port="${id}"]`)?.getAttribute('aria-expanded') ===
        'false',
      rootId,
      { timeout: 10000 },
    );
    assert.equal(
      await page.locator(`[data-branch-port="${rootId}"]`).getAttribute('data-collapsed'),
      'true',
    );
    await page.keyboard.press('Space');
    await page.waitForFunction(
      (id) =>
        document.querySelector(`[data-branch-port="${id}"]`)?.getAttribute('aria-expanded') ===
        'true',
      rootId,
      { timeout: 10000 },
    );

    // Activate add-child with Enter (the button was reached by Tab above).
    const beforeAdd = (await h.activeRuntimeInfo()).blocks;
    await page.locator(`[data-add-child="${rootId}"]`).focus();
    await page.keyboard.press('Enter');
    await h.waitCanonicalBlockCount(beforeAdd + 1);
    await page.waitForFunction(
      (expected) =>
        document.querySelectorAll('.nf-editor[data-active="true"] [data-block-card]').length ===
        expected,
      beforeAdd + 1,
      { timeout: 10000 },
    );

    // The drag handle is a keyboard button: Enter opens the block actions
    // menu (with Move up/down) and Escape restores focus to the handle.
    await page.locator(`[data-block-actions="${rootId}"]`).focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('.nf-menu');
    await page.waitForFunction(
      () => document.activeElement?.closest('.nf-menu') !== null,
      undefined,
      { timeout: 10000 },
    );
    assert.equal(await page.getByRole('menuitem', { name: /Move up/ }).count(), 1);
    await page.keyboard.press('Escape');
    await page.waitForSelector('.nf-menu', { state: 'detached' });
    await page.waitForFunction(
      (id) => document.activeElement?.getAttribute('data-block-actions') === id,
      rootId,
      { timeout: 10000 },
    );

    // Context menu: first item focused, arrows move, Tab wraps, Escape closes
    // and returns focus to the editor.
    await rootCard.locator('.nf-block-prose').first().click();
    await rootCard.click({ button: 'right' });
    await page.waitForSelector('.nf-menu');
    await page.waitForFunction(
      () => document.querySelector('.nf-menu [role="menuitem"]') === document.activeElement,
      undefined,
      { timeout: 10000 },
    );
    const firstItem = await page.evaluate(() => document.activeElement?.textContent ?? '');
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(
      (previous) =>
        document.activeElement?.closest('.nf-menu') !== null &&
        (document.activeElement?.textContent ?? '') !== previous,
      firstItem,
      { timeout: 10000 },
    );
    const itemCount = await page.locator('.nf-menu [role="menuitem"]').count();
    for (let index = 0; index < itemCount + 1; index += 1) {
      await page.keyboard.press('Tab');
      const insideMenu = await page.evaluate(
        () => document.activeElement?.closest('.nf-menu') !== null,
      );
      assert.equal(insideMenu, true, 'Tab stays inside the context menu');
    }
    await page.keyboard.press('Escape');
    await page.waitForSelector('.nf-menu', { state: 'detached' });
    await page.waitForFunction(
      () => document.activeElement?.closest('.nf-prosemirror') !== null,
      undefined,
      { timeout: 10000 },
    );

    // Ctrl+Tab is a real tab cycle, and the active tab exposes a focusable,
    // announced close button.
    const firstPath = (await h.state()).activeTab;
    await page.locator('.nf-toolbar-button[aria-label="New note"]').click();
    await page.waitForFunction(
      () => window.__noteforestTest.state().tabs.length === 2,
      undefined,
      { timeout: 10000 },
    );
    await h.waitSaved();
    const secondPath = (await h.state()).activeTab;
    assert.ok(secondPath !== null && secondPath !== firstPath);
    await page.keyboard.press('Control+Tab');
    await waitActiveTab(firstPath);
    await page.keyboard.press('Control+Shift+Tab');
    await waitActiveTab(secondPath);

    assert.equal(
      await page.locator('[data-close-active-tab="true"]').count(),
      0,
      'there is no global close-tab button',
    );
    const closeButton = page.locator('.nf-tab[data-active="true"] .nf-tab-close');
    assert.match((await closeButton.getAttribute('title')) ?? '', /^Close /);
    await page.locator('.nf-tab[data-active="true"] .nf-tab-label').focus();
    // Keyboard close is the tablist Delete handler (⌘W is the global path);
    // the × remains a pointer affordance inside the presentation tab chip.
    await page.keyboard.press('Delete');
    await waitTabCount(1);
  });

  it('serializes rapid structural creation and keeps canvas, sidebar and arrows in parity', async () => {
    await launch(isolated('rapid'));
    await page.waitForSelector('.nf-empty-state');
    await page.locator('.nf-empty-actions .nf-button-primary').click();
    await h.waitBlockCount(1);
    let firstPath = (await h.state()).activeTab;
    await page.keyboard.type('Root block');
    await h.waitSaved();
    // The first keystroke materialized the draft; the tab key is now the package.
    firstPath = (await h.state()).activeTab;
    assert.doesNotMatch(firstPath, /^draft:/, 'the note has a real package path');
    await showOutline();

    // Three Control+Enter presses before the first IPC round-trip can finish.
    await h.rapidKeydowns('Enter', 3, { ctrlKey: true });
    await h.waitBlockCount(4);
    await h.waitCanonicalBlockCount(4);
    await h.waitLayout({ blocks: 4, arrows: 3 });
    const created = await h.parity();
    assert.equal(created.canvas, 4, 'four blocks in the canvas');
    assert.equal(created.sidebar, 4, 'four blocks in the sidebar');
    assert.equal(created.canonical, 4, 'four blocks in the canonical document');
    assert.equal(created.arrows, 3, 'three arrows for three children');
    assert.equal(created.trunks, 1, 'one shared trunk for three children');

    // Every created child is deletable; deleting each one keeps parity.
    for (let remaining = 3; remaining > 0; remaining -= 1) {
      const children = h.activeEditor().locator('[data-block-card][data-top-level="false"]');
      await page.waitForFunction(
        (expected) =>
          document.querySelectorAll(
            '.nf-editor[data-active="true"] [data-block-card][data-top-level="false"]',
          ).length === expected,
        remaining,
        { timeout: 10000 },
      );
      await children.last().click({ button: 'right' });
      await page.getByRole('menuitem', { name: /Delete block/ }).click();
      await page.getByRole('button', { name: 'Delete', exact: true }).click();
      await h.waitCanonicalBlockCount(remaining);
      await h.waitBlockCount(remaining);
      await h.waitEdges(remaining - 1);
      const current = await h.parity();
      assert.equal(current.canvas, remaining, `canvas loses one block (${remaining} left)`);
      assert.equal(current.sidebar, remaining, 'sidebar stays in parity');
      assert.equal(current.canonical, remaining, 'canonical document stays in parity');
      assert.equal(current.arrows, remaining - 1, 'arrows stay in parity');
    }

    // Create, type, undo/redo text, and delete without an orphan.
    await h.activeEditor().locator('[data-block-card]').first().click();
    await page.keyboard.press('Control+Enter');
    await h.waitBlockCount(2);
    await page.keyboard.type('Undo me');
    await h.waitEditorText('Undo me', true);
    await page.keyboard.press('Meta+z');
    await h.waitEditorText('Undo me', false);
    await page.keyboard.press('Meta+Shift+z');
    await h.waitEditorText('Undo me', true);
    // Undo/redo are exempt from the menu-command dedupe: the sequence repeats
    // immediately, as a user pressing ⌘Z twice would.
    let afterUndo = await h.parity();
    assert.equal(afterUndo.canvas, afterUndo.canonical, 'undo/redo keeps the canonical count');
    await page.keyboard.press('Meta+z');
    await h.waitEditorText('Undo me', false);
    await page.keyboard.press('Meta+Shift+z');
    await h.waitEditorText('Undo me', true);
    afterUndo = await h.parity();
    assert.equal(afterUndo.sidebar, afterUndo.canvas, 'sidebar matches after undo/redo');
    await h
      .activeEditor()
      .locator('[data-block-card][data-top-level="false"]')
      .last()
      .click({ button: 'right' });
    await page.getByRole('menuitem', { name: /Delete block/ }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await h.waitCanonicalBlockCount(1);
    await h.waitEdges(0);
    const final = await h.parity();
    assert.equal(final.canvas, 1);
    assert.equal(final.sidebar, 1);
    assert.equal(final.canonical, 1);
    assert.equal(final.arrows, 0);

    // Child + sibling in quick succession, then a tab round-trip.
    await h.activeEditor().locator('[data-block-card]').first().click();
    await h.rapidKeySequence([
      { key: 'Enter', options: { ctrlKey: true } },
      { key: 'Enter', options: { altKey: true } },
    ]);
    await h.waitBlockCount(3);
    await h.waitCanonicalBlockCount(3);
    await h.waitLayout({ blocks: 3 });
    const quick = await h.parity();
    assert.deepEqual(
      { canvas: quick.canvas, sidebar: quick.sidebar, canonical: quick.canonical },
      { canvas: 3, sidebar: 3, canonical: 3 },
      'quick child + sibling stays in parity',
    );
    assert.ok(quick.arrows >= 1 && quick.arrows <= 2, 'the quick blocks keep their arrows');

    // A second document and a tab round-trip do not resurrect a phantom block.
    await page.keyboard.press('Meta+n');
    await waitTabCount(2);
    await page.keyboard.press('Meta+1');
    await waitActiveTab(firstPath);
    const returned = await h.parity();
    assert.equal(returned.canvas, 3);
    assert.equal(returned.sidebar, 3);
    assert.equal(returned.canonical, 3);
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
    await h.quit();
  });

  it('routes undo and redo across text and structural history without dropping presses', async () => {
    await launch(isolated('undo-routing'));
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    await h.waitLayout({ blocks: 7, arrows: 3 });
    await showOutline();
    await waitHistoryState({
      lastHistoryOperation: null,
      canUndoStructural: false,
      canRedoStructural: false,
    });

    const textE = 'Take the symmetric matrix below. Its eigenvalues are 1 and 3.';
    const textA = 'A scalar λ is an eigenvalue of A if there is a nonzero vector v with Av = λv.';
    const textB = 'A nonzero vector v that satisfies Av = λv for some λ.';

    const packagePath = (await h.state()).activeTab;
    // The seeded table gains ProseMirror's canonical cell attrs on first load;
    // commit and save before snapshotting so the comparison is not seed drift.
    await page.keyboard.press('Meta+s');
    await h.waitSaved();
    const seedStructure = storedStructure(await readDiskDocument(packagePath));
    const seedBlockIds = Object.keys(seedStructure.blocks).sort();
    const seedBranchIds = Object.keys(seedStructure.branches).sort();

    // Delete promote: undo must restore the exact block, branch and chapter
    // state (IDs, order, label, unknown fields); redo must delete it again.
    const promotedId = await deleteBlockThroughDialog('Eigenvalues');
    await h.waitCanonicalBlockCount(6);
    await h.waitBlockCount(6);
    await h.waitEdges(1);
    await waitHistoryState({
      lastHistoryOperation: 'structural',
      canUndoStructural: true,
      canRedoStructural: false,
    });
    const promoted = await h.parity();
    assert.equal(promoted.canvas, promoted.sidebar, 'sidebar matches the canvas after promote');
    assert.equal(promoted.canvas, promoted.canonical, 'canvas matches canonical after promote');
    assert.ok(!promoted.canonicalIds.includes(promotedId), 'promote removes the root block');

    await page.keyboard.press('Meta+z');
    await h.waitCanonicalBlockCount(7);
    await h.waitBlockCount(7);
    await h.waitEdges(3);
    await h.waitSaved();
    assert.deepEqual(
      storedStructure(await readDiskDocument(packagePath)),
      seedStructure,
      'promote undo restores blocks, branch IDs, order and chapter exactly',
    );
    const promoteUndone = await h.parity();
    assert.deepEqual([...promoteUndone.canonicalIds].sort(), seedBlockIds);
    assert.deepEqual([...(await h.activeRuntimeInfo()).branchIds].sort(), seedBranchIds);
    await waitHistoryState({ canUndoStructural: false, canRedoStructural: true });

    await page.keyboard.press('Meta+Shift+z');
    await h.waitCanonicalBlockCount(6);
    await h.waitBlockCount(6);
    await h.waitEdges(1);
    await waitHistoryState({ canUndoStructural: true, canRedoStructural: false });
    assert.ok(!(await h.parity()).canonicalIds.includes(promotedId), 'redo deletes the block again');

    await page.keyboard.press('Meta+z');
    await h.waitCanonicalBlockCount(7);
    await h.waitBlockCount(7);
    await h.waitEdges(3);

    // Delete subtree: undo restores every block and branch with the same IDs.
    await deleteBlockThroughDialog('Eigenvalues', 'delete-subtree');
    await h.waitCanonicalBlockCount(3);
    await h.waitBlockCount(3);
    await h.waitEdges(0);
    assert.ok(!(await h.parity()).canonicalIds.includes(promotedId));
    await page.keyboard.press('Meta+z');
    await h.waitCanonicalBlockCount(7);
    await h.waitBlockCount(7);
    await h.waitEdges(3);
    const subtreeUndone = await h.parity();
    assert.deepEqual([...subtreeUndone.canonicalIds].sort(), seedBlockIds);
    assert.deepEqual([...(await h.activeRuntimeInfo()).branchIds].sort(), seedBranchIds);
    await page.keyboard.press('Meta+Shift+z');
    await h.waitCanonicalBlockCount(3);
    await h.waitBlockCount(3);
    await waitHistoryState({ canUndoStructural: true, canRedoStructural: false });
    await page.keyboard.press('Meta+z');
    await h.waitCanonicalBlockCount(7);
    await h.waitBlockCount(7);
    await h.waitEdges(3);

    // Detach: undo restores the exact branch record (same ID, endpoints,
    // order and label); redo detaches again.
    const eigenvectorId = await blockIdWithText('Eigenvector');
    assert.ok(eigenvectorId !== null);
    const incomingBranch = Object.values(seedStructure.branches).find(
      (branch) => branch.targetBlockId === eigenvectorId,
    );
    assert.ok(incomingBranch !== undefined, 'the demo seed has an incoming branch');
    await detachBlockThroughMenu('Eigenvector');
    await h.waitCanonicalBlockCount(7);
    await h.waitBlockCount(7);
    await h.waitEdges(2);
    assert.equal((await h.parity()).sidebar, 7, 'detach keeps sidebar/canvas parity');
    assert.ok(
      !(await h.activeRuntimeInfo()).branchIds.includes(incomingBranch.id),
      'detach removes the branch',
    );
    await page.keyboard.press('Meta+z');
    await h.waitEdges(3);
    await h.waitSaved();
    const detachUndone = storedStructure(await readDiskDocument(packagePath));
    assert.deepEqual(
      detachUndone.branches,
      seedStructure.branches,
      'detach undo restores the exact branch record',
    );
    assert.deepEqual(
      detachUndone.chapters,
      seedStructure.chapters,
      'detach undo makes the target a child again',
    );
    assert.ok(
      (await h.activeRuntimeInfo()).branchIds.includes(incomingBranch.id),
      'the same branch ID returns',
    );
    await page.keyboard.press('Meta+Shift+z');
    await h.waitEdges(2);
    await waitHistoryState({ canUndoStructural: true, canRedoStructural: false });
    await page.keyboard.press('Meta+z');
    await h.waitEdges(3);

    // Two rapid deletes, two rapid undos and two rapid redos: one press per
    // step, no dropped press, no duplicate records.
    await deleteBlockThroughDialog('Trace and determinant');
    await h.waitCanonicalBlockCount(6);
    await deleteBlockThroughDialog('A = [[2, 1],');
    await h.waitCanonicalBlockCount(5);
    await h.waitBlockCount(5);
    await h.rapidKeydowns('z', 2, { metaKey: true });
    await h.waitCanonicalBlockCount(7);
    await h.waitBlockCount(7);
    await h.waitEdges(3);
    await waitHistoryState({ canUndoStructural: false, canRedoStructural: true });
    assert.deepEqual([...(await h.parity()).canonicalIds].sort(), seedBlockIds);
    await h.rapidKeydowns('z', 2, { metaKey: true, shiftKey: true });
    await h.waitCanonicalBlockCount(5);
    await h.waitBlockCount(5);
    await waitHistoryState({ canUndoStructural: true, canRedoStructural: false });
    await h.rapidKeydowns('z', 2, { metaKey: true });
    await h.waitCanonicalBlockCount(7);
    await h.waitBlockCount(7);
    await h.waitEdges(3);

    // One keypress must undo one history event. Two rapid presses must undo
    // exactly two events (the old 120 ms dedupe dropped the second one).
    await focusBlockEnd(textE);
    await page.keyboard.type(' T-ONE');
    await h.waitEditorText('T-ONE');
    await focusBlockEnd(textA);
    await page.keyboard.type(' T-TWO');
    await h.waitEditorText('T-TWO');
    await focusBlockEnd(textB);
    await page.keyboard.type(' T-THREE');
    await h.waitEditorText('T-THREE');
    await page.keyboard.press('Meta+z');
    await page.keyboard.press('Meta+z');
    await h.waitEditorText('T-THREE', false);
    await h.waitEditorText('T-TWO', false);
    assert.ok(
      (await h.activeEditor().innerText()).includes('T-ONE'),
      'one press undoes one event and a repeated press is not dropped',
    );
    await page.keyboard.press('Meta+Shift+z');
    await page.keyboard.press('Meta+Shift+z');
    await h.waitEditorText('T-ONE', true);
    await h.waitEditorText('T-TWO', true);
    await h.waitEditorText('T-THREE', true);

    // Empty the text stack so the required text → structural fallback sequence
    // starts with no older text event to consume.
    await page.keyboard.press('Meta+z');
    await page.keyboard.press('Meta+z');
    await page.keyboard.press('Meta+z');
    await h.waitEditorText('T-ONE', false);
    await waitHistoryState({ canUndoText: false });

    // Add child → type → palette undo (text) → menu undo (structural fallback).
    const parentId = await focusBlockEnd(textB);
    assert.ok(parentId !== null, 'the parent block has an ID');
    const idsBeforeChild = new Set((await h.parity()).canonicalIds);
    await page.keyboard.press('Control+Enter');
    await h.waitBlockCount(8);
    await h.waitCanonicalBlockCount(8);
    const childId = (await h.parity()).canonicalIds.find((id) => !idsBeforeChild.has(id));
    assert.ok(childId !== undefined, 'the created child has an ID');
    await page.keyboard.type(' CHILD-TEXT');
    await h.waitEditorText('CHILD-TEXT');
    await waitHistoryState({
      lastHistoryOperation: 'text',
      canUndoText: true,
      canUndoStructural: true,
    });

    await page.keyboard.press('Meta+k');
    await page.waitForSelector('.nf-palette');
    await page.getByRole('option', { name: /Undo/ }).click();
    await page.waitForSelector('.nf-palette', { state: 'detached' });
    await h.waitEditorText('CHILD-TEXT', false);
    await h.waitBlockCount(8);
    await waitHistoryState({ lastHistoryOperation: 'text', canUndoText: false });

    await invokeAppMenu('menu-undo');
    await h.waitBlockCount(7);
    await h.waitCanonicalBlockCount(7);
    await waitHistoryState({
      lastHistoryOperation: 'structural',
      canUndoText: false,
      canRedoText: false,
      canUndoStructural: false,
      // Undoing the creation applies block.delete delete-subtree; its exact
      // record restore makes this structural undo redoable with the same ID.
      canRedoStructural: true,
    });
    await h.waitSelected(parentId);
    await waitFocusRestored();
    assert.ok(!(await h.parity()).canonicalIds.includes(childId), 'the child is undone');
    await invokeAppMenu('menu-redo');
    await h.waitBlockCount(8);
    await h.waitCanonicalBlockCount(8);
    assert.ok(
      (await h.parity()).canonicalIds.includes(childId),
      'redo restores the exact created block ID',
    );
    await waitHistoryState({ canUndoStructural: true, canRedoStructural: false });
    await invokeAppMenu('menu-undo');
    await h.waitBlockCount(7);
    await h.waitCanonicalBlockCount(7);

    // Structural redo with a move inverse: reorder a top-level block via the
    // keyboard, then undo/redo the move from the native Edit menu.
    const topLevelIds = () =>
      h
        .activeEditor()
        .locator('[data-block-card][data-top-level="true"]')
        .evaluateAll((cards) => cards.map((card) => card.getAttribute('data-block-card')));
    await focusBlockEnd(textE);
    const beforeMove = await topLevelIds();
    assert.equal(beforeMove.length, 4, 'four top-level blocks remain');
    const afterMove = [beforeMove[0], beforeMove[2], beforeMove[1], beforeMove[3]];
    await page.keyboard.press('Alt+ArrowDown');
    await page.waitForFunction(
      (expected) => {
        const ids = [
          ...document.querySelectorAll(
            '.nf-editor[data-active="true"] [data-block-card][data-top-level="true"]',
          ),
        ].map((card) => card.getAttribute('data-block-card'));
        return ids.join('|') === expected;
      },
      afterMove.join('|'),
      { timeout: 10000 },
    );
    await invokeAppMenu('menu-undo');
    await page.waitForFunction(
      (expected) => {
        const ids = [
          ...document.querySelectorAll(
            '.nf-editor[data-active="true"] [data-block-card][data-top-level="true"]',
          ),
        ].map((card) => card.getAttribute('data-block-card'));
        return ids.join('|') === expected;
      },
      beforeMove.join('|'),
      { timeout: 10000 },
    );
    await waitHistoryState({
      lastHistoryOperation: 'structural',
      canRedoStructural: true,
    });
    await invokeAppMenu('menu-redo');
    await page.waitForFunction(
      (expected) => {
        const ids = [
          ...document.querySelectorAll(
            '.nf-editor[data-active="true"] [data-block-card][data-top-level="true"]',
          ),
        ].map((card) => card.getAttribute('data-block-card'));
        return ids.join('|') === expected;
      },
      afterMove.join('|'),
      { timeout: 10000 },
    );
    await waitHistoryState({
      lastHistoryOperation: 'structural',
      canUndoStructural: true,
    });

    // Phase 3b2: move and branch-create inverses preserve the branch ID, the
    // exact order key and the original chapter/top-level slot. Compare the
    // canonical records directly; the save path is covered above.
    const aId = seedStructure.chapters[0]?.topLevelBlockIds[0];
    assert.ok(aId !== undefined, 'the demo chapter has a first top-level block');
    const beforeMoves = await canonicalStructure();
    const eigenvectorBranch = Object.values(beforeMoves.branches).find(
      (branch) => branch.targetBlockId === eigenvectorId,
    );
    assert.ok(eigenvectorBranch !== undefined, 'the demo seed has an incoming branch');

    // Child -> top level: undo restores the same branch ID/chapter, redo removes it.
    const outdentedId = await outdentBlockThroughMenu('Eigenvector');
    assert.equal(outdentedId, eigenvectorId);
    await h.waitEdges(2);
    await h.waitCanonicalBlockCount(7);
    const afterOutdent = await canonicalStructure();
    assert.equal(
      afterOutdent.branches[eigenvectorBranch.id],
      undefined,
      'outdent removes the incoming branch',
    );
    const chapterAfterOutdent = afterOutdent.chapters[0]?.topLevelBlockIds ?? [];
    assert.equal(
      chapterAfterOutdent[chapterAfterOutdent.indexOf(aId) + 1],
      eigenvectorId,
      'outdent places the block after its former parent in the same chapter',
    );
    const outdentParity = await h.parity();
    assert.equal(outdentParity.canvas, outdentParity.sidebar, 'outdent keeps sidebar/canvas parity');
    assert.equal(outdentParity.canonical, 7);

    await page.keyboard.press('Meta+z');
    await h.waitEdges(3);
    await waitHistoryState({ lastHistoryOperation: 'structural', canRedoStructural: true });
    const outdentUndone = await canonicalStructure();
    assert.deepEqual(
      outdentUndone,
      beforeMoves,
      'outdent undo restores branch ID, source/target/role/order/label and chapter slot exactly',
    );
    assert.deepEqual(
      outdentUndone.branches[eigenvectorBranch.id],
      eigenvectorBranch,
      'the same branch record returns',
    );
    assert.equal(
      outdentUndone.chapters[0]?.topLevelBlockIds.includes(eigenvectorId),
      false,
      'the block is a child again, not top-level',
    );
    assert.equal((await h.parity()).sidebar, 7, 'sidebar matches after the outdent undo');

    await page.keyboard.press('Meta+Shift+z');
    await h.waitEdges(2);
    assert.deepEqual(
      await canonicalStructure(),
      afterOutdent,
      'outdent redo removes the exact branch again',
    );

    await page.keyboard.press('Meta+z');
    await h.waitEdges(3);
    assert.deepEqual(await canonicalStructure(), beforeMoves, 'second outdent undo is exact');

    // Cross-chapter top-level -> child: undo returns the block to its original
    // chapter and slot; redo reattaches with the same branch ID. Chapter B
    // keeps a second top-level block so the move cannot strand an empty
    // chapter (phase 4b invariant).
    const chapterTwoText = 'Chapter two note';
    const chapterTwoBlockId = await addChapterWithBlock(chapterTwoText);
    await h.waitSaved();
    const chapterTwo = (await canonicalStructure()).chapters[1];
    assert.ok(chapterTwo !== undefined);
    const secondChapterTwoBlock = await page.evaluate(
      (chapterId) =>
        window.__noteforestTest.applyStructural({
          type: 'block.create',
          content: {
            type: 'doc',
            children: [
              {
                type: 'paragraph',
                children: [{ type: 'text', text: 'Chapter two second root' }],
              },
            ],
          },
          placement: { kind: 'top-level', chapterId },
        }),
      chapterTwo.id,
    );
    assert.equal(secondChapterTwoBlock.ok, true, secondChapterTwoBlock.message);
    const secondChapterTwoBlockId = secondChapterTwoBlock.blockId;
    assert.ok(secondChapterTwoBlockId);
    await h.waitCanonicalBlockCount(9);
    const beforeCrossChapter = await canonicalStructure();
    assert.equal(beforeCrossChapter.chapters.length, 2);
    assert.equal(beforeCrossChapter.chapters[1]?.topLevelBlockIds[0], chapterTwoBlockId);
    assert.equal(beforeCrossChapter.chapters[1]?.topLevelBlockIds[1], secondChapterTwoBlockId);

    await moveBlockThroughDialog(chapterTwoText, 'Eigenvalues');
    await h.waitEdges(4);
    await h.waitCanonicalBlockCount(9);
    const afterCrossMove = await canonicalStructure();
    const crossMoveBranchId = Object.keys(afterCrossMove.branches).find(
      (branchId) => beforeCrossChapter.branches[branchId] === undefined,
    );
    assert.ok(crossMoveBranchId !== undefined, 'the cross-chapter move creates a branch');
    assert.deepEqual(afterCrossMove.branches[crossMoveBranchId].source, { blockId: aId });
    assert.equal(afterCrossMove.branches[crossMoveBranchId].targetBlockId, chapterTwoBlockId);
    assert.equal(afterCrossMove.branches[crossMoveBranchId].role, 'primary');
    assert.equal(typeof afterCrossMove.branches[crossMoveBranchId].order, 'string');
    assert.deepEqual(afterCrossMove.chapters[1]?.topLevelBlockIds, [secondChapterTwoBlockId]);
    const crossMoveParity = await h.parity();
    assert.equal(crossMoveParity.canvas, crossMoveParity.sidebar);
    assert.equal(crossMoveParity.canonical, 9);

    await page.keyboard.press('Meta+z');
    await h.waitEdges(3);
    const crossMoveUndone = await canonicalStructure();
    assert.deepEqual(
      crossMoveUndone,
      beforeCrossChapter,
      'cross-chapter move undo returns the block to its original chapter and slot',
    );
    assert.equal(crossMoveUndone.chapters[1]?.topLevelBlockIds[0], chapterTwoBlockId);
    assert.equal(crossMoveUndone.chapters[0]?.topLevelBlockIds.includes(chapterTwoBlockId), false);
    assert.equal(crossMoveUndone.branches[crossMoveBranchId], undefined);

    await page.keyboard.press('Meta+Shift+z');
    await h.waitEdges(4);
    assert.deepEqual(
      await canonicalStructure(),
      afterCrossMove,
      'cross-chapter move redo recreates the same branch ID and order',
    );

    await page.keyboard.press('Meta+z');
    await h.waitEdges(3);
    assert.deepEqual(await canonicalStructure(), beforeCrossChapter);

    // Cross-chapter branch.create (no UI yet in M2): undo must return the
    // target to chapter B, not the source chapter, and redo must reuse the ID.
    // Chapter B still has its second root, so the operation is legal.
    const attachResult = await page.evaluate(
      ({ sourceBlockId, targetBlockId }) =>
        window.__noteforestTest.applyStructural({
          type: 'branch.create',
          sourceBlockId,
          targetBlockId,
        }),
      { sourceBlockId: aId, targetBlockId: chapterTwoBlockId },
    );
    assert.equal(attachResult.ok, true, attachResult.message);
    await h.waitEdges(4);
    const afterAttach = await canonicalStructure();
    const attachBranchId = Object.keys(afterAttach.branches).find(
      (branchId) => beforeCrossChapter.branches[branchId] === undefined,
    );
    assert.ok(attachBranchId !== undefined, 'branch.create adds a branch');
    assert.deepEqual(afterAttach.branches[attachBranchId].source, { blockId: aId });
    assert.equal(afterAttach.branches[attachBranchId].targetBlockId, chapterTwoBlockId);
    assert.deepEqual(afterAttach.chapters[1]?.topLevelBlockIds, [secondChapterTwoBlockId]);
    assert.ok(
      (await h.activeRuntimeInfo()).branchIds.includes(attachBranchId),
      'the runtime exposes the created branch ID',
    );

    await page.keyboard.press('Meta+z');
    await h.waitEdges(3);
    const attachUndone = await canonicalStructure();
    assert.deepEqual(
      attachUndone,
      beforeCrossChapter,
      'cross-chapter attach undo returns the target to its original chapter and slot',
    );
    assert.equal(attachUndone.chapters[1]?.topLevelBlockIds[0], chapterTwoBlockId);
    assert.equal(attachUndone.chapters[0]?.topLevelBlockIds.includes(chapterTwoBlockId), false);
    assert.equal(attachUndone.branches[attachBranchId], undefined);
    assert.equal((await h.parity()).sidebar, 9, 'sidebar matches after the attach undo');

    await page.keyboard.press('Meta+Shift+z');
    await h.waitEdges(4);
    const attachRedone = await canonicalStructure();
    assert.deepEqual(
      attachRedone,
      afterAttach,
      'cross-chapter attach redo reuses the same branch ID and placement',
    );
    assert.deepEqual(attachRedone.branches[attachBranchId], afterAttach.branches[attachBranchId]);

    await page.keyboard.press('Meta+z');
    await h.waitEdges(3);
    assert.deepEqual(await canonicalStructure(), beforeCrossChapter);

    // Two rapid outdents, two rapid undos and two rapid redos: one step per press.
    const beforeRapid = await canonicalStructure();
    await outdentBlockThroughMenu('Eigenvector');
    await h.waitEdges(2);
    await outdentBlockThroughMenu('Spectrum');
    await h.waitEdges(1);
    const rapidOutdents = await canonicalStructure();
    await h.rapidKeydowns('z', 2, { metaKey: true });
    await h.waitEdges(3);
    assert.deepEqual(await canonicalStructure(), beforeRapid, 'two rapid undos undo two moves');
    await h.rapidKeydowns('z', 2, { metaKey: true, shiftKey: true });
    await h.waitEdges(1);
    assert.deepEqual(
      await canonicalStructure(),
      rapidOutdents,
      'two rapid redos redo two moves without duplicates',
    );
    await h.rapidKeydowns('z', 2, { metaKey: true });
    await h.waitEdges(3);
    assert.deepEqual(await canonicalStructure(), beforeRapid);
    await h.waitSaved();

    // The shell undo surface uses the same router: a text edit is undone, not
    // presented as a structural-only command.
    await focusBlockEnd(textE);
    await page.keyboard.type(' TOOLBAR-TEXT');
    await h.waitEditorText('TOOLBAR-TEXT');
    await page.locator('[data-header-undo]').click();
    await h.waitEditorText('TOOLBAR-TEXT', false);
    await h.waitSaved();

    // N1: New chapter is one user action and one structural undo entry. A
    // top-level block is created first so older history exists behind it: the
    // chapter undo must restore the counts and still leave that entry
    // reachable. The old failing inverse stayed on top of the stack, repeated
    // the empty-chapter toast, and hid all older history until reload.
    const beforeExtra = await canonicalStructure();
    await page.locator('[data-chapter-add]').first().click();
    await h.waitCanonicalBlockCount(Object.keys(beforeExtra.blocks).length + 1);
    await h.waitBlockCount(Object.keys(beforeExtra.blocks).length + 1);
    // Let the editor normalize the new empty block's body and commit it before
    // snapshotting; the chapter undo must not change it.
    await h.waitSaved();
    const beforeNewChapter = await canonicalStructure();
    const chaptersBefore = beforeNewChapter.chapters.length;
    const blocksBefore = Object.keys(beforeNewChapter.blocks).length;

    await page.locator('[data-canvas-action="add-chapter"]').click();
    await page.waitForFunction(
      ({ chapterCount, blockCount }) => {
        const current = window.__noteforestTest.state();
        const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
        return (runtime?.chapters ?? 0) === chapterCount && (runtime?.blocks ?? 0) === blockCount;
      },
      { chapterCount: chaptersBefore + 1, blockCount: blocksBefore + 1 },
      { timeout: 10000 },
    );
    await page.waitForFunction(
      () => document.activeElement?.className === 'nf-chapter-title-input',
      undefined,
      { timeout: 10000 },
    );
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () => document.activeElement?.className !== 'nf-chapter-title-input',
      undefined,
      { timeout: 10000 },
    );

    await page.keyboard.press('Meta+z');
    await page.waitForFunction(
      ({ chapterCount, blockCount }) => {
        const current = window.__noteforestTest.state();
        const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
        return (runtime?.chapters ?? 0) === chapterCount && (runtime?.blocks ?? 0) === blockCount;
      },
      { chapterCount: chaptersBefore, blockCount: blocksBefore },
      { timeout: 10000 },
    );
    assert.deepEqual(
      await canonicalStructure(),
      beforeNewChapter,
      'one undo removes the new chapter and its first block exactly',
    );
    assert.equal(
      await page.getByText(/Cannot delete the last top-level block/).count(),
      0,
      'undo does not repeat the empty-chapter rejection toast',
    );
    const afterChapterUndo = await h.activeRuntimeInfo();
    assert.equal(
      afterChapterUndo.canUndoStructural,
      true,
      'older structural history remains reachable after the chapter undo',
    );
    assert.equal(
      afterChapterUndo.canRedoStructural,
      false,
      'chapter.delete has no structural redo (recorded follow-up)',
    );

    await page.keyboard.press('Meta+z');
    await h.waitCanonicalBlockCount(blocksBefore - 1);
    await h.waitBlockCount(blocksBefore - 1);
    assert.deepEqual(
      await canonicalStructure(),
      beforeExtra,
      'the next undo reaches the older top-level block creation',
    );
    await h.waitSaved();

    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
    await h.quit();
  });

  it('applies the M2c keyboard, heading, chapter and landscape model', async () => {
    await launch(isolated('keyboard'));
    await page.locator('.nf-empty-actions .nf-button-primary').click();
    await h.waitBlockCount(1);
    const orientation = (await h.state()).runtimes[0]?.orientation;
    assert.equal(orientation, 'landscape', 'new documents default to A4 landscape');

    // Markdown heading, Enter escapes it inside the same block.
    await page.keyboard.type('# Quantum notes');
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-block-prose h1');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Body text');
    await page.waitForFunction(
      () => {
        const scope = document.querySelector('.nf-editor[data-active="true"]');
        return (
          scope?.querySelectorAll('.nf-block-prose h1').length === 1 &&
          scope?.querySelectorAll('.nf-block-prose p').length === 1
        );
      },
      undefined,
      { timeout: 10000 },
    );
    assert.equal((await h.parity()).canvas, 1, 'Enter at the end of a heading stays in the block');
    assert.equal(await h.activeEditor().locator('.nf-block-prose h1').count(), 1);
    assert.equal(await h.activeEditor().locator('.nf-block-prose p').count(), 1);

    // Shift+Enter is a hard break.
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('second line');
    await page.waitForFunction(
      () => document.querySelectorAll('.nf-editor[data-active="true"] .nf-block-prose br').length === 1,
      undefined,
      { timeout: 10000 },
    );
    assert.equal(
      await h.activeEditor().locator('.nf-block-prose br').count(),
      1,
      'Shift+Enter inserts a hard break',
    );

    // Option+Enter sibling, Control+Enter child.
    await page.keyboard.press('Alt+Enter');
    await h.waitBlockCount(2);
    await page.keyboard.press('Control+Enter');
    await h.waitBlockCount(3);
    await h.waitLayout({ blocks: 3, arrows: 1 });
    assert.equal(
      await h.activeEditor().locator('.nf-edge-path').count(),
      1,
      'the child key creates an arrow',
    );

    // Tab in a normal paragraph never creates a child and leaves the
    // contenteditable body so keyboard users can reach the card controls and
    // the rest of the shell.
    await h.activeEditor().locator('[data-block-card] .nf-block-prose').last().click();
    await page.keyboard.press('End');
    await page.keyboard.press('Tab');
    await page.waitForFunction(
      () => document.activeElement?.isContentEditable !== true,
      undefined,
      { timeout: 10000 },
    );
    assert.equal((await h.parity()).canvas, 3, 'Tab in a paragraph does not create a block');
    const focusOutside = await page.evaluate(() => {
      const active = document.activeElement;
      return active !== null && active.isContentEditable !== true;
    });
    assert.equal(focusOutside, true, 'Tab exits the contenteditable body');
    // Return the caret to the last block for the list-indent check.
    await h.activeEditor().locator('[data-block-card] .nf-block-prose').last().click();
    await page.keyboard.press('End');

    // Tab in a list is native indent, not a block.
    await page.keyboard.type('- first item');
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-block-prose ul');
    await page.keyboard.press('Enter');
    await page.keyboard.type('second item');
    await page.keyboard.press('Tab');
    await page.waitForFunction(
      () => document.querySelectorAll('.nf-editor[data-active="true"] .nf-block-prose ul ul').length === 1,
      undefined,
      { timeout: 10000 },
    );
    assert.equal((await h.parity()).canvas, 3, 'Tab in a list does not create a block');
    assert.equal(await h.activeEditor().locator('.nf-block-prose ul ul').count(), 1, 'Tab nests the list item');

    // Palette block-type control can always escape a heading without changing
    // the block identity.
    const rootCard = h.activeEditor().locator('[data-block-card]').first();
    const rootId = await rootCard.getAttribute('data-block-card');
    await rootCard.locator('.nf-block-prose').first().click();
    assert.ok(rootId !== null);
    await h.waitSelected(rootId);
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('.nf-palette');
    await page.getByRole('option', { name: /Block type: Heading 2/ }).click();
    await page.waitForSelector('.nf-palette', { state: 'detached' });
    await page.waitForFunction(
      () => document.querySelectorAll('.nf-editor[data-active="true"] .nf-block-prose h2').length === 1,
      undefined,
      { timeout: 10000 },
    );
    assert.equal(await h.activeEditor().locator('.nf-block-prose h2').count(), 1);
    assert.equal(
      await h.activeEditor().locator(`[data-block-card="${rootId}"]`).count(),
      1,
      'heading change keeps the block ID',
    );
    // Let the palette finish restoring focus before the next block-type change.
    // The title-bar button is used for the second open so the test does not
    // depend on the F2 repeated-shortcut dedupe window.
    await waitFocusRestored();
    await page.locator('.nf-palette-button').click();
    await page.waitForSelector('.nf-palette');
    await page.getByRole('option', { name: /Block type: Text/ }).click();
    await page.waitForSelector('.nf-palette', { state: 'detached' });
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          '.nf-editor[data-active="true"] .nf-block-prose h1, .nf-editor[data-active="true"] .nf-block-prose h2, .nf-editor[data-active="true"] .nf-block-prose h3',
        ).length === 0,
      undefined,
      { timeout: 10000 },
    );
    assert.equal(
      await h.activeEditor().locator('.nf-block-prose h1, .nf-block-prose h2, .nf-block-prose h3').count(),
      0,
    );

    // Inline chapter title edit and sidebar sync.
    await page.locator('.nf-chapter-title').click();
    const chapterInput = page.locator('.nf-chapter-title-input');
    await chapterInput.fill('Linear systems');
    await chapterInput.press('Enter');
    await showOutline();
    await page.waitForFunction(
      () => document.querySelector('.nf-tree-chapter-row .nf-tree-label')?.textContent?.trim() === 'Linear systems',
      undefined,
      { timeout: 10000 },
    );
    assert.equal(
      (await page.locator('.nf-tree-chapter-row .nf-tree-label').first().innerText()).trim(),
      'Linear systems',
      'sidebar chapter title follows the canvas edit',
    );

    // Add a top-level block to the selected chapter, from that chapter's row.
    const beforeTopLevel = (await h.parity()).canvas;
    const beforeChapters = (await h.activeRuntimeInfo()).chapterList;
    await page.locator('[data-chapter-add]').first().click();
    await h.waitBlockCount(beforeTopLevel + 1);
    await page.waitForFunction(
      (expected) => {
        const current = window.__noteforestTest.state();
        const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
        return (runtime?.chapterList[0]?.blocks ?? 0) === expected;
      },
      (beforeChapters[0]?.blocks ?? 0) + 1,
      { timeout: 10000 },
    );
    const afterTopLevel = (await h.activeRuntimeInfo()).chapterList;
    assert.equal((await h.parity()).canvas, beforeTopLevel + 1, 'canvas adds a top-level block');
    assert.equal(
      afterTopLevel[0]?.blocks,
      (beforeChapters[0]?.blocks ?? 0) + 1,
      'the new block belongs to the chapter whose row was clicked',
    );

    // Add chapter: it is inserted after the active chapter and its title is focused.
    await page.locator('[data-canvas-action="add-chapter"]').click();
    await page.waitForFunction(
      () => {
        const current = window.__noteforestTest.state();
        const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
        return (runtime?.chapters ?? 0) === 2;
      },
      undefined,
      { timeout: 10000 },
    );
    await page.waitForFunction(
      () => document.querySelectorAll('.nf-tree-chapter-row').length === 2,
      undefined,
      { timeout: 10000 },
    );
    await page.waitForFunction(
      () => document.activeElement?.className === 'nf-chapter-title-input',
      undefined,
      { timeout: 10000 },
    );
    await h.waitLayout({ blocks: beforeTopLevel + 2 });
    const afterChapter = await h.parity();
    assert.equal(afterChapter.canvas, beforeTopLevel + 2, 'canvas adds a chapter with its first block');
    assert.equal(afterChapter.sidebar, afterChapter.canvas, 'sidebar follows canvas chapter creation');
    assert.equal(
      await page.evaluate(() => document.activeElement?.className),
      'nf-chapter-title-input',
      'the new chapter title is focused',
    );
    await page.keyboard.press('Escape');
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
    await h.quit();
  });


  it('adds top-level blocks to the selected chapter and chapters after the active one', async () => {
    await launch(isolated('chapters'));
    await h.setWindowSize(1440, 900);
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    await showOutline();

    const initial = (await h.activeRuntimeInfo()).chapterList;
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
    await page.waitForFunction(
      () => {
        const current = window.__noteforestTest.state();
        const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
        return (runtime?.chapters ?? 0) === 2;
      },
      undefined,
      { timeout: 10000 },
    );
    await page.waitForFunction(
      () => document.activeElement?.className === 'nf-chapter-title-input',
      undefined,
      { timeout: 10000 },
    );
    await h.waitLayout({ blocks: 8 });
    assert.equal(
      await page.evaluate(() => document.activeElement?.className),
      'nf-chapter-title-input',
      'the new chapter title is focused',
    );
    await page.keyboard.press('Escape');
    await h.waitLayout({ blocks: 8 });
    const two = (await h.activeRuntimeInfo()).chapterList;
    assert.equal(two.length, 2);
    const lastChapterId = two[1].id;

    // Select a block in chapter 1 and add a top-level block from that
    // chapter's row: it must not go to the last chapter.
    await h.activeEditor().locator('[data-block-card]').first().click();
    await page.locator(`[data-chapter-add="${firstChapterId}"]`).click();
    await h.waitBlockCount(9);
    await page.waitForFunction(
      (expected) => {
        const current = window.__noteforestTest.state();
        const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
        return (runtime?.chapterList[0]?.blocks ?? 0) === expected;
      },
      firstBlocks + 1,
      { timeout: 10000 },
    );
    const afterBlock = (await h.activeRuntimeInfo()).chapterList;
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
    await page.waitForFunction(
      () => document.querySelectorAll('.nf-tree-chapter-row').length === 3,
      undefined,
      { timeout: 10000 },
    );
    await h.waitLayout({ blocks: 10 });
    const three = (await h.activeRuntimeInfo()).chapterList;
    assert.equal(three.length, 3);
    assert.equal(three[0].id, firstChapterId);
    assert.equal(three[2].id, lastChapterId, 'the existing last chapter stays last');
    assert.notEqual(three[1].id, lastChapterId, 'the new chapter sits after the active chapter');
    await page.waitForFunction(
      (id) =>
        document.activeElement
          ?.closest('[data-chapter-id]')
          ?.getAttribute('data-chapter-id') === id,
      three[1].id,
      { timeout: 10000 },
    );
    const focusedChapter = await page.evaluate(
      () => document.activeElement?.closest('[data-chapter-id]')?.getAttribute('data-chapter-id') ?? null,
    );
    assert.equal(focusedChapter, three[1].id, 'the new chapter title is focused');
    await page.keyboard.press('Escape');
    await h.quit();
  });

  it('saves pending edits on close and restores them after relaunch', async () => {
    const env = isolated('close-normal');
    await launch(env);
    await createDocumentWithText('Closing the window keeps this paragraph');
    await closeMainWindow();
    await waitWindowCount(0);
    await h.quit();
    await launch(env);
    await page.waitForSelector('.nf-editor[data-active="true"]');
    await h.waitEditorText('Closing the window keeps this paragraph');
  });

  it('saves pending edits on quit and restores them after relaunch', async () => {
    const env = isolated('quit-normal');
    await launch(env);
    await createDocumentWithText('Quitting keeps this paragraph');
    await h.app.evaluate(({ app: electronApp }) => {
      electronApp.quit();
    });
    await waitProcessExit();
    await h.quit();
    await launch(env);
    await page.waitForSelector('.nf-editor[data-active="true"]');
    await h.waitEditorText('Quitting keeps this paragraph');
  });

  it('keeps the window open on a flush timeout and closes after Retry', async () => {
    await launch({ ...isolated('flush-timeout'), NOTEFOREST_FLUSH_TIMEOUT_MS: '400' });
    await mockCloseDialogs();
    await page.evaluate(() => window.__noteforestTest.setFlushMode('hang'));
    await closeMainWindow();
    const dialog = await waitCloseDialog();
    assert.deepEqual(dialog.buttons, ['Retry', 'Cancel']);
    assert.match(dialog.message, /could not save your changes before closing/i);
    assert.match(dialog.detail, /did not confirm the save within 400 ms/);
    await waitWindowCount(1);
    await page.evaluate(() => window.__noteforestTest.setFlushMode('normal'));
    await answerCloseDialog(0);
    await waitWindowCount(0);
  });

  it('surfaces a flush error on quit and keeps the app open until Cancel', async () => {
    await launch(isolated('flush-error'));
    await mockCloseDialogs();
    await page.evaluate(() => window.__noteforestTest.setFlushMode('error'));
    await h.app.evaluate(({ app: electronApp }) => {
      electronApp.quit();
    });
    const dialog = await waitCloseDialog();
    assert.deepEqual(dialog.buttons, ['Retry', 'Cancel']);
    assert.match(dialog.message, /could not save your changes before quitting/i);
    assert.match(dialog.detail, /Forced flush failure \(test\)/);
    await waitWindowCount(1);
    await answerCloseDialog(1);
    assert.equal(await page.evaluate(() => window.__noteforestTest.state().ready), true);
    await page.evaluate(() => window.__noteforestTest.setFlushMode('normal'));
    await h.app.evaluate(({ app: electronApp }) => {
      electronApp.quit();
    });
    await waitProcessExit();
  });

  it('quits after the last window is closed', async () => {
    await launch(isolated('quit'));
    await page.waitForSelector('.nf-empty-state');
    const child = h.app.process();
    const exited = new Promise((resolveExit) => {
      child.once('exit', (code, signal) => resolveExit({ code, signal }));
    });
    await h.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].close();
    });
    await waitUntil(
      async () =>
        (await h.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)) === 0,
      'last window closed',
    );
    await h.app.evaluate(({ app: electronApp }) => {
      electronApp.quit();
    });
    const outcome = await Promise.race([exited, delay(5000).then(() => 'timeout')]);
    assert.notEqual(
      outcome,
      'timeout',
      'process exits within 5 s after closing the last window and quitting',
    );
  });

  it('surfaces a permission save failure and recovers with Retry', async () => {
    await launch(isolated('save-failure'));
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    const packagePath = (await h.state()).activeTab;
    await setPackageWritable(packagePath, false);
    try {
      await h.activeEditor().locator('[data-block-card] .nf-block-prose').first().click();
      await page.keyboard.press('End');
      await page.keyboard.type(' Blocked by permissions');
      await waitSaveFailure('permission');

      const status = page.locator('[data-save-state]');
      assert.equal((await status.innerText()).trim().startsWith('Save failed'), true);
      assert.equal(await status.getAttribute('data-save-failure-code'), 'permission');
      assert.equal(await status.getAttribute('role'), 'status');
      assert.equal(await status.getAttribute('aria-live'), 'polite');

      const banner = page.locator('[data-save-failure="true"]');
      await banner.waitFor();
      assert.match(await banner.locator('.nf-save-failure-title').innerText(), /cannot write/i);
      assert.match(await banner.locator('.nf-save-failure-message').innerText(), /permission|EACCES/i);
      for (const action of ['retry', 'save-copy', 'reload', 'reveal']) {
        assert.equal(
          await banner.locator(`[data-save-action="${action}"]`).count(),
          1,
          `${action} action is present`,
        );
      }
      assert.equal(
        await banner.getByRole('button', { name: /overwrite/i }).count(),
        0,
        'permission failures never offer overwrite',
      );
      assert.equal(
        await banner.locator('[data-save-action="overwrite"]').count(),
        0,
        'overwrite is external-modification only',
      );

      // Autosave retries on the 2 s backoff instead of hammering or stopping
      // silently. The attempt counter is the condition; no fixed sleep.
      await waitSaveAttempts(2);

      await setPackageWritable(packagePath, true);
      await banner.locator('[data-save-action="retry"]').click();
      await h.waitSaved();
      await page.waitForSelector('[data-save-failure="true"]', { state: 'detached' });
      await h.waitEditorText('Blocked by permissions');

      const disk = await readDiskDocument(packagePath);
      assert.match(JSON.stringify(disk), /Blocked by permissions/);
    } finally {
      await setPackageWritable(packagePath, true);
    }
  });

  it('saves a copy of the unsaved content and leaves the original untouched', async () => {
    const env = isolated('save-copy');
    await launch(env);
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    const packagePath = (await h.state()).activeTab;
    const originalPath = resolve(packagePath, 'document.json');
    const originalBytes = await readFile(originalPath);
    const destination = resolve(env.NOTEFOREST_LIBRARY, 'rescued copy');
    await setPackageWritable(packagePath, false);
    try {
      await h.activeEditor().locator('[data-block-card] .nf-block-prose').first().click();
      await page.keyboard.press('End');
      await page.keyboard.type(' Rescued from a failed save');
      await waitSaveFailure('permission');

      await mockSaveCopyDialog(destination);
      await page.locator('[data-save-action="save-copy"]').click();

      await page.waitForFunction(
        (expected) => window.__noteforestTest.state().tabs.length === 2 &&
          window.__noteforestTest.state().activeTab === expected,
        destination,
        { timeout: 10000 },
      );
      const copy = await readDiskDocument(destination);
      assert.match(JSON.stringify(copy), /Rescued from a failed save/);
      assert.equal(copy.id, (await readDiskDocument(packagePath)).id, 'copy keeps the document identity');
      assert.deepEqual(
        Object.keys(copy.blocks).sort(),
        Object.keys((await readDiskDocument(packagePath)).blocks).sort(),
        'copy contains every block',
      );
      assert.equal(
        (await readFile(originalPath)).equals(originalBytes),
        true,
        'the original document.json was not rewritten by the copy',
      );

      const dialogs = await h.app.evaluate(() => globalThis.__nfSaveDialogs ?? []);
      assert.equal(dialogs.length, 1);
      assert.equal(dialogs[0].buttonLabel, 'Save copy');

      // Restore write access only after the "original untouched" checks, then
      // let the original's re-enabled autosave finish.
      await setPackageWritable(packagePath, true);
      await h.waitSaved();
    } finally {
      await setPackageWritable(packagePath, true);
    }
  });

  it('reloads externally changed content only after confirmation', async () => {
    await launch(isolated('external-reload'));
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    const packagePath = (await h.state()).activeTab;
    const documentPath = resolve(packagePath, 'document.json');
    const externalBytes = await modifyDocumentOnDisk(packagePath, (document) => {
      setFirstBlockText(document, 'Externally edited text');
    });

    await h.activeEditor().locator('[data-block-card] .nf-block-prose').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Local change discarded by reload');
    await waitSaveFailure('external-modification');

    const editor = page.locator('.nf-editor[data-active="true"]');
    const reload = activeSaveBanner().locator('[data-save-action="reload"]');

    // Cancel is a real discard guard: the local text and the failure banner stay.
    await reload.click();
    const dialog = page.getByRole('dialog', { name: 'Reload from disk?' });
    await dialog.waitFor();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.match(await editor.innerText(), /Local change discarded by reload/);
    assert.equal(
      await page.locator('[data-save-failure="true"]').count(),
      1,
      'cancel keeps the failure visible',
    );
    assert.equal(
      (await readFile(documentPath)).equals(externalBytes),
      true,
      'cancel never writes or reloads the external file',
    );

    await reload.click();
    const confirm = page.getByRole('dialog', { name: 'Reload from disk?' });
    await confirm.waitFor();
    await confirm.getByRole('button', { name: 'Reload from disk', exact: true }).click();

    await page.waitForSelector('.nf-main-column [data-save-failure="true"]', {
      state: 'detached',
    });
    await h.waitSaved();
    await h.waitEditorText('Externally edited text');
    await h.waitEditorText('Local change discarded by reload', false);
    assert.equal(
      (await readFile(documentPath)).equals(externalBytes),
      true,
      'reload reads the external file and never writes it',
    );
  });

  it('creates a text-anchored child, undoes once, and reloads with the anchor intact', async () => {
    const env = isolated('text-anchor');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await createDocumentWithText('Alpha eigenvalue beta');
    await page.keyboard.press('Meta+s');
    await h.waitSaved();
    const packagePath = (await h.state()).activeTab;
    const before = await page.evaluate(() => window.__noteforestTest.structure());
    const parentId = before.chapters[0].topLevelBlockIds[0];
    assert.equal(typeof parentId, 'string');

    // Select "eigenvalue" deterministically with the keyboard: click the
    // source paragraph, go to line start, advance to the word, extend the
    // selection. A raw mouse drag was flaky under full-suite load and the
    // visible window stole OS focus for the screenshot.
    const selectWord = async (value, prefixLength) => {
      const prose = h
        .activeEditor()
        .locator('[data-block-card] .nf-block-prose')
        .first();
      await prose.click();
      await page.keyboard.press('Meta+ArrowLeft');
      for (let index = 0; index < prefixLength; index += 1) {
        await page.keyboard.press('ArrowRight');
      }
      for (let index = 0; index < value.length; index += 1) {
        await page.keyboard.press('Shift+ArrowRight');
      }
      await page.waitForFunction(
        (expected) => window.getSelection()?.toString() === expected,
        value,
        { timeout: 10000 },
      );
    };
    await selectWord('eigenvalue', 'Alpha '.length);
    await page.waitForSelector(
      '[data-testid="selection-toolbar"] [data-action="branch-from-selection"]',
    );
    await page.keyboard.press('Meta+Shift+Enter');

    await h.waitCanonicalBlockCount(2);
    await h.waitBlockCount(2);
    await page.waitForSelector('.nf-anchor-mark[data-anchor-mark="true"]');
    const created = await page.evaluate(() => window.__noteforestTest.structure());
    const anchorId = Object.keys(created.anchors)[0];
    const childId = Object.keys(created.blocks).find((id) => id !== parentId);
    assert.equal(typeof anchorId, 'string');
    assert.equal(typeof childId, 'string');
    assert.equal(created.anchors[anchorId].quote, 'eigenvalue');
    assert.equal(created.anchors[anchorId].blockId, parentId);
    const anchoredBranch = Object.values(created.branches).find(
      (branch) => branch.source.anchorId === anchorId,
    );
    assert.equal(anchoredBranch?.targetBlockId, childId);
    assert.equal(anchoredBranch?.role, 'primary');
    assert.equal(
      await page.locator(`.nf-anchor-mark[data-anchor-mark="true"]`).getAttribute('data-anchor-ids'),
      anchorId,
    );
    assert.equal(
      await h
        .activeEditor()
        .locator(`[data-parent-id="${parentId}"] [data-block-card="${childId}"]`)
        .count(),
      1,
      'the anchored child renders under its parent',
    );
    await page.waitForFunction(
      (expected) => {
        const current = window.__noteforestTest.state();
        const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
        if (runtime?.selectedBlockId !== expected) return false;
        const node = window.getSelection()?.anchorNode;
        if (node === null || node === undefined) return false;
        const element = node instanceof Element ? node : node.parentElement;
        return element?.closest('[data-block-card]')?.getAttribute('data-block-card') === expected;
      },
      childId,
      { timeout: 10000 },
    );

    // One ⌘Z removes the branch, block and newly created anchor exactly.
    await page.keyboard.press('Meta+z');
    await h.waitCanonicalBlockCount(1);
    await h.waitBlockCount(1);
    await page.waitForSelector('.nf-anchor-mark[data-anchor-mark="true"]', { state: 'detached' });
    assert.deepEqual(
      await page.evaluate(() => window.__noteforestTest.structure()),
      before,
      'undo restores the source content and removes every created record',
    );

    // Redo restores the same IDs; the action had one inverse.
    await page.keyboard.press('Meta+Shift+z');
    await h.waitCanonicalBlockCount(2);
    const redone = await page.evaluate(() => window.__noteforestTest.structure());
    assert.deepEqual(Object.keys(redone.blocks).sort(), Object.keys(created.blocks).sort());
    assert.deepEqual(Object.keys(redone.anchors).sort(), Object.keys(created.anchors).sort());
    assert.deepEqual(Object.keys(redone.branches).sort(), Object.keys(created.branches).sort());
    assert.deepEqual(redone.anchors[anchorId], created.anchors[anchorId]);
    assert.equal(redone.branches[anchoredBranch.id]?.source.anchorId, anchorId);

    // Type in the child.
    await page.locator(`[data-block-card="${childId}"] .nf-block-prose`).click();
    await page.keyboard.type('Durable child note');
    await h.waitEditorText('Durable child note');
    await page.keyboard.press('Meta+s');
    await h.waitSaved();

    // The floating toolbar uses the same command: the same span reuses its
    // anchor, adds a second branch, and undo keeps the anchor plus first child.
    await selectWord('eigenvalue', 'Alpha '.length);
    await page.locator('[data-action="branch-from-selection"]').click();
    await h.waitCanonicalBlockCount(3);
    await h.waitBlockCount(3);
    const reused = await page.evaluate(() => window.__noteforestTest.structure());
    assert.deepEqual(Object.keys(reused.anchors), [anchorId]);
    assert.equal(
      Object.values(reused.branches).filter((branch) => branch.source.anchorId === anchorId).length,
      2,
      'the toolbar reuses the existing anchor instead of duplicating it',
    );
    await page.keyboard.press('Meta+z');
    await h.waitCanonicalBlockCount(2);
    await h.waitBlockCount(2);
    const afterReuseUndo = await page.evaluate(() => window.__noteforestTest.structure());
    assert.deepEqual(Object.keys(afterReuseUndo.anchors), [anchorId]);
    assert.ok(afterReuseUndo.blocks[childId] !== undefined, 'the original anchored child survives');
    await page.keyboard.press('Meta+s');
    await h.waitSaved();

    // Relaunch: the marker and branch survive the persisted binding.
    await h.quit();
    await launch(env);
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitEditorText('Durable child note');
    await page.waitForSelector('.nf-anchor-mark[data-anchor-mark="true"]');
    const reloaded = await page.evaluate(() => window.__noteforestTest.structure());
    // `manualBreakBeforeBlockIds` is a resolved personal page setting exposed by
    // the bridge, never canonical document data; compare the canonical part.
    const { manualBreakBeforeBlockIds, ...reloadedCanonical } = reloaded;
    assert.deepEqual(
      reloadedCanonical,
      storedStructure(await readDiskDocument(packagePath)),
      'the reloaded document matches the saved anchor binding and branch',
    );
    assert.equal(reloaded.anchors[anchorId]?.quote, 'eigenvalue');
    assert.equal(reloaded.branches[anchoredBranch.id]?.source.anchorId, anchorId);
    assert.equal(
      await h
        .activeEditor()
        .locator(`[data-parent-id="${parentId}"] [data-block-card="${childId}"]`)
        .count(),
      1,
      'anchored-first child placement survives reload',
    );
    assert.equal(Object.keys(reloaded.anchors).length, 1, 'the reused anchor was not duplicated');
    await h.waitSaved();
  });
});
