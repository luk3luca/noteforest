import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import {
  multiPageBlocksDocument,
  pageDocument,
  textBlock,
  writePagePackage,
} from '../support/page-fixtures.mjs';

/**
 * Batch B Page settings.
 *
 * Covers the frozen Page settings model end to end: setup/orientation/margins
 * with inline validation, scope/override behavior, preset/density, the live
 * real-model preview, Page Edit commit ordering, and Page Read/PDF parity.
 */

const tempRoot = artifactsPath('ui-batch-b-temp');
const screenshotDir = artifactsPath('ui-batch-b');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

async function launch(name, env) {
  page = await ui.launch({ ...(env ?? ui.isolated(name)), NOTEFOREST_E2E_HIDDEN: '1' });
  await h.setWindowSize(1440, 900);
}

async function openPackage(env, name, document) {
  const packagePath = await writePagePackage(env.NOTEFOREST_LIBRARY, name, document);
  const opened = await page.evaluate(
    (path) => window.__noteforestTest.openPath(path),
    packagePath,
  );
  assert.equal(opened, true, 'fixture package opens');
  await page.waitForFunction(
    (path) => window.__noteforestTest.state().activeTab === path,
    packagePath,
    { timeout: 10000 },
  );
  await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
  return packagePath;
}

function activePageView() {
  return page.locator('.nf-editor[data-active="true"] .nf-page-view');
}

async function showPageRead() {
  await page.keyboard.press('Meta+3');
  await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view');
  await waitPageReady();
}

async function waitPageReady() {
  await page.waitForFunction(
    () => {
      const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
      return (
        view !== null &&
        view.getAttribute('data-ready') === 'true' &&
        view.getAttribute('data-updating') !== 'true'
      );
    },
    undefined,
    { timeout: 30000 },
  );
}

async function waitPageBody(expected) {
  await page.waitForFunction(
    (body) => {
      const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
      if (view === null) return false;
      if (view.getAttribute('data-ready') !== 'true') return false;
      if (view.getAttribute('data-updating') === 'true') return false;
      return getComputedStyle(view).getPropertyValue('--nf-page-body-size').trim() === body;
    },
    expected,
    { timeout: 30000 },
  );
}

async function waitSheetGeometry(expected) {
  await page.waitForFunction(
    ({ width, height, margins }) => {
      const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
      if (view === null) return false;
      if (view.getAttribute('data-ready') !== 'true') return false;
      if (view.getAttribute('data-updating') === 'true') return false;
      const sheet = view.querySelector('.nf-page-sheet');
      if (sheet === null) return false;
      const near = (value, target) => Math.abs(Number(value) - target) < 0.1;
      return (
        near(sheet.getAttribute('data-page-width-px'), width) &&
        near(sheet.getAttribute('data-page-height-px'), height) &&
        near(sheet.getAttribute('data-margin-top'), margins.top) &&
        near(sheet.getAttribute('data-margin-right'), margins.right) &&
        near(sheet.getAttribute('data-margin-bottom'), margins.bottom) &&
        near(sheet.getAttribute('data-margin-left'), margins.left)
      );
    },
    {
      width: expected.width * (96 / 25.4),
      height: expected.height * (96 / 25.4),
      margins: {
        top: expected.margins.top * (96 / 25.4),
        right: expected.margins.right * (96 / 25.4),
        bottom: expected.margins.bottom * (96 / 25.4),
        left: expected.margins.left * (96 / 25.4),
      },
    },
    { timeout: 30000 },
  );
}

async function openSettings() {
  await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
  await page.keyboard.press('Meta+,');
  await page.waitForSelector('[data-settings-dialog="true"]', { timeout: 10000 });
  // Settings opens on General; this suite covers the Page setup page.
  await page.locator('[data-settings-nav="page"]').click();
  await page.waitForSelector('[data-page-setup-section="true"]');
}

/**
 * The overlay root exists before TipTap's view is mounted. Typing before the
 * view's onCreate baseline would be recorded as part of that baseline, so the
 * commit would treat the text as unchanged. Wait for the mounted ProseMirror
 * view and for focus inside the overlay.
 */
async function waitForEditView() {
  await page.waitForFunction(
    () => {
      const view = document.querySelector('[data-page-edit-overlay] .ProseMirror');
      return (
        view !== null &&
        view.getAttribute('contenteditable') === 'true' &&
        document.activeElement?.closest('[data-page-edit-overlay]') !== null
      );
    },
    undefined,
    { timeout: 10000 },
  );
}

/**
 * Open Settings from the sidebar. Used when a contenteditable Page Edit block
 * owns focus and a repeated native menu accelerator is not reliable in E2E.
 * This is the same real Settings command, not a test-only hook.
 */
async function openSettingsFromButton() {
  await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
  await page.locator('.nf-sidebar-settings').click();
  await page.waitForSelector('[data-settings-dialog="true"]', { timeout: 10000 });
  // Settings opens on General; this suite covers the Page setup page.
  await page.locator('[data-settings-nav="page"]').click();
  await page.waitForSelector('[data-page-setup-section="true"]');
}

async function closeSettings() {
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
}

async function waitPreviewReady() {
  await page.waitForFunction(
    () => {
      const preview = document.querySelector('[data-page-preview="true"]');
      if (preview === null) return false;
      const state = preview.getAttribute('data-page-preview-state');
      return state === 'ready' || state === 'invalid' || state === 'sample' || state === 'empty';
    },
    undefined,
    { timeout: 30000 },
  );
}

async function settings() {
  return page.evaluate(() => window.__noteforestTest.settings());
}

async function resolvedPageSettings(packagePath) {
  return page.evaluate(
    (path) => window.__noteforestTest.resolvedPageSettings(path),
    packagePath,
  );
}

async function sheetGeometry() {
  const sheet = activePageView().locator('.nf-page-sheet').first();
  return sheet.evaluate((element) => ({
    width: Number(element.getAttribute('data-page-width-px')),
    height: Number(element.getAttribute('data-page-height-px')),
    marginTop: Number(element.getAttribute('data-margin-top')),
    marginRight: Number(element.getAttribute('data-margin-right')),
    marginBottom: Number(element.getAttribute('data-margin-bottom')),
    marginLeft: Number(element.getAttribute('data-margin-left')),
    pageCount: Number(element.getAttribute('data-page-count')),
  }));
}

const PX_PER_MM = 96 / 25.4;

function closeTo(actual, expected, tolerance = 0.1) {
  return Math.abs(actual - expected) < tolerance;
}

