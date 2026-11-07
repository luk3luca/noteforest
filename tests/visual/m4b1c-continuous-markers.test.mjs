import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifactsPath, createHarness } from '../support/harness.mjs';
import {
  pageDocument,
  portraitLongDocument,
  textBlock,
  writePagePackage,
} from '../support/page-fixtures.mjs';

const tempRoot = artifactsPath('m4b1c-visual-tmp');
const screenshotDir = artifactsPath('m4b1c');
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
  await page.waitForFunction(
    () => {
      const layer = document.querySelector('.nf-editor[data-active="true"] .nf-page-markers');
      return (
        layer !== null &&
        layer.getAttribute('data-page-model-ready') === 'true' &&
        layer.getAttribute('data-page-model-updating') === 'false' &&
        Number(layer.getAttribute('data-page-marker-count')) > 0
      );
    },
    undefined,
    { timeout: 20000 },
  );
  // One settled frame after the model paints; screenshots must not catch a
  // transient measurement pass.
  await page.waitForTimeout(150);
}

function manualBreakDocument() {
  const document = pageDocument({
    id: 'm4b1c-visual-breaks',
    title: 'Continuous markers',
    orientation: 'portrait',
    chapterTitle: 'Derived pages',
    blocks: [
      textBlock('b1', 'One', 'First page body. '.repeat(18)),
      textBlock('b2', 'Two', 'Second page body. '.repeat(18)),
      textBlock('b3', 'Three', 'Third page body. '.repeat(18)),
      textBlock('b4', 'Four', 'Fourth page body. '.repeat(18)),
    ],
  });
  document.manualBreakBeforeBlockIds = ['b2', 'b3', 'b4'];
  return document;
}

describe('M4b1c continuous marker visual evidence', () => {
  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
    await h.quit();
  });

  it('captures continuous page-break markers at 1440×900 and 960×720', async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await rm(screenshotDir, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    await mkdir(screenshotDir, { recursive: true });

    const env = isolated('m4b1c-shots');
    await launch(env);
    await h.setWindowSize(1440, 900);
    await openPackage(env, 'Continuous markers', manualBreakDocument());
    await shot('continuous-markers-edit-1440x900.png', 1440, 900);

    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      () =>
        document
          .querySelector('.nf-editor[data-active="true"]')
          ?.getAttribute('data-interaction-mode') === 'read',
      undefined,
      { timeout: 5000 },
    );
    await page.waitForTimeout(150);
    await shot('continuous-markers-read-1440x900.png', 1440, 900);

    await h.setWindowSize(960, 720);
    await page.waitForTimeout(150);
    await shot('continuous-markers-read-960x720.png', 960, 720);

    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      () =>
        document
          .querySelector('.nf-editor[data-active="true"]')
          ?.getAttribute('data-interaction-mode') === 'edit',
      undefined,
      { timeout: 5000 },
    );
    await page.waitForTimeout(150);
    await shot('continuous-markers-edit-960x720.png', 960, 720);

    // A long block gets a continuation chip; capture it at both widths.
    await h.setWindowSize(1440, 900);
    await openPackage(env, 'Portrait long study', portraitLongDocument());
    await shot('continuous-markers-continuation-1440x900.png', 1440, 900);
    await h.setWindowSize(960, 720);
    await page.waitForTimeout(150);
    await shot('continuous-markers-continuation-960x720.png', 960, 720);
    await h.quit();
  });
});
