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

  it('keeps one 320 px Settings control geometry and a symmetric 10 px card inset', async () => {
    await launch('batch-v-controls');
    await ui.seedDemo();
    await openSettings();

    async function controlGeometry() {
      return page.evaluate(() => {
        const rect = (element) => {
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
        const groups = [...document.querySelectorAll('.nf-settings-pane .nf-segmented')].map(
          (group) => {
            const items = [...group.querySelectorAll('.nf-segmented-item')];
            return {
              ...rect(group),
              labels: items.map((item) => item.textContent?.trim() ?? ''),
              itemWidths: items.map((item) => item.getBoundingClientRect().width),
              clipped: items
                .filter((item) => item.scrollWidth > item.clientWidth + 0.5)
                .map((item) => item.textContent?.trim() ?? ''),
            };
          },
        );
        const selects = [...document.querySelectorAll('.nf-settings-pane .nf-select')].map(
          (select) => {
            const wrap = select.closest('.nf-select-wrap');
            const chevron = wrap?.querySelector('.nf-select-chevron');
            const selectBox = rect(select);
            const chevronBox = chevron === null || chevron === undefined ? null : rect(chevron);
            return {
              ...selectBox,
              appearance: getComputedStyle(select).appearance,
              paddingRight: getComputedStyle(select).paddingRight,
              chevron: chevronBox,
              chevronInside:
                chevronBox !== null &&
                chevronBox.right <= selectBox.right &&
                chevronBox.left >= selectBox.left &&
                chevronBox.top >= selectBox.top &&
                chevronBox.bottom <= selectBox.bottom,
            };
          },
        );
        return { groups, selects };
      });
    }

    // Page exposes the widest label set (None / Document title / Chapter title).
    await showSettingsPage('page');
    await page.waitForSelector('[data-page-setup-section="true"]');
    const pageControls = await controlGeometry();
    assert.ok(pageControls.groups.length >= 5, 'Page has several segmented groups');
    for (const group of pageControls.groups) {
      assert.ok(Math.abs(group.width - 320) <= 0.5, `segmented group width 320 (${group.width})`);
      assert.equal(group.height, 28, 'segmented group height 28');
      const first = group.itemWidths[0];
      assert.ok(
        group.itemWidths.every((width) => Math.abs(width - first) <= 0.5),
        `equal-width segments (${group.labels.join(' / ')}: ${group.itemWidths.join(', ')})`,
      );
      assert.deepEqual(group.clipped, [], `no clipped segment label (${group.labels.join(' / ')})`);
    }
    await page.screenshot({ path: join(screenshotDir, 'settings-page-controls-100.png') });

    // The brief's worst case is 115% even though the shipped max step is 110.
    await page.evaluate(() => document.documentElement.style.setProperty('--ui-scale', '1.15'));
    const pageControls115 = await controlGeometry();
    for (const group of pageControls115.groups) {
      assert.ok(Math.abs(group.width - 320) <= 0.5, '320 px survives UI scale 115');
      assert.deepEqual(
        group.clipped,
        [],
        `no clipped segment label at 115% (${group.labels.join(' / ')})`,
      );
    }
    await page.screenshot({ path: join(screenshotDir, 'settings-page-controls-115.png') });
    await page.evaluate(() => document.documentElement.style.removeProperty('--ui-scale'));

    await showSettingsPage('appearance');
    const appearanceControls = await controlGeometry();
    assert.equal(appearanceControls.selects.length, 2, 'UI font and code font selects');
    for (const select of appearanceControls.selects) {
      assert.ok(Math.abs(select.width - 320) <= 0.5, `select width 320 (${select.width})`);
      assert.equal(select.height, 28, 'select height 28');
      assert.equal(select.appearance, 'none', 'native arrow suppressed');
      assert.equal(select.paddingRight, '30px');
      assert.equal(select.chevronInside, true, 'the chevron sits fully inside the select');
      assert.ok(
        select.chevron !== null && Math.abs(select.right - select.chevron.right - 9) <= 0.5,
        'the chevron is 9 px from the select right edge',
      );
      assert.equal(select.chevron.width, 14);
    }
    await page.screenshot({ path: join(screenshotDir, 'settings-typography-100.png') });
    await page.evaluate(() => document.documentElement.style.setProperty('--ui-scale', '1.15'));
    await page.screenshot({ path: join(screenshotDir, 'settings-typography-115.png') });
    await page.evaluate(() => document.documentElement.style.removeProperty('--ui-scale'));
    await closeSettings();

    // Continuous: the React node-view wrapper reset gives both a top-level and
    // a child card the same 10 px content inset at top and bottom.
    const insets = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.nf-editor[data-active="true"] [data-block-card]')];
      const measure = (card) => {
        const prose = card.querySelector('.nf-block-prose');
        const firstWrapper = prose?.firstElementChild;
        const lastWrapper = prose?.lastElementChild;
        const first = firstWrapper?.firstElementChild ?? firstWrapper;
        const last = lastWrapper?.lastElementChild ?? lastWrapper;
        if (first === null || first === undefined || last === null || last === undefined) {
          return null;
        }
        const cardBox = card.getBoundingClientRect();
        const firstBox = first.getBoundingClientRect();
        const lastBox = last.getBoundingClientRect();
        return {
          top: firstBox.top - cardBox.top,
          bottom: cardBox.bottom - lastBox.bottom,
          firstTag: first.tagName,
          lastTag: last.tagName,
          paddingTop: getComputedStyle(card).paddingTop,
          paddingBottom: getComputedStyle(card).paddingBottom,
        };
      };
      const topLevel = cards.find((card) => card.getAttribute('data-top-level') === 'true');
      const child = cards.find((card) => card.getAttribute('data-top-level') === 'false');
      return {
        topLevel: topLevel === undefined ? null : measure(topLevel),
        child: child === undefined ? null : measure(child),
      };
    });
    assert.ok(insets.topLevel !== null && insets.child !== null);
    for (const [name, value] of Object.entries(insets)) {
      assert.ok(value !== null);
      assert.ok(
        Math.abs(value.top - 10) <= 0.75,
        `${name}: first content sits at the 10 px top inset (${value.top})`,
      );
      assert.ok(
        Math.abs(value.bottom - 10) <= 0.75,
        `${name}: last content ends at the 10 px bottom inset (${value.bottom})`,
      );
      assert.equal(value.paddingTop, '10px');
      assert.equal(value.paddingBottom, '10px');
    }
    await page.screenshot({ path: join(screenshotDir, 'card-inset-top-level-child.png') });
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

  it('expands tabs when space allows, shrinks inactive tabs first, then windows', async () => {
    await launch('batch-v-tabs');
    await ui.seedDemo();
    await page.waitForSelector('.nf-tablist');

    const tabCount = async () => page.evaluate(() => window.__noteforestTest.state().tabs.length);
    const addTab = async (expected) => {
      await page.locator('[data-toolbar-new="true"]').click();
      await page.waitForFunction(
        (count) => window.__noteforestTest.state().tabs.length === count,
        expected,
        { timeout: 15000 },
      );
      await h.waitSaved();
    };

    const measure = async () =>
      page.evaluate(() => {
        const tabs = [...document.querySelectorAll('.nf-tab')];
        const active = tabs.find((tab) => tab.getAttribute('data-active') === 'true');
        return {
          widths: tabs.map((tab) => tab.getBoundingClientRect().width),
          activeWidth: active?.getBoundingClientRect().width ?? null,
          activeIndex: tabs.indexOf(active),
        };
      });

    await addTab(2);
    await page.screenshot({ path: join(screenshotDir, 'tabs-2.png') });
    const two = await measure();
    assert.equal(two.widths.length, 2);
    assert.ok(
      two.widths.every((width) => width >= 219.5 && width <= 220.5),
      `all tabs expand to 220 px when space allows (${two.widths.join(', ')})`,
    );

    while ((await tabCount()) < 4) {
      await addTab((await tabCount()) + 1);
    }
    await page.screenshot({ path: join(screenshotDir, 'tabs-4.png') });
    const four = await measure();
    assert.ok(
      four.widths.every((width) => width >= 219.5 && width <= 220.5),
      `four tabs still fit at 220 px (${four.widths.join(', ')})`,
    );

    while ((await tabCount()) < 8) {
      await addTab((await tabCount()) + 1);
    }
    await page.screenshot({ path: join(screenshotDir, 'tabs-8.png') });
    const eight = await measure();
    const inactiveEight = eight.widths.filter((_, index) => index !== eight.activeIndex);
    assert.ok(eight.activeWidth !== null);
    assert.ok(
      eight.activeWidth >= 219.5 && eight.activeWidth <= 220.5,
      `the active tab stays expanded at eight tabs (${eight.activeWidth})`,
    );
    assert.ok(
      inactiveEight.length > 0 &&
        inactiveEight.every((width) => width > 80.5 && width < 219.5),
      `inactive tabs start shrinking before overflow (${inactiveEight.join(', ')})`,
    );
    assert.ok(
      inactiveEight.every((width) => (eight.activeWidth ?? 0) > width),
      'the active tab is wider than every inactive tab',
    );

    while ((await tabCount()) < 14) {
      await addTab((await tabCount()) + 1);
    }
    await h.setWindowSize(1200, 800);
    await page.waitForFunction(
      () => {
        const state = window.__noteforestTest.state();
        return (
          state.tabs.length === 14 &&
          document.querySelectorAll('.nf-tab').length < state.tabs.length
        );
      },
      undefined,
      { timeout: 15000 },
    );
    await page.screenshot({ path: join(screenshotDir, 'tabs-14.png') });

    const stress = await page.evaluate(() => {
      const state = window.__noteforestTest.state();
      const tabs = [...document.querySelectorAll('.nf-tab')];
      const active = tabs.find((tab) => tab.getAttribute('data-active') === 'true');
      const activeBox = active?.getBoundingClientRect() ?? null;
      const list = document.querySelector('.nf-tablist');
      const listBox = list?.getBoundingClientRect() ?? null;
      const plus = document.querySelector('.nf-tab-actions [data-toolbar-new="true"]');
      const last = tabs.at(-1)?.getBoundingClientRect() ?? null;
      const plusBox = plus?.getBoundingClientRect() ?? null;
      return {
        tabCount: state.tabs.length,
        visibleCount: tabs.length,
        activeIndex: tabs.indexOf(active),
        widths: tabs.map((tab) => tab.getBoundingClientRect().width),
        activeWidth: activeBox?.width ?? null,
        activeLeft: activeBox?.left ?? null,
        activeRight: activeBox?.right ?? null,
        listLeft: listBox?.left ?? null,
        listRight: listBox?.right ?? null,
        overflowX: list === null ? null : getComputedStyle(list).overflowX,
        plusVisible: plusBox !== null && plusBox.width > 0,
        plusAfterLast: plusBox !== null && last !== null && plusBox.left >= last.right - 0.5,
        pageScroll: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        closeSizes: tabs.map((tab) => {
          const close = tab.querySelector('.nf-tab-close');
          const icon = tab.querySelector('.nf-tab-close svg');
          return {
            close: close?.getBoundingClientRect().width ?? null,
            closeHeight: close?.getBoundingClientRect().height ?? null,
            icon: icon?.getBoundingClientRect().width ?? null,
          };
        }),
      };
    });

    assert.equal(stress.tabCount, 14);
    assert.ok(stress.visibleCount < 14, 'the overflow window hides tabs beyond the floor');
    assert.ok(stress.activeWidth !== null);
    assert.ok(
      stress.activeWidth >= 169.5 && stress.activeWidth <= 220.5,
      `the active tab stays between 170 and 220 px (${stress.activeWidth})`,
    );
    assert.ok(
      stress.activeLeft !== null &&
        stress.listLeft !== null &&
        stress.activeLeft >= stress.listLeft - 0.5 &&
        stress.activeRight !== null &&
        stress.listRight !== null &&
        stress.activeRight <= stress.listRight + 0.5,
      'the active tab is fully visible in the window',
    );
    const inactive = stress.widths.filter((_, index) => index !== stress.activeIndex);
    assert.ok(
      inactive.length > 0 && inactive.every((width) => width >= 79.5 && width <= 220.5),
      `inactive tabs stay between the 80 px floor and 220 px (${inactive.join(', ')})`,
    );
    assert.ok(
      inactive.every((width) => stress.activeWidth > width),
      'the active tab is wider than every inactive tab',
    );
    assert.ok(
      stress.closeSizes.every(
        (size) => size.close === 20 && size.closeHeight === 20 && size.icon === 12,
      ),
      'tab close controls never shrink',
    );
    assert.equal(stress.overflowX, 'hidden', 'the tablist never scrolls horizontally');
    assert.equal(stress.plusVisible, true, 'the + stays visible');
    assert.equal(stress.plusAfterLast, true, 'the + follows the last visible tab');
    assert.ok(stress.pageScroll <= stress.innerWidth, 'the shell never scrolls horizontally');

    // The overflow menu still lists every open tab.
    await page.locator('.nf-tab-actions [aria-label="All open tabs"]').click();
    await page.waitForSelector('.nf-menu');
    const menuText = await page.locator('.nf-menu').innerText();
    const menuUntitled = menuText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line === 'Untitled').length;
    assert.ok(
      menuUntitled >= 13,
      `the overflow menu lists the hidden Untitled tabs (${menuUntitled})`,
    );

    // Activate the first tab, which the window hid at 14 tabs.
    await page.getByRole('menuitem', { name: 'Linear algebra', exact: true }).click();
    await page.waitForSelector('.nf-menu', { state: 'detached' });
    await page.waitForFunction(() => {
      const active = document.querySelector('.nf-tab[data-active="true"]');
      return active?.textContent?.includes('Linear algebra') ?? false;
    });
    const afterActivation = await page.evaluate(() => {
      const tab = document.querySelector('.nf-tab[data-active="true"]');
      const list = document.querySelector('.nf-tablist');
      if (tab === null || list === null) return null;
      const tabBox = tab.getBoundingClientRect();
      const listBox = list.getBoundingClientRect();
      return {
        width: tabBox.width,
        left: tabBox.left,
        right: tabBox.right,
        listLeft: listBox.left,
        listRight: listBox.right,
      };
    });
    assert.ok(afterActivation !== null);
    assert.ok(
      afterActivation.left >= afterActivation.listLeft - 0.5 &&
        afterActivation.right <= afterActivation.listRight + 0.5,
      'the newly active tab is always brought into view',
    );
    assert.ok(
      afterActivation.width >= 169.5 && afterActivation.width <= 220.5,
      'the newly active tab expands',
    );
  });

  it('starts the Continuous chapter title at the 8 px lateral inset', async () => {
    await launch('batch-v-canvas');
    await ui.seedDemo();
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-chapter-title');

    const measure = async () =>
      page.evaluate(() => {
        const canvas = document.querySelector('.nf-editor[data-active="true"] .nf-canvas');
        const title = canvas?.querySelector('.nf-chapter-title');
        const card = canvas?.querySelector('[data-block-card]');
        if (canvas === null || title === null || card === null) return null;
        const canvasBox = canvas.getBoundingClientRect();
        return {
          paddingLeft: getComputedStyle(canvas).paddingLeft,
          titleMarginLeft: getComputedStyle(title).marginLeft,
          titleInset: title.getBoundingClientRect().left - canvasBox.left,
          cardInset: card.getBoundingClientRect().left - canvasBox.left,
        };
      });

    const wide = await measure();
    assert.ok(wide !== null);
    assert.equal(wide.paddingLeft, '8px');
    assert.equal(wide.titleMarginLeft, '0px');
    assert.ok(
      Math.abs(wide.titleInset - 8) <= 0.5,
      `the chapter title starts at an 8 px inset (${wide.titleInset})`,
    );
    assert.ok(
      Math.abs(wide.cardInset - 8) <= 0.5,
      `the cards share the same canvas inset (${wide.cardInset})`,
    );
    await page.screenshot({ path: join(screenshotDir, 'canvas-chapter-inset.png') });

    // The medium step keeps 8 px; the compact step drops to 6 px.
    await h.setWindowSize(1050, 800);
    await page.waitForFunction(() => window.innerWidth <= 1100, undefined, {
      timeout: 5000,
    });
    const medium = await measure();
    assert.ok(medium !== null);
    assert.equal(medium.paddingLeft, '8px');
    assert.ok(Math.abs(medium.titleInset - 8) <= 0.5);

    await page.setViewportSize({ width: 880, height: 800 });
    await page.waitForFunction(() => window.innerWidth <= 900, undefined, {
      timeout: 5000,
    });
    const compact = await measure();
    assert.ok(compact !== null);
    assert.equal(compact.paddingLeft, '6px');
    assert.ok(
      Math.abs(compact.titleInset - 6) <= 0.5,
      `the compact step keeps the title at 6 px (${compact.titleInset})`,
    );
  });
});
