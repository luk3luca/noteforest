import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import {
  emptyDocument,
  multiPageBlocksDocument,
  pageDocument,
  textBlock,
  writePagePackage,
} from '../support/page-fixtures.mjs';

/**
 * Settings & shell layout batch.
 *
 * A: the Settings modal is 1180 wide and 820 tall, capped by the viewport so
 *    the footer stays reachable below the fixed 108 px overlay offset.
 * B: Page, Continuous, and Appearance share one right rail whose width is
 *    viewport-driven; switching pages never resizes the modal.
 * C: the Page preview stacks page 1 and page 2 from the same page model and
 *    both sheets fit the rail without scrolling.
 * D: Continuous is an App page; Page is the only Document page.
 * E: the sidebar collapse/expand and Settings icons keep their exact centre
 *    and 15 px size across the collapsed/expanded states.
 */

const tempRoot = artifactsPath('settings-shell-temp');
const screenshotDir = artifactsPath('settings-shell');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

async function launch(name, width = 1440, height = 900) {
  page = await ui.launch({ ...ui.isolated(name), NOTEFOREST_E2E_HIDDEN: '1' });
  await h.setWindowSize(width, height);
}

async function openSettings(pageId = 'general') {
  await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
  // Open from the sidebar button: a repeated native ⌘, accelerator is not
  // reliable while a contenteditable block owns focus, and this suite opens
  // Settings after opening new documents.
  await page.locator('.nf-sidebar-settings').click();
  await page.waitForSelector('[data-settings-dialog="true"]', { timeout: 10000 });
  if (pageId !== 'general') {
    await page.locator(`[data-settings-nav="${pageId}"]`).click();
  }
  await page.locator('.nf-settings-page-title').first().waitFor();
}

async function closeSettings() {
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
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

async function showPage(pageId) {
  await page.locator(`[data-settings-nav="${pageId}"]`).click();
  await page.locator('.nf-settings-page-title').first().waitFor();
}

async function waitPagePreviewReady() {
  await page.waitForFunction(
    () => {
      const preview = document.querySelector('[data-page-preview="true"]');
      return (
        preview !== null &&
        preview.getAttribute('data-page-preview-state') === 'ready' &&
        preview.getAttribute('data-page-preview-updating') === 'false'
      );
    },
    undefined,
    { timeout: 30000 },
  );
}

async function waitSaved() {
  await page.waitForFunction(
    () =>
      document.querySelector('[data-settings-status]')?.getAttribute('data-settings-status') ===
      'saved',
    undefined,
    { timeout: 15000 },
  );
}

async function setSlider(attribute, value) {
  const slider = page.locator(`[data-continuous-slider="${attribute}"]`);
  await slider.evaluate((element, next) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    setter?.call(element, String(next));
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

async function rect(selector) {
  const locator = page.locator(selector).first();
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      width: box.width,
      height: box.height,
    };
  });
}

async function settingsGeometry() {
  return page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (element === null) return null;
      const box = element.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      };
    };
    const rails = document.querySelectorAll(
      '[data-page-preview="true"], [data-continuous-preview="true"], [data-appearance-preview="true"]',
    );
    const rail =
      [...rails].find(
        (element) =>
          element.getClientRects().length > 0 && getComputedStyle(element).display !== 'none',
      ) ?? null;
    return {
      innerHeight: window.innerHeight,
      modal: rect('[data-settings-dialog="true"]'),
      dialog: rect('.nf-settings'),
      head: rect('.nf-settings-head'),
      body: rect('.nf-settings-body'),
      nav: rect('.nf-settings-nav'),
      pane: rect('.nf-settings-pane'),
      foot: rect('.nf-settings-foot'),
      rail: rail === null ? null : rect('.nf-settings-preview'),
      railVisible: rail !== null,
      paneOverflow: getComputedStyle(document.querySelector('.nf-settings-pane')).overflowY,
      footReachable: (() => {
        const element = document.querySelector('.nf-settings-foot');
        if (element === null) return false;
        const box = element.getBoundingClientRect();
        return box.top >= 0 && box.bottom <= window.innerHeight + 0.5;
      })(),
    };
  });
}

