import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifactsPath, createHarness } from '../support/harness.mjs';
import {
  multiPageBlocksDocument,
  pageArrowsDocument,
  writePagePackage,
} from '../support/page-fixtures.mjs';

const tempRoot = artifactsPath('r2a-visual-tmp');
const screenshotDir = artifactsPath('r2a');
const h = createHarness({ tempRoot });
let page;

function isolated(name) {
  return {
    NOTEFOREST_LIBRARY: resolve(tempRoot, `${name}-library`),
    NOTEFOREST_APP_SUPPORT: resolve(tempRoot, `${name}-support`),
  };
}

async function launch(overrides = {}) {
  await h.launch({ NOTEFOREST_E2E_HIDDEN: '0', ...overrides });
  page = h.page;
}

async function shot(name, width, height) {
  await h.screenshot(resolve(screenshotDir, name), { width, height });
}

async function openPackage(env, name, document) {
  const packagePath = await writePagePackage(env.NOTEFOREST_LIBRARY, name, document);
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
  return packagePath;
}

async function waitPageReady(minRuns = 1) {
  await page.waitForFunction(
    (runs) => {
      const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
      if (view === null) return false;
      return (
        view.getAttribute('data-ready') === 'true' &&
        view.getAttribute('data-updating') === 'false' &&
        Number(view.getAttribute('data-model-runs')) >= runs
      );
    },
    minRuns,
    { timeout: 30000 },
  );
}

async function showPageRead() {
  await page.keyboard.press('Meta+3');
  await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view');
  await waitPageReady();
  await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-edges');
  // Clear any selection inherited from Continuous so the evidence shows the
  // arrows, not a selected-card outline.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
}

async function modelRuns() {
  return Number(
    await page
      .locator('.nf-editor[data-active="true"] .nf-page-view')
      .getAttribute('data-model-runs'),
  );
}

async function setPageSettingsOverride(packagePath, override) {
  const runs = await modelRuns();
  return page
    .evaluate(
      ({ path, value }) => window.__noteforestTest.setPageSettingsOverride(path, value),
      { path: packagePath, value: override },
    )
    .then((resolved) => ({ resolved, runs }));
}

describe('R2a page arrows visual evidence', () => {
  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
    await h.quit();
  });

  it('captures Page arrows at 1440/960 landscape and portrait, cross-page indicators, and Continuous without chrome', async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await rm(screenshotDir, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    await mkdir(screenshotDir, { recursive: true });

    const env = isolated('r2a-shots');
    await launch(env);
    await h.setWindowSize(1440, 900);
    const packagePath = await openPackage(env, 'Page arrows', pageArrowsDocument());
    await showPageRead();
    await shot('page-read-arrows-1440x900-landscape.png', 1440, 900);

    await h.setWindowSize(960, 720);
    await page.waitForTimeout(150);
    await shot('page-read-arrows-960x720-landscape.png', 960, 720);

    const portrait = await setPageSettingsOverride(packagePath, {
      setup: { orientation: 'portrait' },
    });
    assert.equal(portrait.resolved.setup.orientation, 'portrait');
    await waitPageReady(portrait.runs + 1);
    await page.waitForTimeout(150);
    await shot('page-read-arrows-960x720-portrait.png', 960, 720);

    await h.setWindowSize(1440, 900);
    await page.waitForTimeout(150);
    await shot('page-read-arrows-1440x900-portrait.png', 1440, 900);

    // Cross-page: landscape plus one personal break before the anchored callout.
    const landscape = await setPageSettingsOverride(packagePath, {
      setup: { orientation: 'landscape' },
      manualBreakBeforeBlockIds: ['callout'],
    });
    await waitPageReady(landscape.runs + 1);

    await h.setWindowSize(1440, 900);
    await page.waitForFunction(
      () => {
        const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
        return (
          view !== null &&
          Number(view.getAttribute('data-page-count')) >= 2 &&
          view.querySelector(
            '[data-page-trunk-id="source:below"][data-page-trunk-page="1"]',
          ) !== null
        );
      },
      undefined,
      { timeout: 30000 },
    );
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    await shot('page-read-cross-page-out-1440x900.png', 1440, 900);

    await page.locator('.nf-canvas-header [data-page-position-input]').fill('2');
    await page.locator('.nf-canvas-header [data-page-position-input]').press('Enter');
    await page.waitForFunction(
      () =>
        Number(
          document
            .querySelector('.nf-editor[data-active="true"] .nf-page-view')
            ?.getAttribute('data-current-page'),
        ) === 2,
      undefined,
      { timeout: 5000 },
    );
    await page.waitForTimeout(150);
    await shot('page-read-cross-page-in-1440x900.png', 1440, 900);

    // Continuous: the same multi-page corpus, with no page chrome at all.
    await page.keyboard.press('Meta+2');
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view', {
      state: 'detached',
    });
    await openPackage(env, 'Continuous without pages', multiPageBlocksDocument());
    await page.waitForTimeout(250);
    assert.equal(
      await page.locator('.nf-editor[data-active="true"] [data-page-marker]').count(),
      0,
    );
    assert.equal(
      await page.locator('.nf-editor[data-active="true"] .nf-page-sheet').count(),
      0,
    );
    await shot('continuous-no-page-chrome-1440x900.png', 1440, 900);

    await h.setWindowSize(960, 720);
    await page.waitForTimeout(250);
    await shot('continuous-no-page-chrome-960x720.png', 960, 720);
  });
});
