import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { addTopLevelBlock, codeDoc, formulaDoc } from '../support/fixtures.mjs';

const tempRoot = artifactsPath('m4b1a2-ui');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

const READ_MODE_TITLE = 'Read mode — switch to Edit to add content';

async function launch(name) {
  page = await ui.launch(ui.isolated(name));
  await h.setWindowSize(1440, 900);
}

async function activeRuntimeInfo() {
  const state = await h.state();
  return state.runtimes.find((runtime) => runtime.packagePath === state.activeTab);
}

async function waitViewMode(packagePath, layout, interactionMode) {
  await page.waitForFunction(
    ({ path, expectedLayout, expectedMode }) => {
      const view = window.__noteforestTest.viewState()[path];
      return (
        view?.layout === expectedLayout &&
        view?.interactionMode === expectedMode
      );
    },
    { path: packagePath, expectedLayout: layout, expectedMode: interactionMode },
    { timeout: 5000 },
  );
}

async function openPalette() {
  await page.keyboard.press('Meta+k');
  await page.waitForSelector('.nf-palette');
}

async function closePalette() {
  if ((await page.locator('.nf-palette').count()) === 0) return;
  await page.keyboard.press('Escape');
  await page.waitForSelector('.nf-palette', { state: 'detached' });
}

function paletteItem(label) {
  // Match the row label, not the disabled-reason sentence: "New chapter —
  // Read mode — switch to Continuous Edit…" must not shadow the real
  // "Switch to Continuous" command row.
  return page
    .locator('.nf-palette-item', {
      has: page.locator('.nf-palette-label', { hasText: label }),
    })
    .first();
}

async function assertPaletteDisabled(label) {
  const item = paletteItem(label);
  await item.waitFor({ state: 'visible' });
  assert.equal(
    await item.getAttribute('aria-disabled'),
    'true',
    `palette entry "${label}" is disabled in Read`,
  );
  assert.match(await item.innerText(), /Read mode/, `"${label}" states the reason`);
  return item;
}

async function assertPaletteEnabled(label) {
  const item = paletteItem(label);
  await item.waitFor({ state: 'visible' });
  assert.notEqual(
    await item.getAttribute('aria-disabled'),
    'true',
    `palette entry "${label}" is enabled outside Read`,
  );
  assert.doesNotMatch(await item.innerText(), /Read mode/);
  return item;
}

async function invokeAppMenu(id) {
  await h.app.evaluate(
    ({ Menu, BrowserWindow }, menuId) => {
      const item = Menu.getApplicationMenu()?.getMenuItemById(menuId);
      if (item === null || item === undefined) {
        throw new Error(`missing menu item ${menuId}`);
      }
      item.click(item, BrowserWindow.getAllWindows()[0], undefined);
    },
    id,
  );
}

async function sendMenuCommand(command) {
  await h.app.evaluate(({ BrowserWindow }, menuCommand) => {
    BrowserWindow.getAllWindows()[0].webContents.send('menu:command', menuCommand);
  }, command);
}

async function waitForReadModeToast() {
  await page
    .locator('[data-sonner-toast]', { hasText: 'Read mode' })
    .first()
    .waitFor({ timeout: 5000 });
}

async function assertNoDocumentChange(before, label) {
  const afterState = await activeRuntimeInfo();
  assert.equal(afterState.revision, before.revision, `${label}: revision unchanged`);
  assert.equal(afterState.blocks, before.blocks, `${label}: block count unchanged`);
  assert.equal(afterState.branches, before.branches, `${label}: branch count unchanged`);
  assert.equal(afterState.chapters, before.chapters, `${label}: chapter count unchanged`);
}

