import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifactsPath, createHarness } from '../support/harness.mjs';
import { portraitLongDocument, writePagePackage } from '../support/page-fixtures.mjs';

const tempRoot = artifactsPath('m4b1-visual-tmp');
const screenshotDir = artifactsPath('m4b1');
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
}

async function showPageView() {
  await page.keyboard.press('Meta+3');
  await activePageView().waitFor();
  await waitPageReady();
  // One settled frame after the model paints; screenshots must not catch a
  // transient measurement pass.
  await page.waitForTimeout(150);
}

describe('M4b1a editor layouts and modes visual evidence', () => {
  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
    await h.quit();
  });

  it('captures Continuous Edit/Read and Page Read at 1440×900 and 960×720', async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await rm(screenshotDir, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    await mkdir(screenshotDir, { recursive: true });

    const env = isolated('m4b1-shots');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await page.evaluate(() => window.__noteforestTest.seed('demo'));
    await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
    await h.waitSaved();
    await page.waitForTimeout(150);
    await shot('continuous-edit-1440x900.png', 1440, 900);
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      () => document.querySelector('.nf-editor[data-active="true"]')?.getAttribute('data-interaction-mode') === 'read',
      undefined,
      { timeout: 5000 },
    );
    await page.waitForTimeout(150);
    await shot('continuous-read-1440x900.png', 1440, 900);
    await showPageView();
    await shot('page-read-landscape-1440x900.png', 1440, 900);
    await shot('page-landscape-1440x900.png', 1440, 900);
    await h.setWindowSize(960, 720);
    await shot('page-landscape-960x720.png', 960, 720);

    await h.setWindowSize(1440, 900);
    const packagePath = await writePagePackage(
      env.NOTEFOREST_LIBRARY,
      'Portrait long study',
      portraitLongDocument(),
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
    await showPageView();
    await shot('page-portrait-1440x900.png', 1440, 900);

    const next = page.locator('.nf-editor[data-active="true"] [data-page-nav="next"]');
    await next.click();
    await page.waitForSelector('.nf-editor[data-active="true"] [data-page-continued-from]');
    await page.waitForTimeout(120);
    await shot('page-portrait-continuation-1440x900.png', 1440, 900);

    await h.setWindowSize(960, 720);
    await page
      .locator('.nf-editor[data-active="true"] [data-page-nav="prev"]')
      .click();
    await page.waitForTimeout(120);
    await shot('page-portrait-960x720.png', 960, 720);
    await h.quit();
  });
});
