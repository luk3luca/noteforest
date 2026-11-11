import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';

/**
 * Batch V visual refinements: fixed Settings size, tokenized toasts,
 * non-shrinking tab status with an expanded active tab, and the Continuous
 * chapter inset. Behavior, Page/PDF output, and the schema are unchanged.
 */

const tempRoot = artifactsPath('ui-batch-v-temp');
const screenshotDir = artifactsPath('ui-batch-v');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

async function launch(name) {
  page = await ui.launch({ ...ui.isolated(name), NOTEFOREST_E2E_HIDDEN: '1' });
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

async function openSettings() {
  await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
  await page.keyboard.press('Meta+,');
  await page.waitForSelector('[data-settings-dialog="true"]');
}

async function closeSettings() {
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
}

async function showSettingsPage(id) {
  await page.locator(`[data-settings-nav="${id}"]`).click();
  await page.locator('.nf-settings-page-title').first().waitFor();
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
        width: box.width,
        height: box.height,
      };
    };
    const preview = document.querySelector('[data-page-preview="true"]');
    return {
      modal: rect('[data-settings-dialog="true"]'),
      dialog: rect('.nf-settings'),
      body: rect('.nf-settings-body'),
      nav: rect('.nf-settings-nav'),
      pane: rect('.nf-settings-pane'),
      preview: rect('[data-page-preview="true"]'),
      previewVisible:
        preview !== null &&
        preview.getClientRects().length > 0 &&
        getComputedStyle(preview).display !== 'none',
    };
  });
}

