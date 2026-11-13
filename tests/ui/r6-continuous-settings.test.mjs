import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { artifactsPath, waitUntil } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { pageDocument, textBlock, writePagePackage } from '../support/page-fixtures.mjs';

/**
 * R6 Continuous settings UI.
 *
 * Settings → Continuous is global-only, works with no document open, writes
 * immediately (debounced sliders), and applies the resolved spacing, arrow, and
 * width values to every Continuous canvas. The Page/PDF isolation is unit
 * tested; this suite checks the scope boundary in the live DOM (root fallbacks
 * stay at the defaults while the Continuous surface overrides them).
 */

const tempRoot = artifactsPath('r6-continuous-temp');
const screenshotDir = artifactsPath('r6-continuous');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

const DEFAULTS = {
  spacing: { chapterGap: 28, siblingGap: 24, childRowGap: 16 },
  arrows: { width: 1.25, activeWidth: 1.75, mutedWidth: 1, size: 6 },
  widths: { canvasMax: 3200, topLevelMax: 480, childMax: 420 },
};

async function launch(name, env) {
  page = await ui.launch({ ...(env ?? ui.isolated(name)), NOTEFOREST_E2E_HIDDEN: '1' });
  await h.setWindowSize(1440, 900);
}

async function appSettings() {
  return page.evaluate(() => window.__noteforestTest.settings());
}

async function openSettings() {
  await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
  await page.keyboard.press('Meta+,');
  await page.waitForSelector('[data-settings-dialog="true"]');
  await page.locator('[data-settings-nav="continuous"]').click();
  await page.waitForSelector('[data-continuous-page-description="true"]');
}

