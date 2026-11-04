import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
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

async function waitActiveTab(packagePath) {
  await page.waitForFunction(
    (expected) => window.__noteforestTest.state().activeTab === expected,
    packagePath,
    { timeout: 10000 },
  );
}

async function waitZoomLabel(label) {
  await page.waitForFunction(
    (expected) => document.querySelector('.nf-status-zoom')?.textContent?.trim() === expected,
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

/**
 * Replace the native restore destination picker. `null` simulates Cancel; any
 * other value is returned as the chosen package folder.
 */
async function mockRestoreDialog(filePath) {
  await h.app.evaluate(({ dialog }, target) => {
    globalThis.__nfRestoreDialogs = [];
    dialog.showSaveDialog = async (_window, options) => {
      globalThis.__nfRestoreDialogs.push(options);
      if (target === null) return { canceled: true, filePath: undefined };
      return { canceled: false, filePath: target };
    };
  }, filePath ?? null);
}

function backupsDirFor(packagePath, supportDir) {
  const digest = createHash('sha256').update(resolve(packagePath)).digest('hex').slice(0, 32);
  return resolve(supportDir, 'backups', digest);
}

async function typeSavedEdit(value) {
  await h.activeEditor().locator('[data-block-card] .nf-block-prose').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(value);
  await h.waitSaved();
}

async function waitRestoreDialog() {
  const dialog = page.getByRole('dialog', { name: 'Restore backup' });
  await dialog.waitFor({ timeout: 10000 });
  return dialog;
}

async function waitRestoreRows(dialog) {
  await dialog.locator('[data-restore-backup="true"]').waitFor({ timeout: 10000 });
  await dialog.locator('[data-backup-row]').first().waitFor({ timeout: 10000 });
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
    manualBreakBeforeBlockIds: document.manualBreakBeforeBlockIds,
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

async function waitRestoreError(dialog, pattern) {
  await dialog
    .locator('[data-restore-error="true"]')
    .filter({ hasText: pattern })
    .waitFor({ timeout: 10000 });
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
  return page.locator('.nf-editor[data-active="true"] [data-save-failure="true"]');
}

/** Leave the app in a save-clean state so teardown never hits the close dialog. */
async function recoverSaveFailure() {
  if ((await page.locator('[data-save-failure="true"]').count()) > 0) {
    await page.locator('[data-save-action="retry"]').click();
  }
  await h.waitSaved();
}

/**
 * Best-effort teardown for backup-restore tests: close any restore modal,
 * retry a pending save failure, and wait until every runtime is saved. The E2E
 * dialog guard prevents a blocked quit, but a failed assertion must still not
 * leave the document dirty for the next test.
 */
async function recoverBackupFailure() {
  const dialog = page.getByRole('dialog', { name: 'Restore backup' });
  if ((await dialog.count()) > 0) {
    await page.keyboard.press('Escape').catch(() => undefined);
    await dialog.waitFor({ state: 'detached' }).catch(() => undefined);
  }
  if ((await page.locator('[data-save-failure="true"]').count()) > 0) {
    await page.locator('[data-save-action="retry"]').click().catch(() => undefined);
  }
  await h.waitSaved().catch(() => undefined);
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
    const firstPath = await (async () => {
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

    // Rename document.
    await page.locator('.nf-document-title').click();
    await page.locator('.nf-dialog').getByRole('textbox', { name: 'Name' }).fill('M2 notes');
    await page.locator('.nf-dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await h.waitSaved();
    assert.equal((await h.state()).tabs[0].title, 'M2 notes');

    // Second document + tab switching.
    await page.locator('.nf-new-note').click();
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
    await page.keyboard.press('Meta+2');
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
    await h.quit();
  });

  it('serializes rapid structural creation and keeps canvas, sidebar and arrows in parity', async () => {
    await launch(isolated('rapid'));
    await page.waitForSelector('.nf-empty-state');
    await page.locator('.nf-empty-actions .nf-button-primary').click();
    await h.waitBlockCount(1);
    const firstPath = (await h.state()).activeTab;
    await page.keyboard.type('Root block');
    await h.waitSaved();

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
    // chapter and slot; redo reattaches with the same branch ID.
    const chapterTwoText = 'Chapter two note';
    const chapterTwoBlockId = await addChapterWithBlock(chapterTwoText);
    await h.waitSaved();
    const beforeCrossChapter = await canonicalStructure();
    assert.equal(beforeCrossChapter.chapters.length, 2);
    assert.equal(beforeCrossChapter.chapters[1]?.topLevelBlockIds[0], chapterTwoBlockId);

    await moveBlockThroughDialog(chapterTwoText, 'Eigenvalues');
    await h.waitEdges(4);
    await h.waitCanonicalBlockCount(8);
    const afterCrossMove = await canonicalStructure();
    const crossMoveBranchId = Object.keys(afterCrossMove.branches).find(
      (branchId) => beforeCrossChapter.branches[branchId] === undefined,
    );
    assert.ok(crossMoveBranchId !== undefined, 'the cross-chapter move creates a branch');
    assert.deepEqual(afterCrossMove.branches[crossMoveBranchId].source, { blockId: aId });
    assert.equal(afterCrossMove.branches[crossMoveBranchId].targetBlockId, chapterTwoBlockId);
    assert.equal(afterCrossMove.branches[crossMoveBranchId].role, 'primary');
    assert.equal(typeof afterCrossMove.branches[crossMoveBranchId].order, 'string');
    assert.equal(afterCrossMove.chapters[1]?.topLevelBlockIds.length, 0);
    const crossMoveParity = await h.parity();
    assert.equal(crossMoveParity.canvas, crossMoveParity.sidebar);
    assert.equal(crossMoveParity.canonical, 8);

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
    assert.equal(afterAttach.chapters[1]?.topLevelBlockIds.length, 0);
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
    assert.equal((await h.parity()).sidebar, 8, 'sidebar matches after the attach undo');

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

    // The settings surface uses the same router: a text edit is undone, not
    // presented as a structural-only command.
    await focusBlockEnd(textE);
    await page.keyboard.type(' TOOLBAR-TEXT');
    await h.waitEditorText('TOOLBAR-TEXT');
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('.nf-palette');
    await page.getByRole('option', { name: /Settings/ }).click();
    await page.waitForSelector('.nf-dialog');
    await page.getByRole('button', { name: 'Undo last change' }).click();
    await h.waitEditorText('TOOLBAR-TEXT', false);
    await page.getByRole('button', { name: 'Done' }).click();
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

    // Tab in a normal paragraph never creates a child.
    await page.keyboard.press('Tab');
    await page.waitForFunction(
      () => document.activeElement?.closest('.nf-prosemirror') !== null,
      undefined,
      { timeout: 10000 },
    );
    assert.equal((await h.parity()).canvas, 3, 'Tab in a paragraph does not create a block');
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

  it('adds top-level blocks to the selected chapter and chapters after the active one', async () => {
    await launch(isolated('chapters'));
    await h.setWindowSize(1440, 900);
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();

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
      assert.equal((await status.innerText()).trim(), 'Save failed');
      assert.equal(await status.getAttribute('data-save-failure-code'), 'permission');

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

  it('reloads from disk only after confirmation and discards local changes', async () => {
    await launch(isolated('reload'));
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    const packagePath = (await h.state()).activeTab;
    const originalBytes = await readFile(resolve(packagePath, 'document.json'));
    await setPackageWritable(packagePath, false);
    try {
      await h.activeEditor().locator('[data-block-card] .nf-block-prose').first().click();
      await page.keyboard.press('End');
      await page.keyboard.type(' Local change that reload must discard');
      await waitSaveFailure('permission');

      await page.locator('[data-save-action="reload"]').click();
      const dialog = page.getByRole('dialog', { name: 'Reload from disk?' });
      await dialog.waitFor();
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await page.getByRole('dialog', { name: 'Reload from disk?' }).waitFor({ state: 'detached' });
      assert.match(await page.locator('.nf-editor[data-active="true"]').innerText(), /Local change that reload must discard/);
      assert.equal(await page.locator('[data-save-failure="true"]').count(), 1, 'cancel keeps the failure visible');

      await setPackageWritable(packagePath, true);
      await page.locator('[data-save-action="reload"]').click();
      const confirm = page.getByRole('dialog', { name: 'Reload from disk?' });
      await confirm.waitFor();
      await confirm.getByRole('button', { name: 'Reload from disk', exact: true }).click();

      await page.waitForSelector('[data-save-failure="true"]', { state: 'detached' });
      await page.waitForFunction(
        () => {
          const current = window.__noteforestTest.state();
          const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
          return runtime?.saveState === 'saved';
        },
        undefined,
        { timeout: 10000 },
      );
      assert.equal(
        (await readFile(resolve(packagePath, 'document.json'))).equals(originalBytes),
        true,
        'reload never writes to disk',
      );
      assert.doesNotMatch(
        await page.locator('.nf-editor[data-active="true"]').innerText(),
        /Local change that reload must discard/,
        'local changes are gone after the confirmed reload',
      );
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

    await activeSaveBanner().locator('[data-save-action="reload"]').click();
    const dialog = page.getByRole('dialog', { name: 'Reload from disk?' });
    await dialog.waitFor();
    await dialog.getByRole('button', { name: 'Reload from disk', exact: true }).click();

    await page.waitForSelector('.nf-editor[data-active="true"] [data-save-failure="true"]', {
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

  it('overwrites an external modification only after a Cancel-default confirmation', async () => {
    await launch(isolated('external-overwrite'));
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    const packagePath = (await h.state()).activeTab;
    const documentPath = resolve(packagePath, 'document.json');
    const externalBytes = await modifyDocumentOnDisk(packagePath, (document) => {
      document.title = 'Externally renamed';
    });

    await h.activeEditor().locator('[data-block-card] .nf-block-prose').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Local content that overwrite keeps');
    await waitSaveFailure('external-modification');

    const banner = activeSaveBanner();
    await banner.waitFor();
    assert.match(await banner.locator('.nf-save-failure-title').innerText(), /changed on disk/i);
    assert.equal(await banner.getAttribute('data-save-failure-code'), 'external-modification');
    for (const action of ['retry', 'overwrite', 'save-copy', 'reload', 'reveal']) {
      assert.equal(
        await banner.locator(`[data-save-action="${action}"]`).count(),
        1,
        `${action} action is present`,
      );
    }
    assert.equal(
      (await readFile(documentPath)).equals(externalBytes),
      true,
      'a failed save never touches the external file',
    );

    await banner.locator('[data-save-action="overwrite"]').click();
    const dialog = page.getByRole('dialog', { name: 'Overwrite file on disk?' });
    await dialog.waitFor();
    const dialogText = await dialog.innerText();
    assert.match(dialogText, new RegExp(packagePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(dialogText, /lost/i);
    await page.waitForFunction(
      () => document.activeElement?.textContent?.trim() === 'Cancel',
      undefined,
      { timeout: 5000 },
    );

    // Cancel is the default: the external file stays untouched and the banner
    // remains the authoritative state.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.equal((await readFile(documentPath)).equals(externalBytes), true);
    assert.equal(await banner.count(), 1, 'cancel keeps the external-modification banner');

    await banner.locator('[data-save-action="overwrite"]').click();
    const confirm = page.getByRole('dialog', { name: 'Overwrite file on disk?' });
    await confirm.waitFor();
    await confirm.getByRole('button', { name: 'Overwrite', exact: true }).click();

    await page.waitForSelector('.nf-editor[data-active="true"] [data-save-failure="true"]', {
      state: 'detached',
    });
    await h.waitSaved();
    const disk = await readDiskDocument(packagePath);
    assert.match(JSON.stringify(disk), /Local content that overwrite keeps/);
    assert.equal(disk.title, 'Linear algebra', 'the local title replaced the external one');

    // The overwrite establishes the new hash: the next normal save must not
    // report a repeated false conflict.
    await h.activeEditor().locator('[data-block-card] .nf-block-prose').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' and a later save');
    await h.waitSaved();
    assert.match(
      JSON.stringify(await readDiskDocument(packagePath)),
      /and a later save/,
      'the next save succeeds without another conflict',
    );
    assert.equal(
      await page.locator('[data-save-failure="true"]').count(),
      0,
      'no false external-modification banner after overwrite',
    );
  });

  it('saves a copy after external modification without touching the external file', async () => {
    const env = isolated('external-copy');
    await launch(env);
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    const packagePath = (await h.state()).activeTab;
    const documentPath = resolve(packagePath, 'document.json');
    const originalBytes = await readFile(documentPath);
    const externalBytes = await modifyDocumentOnDisk(packagePath, (document) => {
      setFirstBlockText(document, 'External content before copy');
    });

    await h.activeEditor().locator('[data-block-card] .nf-block-prose').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Local content rescued from the conflict');
    await waitSaveFailure('external-modification');

    const destination = resolve(env.NOTEFOREST_LIBRARY, 'external rescue copy');
    await mockSaveCopyDialog(destination);
    await activeSaveBanner().locator('[data-save-action="save-copy"]').click();

    await page.waitForFunction(
      (expected) =>
        window.__noteforestTest.state().tabs.length === 2 &&
        window.__noteforestTest.state().activeTab === expected,
      destination,
      { timeout: 10000 },
    );
    const copy = await readDiskDocument(destination);
    assert.match(JSON.stringify(copy), /Local content rescued from the conflict/);
    assert.equal(
      (await readFile(documentPath)).equals(externalBytes),
      true,
      'the original external file is untouched by the copy',
    );

    // Restore the pre-conflict bytes so the original runtime can save cleanly
    // before teardown. The copy assertions above already ran.
    await page.evaluate((path) => window.__noteforestTest.openPath(path), packagePath);
    await waitActiveTab(packagePath);
    await writeFile(documentPath, originalBytes);
    const banner = activeSaveBanner();
    if ((await banner.count()) > 0) {
      await banner.locator('[data-save-action="retry"]').click();
    }
    await h.waitSaved();
  });

  it('lists valid backups newest first and restores one as a new copy', async () => {
    const env = isolated('backup-restore');
    await launch(env);
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    const packagePath = (await h.state()).activeTab;
    const documentPath = resolve(packagePath, 'document.json');
    const assetsPath = resolve(packagePath, 'assets', 'diagram.bin');
    const assetBytes = 'restored asset bytes';
    await mkdir(resolve(packagePath, 'assets'), { recursive: true });
    await writeFile(assetsPath, assetBytes);

    await typeSavedEdit(' First saved edit');
    await typeSavedEdit(' Second saved edit');
    await typeSavedEdit(' Third saved edit');

    const backupsDir = backupsDirFor(packagePath, env.NOTEFOREST_APP_SUPPORT);
    await mkdir(backupsDir, { recursive: true });
    const autosaves = (await readdir(backupsDir))
      .filter((name) => name.startsWith('autosave-') && name.endsWith('.json'))
      .sort();
    const newestAutosave = autosaves.at(-1);
    assert.ok(newestAutosave, 'normal saves created at least one autosave backup');
    const manualDocument = JSON.parse(
      await readFile(resolve(backupsDir, newestAutosave), 'utf8'),
    );
    manualDocument.revision = 99;
    manualDocument.title = 'Manual snapshot';
    manualDocument.updatedAt = '2099-01-01T00:00:00.000Z';
    const manualPath = resolve(
      backupsDir,
      'manual-20990101T000000000Z-r0000000099.json',
    );
    await writeFile(manualPath, JSON.stringify(manualDocument, null, 2));
    const invalidPath = resolve(
      backupsDir,
      'autosave-20990101T000000001Z-r0000000100.json',
    );
    await writeFile(invalidPath, '{ "schemaVersion": 1,');

    const originalBytes = await readFile(documentPath);
    await setPackageWritable(packagePath, false);
    try {
      await h.activeEditor().locator('[data-block-card] .nf-block-prose').first().click();
      await page.keyboard.press('End');
      await page.keyboard.type(' Blocked by permissions');
      await waitSaveFailure('permission');

      await activeSaveBanner().locator('[data-save-action="restore-backup"]').click();
      const dialog = await waitRestoreDialog();
      await waitRestoreRows(dialog);

      const rows = await dialog.locator('[data-backup-row]').evaluateAll((nodes) =>
        nodes.map((node) => ({ ...node.dataset })),
      );
      assert.ok(rows.length >= 4, 'invalid, manual, and normal backups are listed');
      assert.equal(rows[0]?.backupValid, 'false', 'the newest invalid backup is disabled');
      assert.equal(rows[0]?.backupSource, invalidPath);
      const invalidRow = dialog.locator('label[data-backup-valid="false"]');
      assert.equal(await invalidRow.count(), 1);
      assert.match(await invalidRow.innerText(), /unusable/i);
      assert.equal(
        await invalidRow.locator('input[data-backup-select]').isDisabled(),
        true,
        'invalid backups cannot be selected',
      );

      const valid = rows.filter((row) => row.backupValid === 'true');
      for (let index = 1; index < valid.length; index += 1) {
        assert.ok(
          (valid[index - 1].backupCreated ?? '') >= (valid[index].backupCreated ?? ''),
          'valid backups are newest first',
        );
      }
      const manualRow = valid.find((row) => row.backupSource === manualPath);
      assert.ok(manualRow, 'the manual backup is listed');
      assert.equal(manualRow.backupKind, 'manual');
      assert.equal(manualRow.backupCreated, '2099-01-01T00:00:00.000Z');
      assert.equal(manualRow.backupRevision, '99');
      assert.equal(manualRow.backupBlocks, String(Object.keys(manualDocument.blocks).length));
      assert.equal(manualRow.backupTitle, 'Manual snapshot');
      assert.equal(
        await dialog.locator('input[data-backup-select]:checked').evaluate(
          (element) => element.closest('label')?.getAttribute('data-backup-source') ?? null,
        ),
        manualPath,
        'the newest valid backup is preselected',
      );

      const destination = resolve(env.NOTEFOREST_LIBRARY, 'restored copy');
      await mockRestoreDialog(destination);
      await dialog.getByRole('button', { name: 'Restore copy…' }).click();

      await page.waitForFunction(
        (expected) => {
          const current = window.__noteforestTest.state();
          return current.tabs.length === 2 && current.activeTab === expected;
        },
        destination,
        { timeout: 10000 },
      );

      const restored = await readDiskDocument(destination);
      assert.deepEqual(restored, manualDocument, 'the restored copy is the selected backup');
      assert.equal(restored.revision, 99);
      assert.equal(restored.title, 'Manual snapshot');
      assert.equal(
        Object.keys(restored.blocks).length,
        Object.keys(manualDocument.blocks).length,
      );
      assert.equal(await readFile(resolve(destination, 'assets', 'diagram.bin'), 'utf8'), assetBytes);
      assert.equal(
        (await readFile(documentPath)).equals(originalBytes),
        true,
        'the original document is untouched',
      );

      const dialogs = await h.app.evaluate(() => globalThis.__nfRestoreDialogs ?? []);
      assert.equal(dialogs.length, 1);
      assert.equal(dialogs[0].buttonLabel, 'Restore copy');
      const folder = basename(packagePath).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      assert.match(
        dialogs[0].defaultPath,
        new RegExp(`${folder} restored \\d{4}-\\d{2}-\\d{2} \\d{2}-\\d{2}-\\d{2}$`),
      );
      assert.ok(
        resolve(dialogs[0].defaultPath).startsWith(resolve(env.NOTEFOREST_LIBRARY)),
        'the default destination is inside the library',
      );

      const originalRuntime = (await h.state()).runtimes.find(
        (runtime) => runtime.packagePath === packagePath,
      );
      assert.equal(
        originalRuntime?.saveFailure?.code,
        'permission',
        'restoring a copy does not clear the original failure',
      );

      await setPackageWritable(packagePath, true);
      await page.evaluate((path) => window.__noteforestTest.openPath(path), packagePath);
      await waitActiveTab(packagePath);
      if ((await activeSaveBanner().count()) > 0) {
        await activeSaveBanner().locator('[data-save-action="retry"]').click();
      }
      await h.waitSaved();
    } finally {
      await setPackageWritable(packagePath, true);
      await page
        .evaluate((path) => window.__noteforestTest.openPath(path), packagePath)
        .catch(() => undefined);
      await recoverBackupFailure();
    }
  });

  it('shows an empty state when there are no valid backups', async () => {
    const env = isolated('backup-empty');
    await launch(env);
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    const packagePath = (await h.state()).activeTab;
    const backupsDir = backupsDirFor(packagePath, env.NOTEFOREST_APP_SUPPORT);
    await setPackageWritable(packagePath, false);
    try {
      await h.activeEditor().locator('[data-block-card] .nf-block-prose').first().click();
      await page.keyboard.press('End');
      await page.keyboard.type(' Cannot save without backups');
      await waitSaveFailure('permission');

      // A failed save writes its safety backup before the atomic write fails;
      // remove it so this test starts from a document with no backups at all.
      await rm(backupsDir, { recursive: true, force: true });

      await activeSaveBanner().locator('[data-save-action="restore-backup"]').click();
      let dialog = await waitRestoreDialog();
      await dialog.locator('[data-backup-empty="true"]').waitFor({ timeout: 10000 });
      assert.match(await dialog.innerText(), /No usable backups/);
      assert.equal(
        await dialog.getByRole('button', { name: /Restore copy/ }).count(),
        0,
        'no restore button in the empty state',
      );
      assert.equal(await dialog.locator('[data-restore-backup="true"]').count(), 0);
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await dialog.waitFor({ state: 'detached' });
      assert.equal((await h.state()).tabs.length, 1, 'cancel does not open a copy');

      await mkdir(backupsDir, { recursive: true });
      await writeFile(
        resolve(backupsDir, 'autosave-20990101T000000000Z-r0000000001.json'),
        '{ "schemaVersion": 1,',
      );

      await activeSaveBanner().locator('[data-save-action="restore-backup"]').click();
      dialog = await waitRestoreDialog();
      await dialog.locator('[data-backup-empty="true"]').waitFor({ timeout: 10000 });
      assert.match(await dialog.innerText(), /No usable backups/);
      assert.equal(
        await dialog.getByRole('button', { name: /Restore copy/ }).count(),
        0,
        'invalid backups never enable restore',
      );
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await dialog.waitFor({ state: 'detached' });
    } finally {
      await setPackageWritable(packagePath, true);
      await recoverBackupFailure();
    }
  });

  it('dismisses a failed-save quit through the E2E dialog guard', async () => {
    const env = isolated('quit-guard');
    await launch(env);
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    const packagePath = (await h.state()).activeTab;
    await setPackageWritable(packagePath, false);
    try {
      await h.activeEditor().locator('[data-block-card] .nf-block-prose').first().click();
      await page.keyboard.press('End');
      await page.keyboard.type(' Quit must not block on a native dialog');
      await waitSaveFailure('permission');

      // No dialog mock here: the E2E guard must answer Cancel immediately.
      await h.app.evaluate(({ app: electronApp }) => {
        electronApp.quit();
      });
      await waitUntil(
        async () => {
          const calls = await h.app.evaluate(() => globalThis.__nfDialogCalls ?? []);
          return calls.some((call) => call.method === 'showMessageBox');
        },
        'guarded quit dialog',
      );
      const calls = await h.app.evaluate(() => globalThis.__nfDialogCalls ?? []);
      const quitCall = calls.find((call) => call.method === 'showMessageBox');
      assert.deepEqual(quitCall.options.buttons, ['Retry', 'Cancel']);
      assert.equal(quitCall.options.cancelId, 1, 'the guard answers Cancel');

      await waitWindowCount(1);
      assert.equal(await page.evaluate(() => window.__noteforestTest.state().ready), true);
      assert.equal(await page.locator('[data-save-failure="true"]').count(), 1);
    } finally {
      await setPackageWritable(packagePath, true);
      await recoverBackupFailure();
    }
  });

  it('refuses existing, outside-library, and read-only restore destinations', async () => {
    const env = isolated('backup-refuse');
    await launch(env);
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    const packagePath = (await h.state()).activeTab;
    const documentPath = resolve(packagePath, 'document.json');
    await typeSavedEdit(' First saved edit');
    await typeSavedEdit(' Second saved edit');
    const originalBytes = await readFile(documentPath);

    const occupied = resolve(env.NOTEFOREST_LIBRARY, 'occupied');
    await mkdir(occupied, { recursive: true });
    await copyFile(documentPath, resolve(occupied, 'document.json'));
    const occupiedBytes = await readFile(resolve(occupied, 'document.json'));

    await setPackageWritable(packagePath, false);
    try {
      await h.activeEditor().locator('[data-block-card] .nf-block-prose').first().click();
      await page.keyboard.press('End');
      await page.keyboard.type(' Blocked by permissions');
      await waitSaveFailure('permission');

      await activeSaveBanner().locator('[data-save-action="restore-backup"]').click();
      const dialog = await waitRestoreDialog();
      await waitRestoreRows(dialog);

      await mockRestoreDialog(occupied);
      await dialog.getByRole('button', { name: 'Restore copy…' }).click();
      await waitRestoreError(dialog, /already exists/i);
      assert.equal((await h.state()).tabs.length, 1, 'overwrite refusal opens no copy');
      assert.equal(
        (await readFile(resolve(occupied, 'document.json'))).equals(occupiedBytes),
        true,
        'the occupied package is not overwritten',
      );

      const outside = resolve(tempRoot, 'outside-restore');
      await mockRestoreDialog(outside);
      await dialog.getByRole('button', { name: 'Restore copy…' }).click();
      await waitRestoreError(dialog, /inside the NoteForest library/i);
      assert.equal((await h.state()).tabs.length, 1);
      await assert.rejects(readFile(resolve(outside, 'document.json')));

      if (typeof process.getuid !== 'function' || process.getuid() !== 0) {
        const readOnly = resolve(env.NOTEFOREST_LIBRARY, 'readonly-target');
        await mkdir(readOnly, { recursive: true });
        await chmod(readOnly, 0o555);
        try {
          await mockRestoreDialog(readOnly);
          await dialog.getByRole('button', { name: 'Restore copy…' }).click();
          await waitRestoreError(dialog, /not writable/i);
          assert.equal((await h.state()).tabs.length, 1);
          await assert.rejects(readFile(resolve(readOnly, 'document.json')));
        } finally {
          await chmod(readOnly, 0o755);
        }
      }

      await mockRestoreDialog(null);
      await dialog.getByRole('button', { name: 'Restore copy…' }).click();
      await waitUntil(
        async () =>
          (await h.app.evaluate(() => globalThis.__nfRestoreDialogs?.length ?? 0)) === 1,
        'restore destination dialog',
      );
      await page.waitForFunction(
        () => {
          const buttons = [...document.querySelectorAll('.nf-dialog button')];
          const restore = buttons.find((button) =>
            button.textContent?.includes('Restore copy'),
          );
          return restore !== undefined && !restore.hasAttribute('disabled');
        },
        undefined,
        { timeout: 10000 },
      );
      assert.equal(await dialog.count(), 1, 'native Cancel keeps the modal open');
      assert.equal((await h.state()).tabs.length, 1);
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await dialog.waitFor({ state: 'detached' });

      assert.equal(
        (await readFile(documentPath)).equals(originalBytes),
        true,
        'no restore attempt writes the original document',
      );

      await setPackageWritable(packagePath, true);
      await activeSaveBanner().locator('[data-save-action="retry"]').click();
      await h.waitSaved();
    } finally {
      await setPackageWritable(packagePath, true);
      await recoverBackupFailure();
    }
  });

  it('blocks closing on a failed save and keeps the content until Retry succeeds', async () => {
    const env = isolated('close-failed');
    await launch(env);
    await mockCloseDialogs();
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    const packagePath = (await h.state()).activeTab;
    await setPackageWritable(packagePath, false);
    try {
      await h.activeEditor().locator('[data-block-card] .nf-block-prose').first().click();
      await page.keyboard.press('End');
      await page.keyboard.type(' Saved only after Retry');
      await waitSaveFailure('permission');

      await closeMainWindow();
      const dialog = await waitCloseDialog();
      assert.deepEqual(dialog.buttons, ['Retry', 'Cancel']);
      assert.match(dialog.detail, /permission|EACCES|could not save/i);
      await waitWindowCount(1);
      await answerCloseDialog(1);
      assert.equal(await page.evaluate(() => window.__noteforestTest.state().ready), true);
      assert.equal(await page.locator('[data-save-failure="true"]').count(), 1);

      await setPackageWritable(packagePath, true);
      await recoverSaveFailure();
      await closeMainWindow();
      await waitWindowCount(0);
    } finally {
      await setPackageWritable(packagePath, true);
    }

    await h.quit();
    await launch(env);
    await page.waitForSelector('.nf-editor[data-active="true"]');
    await h.waitEditorText('Saved only after Retry');
  });
});