describe('Batch V visual refinement', () => {
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

  it('keeps one fixed Settings width and height for General, Page, and Editor', async () => {
    await launch('batch-v-settings');
    await ui.seedDemo();
    await openSettings();

    const measurements = [];
    for (const id of ['page', 'general', 'editor', 'page']) {
      await showSettingsPage(id);
      if (id === 'page') {
        await page.waitForSelector(
          '[data-page-preview="true"][data-page-preview-state="ready"]',
          { timeout: 15000 },
        );
      }
      measurements.push({ id, ...(await settingsGeometry()) });
      if (id === 'page') {
        await page.screenshot({
          path: join(screenshotDir, 'settings-page.png'),
        });
      } else {
        await page.screenshot({
          path: join(screenshotDir, `settings-${id}.png`),
        });
      }
    }

    for (const entry of measurements) {
      assert.equal(
        Math.round(entry.modal.width),
        980,
        `${entry.id}: one 980 px desktop Settings width`,
      );
      assert.equal(
        Math.round(entry.dialog.height),
        580,
        `${entry.id}: the Settings height stays fixed`,
      );
      assert.equal(
        Math.round(entry.pane.width),
        536,
        `${entry.id}: one content column width`,
      );
      assert.equal(
        entry.previewVisible,
        entry.id === 'page',
        `${entry.id}: the preview exists only on Page`,
      );
    }

    const general = measurements.find((entry) => entry.id === 'general');
    const pageEntry = measurements.find((entry) => entry.id === 'page');
    assert.ok(general !== undefined && pageEntry !== undefined);
    assert.equal(
      Math.round(general.pane.width),
      Math.round(pageEntry.pane.width),
      'General and Page use the same content width',
    );

    // Non-Page pages center the content column instead of leaving an empty
    // third column: the free space on both sides of the pane is equal.
    const generalFreeLeft = general.pane.left - general.nav.right;
    const generalFreeRight = general.body.right - general.pane.right;
    assert.ok(
      Math.abs(generalFreeLeft - generalFreeRight) <= 1,
      `General content is centered (${generalFreeLeft} vs ${generalFreeRight})`,
    );

    // The Page preview sits directly after the pane and ends at the body edge.
    assert.ok(pageEntry.preview !== null);
    assert.ok(
      Math.abs(pageEntry.preview.right - pageEntry.body.right) <= 1,
      'the Page preview fills the right side of the body',
    );
    assert.equal(
      Math.round(pageEntry.preview.width),
      258,
      'the Page preview column keeps its width',
    );

    // Above 920 px the preview is a viewport rule only; every page shares the
    // same narrow width once the viewport shrinks. The real window has a
    // 960 px minimum, so drive the layout viewport directly here.
    await page.setViewportSize({ width: 900, height: 800 });
    await page.waitForFunction(() => window.innerWidth <= 920, undefined, { timeout: 5000 });
    await showSettingsPage('page');
    const narrowPage = await settingsGeometry();
    assert.equal(narrowPage.previewVisible, false, 'the Page preview hides under 920 px');
    await showSettingsPage('general');
    const narrowGeneral = await settingsGeometry();
    assert.equal(
      Math.round(narrowGeneral.modal.width),
      Math.round(narrowPage.modal.width),
      'the viewport, not the active page, sets the narrow width',
    );
    assert.ok(narrowGeneral.modal.width <= 840, 'the narrow Settings width is bounded');

    await showSettingsPage('page');
    await closeSettings();
  });

  it('uses the app toast surface, typography, and stroke icons', async () => {
    await launch('batch-v-toast');
    await ui.seedDemo();

    const showToast = async (type, title, description) => {
      await page.evaluate(
        ({ type: toastType, title: toastTitle, description: toastDescription }) => {
          window.__noteforestTest.showToast(toastType, toastTitle, toastDescription);
        },
        { type, title, description },
      );
      const selector = `[data-sonner-toast][data-type="${type}"][data-front="true"]`;
      await page.waitForSelector(`${selector}[data-mounted="true"][data-visible="true"]`);
      await page.waitForFunction(
        (target) => {
          const element = document.querySelector(target);
          return element !== null && getComputedStyle(element).opacity === '1';
        },
        selector,
      );
    };

    await showToast('success', 'Saved', 'The document was saved.');
    const success = await page.evaluate(() => {
      const toast = document.querySelector('[data-sonner-toast][data-type="success"]');
      if (toast === null) return null;
      const style = (element) => (element === null ? null : getComputedStyle(element));
      const title = toast.querySelector('[data-title]');
      const description = toast.querySelector('[data-description]');
      const icon = toast.querySelector('[data-icon]');
      const svg = toast.querySelector('[data-icon] svg');
      const toastStyle = style(toast);
      return {
        width: toast.getBoundingClientRect().width,
        paddingTop: toastStyle.paddingTop,
        paddingLeft: toastStyle.paddingLeft,
        radius: toastStyle.borderRadius,
        background: toastStyle.backgroundColor,
        border: toastStyle.borderTopColor,
        shadow: toastStyle.boxShadow,
        fontFamily: toastStyle.fontFamily,
        titleSize: style(title).fontSize,
        titleWeight: style(title).fontWeight,
        titleLineHeight: style(title).lineHeight,
        titleColor: style(title).color,
        descriptionSize: style(description).fontSize,
        descriptionWeight: style(description).fontWeight,
        descriptionLineHeight: style(description).lineHeight,
        descriptionColor: style(description).color,
        iconWidth: icon === null ? null : icon.getBoundingClientRect().width,
        iconHeight: icon === null ? null : icon.getBoundingClientRect().height,
        iconColor: style(icon).color,
        svgWidth: svg === null ? null : svg.getBoundingClientRect().width,
        svgStrokeWidth: style(svg).strokeWidth,
      };
    });
    assert.ok(success !== null);
    assert.ok(Math.abs(success.width - 340) <= 0.5, `toast width is 340 px (${success.width})`);
    assert.equal(success.paddingTop, '12px');
    assert.equal(success.paddingLeft, '14px');
    assert.equal(success.radius, '8px');
    assert.equal(success.background, 'rgb(38, 42, 48)', 'surface-3 background');
    assert.equal(success.border, 'rgb(46, 50, 56)', 'app border');
    assert.match(success.shadow, /0px 12px 32px/, 'toast shadow token');
    assert.match(success.shadow, /0\.45/, 'toast shadow opacity');
    assert.match(success.fontFamily, /-apple-system|SF Pro Text/, 'app UI font');
    assert.equal(success.titleSize, '12.5px');
    assert.equal(success.titleWeight, '500');
    assert.equal(success.titleLineHeight, '17.5px');
    assert.equal(success.titleColor, 'rgb(231, 232, 234)', 'app text color');
    assert.equal(success.descriptionSize, '11.5px');
    assert.equal(success.descriptionWeight, '400');
    assert.equal(success.descriptionLineHeight, '16.1px');
    assert.equal(success.descriptionColor, 'rgb(166, 171, 178)', 'secondary text');
    assert.equal(success.iconWidth, 16);
    assert.equal(success.iconHeight, 16);
    assert.equal(success.iconColor, 'rgb(143, 191, 159)', 'success icon color');
    assert.equal(success.svgWidth, 16);
    assert.equal(success.svgStrokeWidth, '1.5px');
    await page.screenshot({ path: join(screenshotDir, 'toast-success.png') });

    await showToast('info', 'Read mode', 'Editing is off while you read.');
    const infoColor = await page
      .locator('[data-sonner-toast][data-type="info"] [data-icon]')
      .first()
      .evaluate((element) => getComputedStyle(element).color);
    assert.equal(infoColor, 'rgb(155, 183, 212)', 'info uses the accent');
    await page.screenshot({ path: join(screenshotDir, 'toast-info.png') });

    await showToast('error', 'Could not save', 'The folder is not writable.');
    const errorColor = await page
      .locator('[data-sonner-toast][data-type="error"] [data-icon]')
      .first()
      .evaluate((element) => getComputedStyle(element).color);
    assert.equal(errorColor, 'rgb(217, 139, 139)', 'error uses the danger token');
    await page.screenshot({ path: join(screenshotDir, 'toast-error.png') });

    // Sonner keeps three visible; showing a fourth hides the oldest.
    await showToast('warning', 'Heads up', 'One more toast.');
    await page.waitForFunction(
      () => document.querySelectorAll('[data-sonner-toast]').length === 4,
    );
    const visibility = await page.evaluate(() => ({
      total: document.querySelectorAll('[data-sonner-toast]').length,
      visible: document.querySelectorAll('[data-sonner-toast][data-visible="true"]')
        .length,
      focusedInsideToast:
        document.activeElement?.closest('[data-sonner-toast]') !== null,
    }));
    assert.equal(visibility.total, 4);
    assert.equal(visibility.visible, 3, 'at most three toasts are visible');
    assert.equal(visibility.focusedInsideToast, false, 'a toast never steals focus');
  });
});