describe('M4b1a2 Read-mode global gating', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('gates shell authoring in Continuous Read and re-enables it in Continuous Edit', async () => {
    await launch('m4b1a2-continuous');
    await ui.seedDemo();
    await ui.showOutline();
    const packagePath = (await h.state()).activeTab;
    const before = await activeRuntimeInfo();
    const firstBlockId = before.blockIds[0];
    assert.equal(typeof firstBlockId, 'string');
    const blockRow = page.locator(`.nf-tree-row[data-block-id="${firstBlockId}"]`);
    const chapterRow = page.locator('.nf-tree-chapter-row').first();

    // A mode switch is view state only: no revision and no text-history entry.
    await page.keyboard.press('Meta+e');
    await waitViewMode(packagePath, 'continuous', 'read');
    const afterSwitch = await activeRuntimeInfo();
    assert.equal(afterSwitch.revision, before.revision, 'the mode switch creates no revision');
    assert.equal(
      afterSwitch.canUndoText,
      before.canUndoText,
      'the mode switch creates no undo entry',
    );

    // Sidebar authoring is disabled with a visible/accessible reason.
    const addChapter = page
      .locator('.nf-topics-section')
      .getByRole('button', { name: /Add chapter/ });
    const addBlock = page
      .locator('.nf-topics-section .nf-section-foot')
      .getByRole('button', { name: /Add block/ });
    assert.equal(await addChapter.isDisabled(), true);
    assert.match((await addChapter.getAttribute('title')) ?? '', /Read mode/);
    assert.match((await addChapter.getAttribute('aria-label')) ?? '', /Read mode/);
    assert.equal((await addChapter.getAttribute('title')) ?? '', READ_MODE_TITLE);
    assert.equal(await addBlock.isDisabled(), true);
    assert.match((await addBlock.getAttribute('title')) ?? '', /Read mode/);
    assert.match((await addBlock.getAttribute('aria-label')) ?? '', /Read mode/);

    // Sidebar inline rename is unavailable too (double-click and F2 paths).
    await chapterRow.dblclick();
    await page.waitForTimeout(120);
    assert.equal(await page.locator('.nf-tree-rename').count(), 0, 'chapter rename is blocked');
    await blockRow.dblclick();
    await page.waitForTimeout(120);
    assert.equal(await page.locator('.nf-tree-rename').count(), 0, 'block rename is blocked');

    await h.screenshot(
      artifactsPath('m4b1a2', 'continuous-read-sidebar-1440x900.png'),
      { width: 1440, height: 900 },
    );

    // Palette mutating entries are disabled and name the reason; navigation
    // stays available.
    await openPalette();
    for (const label of [
      'New chapter',
      'Add top-level block',
      'Add child block',
      'Add sibling block',
      'Link as reference',
      'Block type: Text',
      'Block type: Heading 1',
      'Undo',
      'Redo',
      'Insert table',
      'Insert image',
      'Insert math',
      'Toggle code block',
    ]) {
      await assertPaletteDisabled(label);
    }
    await assertPaletteEnabled('Save');
    await assertPaletteEnabled('Rename document');
    await assertPaletteEnabled('Switch to Continuous');
    await h.screenshot(
      artifactsPath('m4b1a2', 'continuous-read-palette-1440x900.png'),
      { width: 1440, height: 900 },
    );

    // A disabled insertion action is inert, not a hidden no-op.
    const insertTable = await assertPaletteDisabled('Insert table');
    await insertTable.click({ force: true });
    await page.waitForTimeout(120);
    await assertNoDocumentChange(before, 'disabled insert table');
    assert.equal(await page.locator('.nf-dialog').count(), 0, 'no insertion dialog opened');
    await closePalette();

    // Chapter context menu: both authoring entries are disabled, with reasons.
    await chapterRow.click({ button: 'right' });
    await page.locator('.nf-menu').waitFor();
    const renameChapter = page.getByRole('menuitem', { name: /Rename chapter/ });
    const addChapterBlock = page.getByRole('menuitem', { name: /Add block/ });
    assert.equal(await renameChapter.getAttribute('aria-disabled'), 'true');
    assert.match(await renameChapter.innerText(), /Read mode/);
    assert.equal(await addChapterBlock.getAttribute('aria-disabled'), 'true');
    assert.match(await addChapterBlock.innerText(), /Read mode/);
    await page.keyboard.press('Escape');
    await page.locator('.nf-menu').waitFor({ state: 'detached' });

    // Block menu (reachable from the sidebar): mutating entries are disabled,
    // navigation remains enabled.
    await blockRow.click({ button: 'right' });
    await page.locator('.nf-menu').waitFor();
    const addChild = page.getByRole('menuitem', { name: /Add child block/ });
    const deleteBlock = page.getByRole('menuitem', { name: /Delete block/ });
    const insertTableEntry = page.getByRole('menuitem', { name: /^Insert table/ });
    const editBlock = page.getByRole('menuitem', { name: /^Edit block/ });
    assert.equal(await addChild.getAttribute('aria-disabled'), 'true');
    assert.match(await addChild.innerText(), /Read mode/);
    assert.equal(await deleteBlock.getAttribute('aria-disabled'), 'true');
    assert.equal(await insertTableEntry.getAttribute('aria-disabled'), 'true');
    assert.notEqual(await editBlock.getAttribute('aria-disabled'), 'true');
    await page.keyboard.press('Escape');
    await page.locator('.nf-menu').waitFor({ state: 'detached' });

    // The direct ⌘⇧L link-reference shortcut follows the same gate.
    await page.keyboard.press('Meta+Shift+L');
    await page.waitForTimeout(120);
    assert.equal(await page.locator('.nf-dialog').count(), 0, 'link-reference dialog is blocked');
    await waitForReadModeToast();

    // Keyboard and native-menu undo/redo never mutate in Read.
    await page.locator('.nf-editor[data-active="true"] .nf-prosemirror').click();
    await page.keyboard.press('Meta+z');
    await page.waitForTimeout(120);
    await assertNoDocumentChange(before, 'keyboard undo');
    await invokeAppMenu('menu-undo');
    await page.waitForTimeout(120);
    await assertNoDocumentChange(before, 'native undo');
    await invokeAppMenu('menu-redo');
    await page.waitForTimeout(120);
    await assertNoDocumentChange(before, 'native redo');
    await waitForReadModeToast();

    // Native File menu authoring commands are guarded with a status message.
    await sendMenuCommand('new-chapter');
    await page.waitForTimeout(120);
    await assertNoDocumentChange(before, 'native new chapter');
    await sendMenuCommand('add-block');
    await page.waitForTimeout(120);
    await assertNoDocumentChange(before, 'native add block');
    await waitForReadModeToast();

    // Editor block shortcuts are gated too: the non-editable surface cannot
    // create a child or sibling from the keymap.
    await page.locator('.nf-editor[data-active="true"] .nf-prosemirror').click();
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(120);
    await page.keyboard.press('Alt+Enter');
    await page.waitForTimeout(120);
    await assertNoDocumentChange(before, 'keyboard add child/sibling');

    // Returning to Continuous Edit restores every authoring path.
    await page.keyboard.press('Meta+e');
    await waitViewMode(packagePath, 'continuous', 'edit');
    assert.equal(await addChapter.isDisabled(), false);
    assert.equal(await addBlock.isDisabled(), false);
    assert.equal((await addChapter.getAttribute('title')) ?? '', 'Add chapter');
    assert.equal((await addBlock.getAttribute('title')) ?? '', 'Add block');

    await openPalette();
    await assertPaletteEnabled('New chapter');
    await assertPaletteEnabled('Add top-level block');
    await assertPaletteEnabled('Insert table');
    await assertPaletteEnabled('Undo');
    await closePalette();

    await chapterRow.click({ button: 'right' });
    await page.locator('.nf-menu').waitFor();
    const renameChapterEdit = page.getByRole('menuitem', { name: /Rename chapter/ });
    const addChapterBlockEdit = page.getByRole('menuitem', { name: /Add block/ });
    assert.notEqual(await renameChapterEdit.getAttribute('aria-disabled'), 'true');
    assert.notEqual(await addChapterBlockEdit.getAttribute('aria-disabled'), 'true');
    await page.keyboard.press('Escape');
    await page.locator('.nf-menu').waitFor({ state: 'detached' });

    // The keymap creates a child again in Edit.
    await page.locator('.nf-editor[data-active="true"] .nf-prosemirror').click();
    await page.keyboard.press('Control+Enter');
    await h.waitCanonicalBlockCount(before.blocks + 1);
  });

  it('closes the code and formula node-view editors in Read and never writes', async () => {
    await launch('m4b1a2-node-views');
    await ui.seedDemo();
    const packagePath = (await h.state()).activeTab;
    const codeId = 'gating-code';
    await addTopLevelBlock(ui, codeId, codeDoc('let x = 1;'));
    const formulaId = 'gating-formula';
    await addTopLevelBlock(ui, formulaId, formulaDoc('x^2'));
    await h.waitSaved();

    const code = page.locator(
      `.nf-editor[data-active="true"] [data-block-card="${codeId}"] [data-code-block="true"]`,
    );
    const languageInput = code.locator('[data-code-language-input]');
    const formula = page
      .locator(
        `.nf-editor[data-active="true"] [data-block-card="${formulaId}"] [data-type="inline-math"]`,
      )
      .first();
    const formulaSource = page.locator(
      `.nf-editor[data-active="true"] [data-block-card="${formulaId}"] [data-formula-source]`,
    );
    const formulaActions = page.locator(
      `.nf-editor[data-active="true"] [data-block-card="${formulaId}"] [data-formula-actions="true"]`,
    );

    const before = await ui.structure();
    const runtimeBefore = await activeRuntimeInfo();

    // F1 code: Edit → Read with the caret inside the fence closes the chrome.
    await code.locator('pre code').click();
    await page.waitForFunction(
      (block) =>
        document
          .querySelector(`[data-block-card="${block}"] [data-code-block="true"]`)
          ?.getAttribute('data-code-state') === 'editing',
      codeId,
      { timeout: 5000 },
    );
    await page.keyboard.press('Meta+e');
    await waitViewMode(packagePath, 'continuous', 'read');
    await page.waitForFunction(
      (block) =>
        document
          .querySelector(`[data-block-card="${block}"] [data-code-block="true"]`)
          ?.getAttribute('data-code-state') !== 'editing',
      codeId,
      { timeout: 5000 },
    );
    assert.equal(await code.getAttribute('data-code-state'), 'idle');
    assert.equal(await languageInput.isVisible(), false, 'the language input is closed');
    assert.equal(
      await code.locator('[data-code-action="close"]').isVisible(),
      false,
      'the closing row is closed',
    );
    assert.equal(
      await code.locator('[data-code-action="copy"]').isVisible(),
      false,
      'the copy action is closed',
    );

    // The hidden controls are guarded too, not merely invisible: a forced DOM
    // language commit, blur, close click and typing write nothing.
    await languageInput.evaluate((input) => {
      input.value = 'python';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      input.dispatchEvent(new FocusEvent('blur'));
    });
    await code.locator('[data-code-action="close"]').evaluate((button) => button.click());
    await page.keyboard.type('python');
    await page.keyboard.press('Meta+s');
    await h.waitSaved();

    // F1 formula: open the source in Edit with an unsaved draft, then Read.
    await page.keyboard.press('Meta+e');
    await waitViewMode(packagePath, 'continuous', 'edit');
    await formula.dblclick();
    await formulaSource.waitFor();
    await formulaSource.fill('y^3');

    await page.keyboard.press('Meta+e');
    await waitViewMode(packagePath, 'continuous', 'read');
    await page.waitForSelector(
      `[data-block-card="${formulaId}"] [data-formula-source]`,
      { state: 'detached', timeout: 5000 },
    );
    assert.equal(
      await formulaActions.count(),
      0,
      'the Branch/Copy/Inline-Block action row is closed',
    );
    // A double-click in Read is a NodeSelection, never a writable source.
    await formula.dblclick();
    assert.equal(
      await page.locator(`[data-block-card="${formulaId}"] [data-formula-source]`).count(),
      0,
      'a Read double-click does not reopen the source',
    );
    await page.keyboard.type('y^3');
    await page.keyboard.press('Meta+s');
    await h.waitSaved();
    await h.screenshot(
      artifactsPath('sentinel-fixes', 'read-mode-node-view-closed-1440x900.png'),
      { width: 1440, height: 900 },
    );

    const after = await ui.structure();
    assert.deepEqual(after.blocks, before.blocks, 'Read leaves every block body unchanged');
    assert.deepEqual(after.anchors, before.anchors, 'Read creates no anchor');
    assert.deepEqual(after.branches, before.branches, 'Read creates no branch');
    assert.equal(
      after.blocks[codeId].content.children[0].attrs.language,
      'ts',
      'the canonical code language is unchanged',
    );
    assert.equal(
      after.blocks[formulaId].content.children[0].children[0].attrs.latex,
      'x^2',
      'the canonical LaTeX is unchanged',
    );
    assert.equal(
      (await activeRuntimeInfo()).revision,
      runtimeBefore.revision,
      'Read mode produces no canonical revision',
    );

    // Back in Edit the discarded draft never comes back: the source reopens
    // with the canonical LaTeX.
    await page.keyboard.press('Meta+e');
    await waitViewMode(packagePath, 'continuous', 'edit');
    await formula.dblclick();
    await formulaSource.waitFor();
    assert.equal(await formulaSource.inputValue(), 'x^2');
    await page.keyboard.press('Escape');
  });

  it('gates Page Read and Page Edit shell commands, and re-enables undo in Continuous Edit', async () => {    await launch('m4b1a2-page');
    await ui.seedDemo();
    await ui.showOutline();
    const packagePath = (await h.state()).activeTab;
    const before = await activeRuntimeInfo();
    const chapterRow = page.locator('.nf-tree-chapter-row').first();
    const addChapter = page
      .locator('.nf-topics-section')
      .getByRole('button', { name: /Add chapter/ });
    const addBlock = page
      .locator('.nf-topics-section .nf-section-foot')
      .getByRole('button', { name: /Add block/ });

    // Make one real structural edit so undo has something it could mutate.
    await page.locator('.nf-editor[data-active="true"] .nf-prosemirror').click();
    await page.keyboard.press('Control+Enter');
    await h.waitCanonicalBlockCount(before.blocks + 1);
    // Let the new block's first content commit and save settle: a pending
    // autosave may legitimately advance the revision while Page opens.
    await h.waitSaved();
    const withChild = await activeRuntimeInfo();
    assert.equal(withChild.canUndoStructural, true);

    await page.keyboard.press('Meta+3');
    await waitViewMode(packagePath, 'page', 'read');
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view');
    const structureBeforeUndo = await ui.structure();
    const editorBeforeUndo = await page.evaluate(() => window.__noteforestTest.editorJson());

    assert.equal(await addChapter.isDisabled(), true);
    assert.equal(await addBlock.isDisabled(), true);
    assert.equal(await page.locator('[data-view-interaction="edit"]').isDisabled(), false);

    await openPalette();
    for (const label of ['New chapter', 'Add top-level block', 'Undo', 'Redo', 'Insert table']) {
      await assertPaletteDisabled(label);
    }
    await assertPaletteEnabled('Save');
    await closePalette();

    await page.keyboard.press('Meta+z');
    await page.waitForTimeout(120);
    const structureAfterKeyboardUndo = await ui.structure();
    assert.deepEqual(
      structureAfterKeyboardUndo,
      structureBeforeUndo,
      'keyboard undo leaves canonical content unchanged',
    );
    assert.deepEqual(
      await page.evaluate(() => window.__noteforestTest.editorJson()),
      editorBeforeUndo,
      'keyboard undo leaves the editor buffer unchanged',
    );
    assert.equal(
      (await activeRuntimeInfo()).blocks,
      withChild.blocks,
      'keyboard undo does not delete the child in Page Read',
    );
    await invokeAppMenu('menu-undo');
    await page.waitForTimeout(120);
    assert.equal(
      (await activeRuntimeInfo()).blocks,
      withChild.blocks,
      'native undo does not delete the child in Page Read',
    );
    assert.deepEqual(
      await ui.structure(),
      structureBeforeUndo,
      'native undo leaves canonical content unchanged',
    );
    assert.equal(
      (await activeRuntimeInfo()).revision,
      withChild.revision,
      'Page Read undo leaves the document revision unchanged',
    );
    await waitForReadModeToast();

    // Page Edit changes the block-overlay surface only: shell authoring,
    // block menus, sidebar add controls, palette mutations and global undo
    // stay Continuous-only in this slice.
    await page.keyboard.press('Meta+e');
    await waitViewMode(packagePath, 'page', 'edit');
    assert.equal(await addChapter.isDisabled(), true, 'sidebar add stays gated in Page Edit');
    assert.equal(await addBlock.isDisabled(), true, 'sidebar add stays gated in Page Edit');
    await openPalette();
    for (const label of ['New chapter', 'Add top-level block', 'Undo', 'Redo', 'Insert table']) {
      await assertPaletteDisabled(label);
    }
    await closePalette();
    await page.keyboard.press('Meta+z');
    await page.waitForTimeout(120);
    assert.equal(
      (await activeRuntimeInfo()).blocks,
      withChild.blocks,
      'Page Edit does not enable global undo',
    );
    assert.deepEqual(
      await ui.structure(),
      structureBeforeUndo,
      'Page Edit leaves canonical structure unchanged',
    );
    await waitForReadModeToast();

    await chapterRow.click({ button: 'right' });
    await page.locator('.nf-menu').waitFor();
    assert.equal(
      await page.getByRole('menuitem', { name: /Rename chapter/ }).getAttribute('aria-disabled'),
      'true',
    );
    assert.equal(
      await page.getByRole('menuitem', { name: /Add block/ }).getAttribute('aria-disabled'),
      'true',
    );
    await page.keyboard.press('Escape');
    await page.locator('.nf-menu').waitFor({ state: 'detached' });

    await page.keyboard.press('Meta+e');
    await waitViewMode(packagePath, 'page', 'read');
    await h.screenshot(
      artifactsPath('m4b1a2', 'page-read-sidebar-1440x900.png'),
      { width: 1440, height: 900 },
    );

    // Continuous restores Edit, which re-enables undo and the shell controls.
    await page.keyboard.press('Meta+2');
    await waitViewMode(packagePath, 'continuous', 'edit');
    assert.equal(await addChapter.isDisabled(), false);
    assert.equal(await addBlock.isDisabled(), false);
    await page.locator('.nf-editor[data-active="true"] .nf-prosemirror').click();
    await page.keyboard.press('Meta+z');
    await h.waitCanonicalBlockCount(before.blocks);
  });
});
