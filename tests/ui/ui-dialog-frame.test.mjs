import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { pageDocument, textBlock, writePagePackage } from '../support/page-fixtures.mjs';

/**
 * Copy batch A+B: the dialog frame and Details (docs/design/dialogs.md §1–3,
 * docs/design/copy-plan.md rows A and B).
 *
 * One suite proves the frame contract on the real dialogs: one labelled title,
 * the header X (aria-label Close, title Close (Esc)), a one-line description,
 * the 480/560 size (never 640), the footer slots in order, Cancel focused on a
 * danger primary, focus restored to the trigger, and Details copying the raw
 * value. Settings and the Export sheet adopt the header X/title/footer slots
 * without becoming Frame dialogs.
 */

const tempRoot = artifactsPath('copy-ab-ui');
const outputRoot = artifactsPath('copy-ab-export');
const screenshotDir = artifactsPath('copy-ab');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

const A5_PORTRAIT = {
  size: 'A5',
  orientation: 'portrait',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
};

async function launch(env) {
  page = await ui.launch(env);
  await h.setWindowSize(1440, 900);
}

function dialog() {
  return page.locator('.nf-dialog[data-dialog-frame="true"]');
}

/**
 * The one frame contract. `buttons` is every footer button incl. navigation,
 * in DOM order; `description` is exact when present.
 */
async function assertFrame({
  width,
  title,
  description,
  buttons,
  primary = true,
  focused = null,
}) {
  const frame = dialog();
  await frame.waitFor({ state: 'visible' });
  assert.equal(await frame.count(), 1, 'one frame dialog');
  assert.equal(await frame.locator('h2').count(), 1, 'exactly one h2');
  assert.equal((await frame.locator('h2').innerText()).trim(), title);
  const labelledBy = await frame.getAttribute('aria-labelledby');
  assert.ok(labelledBy !== null && labelledBy.length > 0, 'the title is referenced');
  assert.equal(await frame.locator(`#${labelledBy}`).innerText(), title, 'aria-labelledby hits the h2');
  assert.equal(await frame.getAttribute('aria-label'), null, 'no double label');

  const close = frame.locator('.nf-dialog-close');
  assert.equal(await close.getAttribute('aria-label'), 'Close');
  assert.equal(await close.getAttribute('title'), 'Close (Esc)');
  const closeBox = await close.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  assert.equal(closeBox.width, 28, 'the header X is 28 px');
  assert.equal(closeBox.height, 28, 'the header X is 28 px');

  const modalWidth = await frame
    .locator('..')
    .evaluate((element) => element.getBoundingClientRect().width);
  assert.equal(Math.round(modalWidth), width, `the frame is ${width} px`);
  assert.equal(await page.locator('.nf-dialog-modal-wide').count(), 0, 'no 640 modifier');
  assert.notEqual(Math.round(modalWidth), 640, 'no dialog is 640');

  if (description === undefined) {
    assert.equal(await frame.locator('.nf-dialog-description').count(), 0, 'no description');
  } else {
    const paragraph = frame.locator('.nf-dialog-description');
    assert.equal((await paragraph.innerText()).trim(), description);
    const metrics = await paragraph.evaluate((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const paddingTop = Number.parseFloat(style.paddingTop);
      const paddingBottom = Number.parseFloat(style.paddingBottom);
      return {
        contentHeight: rect.height - paddingTop - paddingBottom,
        fontSize: Number.parseFloat(style.fontSize),
        whiteSpace: style.whiteSpace,
      };
    });
    assert.equal(metrics.whiteSpace, 'nowrap', 'the description is one line');
    assert.ok(
      metrics.contentHeight <= metrics.fontSize * 1.8,
      `the description is one line high (${metrics.contentHeight} <= ${metrics.fontSize * 1.8})`,
    );
  }

  if (buttons !== undefined) {
    assert.deepEqual(
      (await frame.locator('.nf-dialog-actions button').allInnerTexts()).map((value) => value.trim()),
      buttons,
      'footer slots: [navigation] … [secondary] [primary]',
    );
  }  const primaryCount = await frame
    .locator('.nf-dialog-actions .nf-button-primary, .nf-dialog-actions .nf-button-danger')
    .count();
  if (primary === 'optional') {
    assert.ok(primaryCount <= 1, 'at most one primary');
  } else {
    assert.equal(primaryCount, primary ? 1 : 0, primary ? 'one primary' : 'no primary');
  }
  if (primary === true) {
    const lastIsPrimary = await frame
      .locator('.nf-dialog-actions button')
      .last()
      .evaluate(
        (element) =>
          element.classList.contains('nf-button-primary') ||
          element.classList.contains('nf-button-danger'),
      );
    assert.equal(lastIsPrimary, true, 'the primary is the rightmost slot');
  }

  if (focused !== null) {
    assert.match(
      await page.evaluate(() => document.activeElement?.textContent ?? ''),
      new RegExp(focused),
      `${focused} has the default focus`,
    );
  }
  return frame;
}

