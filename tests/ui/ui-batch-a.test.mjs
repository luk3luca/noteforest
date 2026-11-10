import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { pageDocument, textBlock, writePagePackage } from '../support/page-fixtures.mjs';

/**
 * Batch A UI rework coverage (non-Page/PDF): shell C, tabs, zoom, active rows,
 * Settings instant-save shell, and the command palette. Export states live in
 * the dedicated m4d2 suite; Page density/override behavior lives in m4d1 and
 * m4e1. All screenshots land in artifacts/ui-batch-a.
 */

const tempRoot = artifactsPath('ui-batch-a-temp');
const screenshotDir = artifactsPath('ui-batch-a');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

async function launch(name, env) {
  page = await ui.launch({ ...(env ?? ui.isolated(name)), NOTEFOREST_E2E_HIDDEN: '1' });
  await h.setWindowSize(1440, 900);
}

async function box(selector) {
  return page.locator(selector).first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  });
}

async function css(selector, property) {
  return page.locator(selector).first().evaluate((element, name) => {
    return getComputedStyle(element).getPropertyValue(name);
  }, property);
}

async function seedPerformance() {
  await page.evaluate(() => window.__noteforestTest.seed('performance'));
  await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]', {
    timeout: 20000,
  });
  await h.waitSaved();
}

async function openSettings() {
  await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
  await page.keyboard.press('Meta+,');
  await page.waitForSelector('[data-settings-dialog="true"]');
}

async function closeSettings() {
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
}

async function openPaletteFromButton() {
  await page.locator('.nf-palette-button').focus();
  await page.keyboard.press('Meta+k');
  await page.waitForSelector('.nf-palette');
}

function paletteItem(label) {
  return page
    .locator('.nf-palette-item', {
      has: page.locator('.nf-palette-label', { hasText: label }),
    })
    .first();
}

