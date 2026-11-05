import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifactsPath, createHarness } from '../support/harness.mjs';

const tempRoot = artifactsPath('visual-tmp');
const screenshotDir = artifactsPath('m2e');
const h = createHarness({ tempRoot });
let page;

function isolated(name) {
  return {
    NOTEFOREST_LIBRARY: resolve(tempRoot, `${name}-library`),
    NOTEFOREST_APP_SUPPORT: resolve(tempRoot, `${name}-support`),
  };
}

async function launch(overrides = {}) {
  // Screenshots need a real visible surface; every other suite stays hidden.
  await h.launch({ NOTEFOREST_E2E_HIDDEN: '0', ...overrides });
  page = h.page;
}

async function shot(name, width, height) {
  await h.screenshot(resolve(screenshotDir, name), { width, height });
}

describe('NoteForest M2 visual evidence', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await rm(screenshotDir, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    await mkdir(screenshotDir, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('captures the shell and tree screenshots', async () => {
    await launch(isolated('shots'));
    await h.setWindowSize(1440, 900);
    await page.waitForSelector('.nf-empty-state');
    await shot('empty-1440x900.png', 1440, 900);

    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    await h.waitLayout({ blocks: 7, arrows: 3 });
    const firstPath = (await h.state()).activeTab;

    // Give the first top-level block a third child so the shared trunk is visible.
    const rootCard = h.activeEditor().locator('[data-block-card][data-top-level="true"]').first();
    await rootCard.hover();
    await rootCard.locator('[data-add-child]').click();
    await h.waitBlockCount(8);
    await page.keyboard.type('Third child');
    await h.waitSaved();
    await h.waitEdges(4);
    await h.waitLayout({ blocks: 8, arrows: 4 });
    const rootId = await rootCard.getAttribute('data-block-card');
    assert.equal(
      await h.activeEditor().locator(`.nf-edge-trunk[data-parent-id="${rootId}"]`).count(),
      1,
      'one shared trunk for three children',
    );
    await shot('trunk-3-children-1440x900.png', 1440, 900);
    await shot('density-1440x900.png', 1440, 900);
    await shot('chosen-arrows-1440x900.png', 1440, 900);

    // Collapse costs no height and leaves a dot with the child count.
    await rootCard.hover();
    await rootCard.locator('[data-branch-port]').click();
    await h.waitEdges(0);
    await h.waitLayout({ blocks: 8, arrows: 0 });
    await shot('collapse-dot-1440x900.png', 1440, 900);
    await rootCard.locator('[data-branch-port]').click();
    await h.waitEdges(4);

    // A second document so the shell reads as a real session.
    await page.locator('.nf-new-note').click();
    await page.waitForFunction(
      () => window.__noteforestTest.state().tabs.length === 2,
      undefined,
      { timeout: 10000 },
    );
    await page.locator('.nf-document-title').click();
    await page.locator('.nf-dialog').getByRole('textbox', { name: 'Name' }).fill('Reading notes');
    await page.locator('.nf-dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await h.waitSaved();
    await page.keyboard.type('A second note with its own blocks.');
    await h.waitSaved();
    await page.keyboard.press('Meta+1');
    await page.waitForFunction(
      (expected) => window.__noteforestTest.state().activeTab === expected,
      firstPath,
      { timeout: 10000 },
    );
    await h.waitLayout({ blocks: 8 });
    await shot('shell-1440x900.png', 1440, 900);

    await page.keyboard.press('Meta+k');
    await page.waitForSelector('.nf-palette');
    await shot('palette-1440x900.png', 1440, 900);
    await page.keyboard.press('Escape');
    await page.waitForSelector('.nf-palette', { state: 'detached' });

    // Select a deep block to light the active path.
    await h
      .activeEditor()
      .locator('[data-block-card]', { hasText: 'Characteristic polynomial' })
      .first()
      .click();
    await h.waitLayout({ blocks: 8 });
    await shot('selected-path-1440x900.png', 1440, 900);

    // Inline chapter title editing.
    await page.locator('.nf-chapter-title').first().click();
    await page.waitForSelector('.nf-chapter-title-input');
    await shot('chapter-inline-1440x900.png', 1440, 900);
    await page.locator('.nf-chapter-title-input').press('Escape');

    await page.keyboard.press('Meta+2');
    await page.waitForFunction(
      (expected) => window.__noteforestTest.state().activeTab !== expected,
      firstPath,
      { timeout: 10000 },
    );
    await shot('two-tabs-1440x900.png', 1440, 900);

    // Return to the document and align the horizontal scroll for the 1024 shot.
    await page.keyboard.press('Meta+1');
    await page.waitForFunction(
      (expected) => window.__noteforestTest.state().activeTab === expected,
      firstPath,
      { timeout: 10000 },
    );
    await h.waitLayout({ blocks: 8 });
    await h
      .activeEditor()
      .locator('.nf-editor-scroll')
      .evaluate((element) => {
        element.scrollLeft = 0;
      });
    await h.setWindowSize(1024, 768);
    await shot('shell-1024x768.png', 1024, 768);
    await h
      .activeEditor()
      .locator('.nf-editor-scroll')
      .evaluate((element) => {
        element.scrollLeft = 0;
      });
    await h.waitLayout({ blocks: 8 });
    await shot('trunk-3-children-1024x768.png', 1024, 768);
    await shot('chosen-arrows-1024x768.png', 1024, 768);
    await h.quit();
  });

  it('captures zoom, layout and focus screenshots', async () => {
    await launch(isolated('shots-layout'));
    await h.setWindowSize(1440, 900);
    await page.locator('.nf-empty-actions .nf-button-primary').click();
    await h.waitBlockCount(1);
    for (let index = 0; index < 3; index += 1) {
      await page.keyboard.press('Control+Enter');
      await h.waitBlockCount(index + 2);
    }
    await h.waitLayout({ blocks: 4, arrows: 3 });
    await shot('four-level-1440x900.png', 1440, 900);

    await page.locator('[data-chapter-add]').first().click();
    await h.waitBlockCount(5);
    await page.keyboard.type(
      'A wide top-level block whose content deliberately makes this card much wider than the empty chain minimum width.',
    );
    await h.waitEditorText('A wide top-level block');
    await page.keyboard.press('Control+Enter');
    await h.waitBlockCount(6);
    await page.keyboard.type('Parent-relative child');
    await h.waitLayout({ blocks: 6, arrows: 4 });
    const deepCard = h.activeEditor().locator('[data-depth="3"]').first();
    const deepId = await deepCard.getAttribute('data-block-card');
    await deepCard.click();
    await h.waitSelected(deepId);
    for (let index = 0; index < 4; index += 1) {
      await page.keyboard.press('Control+Enter');
      await h.waitBlockCount(7 + index);
    }
    await h.waitLayout({ blocks: 10 });
    await h
      .activeEditor()
      .locator('.nf-editor-scroll')
      .evaluate((element) => {
        element.scrollLeft = 320;
      });
    await page.waitForFunction(
      () =>
        (document.querySelector('.nf-editor[data-active="true"] .nf-editor-scroll')?.scrollLeft ?? 0) >
        0,
      undefined,
      { timeout: 10000 },
    );
    await shot('deep-branch-scroll-1440x900.png', 1440, 900);
    await h.quit();

    await launch(isolated('shots-tree'));
    await h.setWindowSize(1440, 900);
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    await h.waitLayout({ blocks: 7, arrows: 3 });

    // Controls + collapse dot.
    const rootCard = h.activeEditor().locator('[data-block-card][data-top-level="true"]').first();
    await rootCard.hover();
    await rootCard.locator('[data-branch-port]').click();
    await h.waitEdges(0);
    await h.waitLayout({ blocks: 7, arrows: 0 });
    await shot('controls-1440x900.png', 1440, 900);
    await rootCard.locator('[data-branch-port]').click();
    await h.waitEdges(3);

    // 200% zoom: the sidebar yields, nothing overflows.
    await h.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(2);
    });
    await page.waitForFunction(
      () => document.querySelector('.nf-sidebar-panel') === null,
      undefined,
      { timeout: 10000 },
    );
    await page.screenshot({ path: resolve(screenshotDir, 'zoom-200.png') });
    await h.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1);
    });
    await page.waitForFunction(
      () => document.querySelector('.nf-sidebar-panel') !== null,
      undefined,
      { timeout: 10000 },
    );
    await h.waitLayout({ blocks: 7 });

    // Focus the root branch.
    const rootId = await rootCard.getAttribute('data-block-card');
    await rootCard.locator('.nf-block-prose').first().click();
    await h.waitSelected(rootId);
    const focusButton = page.locator('.nf-status-focus');
    await focusButton.click();
    await page.waitForFunction(
      () => {
        const scope = document.querySelector('.nf-editor[data-active="true"]');
        const visible = (element) => element.getClientRects().length > 0;
        if (scope === null) return false;
        return [...scope.querySelectorAll('[data-block-card]')].filter(visible).length === 4;
      },
      undefined,
      { timeout: 10000 },
    );
    await h.waitLayout({ blocks: 7 });
    await shot('focus-branch-1440x900.png', 1440, 900);
    await focusButton.click();
    await page.waitForFunction(
      () => document.querySelector('.nf-status-focus')?.getAttribute('aria-pressed') === 'false',
      undefined,
      { timeout: 10000 },
    );

    // Ancestor chain of a deep block.
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
        return [...scope.querySelectorAll('[data-block-card]')].filter(visible).length === 3;
      },
      undefined,
      { timeout: 10000 },
    );
    await h.waitLayout({ blocks: 7 });
    await shot('focus-ancestors-1440x900.png', 1440, 900);
    await focusButton.click();
    await page.waitForFunction(
      () => document.querySelector('.nf-status-focus')?.getAttribute('aria-pressed') === 'false',
      undefined,
      { timeout: 10000 },
    );

    // Fit width at 1024.
    await h.setWindowSize(1024, 768);
    await h.waitLayout({ blocks: 7 });
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
    await shot('fit-width-1024x768.png', 1024, 768);
    await h.quit();
  });

  it('captures the save-failure recovery surface', async () => {
    await launch(isolated('shots-save-failure'));
    await h.setWindowSize(1440, 900);
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    // Create a few autosave snapshots before the folder becomes read-only so
    // the restore dialog has real rows to show.
    for (const value of [' First saved edit', ' Second saved edit']) {
      await h.activeEditor().locator('[data-block-card] .nf-block-prose').first().click();
      await page.keyboard.press('End');
      await page.keyboard.type(value);
      await h.waitSaved();
    }
    const packagePath = (await h.state()).activeTab;
    await chmod(packagePath, 0o555);
    try {
      await h.activeEditor().locator('[data-block-card] .nf-block-prose').first().click();
      await page.keyboard.press('End');
      await page.keyboard.type(' This edit cannot be saved while the folder is read-only.');
      await page.waitForFunction(
        () => {
          const current = window.__noteforestTest.state();
          const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
          return runtime?.saveState === 'error';
        },
        undefined,
        { timeout: 10000 },
      );
      await shot('save-failure-1440x900.png', 1440, 900);
      await h.setWindowSize(1024, 768);
      await shot('save-failure-1024x768.png', 1024, 768);
      await h.setWindowSize(1440, 900);
      await page.locator('[data-save-action="restore-backup"]').click();
      const restore = page.getByRole('dialog', { name: 'Restore backup' });
      await restore.waitFor();
      await restore.locator('[data-backup-row]').first().waitFor();
      await shot('restore-backup-1440x900.png', 1440, 900);
      await restore.getByRole('button', { name: 'Cancel' }).click();
      await restore.waitFor({ state: 'detached' });
      await chmod(packagePath, 0o755);
      await page.locator('[data-save-action="retry"]').click();
      await h.waitSaved();
    } finally {
      await chmod(packagePath, 0o755);
    }
    await h.quit();
  });

  it('captures the external-modification banner and overwrite confirmation', async () => {
    await launch(isolated('shots-external'));
    await h.setWindowSize(1440, 900);
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    const packagePath = (await h.state()).activeTab;
    const documentPath = resolve(packagePath, 'document.json');
    const document = JSON.parse(await readFile(documentPath, 'utf8'));
    document.title = 'Externally renamed';
    await writeFile(documentPath, JSON.stringify(document, null, 2));

    await h.activeEditor().locator('[data-block-card] .nf-block-prose').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' This edit conflicts with an external change.');
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
    await shot('external-modification-1440x900.png', 1440, 900);

    await page.locator('[data-save-action="overwrite"]').click();
    const confirm = page.getByRole('dialog', { name: 'Overwrite file on disk?' });
    await confirm.waitFor();
    await shot('external-overwrite-confirm-1440x900.png', 1440, 900);

    // Cancel keeps the external file, then reload discards the local edit and
    // leaves the app save-clean for teardown.
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await confirm.waitFor({ state: 'detached' });
    await page.locator('[data-save-action="reload"]').click();
    const reload = page.getByRole('dialog', { name: 'Reload from disk?' });
    await reload.waitFor();
    await reload.getByRole('button', { name: 'Reload from disk', exact: true }).click();
    await page.waitForSelector('[data-save-failure="true"]', { state: 'detached' });
    await h.waitSaved();
    await h.quit();
  });

  it('captures the corrupt-package recovery surface', async () => {
    const env = isolated('shots-recovery');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    const packagePath = (await h.state()).activeTab;
    const documentPath = resolve(packagePath, 'document.json');
    const validBytes = await readFile(documentPath);
    const digest = createHash('sha256').update(resolve(packagePath)).digest('hex').slice(0, 32);
    const backupsDir = resolve(env.NOTEFOREST_APP_SUPPORT, 'backups', digest);
    await mkdir(backupsDir, { recursive: true });
    await writeFile(
      resolve(backupsDir, 'autosave-20261104T120000000Z-r0000000002.json'),
      validBytes,
    );
    await h.quit();

    await writeFile(documentPath, validBytes.subarray(0, Math.floor(validBytes.byteLength / 2)));
    await launch(env);
    await page
      .locator('[data-library-document][data-doc-status="unreadable"]')
      .click();
    await page.locator('[data-recovery-surface="true"]').waitFor();
    await page.locator('[data-recovery-backup="true"]').first().waitFor();
    await shot('recovery-damaged-1440x900.png', 1440, 900);
    await h.quit();
  });
});