async function closeWithEsc() {
  await page.keyboard.press('Escape');
  await page.waitForSelector('.nf-dialog', { state: 'detached' });
}

async function closeWithX() {
  await page.locator('.nf-dialog-close').click();
  await page.waitForSelector('.nf-dialog', { state: 'detached' });
}

async function openPaletteCommand(label) {
  await page.keyboard.press('Meta+k');
  await page.waitForSelector('.nf-palette');
  const item = page.locator('.nf-palette-item', { hasText: label }).first();
  await item.waitFor({ state: 'visible' });
  await item.click();
  await page.waitForSelector('.nf-palette', { state: 'detached' });
}

async function openSwitcher() {
  await page.locator('[data-library-switcher]').click();
  await page.locator('.nf-menu').waitFor();
}

async function chooseMenuItem(name) {
  await page.getByRole('menuitem', { name, exact: true }).click();
  await page.locator('.nf-menu').waitFor({ state: 'detached' });
}

async function openRowMenu(title) {
  const row = page.locator('[data-sidebar-panel="library"] .nf-library-row', { hasText: title });
  await row.waitFor();
  await row.locator('.nf-row-menu').click();
  await page.locator('.nf-menu').waitFor();
}

async function mockFolderDialog(folderPath) {
  await h.app.evaluate(({ dialog }, chosen) => {
    globalThis.__nfFolderDialogCalls = [];
    dialog.showOpenDialog = async (_window, options) => {
      globalThis.__nfFolderDialogCalls.push(structuredClone(options));
      return { canceled: false, filePaths: [chosen] };
    };
  }, folderPath);
}

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

async function exportState() {
  return page.evaluate(() => window.__noteforestTest.exportState());
}

async function waitExportStatus(status, timeout = 180000) {
  await page.waitForFunction(
    (expected) => window.__noteforestTest.exportState().status === expected,
    status,
    { timeout },
  );
  return exportState();
}