async function pageSheets() {
  return page.evaluate(() => {
    const rail = document.querySelector('[data-page-preview="true"]');
    const stack = document.querySelector('[data-page-preview="true"] .nf-settings-preview-pages');
    if (rail === null || stack === null) return null;
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    return {
      rail: box(rail),
      stack: box(stack),
      railScroll: {
        scrollHeight: rail.scrollHeight,
        clientHeight: rail.clientHeight,
        scrollTop: rail.scrollTop,
      },
      labels: [...rail.querySelectorAll('[data-page-preview-label="true"]')].map(
        (element) => element.textContent?.trim() ?? '',
      ),
      sheets: [...rail.querySelectorAll('[data-page-preview-sheet="true"]')].map((element) => ({
        index: Number(element.getAttribute('data-page-preview-sheet-index')),
        box: box(element),
      })),
      state: rail.getAttribute('data-page-preview-state'),
      pageCount: Number(rail.getAttribute('data-page-preview-page-count')),
    };
  });
}

function assertBoxWithin(inner, outer, label) {
  assert.ok(
    inner.left >= outer.left - 0.5 &&
      inner.right <= outer.right + 0.5 &&
      inner.top >= outer.top - 0.5 &&
      inner.bottom <= outer.bottom + 0.5,
    `${label} is fully inside its container (${JSON.stringify(inner)} vs ${JSON.stringify(outer)})`,
  );
}

async function iconCenter(selector) {
  return page.locator(selector).first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height,
    };
  });
}