describe('Batch B Page settings', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    await mkdir(screenshotDir, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('supports global setup without a document and a clearly labelled sample preview', async () => {
    const env = ui.isolated('batch-b-no-document');
    await launch('batch-b-no-document', env);
    assert.deepEqual((await h.state()).tabs, []);
    await openSettings();

    assert.equal(await page.locator('[data-page-scope-option="document"]').isDisabled(), true);
    assert.equal(await page.locator('[data-page-document-reason="true"]').isVisible(), true);
    assert.equal(await page.locator('[data-page-size-option="A4"]').isEnabled(), true);
    assert.equal(
      await page.locator('[data-page-preview="true"]').getAttribute('data-page-preview-state'),
      'sample',
    );
    assert.equal(
      await page.locator('[data-page-preview="true"]').getAttribute('data-page-preview-page-count'),
      null,
      'the sample does not invent an exact page count',
    );
    assert.match(await page.locator('[data-page-preview-summary="true"]').innerText(), /A4 landscape/);
    assert.match(await page.locator('[data-page-preview="true"]').innerText(), /Sample page/);
    assert.equal(
      await page.locator('[data-page-preview-sheet="true"]').count(),
      1,
      'the no-document sample stays one sheet',
    );
    assert.equal(
      await page.locator('[data-page-preview-label="true"]').count(),
      0,
      'the sample sheet has no page number',
    );

    await page.locator('[data-page-size-option="A5"]').click();
    await page.locator('[data-page-orientation-option="portrait"]').click();
    await page.waitForFunction(
      () => {
        const state = window.__noteforestTest.settings();
        return (
          state.app.page.setup.size === 'A5' &&
          state.app.page.setup.orientation === 'portrait' &&
          state.saveState.status === 'saved'
        );
      },
      undefined,
      { timeout: 15000 },
    );
    assert.equal(
      await page.locator('[data-page-preview="true"]').getAttribute('data-page-preview-state'),
      'sample',
    );
    assert.match(await page.locator('[data-page-preview-summary="true"]').innerText(), /A5 portrait/);
    assert.equal(await page.locator('[data-page-density-slider]').isEnabled(), true);

    // R2: global chrome controls drive the same sample preview.
    assert.equal(
      await page.locator('[data-page-chrome-option="header-document"]').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(
      await page.locator('[data-page-chrome-option="footer-chapter"]').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(await page.locator('[data-page-chrome-page-number]').isChecked(), true);
    assert.equal(
      await page.locator('[data-page-preview="true"] .nf-page-header-text').innerText(),
      'Sample page',
    );
    assert.equal(
      await page.locator('[data-page-preview="true"] .nf-page-footer-text').innerText(),
      'Page geometry preview',
    );
    await page.locator('[data-page-chrome-option="header-none"]').click();
    await page.locator('[data-page-chrome-option="footer-none"]').click();
    await page.locator('[data-page-chrome-page-number]').uncheck();
    await page.waitForFunction(
      () => {
        const state = window.__noteforestTest.settings();
        return (
          state.app.page.chrome.header === 'none' &&
          state.app.page.chrome.footer === 'none' &&
          state.app.page.chrome.pageNumber === false &&
          state.saveState.status === 'saved'
        );
      },
      undefined,
      { timeout: 15000 },
    );
    assert.equal(await page.locator('[data-page-preview="true"] .nf-page-header').count(), 0);
    assert.equal(await page.locator('[data-page-preview="true"] .nf-page-footer').count(), 0);
    assert.equal(await page.locator('[data-page-preview="true"] [data-page-indicator]').count(), 0);
    await page.locator('[data-page-chrome-reset="true"]').click();
    await page.waitForFunction(
      () => {
        const state = window.__noteforestTest.settings();
        return (
          state.app.page.chrome.header === 'document' &&
          state.app.page.chrome.footer === 'chapter' &&
          state.app.page.chrome.pageNumber === true
        );
      },
      undefined,
      { timeout: 15000 },
    );
    assert.equal(
      await page.locator('[data-page-preview="true"] .nf-page-header-text').innerText(),
      'Sample page',
    );
    assert.match(
      await page.locator('[data-page-preview="true"] [data-page-indicator]').innerText(),
      /Page 1 of 1/,
    );
    await page.screenshot({ path: join(screenshotDir, 'page-settings-sample-preview.png') });

    await closeSettings();
    const stored = JSON.parse(
      await readFile(join(env.NOTEFOREST_APP_SUPPORT, 'settings.json'), 'utf8'),
    );
    assert.equal(stored.page.setup.size, 'A5');
    assert.equal(stored.page.setup.orientation, 'portrait');
    assert.deepEqual(stored.page.chrome, {
      header: 'document',
      footer: 'chapter',
      pageNumber: true,
    });
  });

  it('allows personal Page setup overrides on a read-only document without changing content', async () => {
    const env = ui.isolated('batch-b-read-only');
    const packagePath = await writePagePackage(
      env.NOTEFOREST_LIBRARY,
      'readonly-page-settings',
      pageDocument({
        id: 'batch-b-readonly',
        title: 'Read-only Page settings',
        chapterTitle: 'Read only',
        blocks: [textBlock('intro', 'Intro', 'Read-only content for personal Page settings.')],
      }),
    );
    const lockDir = join(env.NOTEFOREST_APP_SUPPORT, 'locks');
    await mkdir(lockDir, { recursive: true });
    const lockPath = join(
      lockDir,
      `${createHash('sha256').update(resolve(packagePath)).digest('hex')}.lock`,
    );
    const now = new Date().toISOString();
    await writeFile(
      lockPath,
      JSON.stringify({
        version: 1,
        documentPath: resolve(packagePath),
        pid: process.pid,
        host: (await import('node:os')).hostname(),
        sessionId: 'batch-b-test',
        token: 'batch-b-test-token',
        acquiredAt: now,
        heartbeatAt: now,
      }),
      'utf8',
    );
    await launch('batch-b-read-only', env);
    const opened = await page.evaluate(
      (path) => window.__noteforestTest.openPath(path),
      packagePath,
    );
    assert.equal(opened, true);
    await page.waitForFunction(
      (path) => {
        const state = window.__noteforestTest.state();
        const runtime = state.runtimes.find((item) => item.packagePath === path);
        return runtime?.status === 'read-only';
      },
      packagePath,
      { timeout: 10000 },
    );
    const documentHash = createHash('sha256')
      .update(await readFile(join(packagePath, 'document.json')))
      .digest('hex');

    await openSettings();
    assert.equal(
      await page.locator('[data-page-scope-option="document"]').isDisabled(),
      false,
      'a read-only document may carry a personal Page override',
    );
    await page.locator('[data-page-scope-option="document"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-page-scope-option="document"]')
          ?.getAttribute('aria-pressed') === 'true',
      undefined,
      { timeout: 5000 },
    );
    assert.equal(
      await page.locator('[data-page-preview-scope="true"]').innerText(),
      'This document',
    );
    await page.locator('[data-page-size-option="A5"]').click();
    await page.waitForFunction(
      (path) => {
        const state = window.__noteforestTest.settings();
        return (
          state.pageOverrides[path]?.setup?.size === 'A5' &&
          state.saveState.status === 'saved'
        );
      },
      packagePath,
      { timeout: 15000 },
    );
    // Chrome is personal too (R2) and follows the same read-only document rule.
    await page.locator('[data-page-chrome-option="header-none"]').click();
    await page.waitForFunction(
      (path) => {
        const state = window.__noteforestTest.settings();
        return (
          state.pageOverrides[path]?.chrome?.header === 'none' &&
          state.saveState.status === 'saved'
        );
      },
      packagePath,
      { timeout: 15000 },
    );
    assert.equal(await page.locator('[data-page-chrome-override="header"]').count(), 1);
    await closeSettings();
    assert.equal((await settings()).app.page.setup.size, 'A4');
    const afterHash = createHash('sha256')
      .update(await readFile(join(packagePath, 'document.json')))
      .digest('hex');
    assert.equal(afterHash, documentHash, 'the read-only content was not modified');
    const durable = JSON.parse(
      await readFile(join(env.NOTEFOREST_APP_SUPPORT, 'document-settings.json'), 'utf8'),
    );
    assert.deepEqual(
      durable.entries.find((entry) => entry.packagePath === packagePath)?.page,
      { setup: { size: 'A5' }, chrome: { header: 'none' } },
    );
  });

  it('commits an open Page Edit before a geometry or density write', async () => {
    const env = ui.isolated('batch-b-page-edit');
    await launch('batch-b-page-edit', env);
    const packagePath = await openPackage(
      env,
      'page-edit-settings',
      pageDocument({
        id: 'batch-b-page-edit',
        title: 'Page edit settings',
        chapterTitle: 'Chapter',
        blocks: [
          textBlock('intro', 'Intro', 'Original page text.'),
          textBlock('extra', 'Extra', 'A second block keeps the chapter valid.'),
        ],
      }),
    );
    await showPageRead();
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      () =>
        document
          .querySelector('.nf-editor[data-active="true"] .nf-page-view')
          ?.getAttribute('data-interaction-mode') === 'edit',
      undefined,
      { timeout: 5000 },
    );

    const firstFragment = activePageView().locator('[data-fragment-block="intro"]').first();
    await firstFragment.dblclick();
    await page.waitForSelector('[data-page-edit-overlay]', { timeout: 5000 });
    await page.waitForFunction(
      () => document.activeElement?.closest('[data-page-edit-overlay]') !== null,
      undefined,
      { timeout: 5000 },
    );
    await waitForEditView();
    await page.keyboard.type(' FIRST');
    await page.waitForFunction(
      () => {
        const overlay = document.querySelector('[data-page-edit-overlay]');
        return overlay !== null && (overlay.textContent ?? '').includes('FIRST');
      },
      undefined,
      { timeout: 5000 },
    );
    await openSettingsFromButton();
    await page.locator('[data-page-size-option="A5"]').click();
    await page.locator('[data-page-orientation-option="portrait"]').click();
    await page.waitForFunction(
      () => {
        const setup = window.__noteforestTest.settings().app.page.setup;
        return setup.size === 'A5' && setup.orientation === 'portrait';
      },
      undefined,
      { timeout: 15000 },
    );
    await page.waitForSelector('[data-page-edit-overlay]', { state: 'detached', timeout: 10000 });
    assert.match(JSON.stringify((await ui.structure()).blocks.intro.content), /FIRST/);

    // A second overlay is committed before the density write.
    await closeSettings();
    await waitSheetGeometry({
      width: 148,
      height: 210,
      margins: { top: 12, right: 12, bottom: 12, left: 12 },
    });
    const secondFragment = activePageView().locator('[data-fragment-block="intro"]').first();
    await secondFragment.dblclick();
    await page.waitForSelector('[data-page-edit-overlay]', { timeout: 5000 });
    await page.waitForFunction(
      () => document.activeElement?.closest('[data-page-edit-overlay]') !== null,
      undefined,
      { timeout: 5000 },
    );
    await waitForEditView();
    await page.keyboard.type(' SECOND');
    await page.waitForFunction(
      () => {
        const overlay = document.querySelector('[data-page-edit-overlay]');
        return overlay !== null && (overlay.textContent ?? '').includes('SECOND');
      },
      undefined,
      { timeout: 5000 },
    );
    await openSettingsFromButton();
    await page.locator('[data-page-density-slider]').focus();
    await page.locator('[data-page-density-slider]').press('End');
    await page.waitForFunction(
      () => Math.round(window.__noteforestTest.settings().app.page.theme.density * 100) === 120,
      undefined,
      { timeout: 15000 },
    );
    await page.waitForSelector('[data-page-edit-overlay]', { state: 'detached', timeout: 10000 });
    // The write commits the overlay first; wait for the committed document state
    // instead of racing the save round-trip.
    await page.waitForFunction(
      () =>
        /SECOND/.test(
          JSON.stringify(window.__noteforestTest.structure().blocks.intro.content),
        ),
      undefined,
      { timeout: 10000, polling: 100 },
    );
    const content = JSON.stringify((await ui.structure()).blocks.intro.content);
    assert.match(content, /FIRST/);
    assert.match(content, /SECOND/);

    // A chrome write follows the same commit-before-write ordering (R2).
    await closeSettings();
    await activePageView().locator('[data-fragment-block="intro"]').first().dblclick();
    await page.waitForSelector('[data-page-edit-overlay]', { timeout: 5000 });
    await page.waitForFunction(
      () => document.activeElement?.closest('[data-page-edit-overlay]') !== null,
      undefined,
      { timeout: 5000 },
    );
    await waitForEditView();
    await page.keyboard.type(' THIRD');
    await page.waitForFunction(
      () => {
        const overlay = document.querySelector('[data-page-edit-overlay]');
        return overlay !== null && (overlay.textContent ?? '').includes('THIRD');
      },
      undefined,
      { timeout: 5000 },
    );
    await openSettingsFromButton();
    await page.locator('[data-page-chrome-option="header-none"]').click();
    await page.waitForFunction(
      () => window.__noteforestTest.settings().app.page.chrome.header === 'none',
      undefined,
      { timeout: 15000 },
    );
    await page.waitForSelector('[data-page-edit-overlay]', { state: 'detached', timeout: 10000 });
    await page.waitForFunction(
      () =>
        /THIRD/.test(
          JSON.stringify(window.__noteforestTest.structure().blocks.intro.content),
        ),
      undefined,
      { timeout: 10000 },
    );
    assert.match(JSON.stringify((await ui.structure()).blocks.intro.content), /THIRD/);

    await closeSettings();
    await page.waitForFunction(
      () => {
        const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
        if (view === null) return false;
        const sheet = view.querySelector('.nf-page-sheet');
        if (sheet === null) return false;
        return (
          view.getAttribute('data-ready') === 'true' &&
          view.getAttribute('data-updating') !== 'true' &&
          Math.abs(
            Number(sheet.getAttribute('data-page-width-px')) - 148 * (96 / 25.4),
          ) < 0.1 &&
          getComputedStyle(view).getPropertyValue('--nf-page-body-size').trim() === '10.8pt'
        );
      },
      undefined,
      { timeout: 30000 },
    );
    const geometry = await sheetGeometry();
    assert.ok(closeTo(geometry.width, 148 * PX_PER_MM, 0.1), 'A5 portrait after the edit commit');
    assert.equal(
      await activePageView().evaluate((element) =>
        getComputedStyle(element).getPropertyValue('--nf-page-body-size').trim(),
      ),
      '10.8pt',
      'Page Read follows the 120% density after the edit commit',
    );
    assert.equal((await resolvedPageSettings(packagePath)).setup.size, 'A5');
  });

  it('applies presets, density 60/100/120, and Custom with advanced typography collapsed', async () => {
    const env = ui.isolated('batch-b-typography');
    await launch('batch-b-typography', env);
    const packagePath = await openPackage(env, 'typography-blocks', multiPageBlocksDocument(24));
    await showPageRead();
    await openSettings();

    await page.locator('[data-page-preset-option="comfortable"]').click();
    await page.waitForFunction(
      () => {
        const state = window.__noteforestTest.settings();
        return (
          state.app.page.theme.preset === 'comfortable' &&
          state.saveState.status === 'saved'
        );
      },
      undefined,
      { timeout: 15000 },
    );
    await page.locator('[data-page-density-slider]').focus();
    await page.locator('[data-page-density-slider]').press('End');
    await page.waitForFunction(
      () => Math.round(window.__noteforestTest.settings().app.page.theme.density * 100) === 120,
      undefined,
      { timeout: 15000 },
    );
    await page.locator('[data-page-preset-option="custom"]').click();
    await page.waitForFunction(
      () => window.__noteforestTest.settings().app.page.theme.preset === 'custom',
      undefined,
      { timeout: 15000 },
    );
    assert.equal(
      await page.locator('[data-page-preset-option="custom"]').getAttribute('aria-pressed'),
      'true',
    );
    await page.screenshot({ path: join(screenshotDir, 'page-settings-typography.png') });
    await closeSettings();
    await waitPageBody('12.6pt');
    assert.equal(
      await activePageView().evaluate((element) =>
        getComputedStyle(element).getPropertyValue('--nf-page-body-size').trim(),
      ),
      '12.6pt',
      'Custom preserves the comfortable 120% typography',
    );

    // Compact keeps the density lens and returns to the compact baseline. A
    // Custom layer would be replaced, so Batch C asks first (Q-11).
    await openSettingsFromButton();
    await page.locator('[data-page-preset-option="compact"]').click();
    await page.waitForSelector('[data-page-preset-warning="true"]', { timeout: 5000 });
    await page.locator('[data-page-preset-confirm="true"]').click();
    await page.waitForFunction(
      () => {
        const state = window.__noteforestTest.settings();
        return (
          state.app.page.theme.preset === 'compact' &&
          Math.round(state.app.page.theme.density * 100) === 120 &&
          state.saveState.status === 'saved'
        );
      },
      undefined,
      { timeout: 15000 },
    );
    await closeSettings();
    await waitPageBody('10.8pt');
    assert.equal(
      await activePageView().evaluate((element) =>
        getComputedStyle(element).getPropertyValue('--nf-page-body-size').trim(),
      ),
      '10.8pt',
    );

    // Reset to default is Compact 100.
    await openSettingsFromButton();
    await page.locator('[data-page-theme-reset="true"]').click();
    await page.waitForFunction(
      () => {
        const state = window.__noteforestTest.settings();
        return (
          state.app.page.theme.preset === 'compact' &&
          Math.round(state.app.page.theme.density * 100) === 100 &&
          state.saveState.status === 'saved'
        );
      },
      undefined,
      { timeout: 15000 },
    );
    assert.equal(await page.locator('[data-page-density-value]').innerText(), '100%');
    assert.equal(await page.locator('[data-page-advanced-hidden="true"]').isVisible(), true);
    await closeSettings();
    await waitPageBody('9pt');
    assert.equal(
      await activePageView().evaluate((element) =>
        getComputedStyle(element).getPropertyValue('--nf-page-body-size').trim(),
      ),
      '9pt',
    );
    assert.equal((await resolvedPageSettings(packagePath)).theme.preset, 'compact');
  });

  it('keeps Page Read geometry and typography in parity for size, orientation, margins, density, and an override', async () => {
    const env = ui.isolated('batch-b-parity');
    await launch('batch-b-parity', env);
    const packagePath = await openPackage(env, 'parity-blocks', multiPageBlocksDocument(20));
    await showPageRead();

    const cases = [
      {
        name: 'A4 landscape 12 mm 100%',
        override: undefined,
        expected: { size: 'A4', orientation: 'landscape', margins: 12, body: '9pt', width: 297, height: 210, density: 100 },
      },
      {
        name: 'A5 portrait 20 mm 60%',
        override: {
          setup: {
            size: 'A5',
            orientation: 'portrait',
            margins: { top: 20, right: 20, bottom: 20, left: 20 },
          },
          theme: { density: 0.6 },
        },
        expected: { size: 'A5', orientation: 'portrait', margins: 20, body: '7pt', width: 148, height: 210, density: 60 },
      },
      {
        name: 'Letter landscape 25 mm 120%',
        override: {
          setup: {
            size: 'Letter',
            orientation: 'landscape',
            margins: { top: 25, right: 25, bottom: 25, left: 25 },
          },
          theme: { density: 1.2 },
        },
        expected: { size: 'Letter', orientation: 'landscape', margins: 25, body: '10.8pt', width: 279.4, height: 215.9, density: 120 },
      },
    ];

    for (const item of cases) {
      if (item.override !== undefined) {
        const start = Number(await activePageView().getAttribute('data-model-runs'));
        await page.evaluate(
          ({ path, override }) =>
            window.__noteforestTest.setPageSettingsOverride(path, override),
          { path: packagePath, override: item.override },
        );
        await page.waitForFunction(
          ({ runs, body }) => {
            const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
            if (view === null) return false;
            return (
              Number(view.getAttribute('data-model-runs')) > runs &&
              view.getAttribute('data-ready') === 'true' &&
              getComputedStyle(view).getPropertyValue('--nf-page-body-size').trim() === body
            );
          },
          { runs: start, body: item.expected.body },
          { timeout: 30000 },
        );
      }
      const geometry = await sheetGeometry();
      assert.ok(
        closeTo(geometry.width, item.expected.width * PX_PER_MM, 0.1),
        `${item.name}: width`,
      );
      assert.ok(
        closeTo(geometry.height, item.expected.height * PX_PER_MM, 0.1),
        `${item.name}: height`,
      );
      for (const key of ['marginTop', 'marginRight', 'marginBottom', 'marginLeft']) {
        assert.ok(
          closeTo(geometry[key], item.expected.margins * PX_PER_MM, 0.1),
          `${item.name}: ${key}`,
        );
      }
      const resolved = await resolvedPageSettings(packagePath);
      assert.equal(resolved.setup.size, item.expected.size);
      assert.equal(resolved.setup.orientation, item.expected.orientation);
      assert.equal(
        Math.round(resolved.theme.density * 100),
        item.expected.density,
        `${item.name}: density`,
      );
      assert.ok(geometry.pageCount >= 1);
    }

    // The document override never changes the global default.
    const stored = await settings();
    assert.equal(stored.app.page.setup.size, 'A4');
    assert.equal(stored.app.page.setup.margins.top, 12);
    assert.equal(Math.round(stored.app.page.theme.density * 100), 100);
    assert.equal(stored.pageOverrides[packagePath]?.setup?.size, 'Letter');
  });

  it('shows real Page setup, margins, typography, and a live preview', async () => {
    const env = ui.isolated('batch-b-page-setup');
    await launch('batch-b-page-setup', env);
    const packagePath = await openPackage(env, 'setup-blocks', multiPageBlocksDocument(16));
    await showPageRead();
    const pageReadCount = Number(await activePageView().getAttribute('data-page-count'));

    await openSettings();
    assert.equal(await page.locator('[data-page-scope-option="global"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-page-size-option="A4"]').getAttribute('aria-pressed'), 'true');
    assert.equal(
      await page.locator('[data-page-orientation-option="landscape"]').getAttribute('aria-pressed'),
      'true',
    );
    for (const key of ['top', 'right', 'bottom', 'left']) {
      assert.equal(await page.locator(`[data-page-margin="${key}"]`).inputValue(), '12');
      assert.equal(
        await page.locator(`[data-page-margin="${key}"]`).evaluate((element) =>
          element.parentElement?.textContent?.includes('mm'),
        ),
        true,
        `${key} shows the mm unit`,
      );
    }
    assert.equal(await page.locator('[data-page-margin-all="true"]').inputValue(), '12');
    assert.deepEqual(
      await page.locator('[data-page-preset-option]').allInnerTexts(),
      ['Compact', 'Comfortable', 'Custom'],
    );
    assert.equal(await page.locator('[data-page-preset-option="compact"]').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(
      await page.locator('[data-page-density-slider]').evaluate((element) => ({
        min: element.min,
        max: element.max,
        step: element.step,
      })),
      { min: '60', max: '120', step: '5' },
    );
    assert.equal(await page.locator('[data-page-advanced-hidden="true"]').isVisible(), true);
    assert.equal(await page.locator('[data-page-advanced-typography]').count(), 1);
    assert.equal(
      await page
        .locator('[data-page-advanced-typography]')
        .evaluate((element) => element.open),
      false,
      'advanced typography is collapsed by default',
    );
    assert.equal(
      await page.locator('[data-page-theme-input="bodyPt"]').isVisible(),
      false,
      'a collapsed disclosure does not show its fields',
    );

    await waitPreviewReady();
    assert.equal(
      await page.locator('[data-page-preview="true"]').getAttribute('data-page-preview-state'),
      'ready',
    );
    assert.equal(
      Number(
        await page
          .locator('[data-page-preview="true"]')
          .getAttribute('data-page-preview-page-count'),
      ),
      pageReadCount,
      'the preview uses the same page model and page count as Page Read',
    );
    assert.match(
      await page.locator('[data-page-preview-summary="true"]').innerText(),
      /A4 landscape · 12 \/ 12 \/ 12 \/ 12 mm margins · 100% density/,
    );
    assert.equal(
      await page.locator('[data-page-preview-scope="true"]').innerText(),
      'Global default',
    );
    await page.screenshot({ path: join(screenshotDir, 'page-settings-default.png') });

    await closeSettings();
    assert.equal((await resolvedPageSettings(packagePath)).setup.size, 'A4');
  });

  it('writes size, orientation, and margins instantly and the preview follows the draft', async () => {
    const env = ui.isolated('batch-b-page-write');
    await launch('batch-b-page-write', env);
    const packagePath = await openPackage(env, 'write-blocks', multiPageBlocksDocument(24));
    await showPageRead();
    const initialCount = Number(await activePageView().getAttribute('data-page-count'));

    await openSettings();
    await waitPreviewReady();
    await page.locator('[data-page-size-option="A5"]').click();
    await page.locator('[data-page-orientation-option="portrait"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-page-preview="true"]')
          ?.getAttribute('data-page-preview-updating') === 'true',
      undefined,
      { timeout: 5000 },
    );
    await page.waitForFunction(
      () => {
        const state = window.__noteforestTest.settings();
        return (
          state.app.page.setup.size === 'A5' &&
          state.app.page.setup.orientation === 'portrait' &&
          state.saveState.status === 'saved'
        );
      },
      undefined,
      { timeout: 15000 },
    );
    assert.equal(
      await page.locator('[data-page-size-option="A5"]').getAttribute('aria-pressed'),
      'true',
    );

    await page.locator('[data-page-margin="top"]').fill('20');
    await page.waitForFunction(
      () => window.__noteforestTest.settings().app.page.setup.margins.top === 20,
      undefined,
      { timeout: 15000 },
    );
    // ArrowUp/ArrowDown step by 1 mm; Shift steps by 5 mm.
    const topMargin = page.locator('[data-page-margin="top"]');
    await topMargin.focus();
    await topMargin.press('ArrowUp');
    await page.waitForFunction(
      () => window.__noteforestTest.settings().app.page.setup.margins.top === 21,
      undefined,
      { timeout: 15000 },
    );
    await topMargin.press('ArrowDown');
    await page.waitForFunction(
      () => window.__noteforestTest.settings().app.page.setup.margins.top === 20,
      undefined,
      { timeout: 15000 },
    );
    await page.locator('[data-page-margin-all="true"]').fill('25');
    await page.waitForFunction(
      () => {
        const margins = window.__noteforestTest.settings().app.page.setup.margins;
        return (
          margins.top === 25 &&
          margins.right === 25 &&
          margins.bottom === 25 &&
          margins.left === 25
        );
      },
      undefined,
      { timeout: 15000 },
    );
    await page.locator('[data-page-margin="left"]').fill('30');
    await page.waitForFunction(
      () => {
        const state = window.__noteforestTest.settings();
        return (
          state.app.page.setup.margins.left === 30 &&
          state.saveState.status === 'saved'
        );
      },
      undefined,
      { timeout: 15000 },
    );

    // The preview follows the draft, not a fake skeleton.
    await page.waitForFunction(
      () => {
        const preview = document.querySelector('[data-page-preview="true"]');
        return (
          preview !== null &&
          preview.getAttribute('data-page-preview-size') === 'A5' &&
          preview.getAttribute('data-page-preview-orientation') === 'portrait' &&
          preview.getAttribute('data-page-preview-state') === 'ready'
        );
      },
      undefined,
      { timeout: 30000 },
    );
    const previewCount = Number(
      await page
        .locator('[data-page-preview="true"]')
        .getAttribute('data-page-preview-page-count'),
    );
    assert.ok(previewCount > initialCount, 'A5 portrait needs more pages than A4 landscape');
    assert.match(
      await page.locator('[data-page-preview-summary="true"]').innerText(),
      /A5 portrait · 25 \/ 25 \/ 25 \/ 30 mm margins/,
    );
    await page.screenshot({ path: join(screenshotDir, 'page-settings-margins.png') });

    await closeSettings();
    await waitSheetGeometry({
      width: 148,
      height: 210,
      margins: { top: 25, right: 25, bottom: 25, left: 30 },
    });
    const geometry = await sheetGeometry();
    assert.ok(closeTo(geometry.width, 148 * PX_PER_MM, 0.1), 'A5 portrait width');
    assert.ok(closeTo(geometry.height, 210 * PX_PER_MM, 0.1), 'A5 portrait height');
    assert.ok(closeTo(geometry.marginTop, 25 * PX_PER_MM, 0.1));
    assert.ok(closeTo(geometry.marginRight, 25 * PX_PER_MM, 0.1));
    assert.ok(closeTo(geometry.marginBottom, 25 * PX_PER_MM, 0.1));
    assert.ok(closeTo(geometry.marginLeft, 30 * PX_PER_MM, 0.1));
    assert.ok(geometry.pageCount > initialCount);
    await waitPageReady();
    await page.screenshot({ path: join(screenshotDir, 'page-read-a5-margins.png') });

    const stored = JSON.parse(
      await readFile(join(env.NOTEFOREST_APP_SUPPORT, 'settings.json'), 'utf8'),
    );
    assert.deepEqual(stored.page.setup, {
      size: 'A5',
      orientation: 'portrait',
      margins: { top: 25, right: 25, bottom: 25, left: 30 },
    });
    const onDisk = JSON.parse(await readFile(join(packagePath, 'document.json'), 'utf8'));
    assert.equal(onDisk.pageSetup, undefined, 'page setup is never canonical content');
  });

  it('validates margins inline and never silently resets or writes an invalid value', async () => {
    const env = ui.isolated('batch-b-page-validation');
    await launch('batch-b-page-validation', env);
    const packagePath = await openPackage(env, 'validation-blocks', multiPageBlocksDocument(8));
    await showPageRead();
    await openSettings();

    // 100 + 100 mm leaves 10 mm of content on an A4 landscape page (210 mm high).
    await page.locator('[data-page-margin="top"]').fill('100');
    await page.locator('[data-page-margin="bottom"]').fill('100');
    await page.waitForSelector('[data-page-margin-error="true"]');
    assert.equal(
      await page.locator('[data-page-margin="bottom"]').getAttribute('aria-invalid'),
      'true',
    );
    const describedBy = await page
      .locator('[data-page-margin="bottom"]')
      .getAttribute('aria-describedby');
    assert.match(describedBy ?? '', /page-margin-bottom-error/);
    assert.match(describedBy ?? '', /page-margin-error/);
    assert.match(
      await page.locator('[data-page-margin-field-error="bottom"]').innerText(),
      /at least 20 mm|less than 20 mm/,
    );
    assert.equal(
      await page.locator('[data-settings-status]').getAttribute('data-settings-status'),
      'invalid',
    );
    assert.equal(
      await page.locator('[data-page-preview="true"]').getAttribute('data-page-preview-state'),
      'invalid',
    );
    assert.equal(await page.locator('[data-page-preview-invalid="true"]').isVisible(), true);
    // The invalid text is still visible; nothing was sanitized to 12 mm.
    assert.equal(await page.locator('[data-page-margin="bottom"]').inputValue(), '100');
    const beforeClose = await settings();
    assert.deepEqual(beforeClose.app.page.setup.margins, {
      top: 12,
      right: 12,
      bottom: 12,
      left: 12,
    });
    await page.screenshot({ path: join(screenshotDir, 'page-settings-invalid-margins.png') });

    // Closing flushes any pending edit; the invalid value must still not write.
    await closeSettings();
    const afterClose = await settings();
    assert.deepEqual(afterClose.app.page.setup.margins, {
      top: 12,
      right: 12,
      bottom: 12,
      left: 12,
    });
    const onDisk = await readFile(
      join(env.NOTEFOREST_APP_SUPPORT, 'settings.json'),
      'utf8',
    )
      .then((text) => JSON.parse(text))
      .catch(() => null);
    assert.equal(
      onDisk?.page?.setup?.margins?.bottom ?? 12,
      12,
      'the invalid value never reached disk',
    );

    // A corrected pair writes; 100 + 80 mm leaves 30 mm of content.
    await openSettings();
    assert.equal(await page.locator('[data-page-margin="bottom"]').inputValue(), '12');
    await page.locator('[data-page-margin="top"]').fill('100');
    await page.locator('[data-page-margin="bottom"]').fill('80');
    await page.waitForFunction(
      () => {
        const margins = window.__noteforestTest.settings().app.page.setup.margins;
        return (
          margins.top === 100 &&
          margins.bottom === 80 &&
          window.__noteforestTest.settings().saveState.status === 'saved'
        );
      },
      undefined,
      { timeout: 15000 },
    );
    assert.equal(await page.locator('[data-page-margin-error="true"]').count(), 0);
    assert.ok(
      (await page.locator('[data-page-margins-help="true"]').innerText()).includes(
        'content',
      ),
    );
    const resolved = await resolvedPageSettings(packagePath);
    assert.deepEqual(resolved.setup.margins, {
      top: 100,
      right: 12,
      bottom: 80,
      left: 12,
    });
  });

  it('creates partial document overrides, removes equal values, and never writes on scope switch', async () => {
    const env = ui.isolated('batch-b-page-override');
    await launch('batch-b-page-override', env);
    const packagePath = await openPackage(env, 'override-blocks', multiPageBlocksDocument(12));
    await showPageRead();
    await openSettings();

    // Switching the layer is not a write and creates no entry.
    await page.locator('[data-page-scope-option="document"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-page-scope-option="document"]')
          ?.getAttribute('aria-pressed') === 'true',
      undefined,
      { timeout: 5000 },
    );
    assert.equal((await settings()).pageOverrides[packagePath], undefined);
    await page.locator('[data-page-scope-option="global"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-page-scope-option="global"]')
          ?.getAttribute('aria-pressed') === 'true',
      undefined,
      { timeout: 5000 },
    );
    assert.equal((await settings()).pageOverrides[packagePath], undefined);

    await page.locator('[data-page-scope-option="document"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-page-scope-option="document"]')
          ?.getAttribute('aria-pressed') === 'true',
      undefined,
      { timeout: 5000 },
    );
    assert.equal(
      await page.locator('[data-page-preview-scope="true"]').innerText(),
      'This document',
    );
    await page.locator('[data-page-size-option="A5"]').click();
    await page.waitForFunction(
      (path) => {
        const state = window.__noteforestTest.settings();
        return (
          state.pageOverrides[path]?.setup?.size === 'A5' &&
          state.saveState.status === 'saved'
        );
      },
      packagePath,
      { timeout: 15000 },
    );
    assert.equal((await settings()).app.page.setup.size, 'A4', 'global stays A4');
    assert.equal(await page.locator('[data-page-size-override="true"]').count(), 1);
    await page.locator('[data-page-size-use-global="true"]').click();
    await page.waitForFunction(
      (path) => {
        const state = window.__noteforestTest.settings();
        return (
          state.pageOverrides[path] === undefined && state.saveState.status === 'saved'
        );
      },
      packagePath,
      { timeout: 15000 },
    );
    assert.equal(await page.locator('[data-page-size-override="true"]').count(), 0);

    // One margin override; an equal-to-global value removes it again.
    await page.locator('[data-page-margin="top"]').fill('20');
    await page.waitForFunction(
      (path) => {
        const state = window.__noteforestTest.settings();
        return (
          state.pageOverrides[path]?.setup?.margins?.top === 20 &&
          state.saveState.status === 'saved'
        );
      },
      packagePath,
      { timeout: 15000 },
    );
    assert.equal((await settings()).app.page.setup.margins.top, 12);
    assert.equal(await page.locator('[data-page-margin-override="top"]').count(), 1);
    await page.screenshot({ path: join(screenshotDir, 'page-settings-document-override.png') });
    await page.locator('[data-page-margin="top"]').fill('12');
    await page.waitForFunction(
      (path) => {
        const state = window.__noteforestTest.settings();
        return (
          state.pageOverrides[path] === undefined && state.saveState.status === 'saved'
        );
      },
      packagePath,
      { timeout: 15000 },
    );
    assert.equal(await page.locator('[data-page-margin-override="top"]').count(), 0);

    // Per-field Use global, then group Use global.
    await page.locator('[data-page-margin="top"]').fill('20');
    await page.waitForFunction(
      (path) => window.__noteforestTest.settings().pageOverrides[path]?.setup?.margins?.top === 20,
      packagePath,
      { timeout: 15000 },
    );
    await page.locator('[data-page-margin-use-global="top"]').click();
    await page.waitForFunction(
      (path) => window.__noteforestTest.settings().pageOverrides[path] === undefined,
      packagePath,
      { timeout: 15000 },
    );
    await page.locator('[data-page-size-option="A5"]').click();
    await page.locator('[data-page-margin="top"]').fill('20');
    await page.waitForFunction(
      (path) => {
        const page = window.__noteforestTest.settings().pageOverrides[path];
        return page?.setup?.size === 'A5' && page?.setup?.margins?.top === 20;
      },
      packagePath,
      { timeout: 15000 },
    );
    await page.locator('[data-page-setup-use-global="true"]').click();
    await page.waitForFunction(
      (path) => window.__noteforestTest.settings().pageOverrides[path] === undefined,
      packagePath,
      { timeout: 15000 },
    );

    // Theme overrides are partial too and clear through Use global.
    await page.locator('[data-page-preset-option="comfortable"]').click();
    await page.waitForFunction(
      (path) => {
        const state = window.__noteforestTest.settings();
        return (
          state.pageOverrides[path]?.theme?.preset === 'comfortable' &&
          state.saveState.status === 'saved'
        );
      },
      packagePath,
      { timeout: 15000 },
    );
    assert.equal(await page.locator('[data-page-preset-override="true"]').count(), 1);
    await page.locator('[data-page-theme-use-global="true"]').click();
    await page.waitForFunction(
      (path) => window.__noteforestTest.settings().pageOverrides[path] === undefined,
      packagePath,
      { timeout: 15000 },
    );

    await page.locator('[data-page-density-slider]').focus();
    await page.locator('[data-page-density-slider]').press('End');
    await page.waitForFunction(
      (path) => {
        const state = window.__noteforestTest.settings();
        return (
          Math.round((state.pageOverrides[path]?.theme?.density ?? 0) * 100) === 120 &&
          state.saveState.status === 'saved'
        );
      },
      packagePath,
      { timeout: 15000 },
    );
    assert.equal(await page.locator('[data-page-density-override="true"]').count(), 1);
    await page.locator('[data-page-density-use-global="true"]').click();
    await page.waitForFunction(
      (path) => window.__noteforestTest.settings().pageOverrides[path] === undefined,
      packagePath,
      { timeout: 15000 },
    );

    await closeSettings();
    assert.equal((await settings()).pageOverrides[packagePath], undefined);
    const durablePath = join(env.NOTEFOREST_APP_SUPPORT, 'document-settings.json');
    const durable = JSON.parse(await readFile(durablePath, 'utf8').catch(() => '{"entries":[]}'));
    assert.equal(
      durable.entries.some((entry) => entry.packagePath === packagePath && entry.page !== undefined),
      false,
      'cleared overrides leave no durable entry',
    );
  });

  it('edits global and document Page chrome without a write on scope switch', async () => {
    const env = ui.isolated('batch-b-page-chrome');
    await launch('batch-b-page-chrome', env);
    const packagePath = await openPackage(
      env,
      'chrome-settings',
      pageDocument({
        id: 'batch-b-page-chrome',
        title: 'Chrome settings document',
        chapterTitle: 'Chrome settings chapter',
        blocks: [
          textBlock('chrome-intro', 'Intro', 'Chrome settings body.'),
          textBlock('chrome-extra', 'Extra', 'A second block keeps the chapter valid.'),
        ],
      }),
    );
    await showPageRead();
    await openSettings();
    await page.waitForSelector('[data-page-chrome-section="true"]');

    // The global layer starts on the approved defaults.
    assert.equal(
      await page.locator('[data-page-chrome-option="header-document"]').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(
      await page.locator('[data-page-chrome-option="footer-chapter"]').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(await page.locator('[data-page-chrome-page-number]').isChecked(), true);

    // Switching to the document layer never writes and creates no entry.
    await page.locator('[data-page-scope-option="document"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-page-scope-option="document"]')
          ?.getAttribute('aria-pressed') === 'true',
      undefined,
      { timeout: 5000 },
    );
    assert.equal((await settings()).pageOverrides[packagePath], undefined);

    // A header override writes only that field and shows the override dot.
    await page.locator('[data-page-chrome-option="header-none"]').click();
    await page.waitForFunction(
      (path) => {
        const state = window.__noteforestTest.settings();
        return (
          state.pageOverrides[path]?.chrome?.header === 'none' &&
          state.saveState.status === 'saved'
        );
      },
      packagePath,
      { timeout: 15000 },
    );
    assert.equal((await settings()).app.page.chrome.header, 'document', 'global stays unchanged');
    assert.equal(await page.locator('[data-page-chrome-override="header"]').count(), 1);
    assert.equal(await page.locator('[data-page-chrome-use-global="header"]').count(), 1);
    // Page Read behind Settings follows the same resolved chrome.
    await page.waitForFunction(
      () => document.querySelector('.nf-editor[data-active="true"] .nf-page-header') === null,
      undefined,
      { timeout: 15000 },
    );
    assert.equal(
      await page.locator('[data-page-preview="true"] .nf-page-header').count(),
      0,
      'the preview drops the header too',
    );

    // Choosing the global value removes the override instead of storing a no-op.
    await page.locator('[data-page-chrome-option="header-document"]').click();
    await page.waitForFunction(
      (path) => {
        const state = window.__noteforestTest.settings();
        return state.pageOverrides[path] === undefined && state.saveState.status === 'saved';
      },
      packagePath,
      { timeout: 15000 },
    );
    assert.equal(await page.locator('[data-page-chrome-override="header"]').count(), 0);

    // Page number off removes the indicator in Page Read and the preview.
    await page.locator('[data-page-chrome-page-number]').uncheck();
    await page.waitForFunction(
      (path) =>
        window.__noteforestTest.settings().pageOverrides[path]?.chrome?.pageNumber === false,
      packagePath,
      { timeout: 15000 },
    );
    await page.waitForFunction(
      () =>
        document.querySelector(
          '.nf-editor[data-active="true"] .nf-page-view [data-page-indicator]',
        ) === null,
      undefined,
      { timeout: 15000 },
    );
    assert.equal(
      await page.locator('[data-page-preview="true"] [data-page-indicator]').count(),
      0,
    );
    assert.equal(await page.locator('[data-page-chrome-override="pageNumber"]').count(), 1);

    // Footer source is independent and updates the footer text on Page Read.
    await page.locator('[data-page-chrome-option="footer-document"]').click();
    await page.waitForFunction(
      (path) =>
        window.__noteforestTest.settings().pageOverrides[path]?.chrome?.footer === 'document',
      packagePath,
      { timeout: 15000 },
    );
    await page.waitForFunction(
      () =>
        document
          .querySelector(
            '.nf-editor[data-active="true"] .nf-page-view .nf-page-footer-text',
          )
          ?.textContent?.trim() === 'Chrome settings document',
      undefined,
      { timeout: 15000 },
    );
    await page.waitForFunction(
      () => window.__noteforestTest.settings().saveState.status === 'saved',
      undefined,
      { timeout: 15000 },
    );
    await page.locator('[data-page-chrome-section="true"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(screenshotDir, 'page-settings-chrome-override.png') });

    // Scope switches never write: the durable override is unchanged.
    const beforeSwitch = JSON.stringify((await settings()).pageOverrides[packagePath]);
    await page.locator('[data-page-scope-option="global"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-page-scope-option="global"]')
          ?.getAttribute('aria-pressed') === 'true',
      undefined,
      { timeout: 5000 },
    );
    assert.equal(
      await page.locator('[data-page-chrome-override="pageNumber"]').count(),
      0,
      'no dots in the global layer',
    );
    await page.locator('[data-page-scope-option="document"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-page-scope-option="document"]')
          ?.getAttribute('aria-pressed') === 'true',
      undefined,
      { timeout: 5000 },
    );
    assert.equal(JSON.stringify((await settings()).pageOverrides[packagePath]), beforeSwitch);

    // Per-field and group Use global clear the override.
    await page.locator('[data-page-chrome-use-global="pageNumber"]').click();
    await page.waitForFunction(
      (path) =>
        window.__noteforestTest.settings().pageOverrides[path]?.chrome?.pageNumber === undefined,
      packagePath,
      { timeout: 15000 },
    );
    await page.locator('[data-page-chrome-use-global="true"]').click();
    await page.waitForFunction(
      (path) => window.__noteforestTest.settings().pageOverrides[path] === undefined,
      packagePath,
      { timeout: 15000 },
    );
    assert.equal(await page.locator('[data-page-chrome-override="header"]').count(), 0);
    assert.equal(await page.locator('[data-page-chrome-override="footer"]').count(), 0);
    assert.equal(await page.locator('[data-page-chrome-override="pageNumber"]').count(), 0);

    // Global chrome changes reach the document when it has no override.
    await page.locator('[data-page-scope-option="global"]').click();
    await page.locator('[data-page-chrome-option="header-chapter"]').click();
    await page.waitForFunction(
      () =>
        window.__noteforestTest.settings().app.page.chrome.header === 'chapter' &&
        window.__noteforestTest.settings().saveState.status === 'saved',
      undefined,
      { timeout: 15000 },
    );
    assert.equal(
      await page.locator('[data-page-preview="true"] .nf-page-header-text').innerText(),
      'Chrome settings chapter',
    );
    await closeSettings();
    assert.equal((await resolvedPageSettings(packagePath)).chrome.header, 'chapter');
    const stored = JSON.parse(
      await readFile(join(env.NOTEFOREST_APP_SUPPORT, 'settings.json'), 'utf8'),
    );
    assert.deepEqual(stored.page.chrome, {
      header: 'chapter',
      footer: 'chapter',
      pageNumber: true,
    });
  });
});
