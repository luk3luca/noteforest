import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifactsPath, createHarness } from '../support/harness.mjs';
import { longDocument, writePagePackage } from '../support/page-fixtures.mjs';

const tempRoot = artifactsPath('m4b1b1-visual-tmp');
const screenshotDir = artifactsPath('m4b1b1');
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

function activePageView() {
  return page.locator('.nf-editor[data-active="true"] .nf-page-view');
}

function overlay() {
  return page.locator('.nf-editor[data-active="true"] [data-page-edit-overlay]');
}

async function waitPageReady() {
  await page.waitForFunction(
    () => {
      const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
      return (
        view !== null &&
        view.getAttribute('data-ready') === 'true' &&
        view.getAttribute('data-updating') === 'false'
      );
    },
    undefined,
    { timeout: 20000 },
  );
  await page.waitForTimeout(150);
}

async function showPageRead() {
  await page.keyboard.press('Meta+3');
  await activePageView().waitFor();
  await waitPageReady();
}

async function enterPageEdit() {
  await page.keyboard.press('Meta+e');
  await page.waitForFunction(
    () => document.querySelector('.nf-editor[data-active="true"] .nf-page-view')?.getAttribute('data-interaction-mode') === 'edit',
    undefined,
    { timeout: 5000 },
  );
}

async function openOverlay(blockId) {
  const fragment = blockId === undefined
    ? activePageView().locator('.nf-page-fragment').first()
    : activePageView()
        .locator(`.nf-page-fragment[data-fragment-block="${blockId}"]`)
        .first();
  await fragment.dblclick();
  await overlay().waitFor({ timeout: 5000 });
  await page.waitForTimeout(150);
}

describe('M4b1b1 Page Edit overlay visual evidence', () => {
  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
    await h.quit();
  });

  it('captures Page Read before/after and Page Edit overlays at 1440×900 and 960×720', async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await rm(screenshotDir, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    await mkdir(screenshotDir, { recursive: true });

    const env = isolated('m4b1b1-shots');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    await showPageRead();
    await shot('page-read-landscape-before-1440x900.png', 1440, 900);

    await enterPageEdit();
    await openOverlay();
    await shot('page-edit-overlay-landscape-1440x900.png', 1440, 900);
    await h.setWindowSize(960, 720);
    await shot('page-edit-overlay-landscape-960x720.png', 960, 720);

    // Commit and compare the unchanged Page Read proof.
    await h.setWindowSize(1440, 900);
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      () => window.__noteforestTest.viewState()[window.__noteforestTest.state().activeTab]?.interactionMode === 'read',
      undefined,
      { timeout: 5000 },
    );
    await waitPageReady();
    await shot('page-read-landscape-after-1440x900.png', 1440, 900);

    // Long fixture, including a block that spans pages (opened on page 2).
    const packagePath = await writePagePackage(
      env.NOTEFOREST_LIBRARY,
      'Long Page Edit',
      longDocument(),
    );
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
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card="parent"]');
    await showPageRead();
    await shot('page-read-long-before-1440x900.png', 1440, 900);
    await enterPageEdit();
    await openOverlay('parent');
    await shot('page-edit-overlay-long-1440x900.png', 1440, 900);
    await h.setWindowSize(960, 720);
    await shot('page-edit-overlay-long-960x720.png', 960, 720);

    await h.setWindowSize(1440, 900);
    await page.keyboard.press('Escape');
    await page.waitForSelector('.nf-editor[data-active="true"] [data-page-edit-overlay]', {
      state: 'detached',
    });
    await page.locator('.nf-toolbar [data-page-position]').click();
    await page.locator('[data-page-jump-input]').fill('2');
    await page.locator('[data-page-jump-input]').press('Enter');
    await page.waitForFunction(
      () => Number(document.querySelector('.nf-editor[data-active="true"] .nf-page-view')?.getAttribute('data-current-page')) === 2,
      undefined,
      { timeout: 10000 },
    );
    const continuation = activePageView()
      .locator('.nf-page-sheet[data-page-current="true"] .nf-page-fragment[data-fragment-block="child"][data-fragment-first="0"]')
      .first();
    await continuation.waitFor();
    await continuation.dblclick();
    await overlay().waitFor({ timeout: 5000 });
    await page.waitForTimeout(150);
    await shot('page-edit-spanning-overlay-long-1440x900.png', 1440, 900);
    await h.setWindowSize(960, 720);
    await shot('page-edit-spanning-overlay-long-960x720.png', 960, 720);
    await h.quit();
  });
});