describe('Settings & shell layout batch', () => {
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

  it('keeps one 1180 px modal with a shared preview rail and moves Continuous to App', async () => {
    await launch('shell-geometry');
    await ui.seedDemo();
    await openSettings();

    // D: Continuous is an App page; Page is the only Document page.
    const navGroups = await page.evaluate(() =>
      [...document.querySelectorAll('.nf-settings-nav-group')].map((group) => ({
        label: group.querySelector('.nf-settings-nav-label')?.textContent?.trim() ?? '',
        items: [...group.querySelectorAll('.nf-settings-nav-item')].map(
          (item) => item.textContent?.trim() ?? '',
        ),
      })),
    );
    assert.deepEqual(navGroups, [
      { label: 'App', items: ['General', 'Appearance', 'Continuous'] },
      { label: 'Document', items: ['Page'] },
      { label: 'Workflow', items: ['Editor', 'Export'] },
      { label: 'Data', items: ['Data & About'] },
    ]);

    const measurements = [];
    for (const pageId of [
      'general',
      'page',
      'continuous',
      'appearance',
      'editor',
      'page',
    ]) {
      await showPage(pageId);
      if (pageId === 'page') await waitPagePreviewReady();
      measurements.push({ pageId, ...(await settingsGeometry()) });
    }

    const previewPages = new Set(['page', 'continuous', 'appearance']);
    for (const entry of measurements) {
      // A: one fixed surface, capped so the footer is always reachable.
      const expectedHeight = Math.min(820, entry.innerHeight - 132);
      assert.equal(Math.round(entry.modal.width), 1180, `${entry.pageId}: 1180 px width`);
      assert.ok(
        Math.abs(entry.modal.height - expectedHeight) <= 0.5,
        `${entry.pageId}: height is min(820, 100vh - 132) (${entry.modal.height} vs ${expectedHeight})`,
      );
      assert.equal(Math.round(entry.modal.top), 108, `${entry.pageId}: the overlay stays top-anchored`);
      assert.equal(entry.footReachable, true, `${entry.pageId}: the footer is reachable`);
      assert.equal(entry.dialog.height, entry.modal.height - 2, `${entry.pageId}: one height literal`);
      assert.equal(Math.round(entry.pane.width), 536, `${entry.pageId}: one content column`);
      assert.equal(entry.paneOverflow, 'auto', `${entry.pageId}: only the page body scrolls`);
      // The header and footer stay fixed; only the body height changes.
      assert.equal(Math.round(entry.head.height), 44, `${entry.pageId}: a fixed 44 px header`);
      assert.equal(Math.round(entry.foot.height), 48, `${entry.pageId}: a fixed 48 px footer`);

      // B: one rail exactly on the three preview pages, same width everywhere.
      assert.equal(
        entry.railVisible,
        previewPages.has(entry.pageId),
        `${entry.pageId}: the shared rail exists exactly on preview pages`,
      );
      if (entry.railVisible) {
        const expectedRail = Math.min(400, Math.max(320, entry.body.width * 0.34));
        assert.ok(
          Math.abs(entry.rail.width - expectedRail) <= 0.5,
          `${entry.pageId}: rail width is clamp(320, 34%, 400) (${entry.rail.width} vs ${expectedRail})`,
        );
        assert.ok(
          Math.abs(entry.rail.right - entry.body.right) <= 1,
          `${entry.pageId}: the rail ends at the body edge`,
        );
        assert.ok(
          Math.abs(entry.rail.height - entry.body.height) <= 0.5,
          `${entry.pageId}: the rail follows the body height`,
        );
      }

      // Switching pages never changes the modal geometry.
      assert.equal(
        Math.round(entry.modal.width),
        Math.round(measurements[0].modal.width),
        `${entry.pageId}: the modal width never depends on the page`,
      );
      assert.ok(
        Math.abs(entry.modal.height - measurements[0].modal.height) <= 0.5,
        `${entry.pageId}: the modal height never depends on the page`,
      );
    }

    // Non-preview pages center the content column (no phantom third column).
    const general = measurements.find((entry) => entry.pageId === 'general');
    assert.ok(general !== undefined);
    assert.ok(
      Math.abs(
        general.pane.left - general.nav.right - (general.body.right - general.pane.right),
      ) <= 1,
      'General content is centered',
    );

    await showPage('appearance');
    await page.screenshot({
      path: join(screenshotDir, 'appearance-1440x900-dark.png'),
      scale: 'css',
    });
    await showPage('page');
    await page.screenshot({ path: join(screenshotDir, 'page-1440x900-dark.png'), scale: 'css' });

    // The narrow viewport keeps the rail rule: all three preview pages hide it
    // together and the modal width stays viewport-driven.
    await page.setViewportSize({ width: 900, height: 800 });
    await page.waitForFunction(() => window.innerWidth <= 920, undefined, { timeout: 5000 });
    const narrow = [];
    for (const pageId of ['page', 'continuous', 'appearance']) {
      await showPage(pageId);
      narrow.push({ pageId, ...(await settingsGeometry()) });
    }
    for (const entry of narrow) {
      assert.equal(entry.railVisible, false, `${entry.pageId}: the rail hides at <=920 px`);
      assert.equal(entry.footReachable, true, `${entry.pageId}: the narrow footer is reachable`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForFunction(() => window.innerWidth > 920, undefined, { timeout: 5000 });

    // E: the same icon centre and 15 px size in both sidebar states.
    await closeSettings();
    const expandedCollapse = await iconCenter('[aria-label="Collapse sidebar"] svg');
    const expandedSettings = await iconCenter('.nf-sidebar-settings svg');
    await page.screenshot({
      path: join(screenshotDir, 'sidebar-expanded-settings-icons.png'),
      scale: 'css',
    });
    await page.locator('[aria-label="Collapse sidebar"]').click();
    await page.waitForSelector('[data-sidebar-expand="true"]');
    const railCollapse = await iconCenter('[data-sidebar-expand="true"] svg');
    const railSettings = await iconCenter('[data-rail-settings="true"] svg');
    await page.screenshot({
      path: join(screenshotDir, 'sidebar-collapsed-settings-icons.png'),
      scale: 'css',
    });
    for (const [name, expandedIcon, railIcon] of [
      ['collapse/expand', expandedCollapse, railCollapse],
      ['Settings', expandedSettings, railSettings],
    ]) {
      assert.ok(
        Math.abs(expandedIcon.x - railIcon.x) <= 0.5,
        `${name}: the icon centre x is stable (${expandedIcon.x} vs ${railIcon.x})`,
      );
      assert.ok(
        Math.abs(expandedIcon.y - railIcon.y) <= 0.5,
        `${name}: the icon centre y is stable (${expandedIcon.y} vs ${railIcon.y})`,
      );
      for (const icon of [expandedIcon, railIcon]) {
        assert.equal(icon.width, 15, `${name}: the icon stays 15 px wide`);
        assert.equal(icon.height, 15, `${name}: the icon stays 15 px tall`);
      }
    }
    // 28 x 28 collapse and 30 x 30 gear boxes in both states.
    const collapseBox = await rect('[data-sidebar-expand="true"]');
    const gearBox = await rect('[data-rail-settings="true"]');
    assert.equal(collapseBox.width, 28);
    assert.equal(collapseBox.height, 28);
    assert.equal(gearBox.width, 30);
    assert.equal(gearBox.height, 30);
  });

  it('stacks page 1 and page 2 from the same page model inside the rail', async () => {
    const env = ui.isolated('shell-pages');
    await launch('shell-pages', 1792, 1120);
    const packagePath = await openPackage(
      env,
      'two-page-preview',
      multiPageBlocksDocument(24),
    );
    await openSettings('page');
    await waitPagePreviewReady();

    const two = await pageSheets();
    assert.ok(two !== null);
    assert.equal(two.state, 'ready');
    assert.ok(two.pageCount >= 2, `the fixture has at least two pages (${two.pageCount})`);
    assert.deepEqual(two.labels, ['1', '2'], 'small 1 and 2 labels above the sheets');
    assert.equal(two.sheets.length, 2, 'page 1 and page 2 are rendered');
    assert.deepEqual(
      two.sheets.map((sheet) => sheet.index),
      [1, 2],
      'the sheet index follows the page number',
    );
    assert.ok(two.sheets[0].box.top < two.sheets[1].box.top, 'page 1 is above page 2');
    assert.ok(
      two.sheets[0].box.bottom <= two.sheets[1].box.top + 0.5,
      'the two sheets never overlap',
    );
    for (const sheet of two.sheets) {
      assertBoxWithin(sheet.box, two.stack, `page ${sheet.index}`);
      assertBoxWithin(sheet.box, two.rail, `page ${sheet.index} in the rail`);
      const ratio = sheet.box.width / sheet.box.height;
      assert.ok(
        Math.abs(ratio - 297 / 210) <= 0.01,
        `page ${sheet.index} keeps the A4 landscape ratio (${ratio})`,
      );
      // Each sheet renders its own projection, not a copy of page 1: its own
      // fragments and its own chrome (page number included).
      assert.ok(
        (await page
          .locator(
            `[data-page-preview-sheet-index="${sheet.index}"] [data-fragment-page="${sheet.index}"]`,
          )
          .count()) > 0,
        `page ${sheet.index} renders its own fragments`,
      );
      assert.equal(
        (
          await page
            .locator(`[data-page-preview-sheet-index="${sheet.index}"] [data-page-indicator]`)
            .innerText()
        ).trim(),
        `Page ${sheet.index} of ${two.pageCount}`,
        `page ${sheet.index} keeps its own chrome`,
      );
    }
    assert.ok(
      two.railScroll.scrollHeight <= two.railScroll.clientHeight + 0.5,
      `both sheets are visible without scrolling (${two.railScroll.scrollHeight} vs ${two.railScroll.clientHeight})`,
    );
    assert.equal(two.railScroll.scrollTop, 0, 'the rail is not scrolled');
    await page.screenshot({
      path: join(screenshotDir, 'page-two-pages-1792x1120-dark.png'),
      scale: 'css',
    });

    // The summary still states the real page count, and the sheet count is the
    // visible one (two), not the document total.
    assert.match(
      await page.locator('[data-page-preview-summary="true"]').innerText(),
      new RegExp(`\\b${two.pageCount} pages?\\b`),
    );
    assert.equal(
      Number(
        await page
          .locator('[data-page-preview="true"]')
          .getAttribute('data-page-preview-sheet-count'),
      ),
      2,
    );

    // A 900 px-tall window is the binding height: both sheets still fit.
    await h.setWindowSize(1440, 900);
    const atNineHundred = await pageSheets();
    assert.ok(atNineHundred !== null);
    assert.equal(atNineHundred.sheets.length, 2);
    for (const sheet of atNineHundred.sheets) {
      assertBoxWithin(sheet.box, atNineHundred.stack, `900 px page ${sheet.index}`);
    }
    assert.ok(
      atNineHundred.railScroll.scrollHeight <= atNineHundred.railScroll.clientHeight + 0.5,
      'both sheets fit a 900 px window without scrolling',
    );
    assert.ok(
      atNineHundred.sheets[0].box.height < two.sheets[0].box.height,
      'a shorter window scales the sheets down uniformly',
    );
    await page.screenshot({ path: join(screenshotDir, 'page-two-pages-1440x900-dark.png'), scale: 'css' });

    // Light theme keeps the same stacked Page preview.
    await h.setWindowSize(1792, 1120);
    await showPage('appearance');
    await page.locator('[data-appearance-theme-option="light"]').click();
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-theme') === 'light',
      undefined,
      { timeout: 10000 },
    );
    await showPage('page');
    await waitPagePreviewReady();
    await page.screenshot({
      path: join(screenshotDir, 'page-two-pages-1792x1120-light.png'),
      scale: 'css',
    });

    // A one-page document shows one sheet and no empty second page.
    await closeSettings();
    const onePage = pageDocument({
      id: 'one-page-preview',
      title: 'One page',
      chapterTitle: 'Single page',
      blocks: [textBlock('only', 'Only block', 'A single short block.')],
    });
    await openPackage(env, 'one-page-preview', onePage);
    await openSettings('page');
    await waitPagePreviewReady();
    const single = await pageSheets();
    assert.ok(single !== null);
    assert.equal(single.pageCount, 1);
    assert.equal(single.sheets.length, 1, 'one page renders one sheet');
    assert.deepEqual(single.labels, ['1']);

    // The empty-document state stays one unlabelled sheet.
    await closeSettings();
    await openPackage(env, 'empty-page-preview', emptyDocument());
    // A brand-new empty chapter starts with one editable block; delete it to
    // reach the real "nothing to paginate" state.
    const emptyStructure = await ui.structure();
    const onlyBlock = Object.keys(emptyStructure.blocks)[0];
    assert.equal(typeof onlyBlock, 'string');
    await ui.applyCommand({
      type: 'block.delete',
      blockId: onlyBlock,
      children: 'promote',
      allowEmptyChapter: true,
    });
    await page.waitForFunction(
      () => {
        const state = window.__noteforestTest.state();
        const runtime = state.runtimes.find((item) => item.packagePath === state.activeTab);
        return runtime?.blocks === 0;
      },
      undefined,
      { timeout: 10000 },
    );
    await openSettings('page');
    await page.waitForFunction(
      () =>
        document.querySelector('[data-page-preview="true"]')?.getAttribute('data-page-preview-state') ===
        'empty',
      undefined,
      { timeout: 30000 },
    );
    const empty = await pageSheets();
    assert.ok(empty !== null);
    assert.equal(empty.sheets.length, 1, 'the empty state stays one sheet');
    assert.deepEqual(empty.labels, [], 'the empty state has no page number');
    assert.equal(
      Number(
        await page
          .locator('[data-page-preview="true"]')
          .getAttribute('data-page-preview-page-count'),
      ),
      0,
    );
    await page.screenshot({ path: join(screenshotDir, 'page-empty-1440x900-light.png'), scale: 'css' });
    await closeSettings();
    assert.equal(packagePath.length > 0, true);
  });

  it('fits the Continuous sample and the one-column Appearance sample in the rail', async () => {
    await launch('shell-previews', 1792, 1120);
    await openSettings('continuous');
    await page.waitForSelector('[data-continuous-preview="true"]');

    const defaultStage = await page.evaluate(() => {
      const stage = document.querySelector('[data-continuous-preview-stage="true"]');
      const frame = document.querySelector('[data-continuous-preview-frame="true"]');
      const fit = document.querySelector('.nf-continuous-preview-fit');
      const rail = document.querySelector('[data-continuous-preview="true"]');
      if (stage === null || frame === null || fit === null || rail === null) return null;
      const box = (element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      };
      return {
        stage: box(stage),
        frame: box(frame),
        fit: box(fit),
        rail: box(rail),
        scale: rail.getAttribute('data-continuous-preview-scale'),
      };
    });
    assert.ok(defaultStage !== null);
    // The sample stage is 355 px at the defaults and fits the 367 px rail
    // content width without scaling.
    assert.ok(
      Math.abs(defaultStage.stage.width - 355) <= 0.5,
      `the default sample stage is 355 px (${defaultStage.stage.width})`,
    );
    assert.equal(defaultStage.scale, '1.000');
    assertBoxWithin(defaultStage.frame, defaultStage.fit, 'the default sample frame');
    assertBoxWithin(defaultStage.frame, defaultStage.rail, 'the default sample in the rail');
    await page.screenshot({
      path: join(screenshotDir, 'continuous-default-1792x1120-dark.png'),
      scale: 'css',
    });

    // 1440 and 1280 windows keep the default sample and the rail intact.
    await h.setWindowSize(1440, 900);
    assert.equal(
      (await page.locator('[data-continuous-preview="true"]').count()),
      1,
      'the rail stays on a 1440 px window',
    );
    assertBoxWithin(
      await rect('[data-continuous-preview-frame="true"]'),
      await rect('[data-continuous-preview="true"]'),
      'the 1440 px sample',
    );
    await page.screenshot({ path: join(screenshotDir, 'continuous-1440x900-dark.png'), scale: 'css' });
    await h.setWindowSize(1280, 800);
    assertBoxWithin(
      await rect('[data-continuous-preview-frame="true"]'),
      await rect('[data-continuous-preview="true"]'),
      'the 1280 px sample',
    );
    await page.screenshot({ path: join(screenshotDir, 'continuous-1280x800-dark.png'), scale: 'css' });
    await h.setWindowSize(1792, 1120);

    // The maximum width caps make the sample 476 px wide; the rail clips
    // nothing because the whole stage is scaled to fit as one transform.
    await page.locator('[data-continuous-advanced="true"] summary').click();
    await setSlider('canvasMax', 4800);
    await setSlider('topLevelMax', 640);
    await setSlider('childMax', 560);
    await page.waitForFunction(
      () => {
        const state = window.__noteforestTest.settings();
        return (
          state.app.continuous.widths.topLevelMax === 640 &&
          state.app.continuous.widths.childMax === 560 &&
          state.saveState.status === 'saved'
        );
      },
      undefined,
      { timeout: 15000 },
    );
    await waitSaved();
    const changed = await page.evaluate(() => {
      const stage = document.querySelector('[data-continuous-preview-stage="true"]');
      const frame = document.querySelector('[data-continuous-preview-frame="true"]');
      const rail = document.querySelector('[data-continuous-preview="true"]');
      if (stage === null || frame === null || rail === null) return null;
      const box = (element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      };
      return {
        stage: box(stage),
        frame: box(frame),
        rail: box(rail),
        scale: Number(rail.getAttribute('data-continuous-preview-scale')),
      };
    });
    assert.ok(changed !== null);
    assert.ok(changed.scale < 1, `the maximum-cap sample scales to fit (${changed.scale})`);
    assertBoxWithin(changed.stage, changed.frame, 'the scaled sample stage');
    assertBoxWithin(changed.frame, changed.rail, 'the scaled sample frame');
    assert.ok(
      Math.abs(changed.frame.width - (changed.rail.width - 32)) <= 1,
      `the scaled frame fills the rail content width (${changed.frame.width})`,
    );
    await page.screenshot({
      path: join(screenshotDir, 'continuous-changed-1792x1120-dark.png'),
      scale: 'css',
    });

    // Appearance: the same rail, one column, code sample present.
    await showPage('appearance');
    const appearance = await page.evaluate(() => {
      const preview = document.querySelector('[data-appearance-preview="true"]');
      const sample = preview?.querySelector('.nf-appearance-preview');
      const code = preview?.querySelector('[data-appearance-preview-code="true"]');
      if (preview === null || preview === undefined || sample === null || sample === undefined) {
        return null;
      }
      const rail = preview.getBoundingClientRect();
      const sampleRect = sample.getBoundingClientRect();
      return {
        rail: { width: rail.width, height: rail.height },
        sample: { width: sampleRect.width, height: sampleRect.height },
        columns: getComputedStyle(sample).gridTemplateColumns.split(' ').length,
        codeVisible: code !== null && code.getBoundingClientRect().width > 0,
      };
    });
    assert.ok(appearance !== null);
    assert.equal(appearance.columns, 1, 'the Appearance sample reads as one column');
    assert.equal(appearance.codeVisible, true, 'the code sample keeps its hook');
    assert.ok(
      appearance.sample.width <= appearance.rail.width,
      'the Appearance sample fits the rail',
    );
    await page.screenshot({
      path: join(screenshotDir, 'appearance-1792x1120-dark.png'),
      scale: 'css',
    });

    // Light: Continuous follows Appearance in the rail.
    await page.locator('[data-appearance-theme-option="light"]').click();
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-theme') === 'light',
      undefined,
      { timeout: 10000 },
    );
    await showPage('continuous');
    await page.waitForSelector('[data-continuous-preview="true"]');
    await page.screenshot({
      path: join(screenshotDir, 'continuous-light-1792x1120.png'),
      scale: 'css',
    });

    // The no-document sample keeps the rail and the sample note.
    assert.equal(
      await page.locator('[data-continuous-preview="true"]').count(),
      1,
      'Continuous works with no document open',
    );
    await page.screenshot({
      path: join(screenshotDir, 'continuous-no-document-1792x1120.png'),
      scale: 'css',
    });
    await closeSettings();
  });
});