describe('Batch A UI rework', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    // Keep screenshots from the export/settings suites that ran earlier.
    await mkdir(screenshotDir, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('keeps one fixed 34 px canvas header outside the scroll with edge-to-edge content', async () => {
    await launch('batch-a-header');
    await seedPerformance();
    await page.waitForSelector('.nf-editor[data-active="true"] [data-canvas-header]');
    await page.screenshot({ path: join(screenshotDir, 'expanded-shell.png') });

    const canvas = await box('.nf-canvas-panel');
    const header = await box('.nf-canvas-header');
    assert.equal(header.height, 34, 'the canvas header is 34 px');
    assert.ok(header.top >= canvas.top - 1 && header.bottom <= canvas.bottom + 1);
    assert.equal(
      await page.locator('.nf-canvas-header').evaluate(
        (element) => element.parentElement?.classList.contains('nf-editor-scroll') ?? false,
      ),
      false,
      'the header is a sibling of the scroll container, not inside it',
    );

    // The header stays put while the continuous canvas scrolls.
    await page.locator('.nf-editor-scroll').evaluate((element) => {
      element.scrollTop = 420;
    });
    await page.waitForFunction(
      () => (document.querySelector('.nf-editor-scroll')?.scrollTop ?? 0) > 0,
      undefined,
      { timeout: 10000 },
    );
    const afterScroll = await box('.nf-canvas-header');
    assert.ok(Math.abs(afterScroll.top - header.top) < 0.5, 'the header does not scroll');

    // Shell C insets: 6 px header padding, 0 lateral canvas content, 8 px bottom.
    assert.equal(await css('.nf-canvas-header', 'padding-left'), '6px');
    assert.equal(await css('.nf-canvas-header', 'padding-right'), '6px');
    assert.equal(await css('.nf-canvas', 'padding-left'), '0px');
    assert.equal(await css('.nf-canvas', 'padding-right'), '0px');
    assert.equal(await css('.nf-canvas', 'padding-top'), '6px');
    assert.equal(await css('.nf-canvas', 'padding-bottom'), '8px');

    // Header content: undo/redo left, icon-only layout/mode right.
    assert.equal(await page.locator('.nf-canvas-header [data-header-undo]').count(), 1);
    assert.equal(await page.locator('.nf-canvas-header [data-header-redo]').count(), 1);
    assert.equal(await page.locator('.nf-canvas-header [data-view-controls]').count(), 1);
    const segmentText = await page
      .locator('.nf-canvas-header .nf-view-segment')
      .allInnerTexts();
    assert.deepEqual(
      segmentText.map((value) => value.trim()),
      ['', '', '', ''],
      'layout/mode are icon-only',
    );
    assert.equal(
      await page
        .locator('.nf-canvas-header .nf-view-segment')
        .evaluateAll((elements) =>
          elements.every((element) => (element.getAttribute('aria-label') ?? '').length > 0),
        ),
      true,
      'icon-only controls keep labels',
    );

    // Toolbar: tabs, +, overflow, zoom, palette. No view controls, no global close.
    assert.equal(await page.locator('.nf-toolbar [data-view-controls]').count(), 0);
    assert.equal(await page.locator('.nf-toolbar [data-zoom-value]').count(), 1);
    assert.equal(await page.locator('.nf-toolbar [data-zoom-action="out"]').count(), 1);
    assert.equal(await page.locator('.nf-toolbar [data-zoom-action="in"]').count(), 1);
    assert.equal(await page.locator('.nf-toolbar [data-zoom-menu]').count(), 0);
    assert.equal(await page.locator('.nf-toolbar [data-toolbar-new]').count(), 1);
    assert.equal(await page.locator('.nf-toolbar [aria-label="All open tabs"]').count(), 1);
    assert.equal(await page.locator('.nf-toolbar [aria-label="Command palette"]').count(), 1);
    assert.equal(await page.locator('[data-close-active-tab]').count(), 0);

    // Undo enables after an edit and is disabled in Read mode with a reason.
    const prose = h.activeEditor().locator('.nf-prosemirror');
    await prose.click();
    await page.keyboard.type('x');
    await h.waitSaved();
    assert.equal(await page.locator('[data-header-undo]').isDisabled(), false);
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      () => document.querySelector('.nf-editor[data-active="true"]')?.getAttribute('data-interaction-mode') === 'read',
      undefined,
      { timeout: 10000 },
    );
    assert.equal(await page.locator('[data-header-undo]').isDisabled(), true);
    assert.match(await page.locator('[data-header-undo]').getAttribute('title'), /Read mode/);
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      () => document.querySelector('.nf-editor[data-active="true"]')?.getAttribute('data-interaction-mode') === 'edit',
      undefined,
      { timeout: 10000 },
    );

    // Page: the same header carries page navigation and Export; the old
    // PageToolbar is gone and the stage is 14/0/8.
    await page.keyboard.press('Meta+3');
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view');
    await page.waitForFunction(
      () => document.querySelector('.nf-editor[data-active="true"] .nf-page-view')?.getAttribute('data-ready') === 'true',
      undefined,
      { timeout: 30000 },
    );
    assert.equal(await page.locator('.nf-page-toolbar').count(), 0);
    assert.equal(await page.locator('.nf-canvas-header [data-page-nav="prev"]').count(), 1);
    assert.equal(await page.locator('.nf-canvas-header [data-page-nav="next"]').count(), 1);
    assert.match(await page.locator('.nf-canvas-header [data-page-counter]').innerText(), /Page \d+ of \d+/);
    assert.equal(await page.locator('.nf-canvas-header [data-page-export="true"]').count(), 1);
    assert.equal(await css('.nf-page-stage', 'padding-top'), '14px');
    assert.equal(await css('.nf-page-stage', 'padding-left'), '0px');
    assert.equal(await css('.nf-page-stage', 'padding-right'), '0px');
    assert.equal(await css('.nf-page-stage', 'padding-bottom'), '8px');
    const pageHeader = await box('.nf-canvas-header');
    assert.equal(pageHeader.height, 34);
    await page.screenshot({ path: join(screenshotDir, 'page-header.png') });
    await page.keyboard.press('Meta+2');
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view', {
      state: 'detached',
    });
    await page.screenshot({ path: join(screenshotDir, 'continuous-header.png') });
  });

  it('shrinks tabs to a 96 px floor, keeps + after the last tab, and uses the accent ring', async () => {
    await launch('batch-a-tabs');
    await ui.seedDemo();
    await page.waitForSelector('.nf-tablist');

    // + is the first action in the tab actions and sits right after the last tab.
    const actions = page.locator('.nf-tab-actions');
    assert.equal(await page.locator('.nf-tab-strip .nf-tab-actions').count(), 1);
    assert.equal(
      await page.locator('.nf-tab-strip').evaluate(
        (element) => {
          const list = element.querySelector('.nf-tablist');
          const actionsElement = element.querySelector('.nf-tab-actions');
          return (
            list !== null &&
            actionsElement !== null &&
            (list.compareDocumentPosition(actionsElement) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
          );
        },
      ),
      true,
      'the tab actions follow the tablist in document order',
    );
    assert.equal(await actions.locator('[data-toolbar-new="true"]').count(), 1);
    const lastTab = await box('.nf-tab:last-of-type');
    const plus = await box('.nf-tab-actions [data-toolbar-new="true"]');
    const overflow = await box('.nf-tab-actions [aria-label="All open tabs"]');
    assert.ok(plus.left >= lastTab.right - 0.5, 'the + follows the last tab');
    assert.ok(plus.left - lastTab.right <= 8, 'the + is immediately after the last tab');
    assert.ok(overflow.left > plus.right, 'the overflow chevron follows +');

    // Add tabs with the toolbar +.
    for (let index = 0; index < 4; index += 1) {
      const before = await page.evaluate(() => window.__noteforestTest.state().tabs.length);
      await page.locator('[data-toolbar-new="true"]').click();
      await page.waitForFunction(
        (count) => window.__noteforestTest.state().tabs.length === count + 1,
        before,
        { timeout: 10000 },
      );
      await h.waitSaved();
    }
    assert.equal(await page.locator('.nf-tab').count(), 5);
    const wideTab = (await box('.nf-tab:first-of-type')).width;
    assert.ok(wideTab <= 190.5, `tabs cap at 190 px (${wideTab})`);

    // Narrowing shrinks them toward the 96 px floor; the tablist never scrolls.
    await h.setWindowSize(960, 768);
    await page.waitForFunction(() => window.innerWidth <= 980, undefined, { timeout: 5000 });
    await page.waitForFunction(
      () => {
        const tabs = [...document.querySelectorAll('.nf-tab')];
        return tabs.length === 5 && tabs.every((tab) => tab.getBoundingClientRect().width < 190);
      },
      undefined,
      { timeout: 10000 },
    );
    const tabInfo = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('.nf-tab')];
      const list = document.querySelector('.nf-tablist');
      const plusButton = document.querySelector('.nf-tab-actions [data-toolbar-new="true"]');
      return {
        widths: tabs.map((tab) => tab.getBoundingClientRect().width),
        overflowX: list === null ? null : getComputedStyle(list).overflowX,
        plusVisible: plusButton !== null && plusButton.getClientRects().length > 0,
        pageScroll: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      };
    });
    assert.ok(
      tabInfo.widths.every((width) => width >= 95.5),
      `tabs never shrink below 96 px (${tabInfo.widths.join(', ')})`,
    );
    assert.ok(
      tabInfo.widths.every((width) => width < 190),
      `tabs actually shrink (${tabInfo.widths.join(', ')})`,
    );
    assert.equal(tabInfo.overflowX, 'hidden', 'the tablist does not scroll horizontally');
    assert.equal(tabInfo.plusVisible, true, 'the + stays visible');
    assert.ok(tabInfo.pageScroll <= tabInfo.innerWidth, 'the shell never scrolls horizontally');

    // Overflow still lists every open tab and activates one.
    await page.locator('.nf-tab-actions [aria-label="All open tabs"]').click();
    await page.waitForSelector('.nf-menu');
    const titles = await page.evaluate(() =>
      window.__noteforestTest.state().tabs.map((tab) => tab.title),
    );
    const menuText = await page.locator('.nf-menu').innerText();
    for (const title of new Set(titles)) {
      assert.ok(menuText.includes(title), `overflow lists ${title}`);
    }
    await page.keyboard.press('Escape');
    await page.waitForSelector('.nf-menu', { state: 'detached' });

    // Active Library and Topics rows use a 1 px accent ring, not a left stripe.
    await h.setWindowSize(1440, 900);
    await page.waitForFunction(() => window.innerWidth > 1300, undefined, { timeout: 5000 });
    const libraryShadow = await css('.nf-library-open[data-active="true"]', 'box-shadow');
    assert.match(libraryShadow, /0px 0px 0px 1px inset/);
    assert.doesNotMatch(libraryShadow, /2px 0px 0px 0px inset/);
    const firstCard = h.activeEditor().locator('[data-block-card]').first();
    await firstCard.click();
    await page.waitForSelector('.nf-tree-item[data-selected] .nf-tree-row');
    const topicShadow = await css('.nf-tree-item[data-selected] .nf-tree-row', 'box-shadow');
    assert.match(topicShadow, /0px 0px 0px 1px inset/);
    assert.doesNotMatch(topicShadow, /2px 0px 0px 0px inset/);

    // The Settings nav uses the same ring.
    await page.keyboard.press('Meta+,');
    await page.waitForSelector('[data-settings-dialog="true"]');
    const navShadow = await css('[data-settings-nav="page"]', 'box-shadow');
    assert.match(navShadow, /0px 0px 0px 1px inset/);
    await closeSettings();
  });

  it('shows the instant-save Settings shell with only real pages and a read-only document', async () => {
    const env = ui.isolated('batch-a-settings');
    await launch('batch-a-settings', env);
    await openSettings();

    assert.equal(
      await page.locator('.nf-settings').evaluate(
        (element) => element.closest('[role="dialog"]') !== null,
      ),
      true,
      'the Settings surface is a labelled modal dialog',
    );
    const navLabels = await page.locator('.nf-settings-nav-item').allInnerTexts();
    assert.deepEqual(navLabels, [
      'General',
      'Page',
      'Continuous',
      'Editor',
      'Export',
      'Data & About',
    ]);
    // Arrow navigation is a real page switch and moves focus with it.
    await page.locator('[data-settings-nav="page"]').focus();
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(
      () => document.activeElement?.id === 'nf-settings-nav-continuous',
      undefined,
      { timeout: 5000 },
    );
    assert.equal(
      await page.locator('[data-settings-nav="continuous"]').getAttribute('aria-current'),
      'page',
    );
    await page.locator('[data-settings-nav="page"]').click();
    assert.doesNotMatch(await page.locator('.nf-settings').innerText(), /Appearance|coming soon/i);
    assert.equal(await page.locator('[data-page-density-apply]').count(), 0);
    assert.equal(await page.locator('[data-page-density-cancel]').count(), 0);
    assert.equal(await page.locator('[data-settings-dirty]').count(), 0);
    assert.equal(await page.locator('[data-settings-dirty-dot]').count(), 0);
    assert.equal(
      await page.locator('[data-page-density-scope-option="document"]').isDisabled(),
      true,
    );
    assert.equal(
      await page.locator('[data-page-density-document-reason]').isVisible(),
      true,
      'no-document document scope explains why',
    );
    assert.equal(await page.locator('[data-page-density-slider]').isEnabled(), true);
    // Continuous is per-document view state, so it is disabled with a reason
    // when no document is open.
    await page.locator('[data-settings-nav="continuous"]').click();
    assert.equal(await page.locator('[data-continuous-no-document]').isVisible(), true);
    assert.equal(await page.locator('[data-continuous-zoom-slider]').isDisabled(), true);
    await page.locator('[data-settings-nav="page"]').click();
    await page.screenshot({ path: join(screenshotDir, 'settings-no-document.png') });

    // Export page: a real action, no fake default controls.
    await page.locator('[data-settings-nav="export"]').click();
    assert.equal(await page.locator('[data-settings-export-now]').isEnabled(), true);
    assert.equal(await page.locator('[data-settings-defaults]').count(), 0);
    assert.match(await page.locator('.nf-settings-pane').innerText(), /do not exist yet/);

    // Editor page: a real shortcut list, no fake toggles.
    await page.locator('[data-settings-nav="editor"]').click();
    assert.ok((await page.locator('.nf-shortcut-row').count()) >= 10);
    assert.doesNotMatch(await page.locator('.nf-settings-pane').innerText(), /single-key/i);

    // Data & About has real paths/status/version and a reveal action.
    await page.locator('[data-settings-nav="data"]').click();
    assert.ok((await page.locator('[data-settings-library-path]').innerText()).includes(env.NOTEFOREST_LIBRARY));
    assert.ok((await page.locator('[data-settings-app-data-path]').innerText()).includes(env.NOTEFOREST_APP_SUPPORT));
    assert.match(
      await page.locator('[data-settings-file-status]').innerText(),
      /^(OK|Defaults)/,
    );
    assert.equal(await page.locator('[data-settings-schema-version]').innerText(), '2');
    assert.ok((await page.locator('[data-settings-version]').innerText()).length > 0);
    assert.equal(await page.locator('[data-settings-reveal-library]').count(), 1);
    assert.equal(await page.locator('[data-settings-reveal-app-data]').count(), 1);
    await page.screenshot({ path: join(screenshotDir, 'settings-data.png') });
    await closeSettings();
    await h.quit();

    // Read-only: personal Page overrides are allowed; content is never mutated.
    const readOnlyEnv = ui.isolated('batch-a-readonly');
    const packagePath = await writePagePackage(
      readOnlyEnv.NOTEFOREST_LIBRARY,
      'readonly-settings',
      pageDocument({
        id: 'batch-a-readonly',
        title: 'Read-only settings',
        chapterTitle: 'Read only',
        blocks: [textBlock('intro', 'Intro', 'Read-only content for personal settings.')],
      }),
    );
    const lockDir = join(readOnlyEnv.NOTEFOREST_APP_SUPPORT, 'locks');
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
        sessionId: 'batch-a-test',
        token: 'batch-a-test-token',
        acquiredAt: now,
        heartbeatAt: now,
      }),
      'utf8',
    );
    await launch('batch-a-readonly', readOnlyEnv);
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
      await page.locator('[data-page-density-scope-option="document"]').isDisabled(),
      false,
      'a read-only document may carry a personal page override',
    );
    await page.locator('[data-page-density-scope-option="document"]').click();
    await page.locator('[data-page-density-slider]').focus();
    await page.locator('[data-page-density-slider]').press('ArrowLeft');
    await page.waitForFunction(
      (path) => {
        const state = window.__noteforestTest.settings();
        return (
          Math.round((state.pageOverrides[path]?.theme?.density ?? 0) * 100) === 95 &&
          state.saveState.status === 'saved'
        );
      },
      packagePath,
      { timeout: 15000 },
    );
    await closeSettings();
    const durable = JSON.parse(
      await readFile(join(readOnlyEnv.NOTEFOREST_APP_SUPPORT, 'document-settings.json'), 'utf8'),
    );
    assert.equal(durable.entries.length, 1);
    assert.equal(durable.entries[0].page.theme.density, 0.95);
    const afterHash = createHash('sha256')
      .update(await readFile(join(packagePath, 'document.json')))
      .digest('hex');
    assert.equal(afterHash, documentHash, 'the read-only document content was not modified');
  });

  it('commits an open Page Edit before a Page density write', async () => {
    const env = ui.isolated('batch-a-page-edit-settings');
    const packagePath = await writePagePackage(
      env.NOTEFOREST_LIBRARY,
      'page-edit-settings',
      pageDocument({
        id: 'batch-a-page-edit-settings',
        title: 'Page edit settings',
        chapterTitle: 'Chapter',
        blocks: [textBlock('intro', 'Intro', 'Original page text.')],
      }),
    );
    await launch('batch-a-page-edit-settings', env);
    const opened = await page.evaluate(
      (path) => window.__noteforestTest.openPath(path),
      packagePath,
    );
    assert.equal(opened, true);
    await page.waitForFunction(
      (path) => window.__noteforestTest.state().activeTab === path,
      packagePath,
      { timeout: 10000 },
    );
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');

    await page.keyboard.press('Meta+3');
    await page.waitForFunction(
      () => document.querySelector('.nf-editor[data-active="true"] .nf-page-view')?.getAttribute('data-ready') === 'true',
      undefined,
      { timeout: 30000 },
    );
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      () => document.querySelector('.nf-editor[data-active="true"] .nf-page-view')?.getAttribute('data-interaction-mode') === 'edit',
      undefined,
      { timeout: 5000 },
    );
    const fragment = page.locator('.nf-editor[data-active="true"] .nf-page-fragment').first();
    await fragment.dblclick();
    const overlay = page.locator('[data-page-edit-overlay]');
    await overlay.waitFor({ timeout: 5000 });
    await page.waitForFunction(
      () => document.activeElement?.closest('[data-page-edit-overlay]') !== null,
      undefined,
      { timeout: 5000 },
    );
    await page.keyboard.type(' EDITED');

    // The density write must commit the overlay first.
    await openSettings();
    const slider = page.locator('[data-page-density-slider]');
    await slider.focus();
    await slider.press('ArrowLeft');
    await page.waitForFunction(
      () =>
        Math.round(window.__noteforestTest.settings().app.page.theme.density * 100) === 95 &&
        window.__noteforestTest.settings().saveState.status === 'saved',
      undefined,
      { timeout: 15000 },
    );
    await page.waitForSelector('[data-page-edit-overlay]', { state: 'detached', timeout: 10000 });
    await closeSettings();
    const structure = await page.evaluate(() => window.__noteforestTest.structure());
    assert.match(JSON.stringify(structure.blocks.intro.content), /EDITED/);
  });

  it('navigates the palette by keyboard, groups/search/empty state, and read-mode reasons', async () => {
    await launch('batch-a-palette');
    await ui.seedDemo();

    await openPaletteFromButton();
    const groups = await page.locator('[data-palette-group]').evaluateAll((elements) => [
      ...new Set(elements.map((element) => element.getAttribute('data-palette-group'))),
    ]);
    assert.deepEqual(groups, ['Commands', 'Documents', 'Blocks']);
    // Documents show chapter counts; blocks show their chapter.
    const docRow = page.locator('[data-palette-group="Documents"]').first();
    assert.match(await docRow.innerText(), /chapters?/);
    const blockRow = page.locator('[data-palette-group="Blocks"]').first();
    assert.ok((await blockRow.locator('.nf-palette-hint').innerText()).trim().length > 0);

    // Search matches labels/titles only, never block content.
    const paletteLabels = (await page.locator('.nf-palette-label').allInnerTexts()).map((label) =>
      label.toLowerCase(),
    );
    const contentWord = await page.evaluate((labels) => {
      const structure = window.__noteforestTest.structure();
      const words = new Set();
      const walk = (node) => {
        if (node.type === 'text' && typeof node.text === 'string') {
          for (const word of node.text.match(/[A-Za-z]{9,}/g) ?? []) words.add(word.toLowerCase());
        }
        for (const child of node.children ?? []) walk(child);
      };
      for (const block of Object.values(structure.blocks)) walk(block.content);
      return (
        [...words].find((word) => !labels.some((label) => label.includes(word))) ?? null
      );
    }, paletteLabels);
    if (contentWord !== null) {
      await page.locator('.nf-palette-input').fill(contentWord);
      await page.waitForSelector('[data-palette-empty="true"]');
      assert.match(await page.locator('[data-palette-empty]').innerText(), /No commands or documents match/);
    }
    await page.locator('.nf-palette-input').fill('zzzzz');
    await page.waitForSelector('[data-palette-empty="true"]');
    // The dead "Command palette" entry is gone: no row and the empty state.
    await page.locator('.nf-palette-input').fill('Command palette');
    await page.waitForSelector('[data-palette-empty="true"]');
    await page.screenshot({ path: join(screenshotDir, 'palette-empty.png') });

    // Arrow + Enter opens the selected command; Esc restores focus.
    await page.locator('.nf-palette-input').fill('Settings');
    await page.waitForFunction(
      () => document.querySelectorAll('.nf-palette-item').length === 1,
      undefined,
      { timeout: 5000 },
    );
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-settings-dialog="true"]');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });

    // Palette focus restore and ⌘K toggle are independent of the Settings call.
    await page.locator('.nf-palette-button').focus();
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('.nf-palette');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.nf-palette', { state: 'detached' });
    await page.waitForFunction(
      () => document.activeElement?.classList.contains('nf-palette-button') === true,
      undefined,
      { timeout: 5000 },
    );
    // Click opens; ⌘K closes. (A rapid second Meta+K would be the intentional
    // 120 ms same-command dedupe, so the click path separates the two commands.)
    await page.locator('.nf-palette-button').click();
    await page.waitForSelector('.nf-palette');
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('.nf-palette', { state: 'detached' });

    // Read mode leaves mutating commands visible with a reason, skipped by Enter.
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      () => document.querySelector('.nf-editor[data-active="true"]')?.getAttribute('data-interaction-mode') === 'read',
      undefined,
      { timeout: 10000 },
    );
    await page.locator('.nf-palette-button').click();
    await page.waitForSelector('.nf-palette');
    await page.locator('.nf-palette-input').fill('New chapter');
    const chapterRow = paletteItem('New chapter');
    await chapterRow.waitFor({ state: 'visible' });
    assert.equal(await chapterRow.getAttribute('aria-disabled'), 'true');
    assert.match(await chapterRow.innerText(), /Read mode/);
    const chaptersBefore = await page.evaluate(() => window.__noteforestTest.structure().chapters.length);
    await page.keyboard.press('Enter');
    await page.waitForSelector('.nf-palette');
    assert.equal(
      await page.evaluate(() => window.__noteforestTest.structure().chapters.length),
      chaptersBefore,
      'Enter on a disabled row changes nothing',
    );
    await page.screenshot({ path: join(screenshotDir, 'palette-read-mode.png') });
    await page.locator('.nf-palette-input').focus();
    await page.keyboard.press('Escape');
    await page.waitForSelector('.nf-palette', { state: 'detached' });
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      () => document.querySelector('.nf-editor[data-active="true"]')?.getAttribute('data-interaction-mode') === 'edit',
      undefined,
      { timeout: 10000 },
    );
  });
});