describe('Dialog frame and A+B copy', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await rm(outputRoot, { recursive: true, force: true });
    await rm(screenshotDir, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    await mkdir(outputRoot, { recursive: true });
    await mkdir(screenshotDir, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('renders the 480 frame for rename, new library, and table size', async () => {
    await launch(ui.isolated('frame-480'));
    await ui.seedDemo();

    // Rename document is a single-field dialog: the field has the focus.
    await page.locator('.nf-tab[data-active="true"]').click({ button: 'right' });
    await page.locator('.nf-menu').waitFor();
    await page.getByRole('menuitem', { name: 'Rename document…' }).click();
    const rename = await assertFrame({
      width: 480,
      title: 'Rename document',
      buttons: ['Cancel', 'Save'],
    });
    const renameInputFocused = await page.evaluate(
      () => document.activeElement?.classList.contains('nf-input') === true,
    );
    assert.equal(renameInputFocused, true, 'the first field has the focus');
    await page.screenshot({ path: resolve(screenshotDir, 'frame-rename-480.png'), scale: 'css' });
    await closeWithX();
    await rename.waitFor({ state: 'detached' });

    // New library keeps the sentence-case title and the empty-error state.
    await openSwitcher();
    await chooseMenuItem('New Library…');
    await assertFrame({
      width: 480,
      title: 'New library',
      description: 'Create a folder for a new set of notes.',
      buttons: ['Cancel', 'Create library'],
    });
    assert.equal(
      await page.locator('[data-new-library-create="true"]').isDisabled(),
      true,
      'Create library waits for a parent folder',
    );
    await page.screenshot({
      path: resolve(screenshotDir, 'frame-new-library-480.png'),
      scale: 'css',
    });
    await closeWithEsc();

    // Table size moved onto the frame: title, description, X, footer slots.
    await openPaletteCommand('Insert table');
    await assertFrame({
      width: 480,
      title: 'Insert table',
      description: 'Pick a size. The first row is a header.',
      buttons: ['Cancel', 'Insert 3 × 3'],
    });
    assert.equal(await page.locator('[data-table-size]').count(), 100, 'the 10 × 10 grid stays');
    await page.screenshot({
      path: resolve(screenshotDir, 'frame-table-size-480.png'),
      scale: 'css',
    });
    await closeWithX();
    await h.waitSaved();
  });

  it('renders the 560 record frame for delete block, link as reference, and trash', async () => {
    await launch(ui.isolated('frame-560'));
    await ui.seedDemo();
    const firstBlock = await page
      .locator('.nf-editor[data-active="true"] [data-block-card]')
      .first()
      .getAttribute('data-block-card');
    const packagePath = (await h.state()).activeTab;

    // Delete block: 560, one description for both descendant states, Cancel
    // focused, outlined danger primary.
    await ui.openBlockMenuFromGutter(firstBlock);
    await page.getByRole('menuitem', { name: /^Delete block/ }).click();
    await assertFrame({
      width: 560,
      title: 'Delete block',
      description: 'The block and its content are removed.',
      buttons: ['Cancel', 'Delete'],
      focused: 'Cancel',
    });
    const danger = page.locator('[data-dialog-frame] .nf-dialog-actions .nf-button-danger');
    await danger.waitFor();
    const dangerStyle = await page.evaluate(() => {
      const button = document.querySelector(
        '[data-dialog-frame] .nf-dialog-actions .nf-button-danger',
      );
      const secondary = document.querySelector(
        '[data-dialog-frame] .nf-dialog-actions .nf-button',
      );
      const probe = document.createElement('div');
      probe.style.color = 'var(--danger)';
      document.body.appendChild(probe);
      const dangerColor = getComputedStyle(probe).color;
      probe.style.color = 'var(--danger-border)';
      const dangerBorder = getComputedStyle(probe).color;
      probe.remove();
      const style = getComputedStyle(button);
      return {
        color: style.color,
        border: style.borderTopColor,
        background: style.backgroundColor,
        secondaryBackground: getComputedStyle(secondary).backgroundColor,
        dangerColor,
        dangerBorder,
      };
    });
    assert.equal(dangerStyle.color, dangerStyle.dangerColor, 'danger ink');
    assert.equal(dangerStyle.border, dangerStyle.dangerBorder, '1 px danger border');
    assert.equal(
      dangerStyle.background,
      dangerStyle.secondaryBackground,
      'outlined, never filled with the danger color',
    );
    await page.screenshot({
      path: resolve(screenshotDir, 'frame-delete-block-560.png'),
      scale: 'css',
    });
    await closeWithEsc();

    // Link as reference is a list/record body at 560; the trailing model note
    // is deleted.
    await ui.openBlockMenuFromGutter(firstBlock);
    await page.getByRole('menuitem', { name: /^Link as reference/ }).click();
    await assertFrame({
      width: 560,
      title: 'Link as reference',
      description: 'The target keeps its place. This adds a reference link.',
      buttons: ['Cancel', 'Link'],
    });
    assert.doesNotMatch(
      await page.locator('[data-dialog-frame]').innerText(),
      /The target stays once at its primary home/,
    );
    await page.screenshot({
      path: resolve(screenshotDir, 'frame-link-reference-560.png'),
      scale: 'css',
    });
    await closeWithEsc();

    // Move to Trash: the path is only in Details; the disclosure stays closed.
    await openRowMenu('Linear algebra');
    await chooseMenuItem('Move to Trash…');
    const trash = await assertFrame({
      width: 560,
      title: 'Move to Trash?',
      description: 'The note moves to the Trash. You can restore it from there.',
      buttons: ['Cancel', 'Move to Trash'],
      focused: 'Cancel',
    });
    assert.equal(await page.locator('[data-trash-path]').count(), 0, 'no path paragraph');
    const details = trash.locator('[data-details]');
    assert.equal(await details.locator('summary').innerText(), 'Details');
    assert.equal(await details.getAttribute('open'), null, 'closed by default');
    assert.equal(await details.locator('[data-details-value]').textContent(), packagePath);
    await details.locator('summary').click();
    await page.screenshot({ path: resolve(screenshotDir, 'frame-trash-560.png'), scale: 'css' });
    await closeWithX();
  });

  it('focuses Cancel on danger dialogs, copies Details, and restores focus', async () => {
    await launch(ui.isolated('frame-danger'));
    await ui.seedDemo();
    const packagePath = (await h.state()).activeTab;
    const documentPath = resolve(packagePath, 'document.json');
    const external = JSON.parse(await readFile(documentPath, 'utf8'));
    external.title = 'Externally renamed';
    await writeFile(documentPath, JSON.stringify(external, null, 2));

    await h.activeEditor().locator('[data-block-card] .nf-block-prose').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' A conflicting edit.');
    await page.waitForFunction(
      () => {
        const current = window.__noteforestTest.state();
        const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
        return (
          runtime?.saveState === 'error' &&
          runtime.saveFailure?.code === 'external-modification'
        );
      },
      undefined,
      { timeout: 10000 },
    );

    // Reload from disk: 480, short description, path in Details, Cancel first.
    await page.locator('[data-save-action="reload"]').click();
    const reload = await assertFrame({
      width: 480,
      title: 'Reload from disk?',
      description:
        'Unsaved changes in this window are discarded. The file on disk is not changed.',
      buttons: ['Cancel', 'Reload from disk'],
      focused: 'Cancel',
    });
    assert.equal(
      await reload.locator('.nf-dialog-description').getAttribute('title'),
      'Unsaved changes in this window are discarded. The file on disk is not changed.',
    );
    assert.equal(await reload.locator('[data-details-value]').textContent(), packagePath);
    await page.screenshot({ path: resolve(screenshotDir, 'frame-reload-480.png'), scale: 'css' });

    // Details copies the verbatim value and toasts Copied (no telemetry).
    await reload.locator('[data-details] summary').click();
    await reload.locator('[data-details-copy]').click();
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('[data-sonner-toast]')].some((element) =>
          element.textContent?.includes('Copied'),
        ),
      undefined,
      { timeout: 5000 },
    );
    assert.equal(await h.clipboardText(), packagePath, 'Details copies the exact path');

    // Cancel returns focus to the banner action that opened the dialog.
    await reload.getByRole('button', { name: 'Cancel', exact: true }).click();
    await reload.waitFor({ state: 'detached' });
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('data-save-action') === 'reload',
      undefined,
      { timeout: 5000 },
    );

    // Overwrite file on disk: the same 480 danger shape, with Details(path).
    await page.locator('[data-save-action="overwrite"]').click();
    const overwrite = await assertFrame({
      width: 480,
      title: 'Overwrite file on disk?',
      description:
        'This replaces the file on disk; the external changes are lost. Reload instead to keep them.',
      buttons: ['Cancel', 'Overwrite'],
      focused: 'Cancel',
    });
    assert.equal(await overwrite.locator('[data-details-value]').textContent(), packagePath);
    assert.doesNotMatch(
      await overwrite.innerText(),
      /The external changes will be lost\. Reload from disk instead/,
      'the deleted note is gone',
    );
    await page.screenshot({
      path: resolve(screenshotDir, 'frame-overwrite-480.png'),
      scale: 'css',
    });
    await overwrite.getByRole('button', { name: 'Cancel', exact: true }).click();
    await overwrite.waitFor({ state: 'detached' });

    // Clean up by discarding the local edit and reloading the external file.
    await page.locator('[data-save-action="reload"]').click();
    await page.waitForSelector('.nf-dialog');
    await page.getByRole('button', { name: 'Reload from disk', exact: true }).click();
    await page.waitForSelector('[data-save-failure="true"]', { state: 'detached' });
    await h.waitSaved();
  });

  it('renders Restore backup as a 560 record dialog with its short copy', async () => {
    await launch(ui.isolated('frame-restore'));
    await ui.seedDemo();
    const packagePath = (await h.state()).activeTab;
    await chmod(packagePath, 0o555);
    try {
      await h.activeEditor().locator('[data-block-card] .nf-block-prose').first().click();
      await page.keyboard.press('End');
      await page.keyboard.type(' A permission failure.');
      await page.waitForFunction(
        () => {
          const current = window.__noteforestTest.state();
          const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
          return runtime?.saveFailure?.code === 'permission';
        },
        undefined,
        { timeout: 10000 },
      );
      await page.locator('[data-save-action="restore-backup"]').click();
      const restore = await assertFrame({
        width: 560,
        title: 'Restore backup',
        description: 'Restores a copy. The current file is not changed.',
        primary: 'optional',
      });
      const footer = (
        await restore.locator('.nf-dialog-actions button').allInnerTexts()
      ).map((value) => value.trim());
      assert.equal(footer[0], 'Cancel', 'Cancel is the safe exit');
      assert.ok(
        footer.length === 1 || (footer.length === 2 && footer[1] === 'Restore copy…'),
        `secondary then optional primary (${footer.join(', ')})`,
      );
      if (footer.length === 2) {
        assert.equal(
          await restore.locator('[data-restore-backup="true"]').count(),
          1,
          'a usable backup shows the list',
        );
      } else {
        assert.equal(
          (await restore.locator('[data-backup-empty]').innerText()).replace(/\s+/g, ' ').trim(),
          'No usable backups No backup yet. Save the note as a copy instead.',
        );
      }
      assert.doesNotMatch(
        await restore.innerText(),
        /The restored copy opens in a new tab/,
        'the deleted trailing note is gone',
      );
      await page.screenshot({
        path: resolve(screenshotDir, 'frame-restore-backup-560.png'),
        scale: 'css',
      });
      await closeWithEsc();
    } finally {
      await chmod(packagePath, 0o755);
    }
    await page.locator('[data-save-action="retry"]').click();
    await h.waitSaved();
    await page.waitForSelector('[data-save-failure="true"]', { state: 'detached' });
  });

  it('completes D25, adopts the Settings header/footer, and exports a failed sheet with Details', async () => {
    const env = ui.isolated('frame-shell');
    await launch(env);
    await ui.seedDemo();
    const detailsValue = '/Users/luca/NoteForest/linear-algebra/document.json';

    // D25: Details, one code block, Copy … Close (the toast host is batch C).
    await page.evaluate((value) => window.__noteforestTest.openDetails(value), detailsValue);
    const d25 = await assertFrame({
      width: 480,
      title: 'Details',
      buttons: ['Copy', 'Close'],
      primary: false,
    });
    assert.equal(await d25.locator('[data-details-value]').textContent(), detailsValue);
    assert.equal(
      await d25.locator('[data-details-value]').getAttribute('aria-label'),
      'Technical details',
    );
    await page.screenshot({ path: resolve(screenshotDir, 'frame-details-480.png'), scale: 'css' });
    await d25.locator('[data-dialog-navigation] button').click();
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('[data-sonner-toast]')].some((element) =>
          element.textContent?.includes('Copied'),
        ),
      undefined,
      { timeout: 5000 },
    );
    assert.equal(await h.clipboardText(), detailsValue);
    await d25.locator('.nf-dialog-actions button').filter({ hasText: /^Close$/ }).click();
    await d25.waitFor({ state: 'detached' });
    await page.waitForSelector('[data-sonner-toast]', { state: 'detached', timeout: 8000 });

    // Settings keeps its layout and adopts the header X and footer slots.
    await page.keyboard.press('Meta+,');
    await page.waitForSelector('[data-settings-dialog="true"]');
    assert.equal(
      Math.round(
        await page
          .locator('.nf-settings-modal')
          .evaluate((element) => element.getBoundingClientRect().width),
      ),
      1180,
      'Settings keeps its own 1180 layout',
    );
    assert.equal(await page.locator('.nf-settings-heading').innerText(), 'Settings');
    const settingsClose = page.locator('.nf-settings-head [aria-label="Close"]');
    assert.equal(await settingsClose.count(), 1);
    assert.equal(await settingsClose.getAttribute('title'), 'Close (Esc)');
    assert.equal(
      (await page.locator('.nf-settings-foot').innerText()).replace(/\s+/g, ' ').trim(),
      'Saved Done',
      'footer slots: Saved … Done',
    );
    const pages = [
      ['general', '.nf-settings-page-title'],
      ['appearance', '[data-appearance-description="true"]'],
      ['continuous', '[data-continuous-page-description="true"]'],
      ['page', '[data-page-lens-help="true"]'],
      ['editor', '[data-shortcut-search="true"]'],
      ['export', '[data-settings-export-folder="true"]'],
      ['data', '[data-settings-library-path="true"]'],
    ];
    for (const [id, selector] of pages) {
      await page.locator(`[data-settings-nav="${id}"]`).click();
      await page.waitForSelector(selector);
      await page.screenshot({
        path: resolve(screenshotDir, `settings-${id}.png`),
        scale: 'css',
      });
    }
    await page.locator('.nf-settings-head [aria-label="Close"]').click();
    await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });

    // Export failed: 560, sentence-case title, Close/Retry, one short line,
    // and every raw message plus the code in Details.
    const packagePath = await writePagePackage(
      env.NOTEFOREST_LIBRARY,
      'copy-ab-blocked',
      pageDocument({
        id: 'copy-ab-blocked',
        title: 'Blocked export',
        chapterTitle: 'Blocked',
        blocks: [textBlock('tall', 'Tall block', 'word '.repeat(4000))],
      }),
    );
    assert.equal(
      await page.evaluate((path) => window.__noteforestTest.openPath(path), packagePath),
      true,
    );
    await page.waitForFunction(
      (path) => window.__noteforestTest.state().activeTab === path,
      packagePath,
      { timeout: 20000 },
    );
    await page.evaluate(
      ({ path, value }) => window.__noteforestTest.setPageSettingsOverride(path, value),
      { path: packagePath, value: { setup: A5_PORTRAIT } },
    );
    const folder = resolve(outputRoot, 'blocked');
    await mkdir(folder, { recursive: true });
    await mockFolderDialog(folder);
    await invokeAppMenu('menu-export-pdf');
    await page.waitForSelector('[data-export-status="configure"]', { timeout: 10000 });
    await page.locator('[data-export-choose-folder]').click();
    await page.waitForFunction(
      (expected) =>
        document.querySelector('[data-export-folder]')?.textContent?.trim() === expected,
      folder,
      { timeout: 10000 },
    );
    await page.locator('[data-export-start]').click();
    await waitExportStatus('failed');
    assert.equal(
      Math.round(
        await page
          .locator('.nf-export-modal')
          .evaluate((element) => element.getBoundingClientRect().width),
      ),
      560,
      'the Export sheet is 560',
    );
    assert.equal(await page.locator('.nf-export-title').innerText(), 'Export failed');
    const exportClose = page.locator('[data-export-sheet] [aria-label="Close"]');
    assert.equal(await exportClose.count(), 1);
    assert.equal(await exportClose.getAttribute('title'), 'Close (Esc)');
    assert.deepEqual(
      (await page.locator('.nf-export-actions button').allInnerTexts()).map((value) => value.trim()),
      ['Close', 'Retry'],
      'footer slots: secondary then primary',
    );
    assert.equal(
      await page.locator('[data-export-error-message]').innerText(),
      'A layout problem would break the PDF.',
    );
    const failedDetails = page.locator('[data-export-failed] [data-details]');
    assert.equal(await failedDetails.locator('summary').innerText(), 'Details');
    await failedDetails.locator('summary').click();
    const failedValue = await failedDetails.locator('[data-details-value]').textContent();
    assert.match(failedValue, /preflight-blocked/);
    assert.match(failedValue, /Tall block/);
    await page.screenshot({
      path: resolve(screenshotDir, 'export-failed-details-560.png'),
      scale: 'css',
    });
    await page.locator('[data-export-dismiss="true"]').click();
    await page.waitForSelector('[data-export-status="failed"]', { state: 'detached' });
    await h.waitSaved();
  });
});