async function closeSettings() {
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
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

async function waitForSaved() {
  await page.waitForFunction(
    () =>
      document.querySelector('[data-settings-status]')?.getAttribute('data-settings-status') ===
      'saved',
    undefined,
    { timeout: 15000 },
  );
}

async function styleOf(selector, property) {
  return page.locator(selector).first().evaluate((element, name) => {
    return getComputedStyle(element).getPropertyValue(name).trim();
  }, property);
}

async function openPackage(env, name, document) {  const packagePath = await writePagePackage(env.NOTEFOREST_LIBRARY, name, document);
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

function canvasDocument() {
  return pageDocument({
    id: 'r6-canvas',
    title: 'R6 canvas',
    chapterTitle: 'Canvas chapter',
    blocks: [
      textBlock('root', 'Root', 'A top-level sample note.'),
      textBlock('child', 'Child', 'A direct child with its own note.'),
    ],
    branches: [
      {
        id: 'branch-child',
        sourceBlockId: 'root',
        targetBlockId: 'child',
        role: 'primary',
      },
    ],
  });
}

describe('R6 Continuous settings', () => {
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

  it('works with no document: global controls, live preview, reset, no zoom control', async () => {
    const env = ui.isolated('r6-no-document');
    await launch('r6-no-document', env);
    await openSettings();

    assert.equal(await page.locator('[data-continuous-no-document]').count(), 0);
    assert.equal(await page.locator('[data-continuous-zoom-slider]').count(), 0);
    for (const field of ['chapterGap', 'siblingGap', 'childRowGap']) {
      assert.equal(
        await page.locator(`[data-continuous-slider="${field}"]`).isEnabled(),
        true,
        `${field} works without a document`,
      );
    }
    assert.equal(await page.locator('[data-continuous-preview="true"]').count(), 1);
    assert.equal(
      await page.locator('[data-continuous-preview="true"]').getAttribute('aria-label'),
      'Continuous preview',
    );
    await page.screenshot({ path: join(screenshotDir, 'settings-default-no-document.png') });

    // Light theme: the preview follows Appearance, not a preview-only palette.
    await page.locator('[data-settings-nav="appearance"]').click();
    await page.locator('[data-appearance-theme-option="light"]').click();
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-theme') === 'light',
      undefined,
      { timeout: 10000 },
    );
    await page.locator('[data-settings-nav="continuous"]').click();
    await page.screenshot({ path: join(screenshotDir, 'settings-default-light.png') });
    await page.locator('[data-settings-nav="appearance"]').click();
    await page.locator('[data-appearance-theme-option="dark"]').click();
    await page.locator('[data-settings-nav="continuous"]').click();

    // A slider edit updates the preview immediately and writes after the
    // debounce, with the real footer status.
    const childBefore = await page.locator('[data-preview-card="child"]').first().evaluate(
      (element) => element.getBoundingClientRect().left,
    );
    const root = await page.locator('[data-preview-card="root"]').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, width: rect.width };
    });
    await setSlider('siblingGap', 36);
    await page.waitForFunction(
      () =>
        document.querySelector('[data-settings-status]')?.getAttribute('data-settings-status') ===
        'saving',
      undefined,
      { timeout: 5000 },
    );
    await waitForSaved();
    await waitUntil(async () => (await appSettings()).app.continuous.spacing.siblingGap === 36);
    const childAfter = await page.locator('[data-preview-card="child"]').first().evaluate(
      (element) => element.getBoundingClientRect().left,
    );
    assert.ok(childAfter > childBefore, 'the preview follows the sibling gap');

    // Advanced is a real disclosure with the width caps.
    await page.locator('[data-continuous-advanced="true"] summary').click();
    assert.equal(await page.locator('[data-continuous-slider="canvasMax"]').isVisible(), true);
    await page.waitForSelector('[data-continuous-width-help="true"]');
    await page.screenshot({ path: join(screenshotDir, 'settings-advanced-changed.png') });
    await page.locator('[data-continuous-preview="true"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(screenshotDir, 'settings-preview-changed.png') });

    // Reset is explicit and confirmed only when a value changed.
    await page.locator('[data-continuous-reset="true"]').click();
    await page.locator('[data-continuous-reset-confirm="true"]').click();
    await waitUntil(
      async () =>
        JSON.stringify((await appSettings()).app.continuous) === JSON.stringify(DEFAULTS),
    );
    await waitForSaved();
    assert.equal(
      await page.locator('[data-continuous-reset="true"]').isDisabled(),
      true,
      'Reset is disabled at the defaults',
    );
    assert.equal(root.width > 0, true);
    await closeSettings();
  });

  it('applies every Continuous value to the canvas without changing Page output', async () => {
    const env = ui.isolated('r6-canvas');
    await launch('r6-canvas', env);
    await openPackage(env, 'r6-canvas', canvasDocument());
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-chapter');

    assert.equal(await styleOf('.nf-chapter', 'margin-bottom'), '28px');
    assert.equal(await styleOf('.nf-branch-children', 'margin-left'), '24px');
    assert.equal(await styleOf('.nf-canvas', 'max-width'), '3200px');
    const arrowBefore = await page
      .locator('.nf-edge-arrow')
      .first()
      .getAttribute('d');

    await openSettings();
    await setSlider('chapterGap', 40);
    await setSlider('siblingGap', 30);
    await setSlider('childRowGap', 20);
    await setSlider('width', 2);
    await setSlider('activeWidth', 2.5);
    await setSlider('mutedWidth', 1.5);
    await setSlider('size', 10);
    await page.locator('[data-continuous-advanced="true"] summary').click();
    await setSlider('canvasMax', 4000);
    await setSlider('topLevelMax', 600);
    await setSlider('childMax', 500);
    await page.waitForFunction(
      () =>
        document.querySelector('[data-settings-status]')?.getAttribute('data-settings-status') ===
        'saved',
      undefined,
      { timeout: 15000 },
    );
    await waitUntil(async () => {
      const settings = await appSettings();
      return settings.app.continuous.spacing.chapterGap === 40 &&
        settings.app.continuous.widths.canvasMax === 4000;
    });
    await closeSettings();

    await page.waitForFunction(
      () => getComputedStyle(document.querySelector('.nf-chapter')).marginBottom === '40px',
      undefined,
      { timeout: 10000 },
    );
    assert.equal(await styleOf('.nf-branch-children', 'margin-left'), '30px');
    assert.equal(await styleOf('.nf-canvas', 'max-width'), '4000px');
    assert.equal(
      await page
        .locator('.nf-block-body[data-top-level="true"]')
        .first()
        .evaluate((element) => getComputedStyle(element).maxWidth),
      '600px',
    );
    const arrowAfter = await page.locator('.nf-edge-arrow').first().getAttribute('d');
    assert.notEqual(arrowAfter, arrowBefore, 'the fixed arrowhead size changed');
    assert.equal(
      await styleOf('.nf-continuous-surface', '--nf-edge-width'),
      '2',
      'the Continuous surface carries the resolved edge width',
    );

    // The Continuous overrides are scoped to the Continuous surface: the root
    // fallbacks (and therefore Page/PDF) still read the product defaults.
    const rootValues = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        childGap: style.getPropertyValue('--nf-child-gap').trim(),
        canvasMax: style.getPropertyValue('--nf-canvas-max').trim(),
        edgeWidth: style.getPropertyValue('--nf-edge-width').trim(),
      };
    });
    assert.deepEqual(rootValues, {
      childGap: '24px',
      canvasMax: '3200px',
      edgeWidth: '1.25',
    });
    await page.screenshot({ path: join(screenshotDir, 'canvas-changed.png') });

    // Settings persisted the v5 continuous namespace.
    const stored = JSON.parse(
      await readFile(join(env.NOTEFOREST_APP_SUPPORT, 'settings.json'), 'utf8'),
    );
    assert.equal(stored.settingsVersion, 5);
    assert.deepEqual(stored.continuous, {
      spacing: { chapterGap: 40, siblingGap: 30, childRowGap: 20 },
      arrows: { width: 2, activeWidth: 2.5, mutedWidth: 1.5, size: 10 },
      widths: { canvasMax: 4000, topLevelMax: 600, childMax: 500 },
    });
  });
});
