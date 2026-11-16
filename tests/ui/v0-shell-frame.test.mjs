import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { addAnchor, addBranch, addTopLevelBlock, textDoc } from '../support/fixtures.mjs';

/**
 * V0 visual shell (browser-lab port): a 30 px TitleBar (traffic lights + app
 * name), a 44 px Toolbar inside the main column (tabs start after the Sidebar),
 * a persistent Sidebar panel that collapses to a 48 px rail, floating rounded
 * panels with 8 px gaps, a floating 24 px StatusStrip, and a softened
 * PageToolbar container.
 *
 * The suite proves behavior, not only structure: tabs start after the sidebar
 * and shift with the rail, the rail expands and opens Settings, the footer
 * Settings button is a button inside a container, the Library has an icon-only
 * `+`, and the layout-aware zoom still targets the active layout.
 */

const tempRoot = artifactsPath('v0-shell-visual-ui');
const screenshotDir = artifactsPath('v0-shell-visual');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

async function launch(name) {
  page = await ui.launch(ui.isolated(name));
  await h.setWindowSize(1440, 900);
}

async function viewState(packagePath) {
  return page.evaluate(
    (path) => window.__noteforestTest.viewState()[path] ?? null,
    packagePath,
  );
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

async function iconCenter(selector) {
  return page.locator(selector).first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      w: rect.width,
      h: rect.height,
    };
  });
}

async function css(selector, property) {
  return page.locator(selector).first().evaluate((element, name) => {
    return getComputedStyle(element).getPropertyValue(name);
  }, property);
}

function assertGap(gap, label) {
  assert.ok(
    gap >= 7.5 && gap <= 9,
    `${label}: 8 px floating gap (got ${gap})`,
  );
}

async function waitZoomLabel(expectation) {
  await page.waitForFunction(
    (expected) => document.querySelector('[data-zoom-value]')?.textContent?.trim() === expected,
    expectation,
    { timeout: 10000 },
  );
}

async function waitRail() {
  await page.waitForFunction(
    () => {
      const rail = document.querySelector('.nf-sidebar-rail');
      return rail !== null && Math.abs(rail.getBoundingClientRect().width - 48) < 1;
    },
    undefined,
    { timeout: 10000 },
  );
}

async function waitExpandedSidebar() {
  await page.waitForFunction(
    () => {
      const sidebar = document.querySelector('.nf-sidebar:not(.nf-sidebar-rail)');
      return sidebar !== null && sidebar.getBoundingClientRect().width > 200;
    },
    undefined,
    { timeout: 10000 },
  );
}

async function showPage() {
  await page.keyboard.press('Meta+3');
  await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view');
  await page.waitForFunction(
    () => {
      const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
      return view !== null && view.getAttribute('data-ready') === 'true';
    },
    undefined,
    { timeout: 30000 },
  );
}

async function showContinuous() {
  await page.keyboard.press('Meta+2');
  await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view', { state: 'detached' });
  await page.waitForFunction(
    () => document.querySelector('.nf-editor[data-active="true"] .nf-prosemirror') !== null,
    undefined,
    { timeout: 10000 },
  );
}

describe('V0 visual shell', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
    await rm(screenshotDir, { recursive: true, force: true });
    await mkdir(screenshotDir, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('splits a 30 px TitleBar from a 44 px Toolbar whose tabs start after the sidebar', async () => {
    await launch('shell-bar');
    await ui.seedDemo();

    // TitleBar: traffic-light/app-name strip only.
    assert.equal(await page.locator('.nf-titlebar').count(), 1, 'one TitleBar');
    assert.equal(
      await page.locator('.nf-app > .nf-titlebar').count(),
      1,
      'the TitleBar is the first shell region',
    );
    const titlebar = await box('.nf-titlebar');
    assert.equal(titlebar.height, 30, 'TitleBar is 30 px');
    assert.equal((await page.locator('.nf-titlebar').innerText()).trim(), 'NoteForest');
    // The native traffic-light inset and row height are unchanged; only the
    // label's optical center moves (line-height 1 + 0.5 px).
    assert.equal(
      await css('.nf-titlebar', 'padding-left'),
      '84px',
      'the native traffic-light inset is unchanged',
    );
    assert.equal(await css('.nf-app-name', 'line-height'), '11px', 'line-height is 1');
    assert.equal(
      await css('.nf-app-name', 'transform'),
      'matrix(1, 0, 0, 1, 0, 0.5)',
      'the label carries the 0.5 px optical offset',
    );
    const appName = await box('.nf-app-name');
    assert.ok(
      Math.abs(appName.top + appName.height / 2 - (titlebar.top + 15.5)) <= 0.6,
      `the label centers on the traffic lights' visual center (${appName.top + appName.height / 2})`,
    );

    assert.equal(
      await page.locator('.nf-titlebar [role="tablist"]').count(),
      0,
      'tabs are not in the TitleBar',
    );
    assert.equal(
      await page.locator('.nf-titlebar button').count(),
      0,
      'no Settings gear or sidebar reveal in the TitleBar',
    );
    assert.equal(await page.locator('[data-sidebar-reveal="true"]').count(), 0);

    // Toolbar: the main-column rail with tabs, new, view controls, palette.
    assert.equal(await page.locator('.nf-toolbar').count(), 1, 'one Toolbar');
    assert.equal(
      await page.locator('.nf-app > .nf-toolbar').count(),
      0,
      'the Toolbar is not a full-width shell row',
    );
    assert.equal(
      await page.locator('.nf-main-column > .nf-toolbar').count(),
      1,
      'the Toolbar lives in the main column',
    );
    const toolbar = await box('.nf-toolbar');
    assert.equal(toolbar.height, 44, 'Toolbar is 44 px');
    assert.ok(toolbar.top >= titlebar.bottom, 'the Toolbar starts below the TitleBar');
    assert.equal(await page.locator('.nf-toolbar [role="tablist"]').count(), 1);
    assert.equal(await page.locator('.nf-toolbar [data-view-controls="true"]').count(), 0);
    assert.equal(await page.locator('.nf-canvas-panel [data-canvas-header="true"]').count(), 1);
    assert.equal(
      await page.locator('.nf-canvas-panel [data-canvas-header="true"] [data-view-controls="true"]').count(),
      1,
    );
    assert.equal(await page.locator('.nf-toolbar [data-toolbar-new="true"]').count(), 1);
    assert.equal(await page.locator('.nf-toolbar [aria-label="Command palette"]').count(), 1);
    assert.equal(await page.locator('.nf-toolbar [aria-label="Settings"]').count(), 0);

    // Tabs start after the sidebar, not over it.
    const sidebar = await box('.nf-sidebar');
    const tablist = await box('.nf-tablist');
    assertGap(toolbar.left - sidebar.right, 'toolbar after sidebar');
    assert.ok(
      tablist.left > sidebar.right,
      `tabs start after the sidebar (${tablist.left} > ${sidebar.right})`,
    );

    // Tabs are rounded chips with a 4 px gap and no vertical separator rules.
    const chip = await page
      .locator('.nf-tab')
      .first()
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          active: element.getAttribute('data-active'),
          height: element.getBoundingClientRect().height,
          radius: style.borderTopLeftRadius,
          borderWidth: style.borderTopWidth,
          borderColor: style.borderTopColor,
        };
      });
    assert.equal(chip.active, 'true');
    assert.equal(chip.height, 34, 'tab chips are 34 px high');
    assert.equal(chip.radius, '7px', 'tab chips are 7 px rounded');
    assert.equal(chip.borderWidth, '1px');
    assert.notEqual(chip.borderColor, 'rgba(0, 0, 0, 0)', 'the active chip has a visible border');
    assert.equal(await css('.nf-tablist', 'column-gap'), '4px');

    // Sidebar header: search only. The activity bar owns collapse (S1) and the
    // one New note control lives in the Library header (LD-02).
    assert.equal(await page.locator('.nf-sidebar-search').count(), 1);
    assert.equal(
      await page.locator('.nf-sidebar-head [aria-label="New note"]').count(),
      0,
      'the global header + is gone',
    );
    assert.equal(
      await page.locator('.nf-sidebar-head [aria-label="Collapse sidebar"]').count(),
      0,
      'the header no longer owns collapse',
    );

    // Activity bar (S1): a 48 px leading column, not a header strip.
    assert.equal(await page.locator('[data-activity-bar="true"]').count(), 1);
    const barBox = await box('[data-activity-bar="true"]');
    const expandedCard = await box('.nf-sidebar');
    assert.ok(Math.abs(barBox.width - 48) < 1, `the bar is 48 px (got ${barBox.width})`);
    assert.ok(
      Math.abs(barBox.left - expandedCard.left) < 2,
      'the bar is the card leading column',
    );
    const expandedFooter = await box('[data-sidebar-foot="true"]');
    assert.ok(
      Math.abs(barBox.height + expandedFooter.height - expandedCard.height) <= 2,
      'the bar and the full-width footer fill the card height',
    );
    assert.ok(
      Math.abs(expandedFooter.width - expandedCard.width) <= 2,
      'the footer spans the whole card, not the 48 px bar',
    );
    assert.equal(
      await page.locator('.nf-sidebar-tabs, .nf-sidebar-tab').count(),
      0,
      'the Library/Outline segmented control is gone',
    );
    assert.equal(
      await page.locator('[data-sidebar-tabs]').getAttribute('role'),
      'tablist',
    );
    assert.equal(
      await page.locator('[data-sidebar-tabs]').getAttribute('aria-orientation'),
      'vertical',
      'the section tablist is vertical',
    );
    assert.equal(await page.locator('[data-sidebar-tabs] [role="tab"]').count(), 4);
    const sectionIcons = {};
    for (const [id, label] of [
      ['library', 'Library'],
      ['outline', 'Outline'],
      ['health', 'Health'],
      ['search', 'Search'],
    ]) {
      const button = page.locator(`[data-sidebar-tab="${id}"]`);
      assert.equal(await button.getAttribute('aria-label'), label);
      assert.equal(await button.getAttribute('title'), label);
      const buttonBox = await box(`[data-sidebar-tab="${id}"]`);
      assert.equal(buttonBox.width, 28, `${label} is a 28 px button`);
      assert.equal(buttonBox.height, 28, `${label} is a 28 px button`);
      const icon = await button.locator('svg').evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
      assert.ok(Math.abs(icon.width - 17) <= 0.5, `${label} icon is 17 px`);
      assert.ok(Math.abs(icon.height - 17) <= 0.5, `${label} icon is 17 px`);
      sectionIcons[id] = buttonBox;
    }
    assert.equal(
      Math.abs(sectionIcons.library?.left - sectionIcons.outline?.left) < 1,
      true,
      'the sections share one column',
    );
    assert.ok(
      (sectionIcons.outline?.top ?? 0) > (sectionIcons.library?.top ?? 0),
      'the sections stack vertically',
    );

    // Health is the third section tab (S2) and Search the fourth (find
    // surface v2): both stack in the same column, and Health carries the
    // needs-repair badge only at non-zero.
    assert.equal(
      await page.locator('[data-sidebar-tab="health"]').getAttribute('role'),
      'tab',
    );
    const healthBox = await box('[data-sidebar-tab="health"]');
    assert.ok(healthBox.top > (sectionIcons.outline?.top ?? 0), 'Health sits below the sections');
    assert.equal(await page.locator('[data-health-badge]').count(), 0, 'badge hidden at zero');
    const searchBox = await box('[data-sidebar-tab="search"]');
    assert.ok(searchBox.top > healthBox.top, 'Search sits below Health');
    assert.equal(Math.abs(searchBox.left - healthBox.left) < 1, true, 'Search shares the column');

    // Library header: active library name, count, and the one New note `+`.
    const libraryHead = page.locator(
      '.nf-sidebar-section[aria-label="Library"] .nf-library-head',
    );
    const libraryText = await libraryHead.innerText();
    assert.ok((await libraryHead.locator('[data-library-name]').innerText()).length > 0);
    assert.match(libraryText, /\d+/, 'the Library count is visible');
    const libraryAdd = libraryHead.locator('[data-library-new="true"]');
    assert.equal(await libraryAdd.count(), 1);
    assert.equal(await libraryAdd.getAttribute('aria-label'), 'New note');
    assert.equal((await libraryAdd.innerText()).trim(), '', 'the Library + is icon-only');
    assert.equal(
      await page.locator('.nf-sidebar-section[aria-label="Library"] [data-library-new="true"]').count(),
      1,
      'the Library header has the only New note control in the sidebar',
    );
    const tabsBefore = await page.evaluate(() => window.__noteforestTest.state().tabs.length);
    await libraryAdd.click();
    await page.waitForFunction(
      (count) => window.__noteforestTest.state().tabs.length === count + 1,
      tabsBefore,
      { timeout: 10000 },
    );
    const openedByLibrary = await page.evaluate(
      () => window.__noteforestTest.state().tabs.at(-1)?.packagePath ?? null,
    );
    assert.ok(openedByLibrary !== null, 'the Library + opens a note');
    await page.keyboard.press('Meta+1');
    await page.waitForFunction(
      () => window.__noteforestTest.state().tabs[0]?.packagePath === window.__noteforestTest.state().activeTab,
      undefined,
      { timeout: 10000 },
    );

    // The expanded card restores the full-width Settings footer (S2 Part A):
    // one gear + label behind a 1 px divider, and no bar foot group.
    assert.equal(await page.locator('[data-activity-foot="true"]').count(), 0, 'no bar foot expanded');
    const settings = page.locator('[data-sidebar-settings="true"]');
    assert.equal(await settings.count(), 1);
    assert.equal(await settings.getAttribute('aria-label'), 'Settings');
    assert.equal((await settings.innerText()).trim(), 'Settings', 'gear + label');
    assert.equal(
      await page.getByRole('button', { name: 'Settings', exact: true }).count(),
      1,
      'one visible Settings entry in the expanded shell',
    );
    const footBox = await box('[data-sidebar-foot="true"]');
    assert.equal(
      await page
        .locator('[data-sidebar-foot="true"]')
        .evaluate((element) => getComputedStyle(element).borderTopWidth),
      '1px',
      'the Settings divider is visible expanded',
    );
    assert.ok(Math.abs(footBox.width - expandedCard.width) <= 2, `the divider spans the card (${footBox.width})`);
    const footerGear = await iconCenter('[data-sidebar-settings="true"] svg');
    assert.ok(footerGear.y > footBox.top, 'the gear sits below the divider');
    assert.equal(footerGear.w, 17, 'the footer gear keeps the 17 px icon');
    const cardBox = await box('.nf-sidebar');
    assert.ok(
      cardBox.bottom - footBox.bottom <= 14,
      `the footer closes the card (${cardBox.bottom - footBox.bottom} px from the bottom)`,
    );
    await settings.click();
    await page.waitForSelector('[data-settings-dialog="true"]');
    assert.equal(await page.locator('.nf-settings-heading').innerText(), 'Settings');
    await page.getByRole('button', { name: 'Done' }).click();
    await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
    await page.waitForFunction(
      () => document.activeElement?.classList.contains('nf-sidebar-settings') === true,
      undefined,
      { timeout: 5000 },
    );

    // The static Graphite label stays gone; the palette still reaches Settings.
    const chromeText = await page.evaluate(() =>
      [
        document.querySelector('.nf-titlebar')?.textContent ?? '',
        document.querySelector('.nf-toolbar')?.textContent ?? '',
        document.querySelector('.nf-sidebar')?.textContent ?? '',
        document.querySelector('.nf-statusbar')?.textContent ?? '',
      ].join('\n'),
    );
    assert.doesNotMatch(chromeText, /Graphite/);
    await page.locator('.nf-sidebar-search').click();
    await page.waitForSelector('.nf-palette');
    assert.equal(
      await page.getByRole('option', { name: /Settings/ }).count() > 0,
      true,
      'the palette still reaches Settings',
    );
    await page.keyboard.press('Escape');
    await page.waitForSelector('.nf-palette', { state: 'detached' });

    // Rename/Reveal stay reachable from the tab context menu.
    await page.locator('.nf-tab[data-active="true"]').click({ button: 'right' });
    await page.locator('.nf-menu').waitFor();
    assert.equal(
      await page.getByRole('menuitem', { name: 'Rename document…' }).count(),
      1,
    );
    assert.equal(
      await page.getByRole('menuitem', { name: 'Reveal in Finder' }).count(),
      1,
    );
    await page.getByRole('menuitem', { name: 'Rename document…' }).click();
    await page.waitForSelector('.nf-dialog');
    assert.equal(await page.locator('.nf-dialog-title').innerText(), 'Rename document');
    // One labelled title, one header X (the same action as Cancel/Esc), the
    // 480 frame, and the field receives focus in a single-field dialog.
    assert.equal(await page.locator('.nf-dialog h2').count(), 1);
    const labelledBy = await page.locator('.nf-dialog').getAttribute('aria-labelledby');
    assert.equal(
      await page.locator(`#${labelledBy}`).innerText(),
      'Rename document',
      'the title is the accessible name',
    );
    assert.equal(await page.locator('.nf-dialog').getAttribute('aria-label'), null);
    const close = page.locator('.nf-dialog-close');
    assert.equal(await close.getAttribute('aria-label'), 'Close');
    assert.equal(await close.getAttribute('title'), 'Close (Esc)');
    assert.equal(
      Math.round(await page.locator('.nf-dialog-modal').evaluate((element) => element.getBoundingClientRect().width)),
      480,
      'the default frame is 480 px',
    );
    assert.deepEqual(
      await page.locator('.nf-dialog-actions button').allInnerTexts(),
      ['Cancel', 'Save'],
      'secondary then primary',
    );
    await page.waitForFunction(
      () => document.activeElement?.classList.contains('nf-input') === true,
      undefined,
      { timeout: 5000 },
    );
    await close.click();
    await page.waitForSelector('.nf-dialog', { state: 'detached' });
    const afterClose = await page.evaluate(() => document.activeElement?.outerHTML ?? null);
    assert.match(
      afterClose ?? '',
      /nf-tab/,
      `focus returns to the tab that opened the menu (${afterClose})`,
    );

    await h.screenshot(resolve(screenshotDir, 'expanded-shell-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // 2x titlebar evidence. `scale: 'device'` captures at the device pixel
    // ratio (2 on a Retina Mac), so the 30 px row lands as a 1440 x 60 image.
    // Page screenshots cannot capture the native traffic lights (macOS draws
    // them outside the web contents); the JSON records the native placement the
    // label is aligned to.
    const finalTitlebar = await box('.nf-titlebar');
    const finalAppName = await box('.nf-app-name');
    const devicePixelRatio = await page.evaluate(() => window.devicePixelRatio);
    await page.locator('.nf-titlebar').screenshot({
      path: join(screenshotDir, 'titlebar-alignment-2x.png'),
      scale: 'device',
    });
    await writeFile(
      join(screenshotDir, 'titlebar-alignment.json'),
      JSON.stringify(
        {
          devicePixelRatio,
          screenshotScale: devicePixelRatio >= 2 ? 2 : 1,
          titlebarHeight: finalTitlebar.height,
          nativeTrafficLightInsetPx: 84,
          trafficLightPosition: { x: 16, y: 9 },
          labelLineHeight: await css('.nf-app-name', 'line-height'),
          labelTransform: await css('.nf-app-name', 'transform'),
          labelCenterPx: finalAppName.top + finalAppName.height / 2,
          titlebarCenterPx: finalTitlebar.top + finalTitlebar.height / 2,
          screenshot: 'titlebar-alignment-2x.png',
        },
        null,
        2,
      ),
      'utf8',
    );
  });

  it('keeps the sidebar as a persistent 48 px rail with expand and Settings', async () => {
    const env = ui.isolated('rail');
    page = await ui.launch(env);
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();
    const packagePath = (await h.state()).activeTab;

    assert.equal(await page.locator('.nf-sidebar-panel').count(), 1);
    assert.equal(await page.locator('#nf-sidebar').count(), 1);
    const expandedToolbar = await box('.nf-toolbar');
    const expandedTabs = await box('.nf-tablist');

    // The resizable panel keeps working and the dragged width persists.
    const initialWidth = (await box('.nf-sidebar')).width;
    const separator = await box('.nf-separator');
    await page.mouse.move(separator.left + 4, separator.top + 120);
    await page.mouse.down();
    await page.mouse.move(separator.left + separator.width + 72, separator.top + 120, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(
      (width) => {
        const sidebar = document.querySelector('.nf-sidebar');
        return sidebar !== null && sidebar.getBoundingClientRect().width > width + 4;
      },
      initialWidth,
      { timeout: 10000 },
    );
    const widenedWidth = (await box('.nf-sidebar')).width;
    assert.ok(widenedWidth > initialWidth, `dragging widens the sidebar (${widenedWidth} > ${initialWidth})`);

    const iconCenter = async (selector) =>
      page.locator(selector).first().evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          w: rect.width,
          h: rect.height,
        };
      });
    const expandedToggleIcon = await iconCenter('[data-sidebar-toggle="true"] svg');
    const expandedSettingsIcon = await iconCenter('[data-sidebar-settings="true"] svg');
    const expandedSectionIcon = await iconCenter('[data-sidebar-tab="library"] svg');
    const expandedBarBox = await box('[data-activity-bar="true"]');

    await page.locator('[aria-label="Collapse sidebar"]').click();
    await waitRail();

    assert.equal(
      await page.locator('.nf-sidebar-panel').count(),
      1,
      'the sidebar column stays mounted as a rail',
    );
    assert.equal(await page.locator('#nf-sidebar').count(), 1);
    assert.equal(
      await page.locator('.nf-sidebar-search').count(),
      0,
      'the expanded sidebar content is replaced',
    );
    const rail = await box('.nf-sidebar');
    assert.ok(Math.abs(rail.width - 48) < 1, `the rail is 48 px (got ${rail.width})`);

    // The bar never hides: the same buttons, the same column.
    assert.equal(await page.locator('[data-activity-bar="true"]').count(), 1);
    assert.equal(await page.locator('[data-sidebar-tabs] [role="tab"]').count(), 4);
    const expand = page.locator('[data-sidebar-expand="true"]');
    const railSettings = page.locator('[data-activity-settings="true"]');
    const railHealth = page.locator('[data-sidebar-tab="health"]');
    await expand.waitFor();
    await railSettings.waitFor();
    assert.equal(await expand.getAttribute('aria-label'), 'Expand sidebar');
    assert.equal(await expand.getAttribute('aria-expanded'), 'false');
    assert.equal(await expand.getAttribute('aria-controls'), 'nf-sidebar');
    assert.equal(await railSettings.getAttribute('aria-label'), 'Settings');
    await railHealth.waitFor();
    const expandBox = await box('[data-sidebar-expand="true"]');
    const settingsBox = await box('[data-activity-settings="true"]');
    assert.ok(expandBox.top < settingsBox.top, 'expand at the top, Settings at the bottom');
    assert.ok(expandBox.top - rail.top < 32, 'expand sits at the top of the bar');
    assert.ok(rail.bottom - settingsBox.bottom < 24, 'Settings sits at the bottom of the bar');
    assert.equal(
      await page.locator('[data-sidebar-reveal="true"]').count(),
      0,
      'no titlebar reveal',
    );
    assert.equal(await page.locator('.nf-titlebar button').count(), 0);

    // Collapsed: the same 1 px divider above Settings, spanning the bar.
    const railFoot = await box('[data-activity-foot="true"]');
    assert.equal(
      await page
        .locator('[data-activity-foot="true"]')
        .evaluate((element) => getComputedStyle(element).borderTopWidth),
      '1px',
      'the Settings divider is visible collapsed',
    );
    assert.ok(Math.abs(railFoot.width - 48) < 1, `the collapsed divider spans the bar (${railFoot.width})`);
    assert.ok(railFoot.top > (await box('[data-sidebar-tab="health"]')).bottom - 1);
    assert.ok(railFoot.bottom <= rail.bottom);

    // No shift: the chevron, the three sections and the gear keep their centres and
    // their 17 px icons across the rail transition.
    const railToggleIcon = await iconCenter('[data-sidebar-toggle="true"] svg');
    const railSettingsIcon = await iconCenter('[data-activity-settings="true"] svg');
    const railSectionIcon = await iconCenter('[data-sidebar-tab="library"] svg');
    const railBarBox = await box('[data-activity-bar="true"]');
    assert.ok(
      Math.abs(expandedBarBox.left - railBarBox.left) < 0.5,
      'the bar itself does not move',
    );
    assert.equal(railBarBox.width, 48, 'the collapsed bar is 48 px');
    for (const [name, expanded, railIcon] of [
      ['collapse/expand', expandedToggleIcon, railToggleIcon],
      ['Settings', expandedSettingsIcon, railSettingsIcon],
      ['Library section', expandedSectionIcon, railSectionIcon],
    ]) {
      assert.ok(
        Math.abs(expanded.x - railIcon.x) <= 0.5 && Math.abs(expanded.y - railIcon.y) <= 0.5,
        `${name} icon center is stable (${expanded.x},${expanded.y} -> ${railIcon.x},${railIcon.y})`,
      );
      assert.equal(expanded.w, 17, `${name} icon keeps its 17 px width`);
      assert.equal(expanded.h, 17, `${name} icon keeps its 17 px height`);
      assert.equal(railIcon.w, 17, `${name} rail icon is 17 px wide`);
      assert.equal(railIcon.h, 17, `${name} rail icon is 17 px tall`);
    }

    // The Toolbar shifts to the rail edge; the tabs follow it.
    const railToolbar = await box('.nf-toolbar');
    const railTabs = await box('.nf-tablist');
    assert.ok(
      railToolbar.left < expandedToolbar.left - 100,
      `the toolbar shifts left with the rail (${railToolbar.left} < ${expandedToolbar.left})`,
    );
    assert.ok(
      railTabs.left < expandedTabs.left - 100,
      `the tabs shift left with the rail (${railTabs.left} < ${expandedTabs.left})`,
    );
    assert.ok(railTabs.left >= rail.right, 'tabs start at the rail edge');
    assertGap(railToolbar.left - rail.right, 'toolbar after the rail');

    await h.screenshot(resolve(screenshotDir, 'collapsed-rail-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // Rail Settings opens the same dialog.
    await railSettings.click();
    await page.waitForSelector('[data-settings-dialog="true"]');
    assert.equal(await page.locator('.nf-settings-heading').innerText(), 'Settings');
    await page.getByRole('button', { name: 'Done' }).click();
    await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });

    // Expand restores the panel. The keyboard and the rail/header buttons
    // alternate so the shell menu-command dedupe never sees two presses of the
    // same command inside its 120 ms window.
    await expand.click();
    await waitExpandedSidebar();
    assert.equal((await h.state()).activeTab, packagePath, 'sidebar toggles never change the document');
    await page.keyboard.press('Meta+\\');
    await waitRail();
    await page.locator('[data-sidebar-expand="true"]').click();
    await waitExpandedSidebar();
    await page.locator('[aria-label="Collapse sidebar"]').click();
    await waitRail();
    // Typing with the rail collapsed proves the editor stays mounted across a
    // collapse; the autosave round trip also separates the two keyboard toggles
    // past the shell's 120 ms same-command dedupe window.
    await page.locator('.nf-editor[data-active="true"] .nf-prosemirror').click();
    await page.keyboard.type('x');
    await h.waitSaved();
    await page.keyboard.press('Meta+\\');
    await waitExpandedSidebar();
    assert.equal((await h.state()).sidebarCollapsed, false, '⌘\\ expands the rail');

    // Collapsed state persists across a relaunch.
    await page.locator('[aria-label="Collapse sidebar"]').click();
    await waitRail();
    await h.flushSession();
    await h.quit();
    page = await ui.launch(env);
    await h.setWindowSize(1440, 900);
    await page.waitForFunction(
      () => window.__noteforestTest.state().sidebarCollapsed === true,
      undefined,
      { timeout: 10000 },
    );
    await waitRail();
    assert.equal(await page.locator('[data-sidebar-expand="true"]').count(), 1);
    await page.locator('[data-sidebar-expand="true"]').click();
    await waitExpandedSidebar();
    assert.equal((await h.state()).sidebarCollapsed, false);
    const restoredWidth = (await box('.nf-sidebar')).width;
    assert.ok(
      Math.abs(restoredWidth - widenedWidth) < 2,
      `the dragged sidebar width persists (${restoredWidth} vs ${widenedWidth})`,
    );
  });

  it('renders floating rounded panels, a floating status strip, and rounded note cards', async () => {
    await launch('floating');
    await ui.seedDemo();

    const sidebar = await box('.nf-sidebar');
    const toolbar = await box('.nf-toolbar');
    const canvas = await box('.nf-canvas-panel');
    const status = await box('.nf-statusbar');

    for (const [selector, label] of [
      ['.nf-sidebar', 'sidebar'],
      ['.nf-toolbar', 'toolbar'],
      ['.nf-canvas-panel', 'canvas'],
    ]) {
      assert.equal(await css(selector, 'border-top-width'), '1px', `${label} border`);
      assert.equal(await css(selector, 'border-top-left-radius'), '8px', `${label} radius`);
    }
    assertGap(toolbar.left - sidebar.right, 'toolbar after sidebar');
    assertGap(canvas.top - toolbar.bottom, 'canvas after toolbar');
    assertGap(sidebar.left, 'body left inset');
    assert.ok(sidebar.top > 30, 'the body sits below the 30 px TitleBar');

    // StatusStrip is floating (8 px inset), not a full-bleed border-top row.
    assert.equal(status.height, 24, 'StatusStrip is 24 px');
    assert.equal(await css('.nf-statusbar', 'border-top-left-radius'), '6px');
    assert.equal(await css('.nf-statusbar', 'border-top-width'), '1px');
    assert.equal(await css('.nf-statusbar', 'border-bottom-width'), '1px');
    assert.equal(await css('.nf-statusbar', 'border-right-width'), '1px');
    assert.ok(status.left >= 7.5, `status strip is inset on the left (${status.left})`);
    const viewport = await page.evaluate(() => window.innerWidth);
    assert.ok(
      viewport - status.right >= 7.5 && viewport - status.right <= 9,
      `status strip is inset on the right (${viewport - status.right})`,
    );
    assertGap(status.top - canvas.bottom, 'status after canvas');

    // Continuous note-card surfaces are rounded (9 px); Page cards keep 4 px.
    const cardRadius = await page
      .locator('.nf-editor[data-active="true"] .nf-block-body')
      .first()
      .evaluate((element) => getComputedStyle(element).borderTopLeftRadius);
    assert.equal(cardRadius, '9px', 'Continuous note cards are 9 px rounded');

    // Narrowing the window collapses to the rail, not a full-width panel.
    await h.setWindowSize(960, 768);
    await page.waitForFunction(() => window.innerWidth <= 1000, undefined, { timeout: 5000 });
    const narrow = await page.evaluate(() => {
      const toolbarElement = document.querySelector('.nf-toolbar')?.getBoundingClientRect();
      return {
        toolbarHeight: toolbarElement?.height ?? 0,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      };
    });
    assert.equal(narrow.toolbarHeight, 44, 'the Toolbar keeps one 44 px rail');
    assert.ok(
      narrow.scrollWidth <= narrow.innerWidth,
      `no page-level horizontal scroll (${narrow.scrollWidth} <= ${narrow.innerWidth})`,
    );
  });

  it('keeps the StatusStrip status-only and the PageToolbar a softened nav + Export bar', async () => {
    await launch('status-page');
    await ui.seedDemo();

    const status = page.locator('.nf-statusbar');
    assert.equal(await status.count(), 1, 'one status strip');
    const save = status.locator('[role="status"]');
    assert.equal(await save.getAttribute('aria-live'), 'polite');
    assert.equal(await save.getAttribute('aria-atomic'), 'true');
    assert.equal(await save.getAttribute('data-save-state'), 'saved');
    assert.equal((await save.innerText()).trim(), 'Saved');
    const statusText = await status.innerText();
    assert.match(statusText, /\d+ words/);
    assert.match(statusText, /\d+ blocks/);
    assert.doesNotMatch(statusText, /Dark/, 'the static Dark label is gone');
    assert.equal(await status.locator('[data-view-layout]').count(), 0, 'no layout buttons');
    assert.equal(await status.locator('[data-view-interaction]').count(), 0, 'no mode buttons');
    assert.equal(await status.locator('[data-zoom-value]').count(), 0, 'no zoom buttons');
    assert.equal(await status.locator('[data-status-focus]').count(), 0, 'no focus button');
    assert.equal(await status.locator('.nf-status-path').count(), 0, 'no document path link');
    assert.equal(await status.getByRole('button').count(), 0, 'status-only: no buttons yet');

    // Anchor health stays available when an anchor breaks.
    await addTopLevelBlock(ui, 'v0-health-source', textDoc('Alpha symmetric beta'));
    await addTopLevelBlock(ui, 'v0-health-target', textDoc('Anchor target'));
    await addAnchor(ui, {
      anchorId: 'v0-health-anchor',
      blockId: 'v0-health-source',
      kind: 'text',
      selector: { kind: 'text', quote: 'symmetric' },
      binding: { kind: 'text', ranges: [{ nodePath: [0, 0], start: 6, end: 15 }] },
    });
    await addBranch(ui, {
      branchId: 'v0-health-branch',
      sourceBlockId: 'v0-health-source',
      sourceAnchorId: 'v0-health-anchor',
      targetBlockId: 'v0-health-target',
    });
    await ui.applyCommand({
      type: 'block.editContent',
      blockId: 'v0-health-source',
      content: textDoc('Alpha beta'),
    });
    const health = page.locator('.nf-statusbar [data-anchor-health-chip]');
    await health.waitFor({ state: 'visible', timeout: 10000 });
    assert.match(await health.innerText(), /1 anchor needs repair/);
    assert.equal(await health.getAttribute('data-health-broken'), '1');
    await health.click();
    await page.waitForSelector(
      '[data-health-dialog="true"][data-health-row="anchor:v0-health-anchor"]',
    );
    assert.equal(
      await page.evaluate(() => window.__noteforestTest.state().sidebarTab),
      'health',
      'the status chip opens the Health section',
    );
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-health-dialog="true"]', { state: 'detached' });

    // Page: the shared fixed canvas header owns page navigation and Export.
    await showPage();
    const canvas = page.locator('.nf-canvas-panel');
    const header = canvas.locator('[data-canvas-header="true"]');
    await header.waitFor();
    assert.equal(await page.locator('.nf-page-toolbar').count(), 0, 'the old PageToolbar is gone');
    assert.equal(await header.locator('[data-header-undo="true"]').count(), 1);
    assert.equal(await header.locator('[data-header-redo="true"]').count(), 1);
    assert.equal(await header.locator('[data-page-nav="prev"]').count(), 1);
    assert.equal(await header.locator('[data-page-nav="next"]').count(), 1);
    assert.match(await header.locator('[data-page-counter]').innerText(), /Page 1 of \d+/);
    assert.equal(await header.locator('[data-page-export="true"]').count(), 1);
    assert.equal(await header.locator('[data-page-fit]').count(), 0, 'no page fit in the header');
    assert.equal(await header.locator('[data-page-zoom]').count(), 0, 'no page zoom in the header');
    assert.equal(
      await page.locator('.nf-page-view').getByRole('button', { name: 'Zoom in' }).count(),
      0,
      'the Page surface has no zoom buttons',
    );
    // Page card geometry is unchanged by the Continuous note radius.
    const pageCardRadius = await page
      .locator('.nf-page-card')
      .first()
      .evaluate((element) => getComputedStyle(element).borderTopLeftRadius);
    assert.equal(pageCardRadius, '4px', 'Page cards keep the shared 4 px radius');

    // The canvas header owns layout/mode in Page. A layout switch preserves
    // the current mode, so the pressed toggle is whichever mode is active.
    assert.equal(
      await page.locator('.nf-canvas-header [data-view-layout="page"]').getAttribute('aria-pressed'),
      'true',
    );
    const pageMode = await page.evaluate(() => {
      const state = window.__noteforestTest.state();
      return window.__noteforestTest.viewState()[state.activeTab]?.interactionMode ?? 'edit';
    });
    assert.equal(
      await page
        .locator(`.nf-canvas-header [data-view-interaction="${pageMode}"]`)
        .getAttribute('aria-pressed'),
      'true',
      'the header toggle reflects the active interaction mode',
    );
    await h.screenshot(resolve(screenshotDir, 'page-toolbar-1440x900.png'), {
      width: 1440,
      height: 900,
    });
    await showContinuous();
  });

  it('uses the accent as the resting Continuous edge and keeps selection readable', async () => {
    await launch('edges');
    await ui.seedDemo();

    // Clear the mount selection through the Page surface's Escape contract so
    // the idle screenshots start from nothing.
    await page.keyboard.press('Meta+3');
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view');
    await page.locator('.nf-page-view').click({ position: { x: 8, y: 8 } });
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () => {
        const current = window.__noteforestTest.state();
        const runtime = current.runtimes.find((item) => item.packagePath === current.activeTab);
        return runtime?.selectedBlockId === null;
      },
      undefined,
      { timeout: 5000 },
    );
    await page.keyboard.press('Meta+2');
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view', { state: 'detached' });
    await page.waitForSelector('.nf-edge-path', { state: 'attached' });

    const edgeColors = () =>
      page.evaluate(() => {
        const probe = document.createElement('div');
        document.body.appendChild(probe);
        const role = (name) => {
          probe.style.color = `var(${name})`;
          return getComputedStyle(probe).color;
        };
        const result = {
          accentStrong: role('--accent-strong'),
          reference: role('--edge-reference'),
          muted: role('--edge-muted'),
          resting: null,
        };
        probe.remove();
        const path = document.querySelector(
          '.nf-editor[data-active="true"] .nf-edge-path:not(.nf-edge-active):not(.nf-edge-muted)',
        );
        if (path !== null) result.resting = getComputedStyle(path).stroke;
        return result;
      });

    // The mount-time editor selection is not a user selection: the tree keeps
    // its resting accent edges instead of opening already muted.
    const mounted = await edgeColors();
    assert.equal(mounted.resting, mounted.accentStrong, 'mount keeps resting accent edges');
    assert.equal(await page.locator('.nf-edge-path.nf-edge-muted').count(), 0);

    const dark = await edgeColors();
    assert.equal(dark.resting, dark.accentStrong, 'no selection: resting primary edges use accent-strong');
    assert.notEqual(dark.resting, dark.reference, 'primary and reference edges stay distinct');
    await h.screenshot(resolve(screenshotDir, 'edges-dark-idle.png'), { width: 1440, height: 900 });

    async function waitRestingEdge() {
      await page.waitForFunction(
        () => {
          const probe = document.createElement('div');
          probe.style.color = 'var(--accent-strong)';
          document.body.appendChild(probe);
          const expected = getComputedStyle(probe).color;
          probe.remove();
          const path = document.querySelector(
            '.nf-editor[data-active="true"] .nf-edge-path:not(.nf-edge-active):not(.nf-edge-muted)',
          );
          return path !== null && getComputedStyle(path).stroke === expected;
        },
        undefined,
        { timeout: 5000 },
      );
    }

    async function setTheme(theme) {
      await page.keyboard.press('Meta+,');
      await page.waitForSelector('[data-settings-dialog="true"]');
      await page.locator('[data-settings-nav="appearance"]').click();
      await page.locator(`[data-appearance-theme-option="${theme}"]`).click();
      await page.waitForFunction(
        (expected) => document.documentElement.dataset.theme === expected,
        theme,
        { timeout: 10000 },
      );
      await page.getByRole('button', { name: 'Done' }).click();
      await page.waitForSelector('[data-settings-dialog="true"]', { state: 'detached' });
    }

    await setTheme('light');
    await waitRestingEdge();
    const light = await edgeColors();
    assert.equal(light.resting, light.accentStrong, 'light resting primary edges use accent-strong');
    await h.screenshot(resolve(screenshotDir, 'edges-light-idle.png'), { width: 1440, height: 900 });

    // A top-level selection mutes every branch (the top-level block is the
    // whole selected path) while the card ring marks the block.
    const topLevel = h.activeEditor().locator('[data-block-card][data-top-level="true"]').first();
    const topLevelId = await topLevel.getAttribute('data-block-card');
    await topLevel.locator('.nf-block-prose').click();
    await h.waitSelected(topLevelId);
    await page.waitForFunction(
      () => {
        const muted = [...document.querySelectorAll('.nf-edge-path.nf-edge-muted')];
        return (
          muted.length > 0 &&
          muted.every((path) => getComputedStyle(path).opacity === '0.35')
        );
      },
      undefined,
      { timeout: 5000 },
    );
    assert.equal(
      await page.locator('.nf-edge-path.nf-edge-active').count(),
      0,
      'a top-level selection has no descendant path edge',
    );
    await h.screenshot(resolve(screenshotDir, 'edges-light-selected.png'), { width: 1440, height: 900 });

    // Selecting a descendant keeps its path active at 1.75 px while the other
    // branches are muted at 1 px / 0.35 opacity.
    const spectrum = h
      .activeEditor()
      .locator('[data-block-card]', { hasText: 'Spectrum' })
      .first();
    const spectrumId = await spectrum.getAttribute('data-block-card');
    await spectrum.locator('.nf-block-prose').click();
    await h.waitSelected(spectrumId);
    await page.waitForFunction(
      () => {
        const active = document.querySelector('.nf-edge-path.nf-edge-active');
        const muted = document.querySelector('.nf-edge-path.nf-edge-muted');
        return (
          active !== null &&
          muted !== null &&
          Math.abs(Number.parseFloat(getComputedStyle(active).strokeWidth) - 1.75) < 0.001 &&
          Math.abs(Number.parseFloat(getComputedStyle(muted).strokeWidth) - 1) < 0.001
        );
      },
      undefined,
      { timeout: 5000 },
    );
    const selectedLight = await page.evaluate(() => {
      const active = document.querySelector('.nf-edge-path.nf-edge-active');
      const muted = document.querySelector('.nf-edge-path.nf-edge-muted');
      return {
        activeStroke: active === null ? null : getComputedStyle(active).stroke,
        mutedStroke: muted === null ? null : getComputedStyle(muted).stroke,
        mutedOpacity: muted === null ? null : getComputedStyle(muted).opacity,
      };
    });
    assert.equal(selectedLight.activeStroke, light.accentStrong);
    assert.equal(selectedLight.mutedStroke, light.muted);
    assert.equal(selectedLight.mutedOpacity, '0.35');

    await setTheme('dark');
    await h.screenshot(resolve(screenshotDir, 'edges-dark-selected.png'), { width: 1440, height: 900 });
  });

  it('keeps one sidebar grid with equal selection surfaces and 28 px rows', async () => {
    await launch('sidebar-grid');
    await ui.seedDemo();

    const readGrid = (selectors) =>
      page.evaluate((wanted) => {
        const box = (selector) => {
          const element = document.querySelector(selector);
          if (element === null) return null;
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
        const scroll = document.querySelector('.nf-sidebar-scroll');
        if (scroll === null) return null;
        const scrollBox = scroll.getBoundingClientRect();
        const scrollStyle = getComputedStyle(scroll);
        const background = (selector) => {
          const element = document.querySelector(selector);
          return element === null ? null : getComputedStyle(element).backgroundColor;
        };
        const iconSize = (selector) => {
          const icon = document.querySelector(`${selector} svg`);
          if (icon === null) return null;
          const rect = icon.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        };
        const result = {
          // S1: the scroll container reserves a permanent 10 px scrollbar
          // gutter (design §7), so the usable content box is its client box
          // minus the padding. At the 264 default that is 238 px in every
          // state, overflow or not.
          contentLeft:
            scrollBox.left +
            Number.parseFloat(scrollStyle.borderLeftWidth) +
            Number.parseFloat(scrollStyle.paddingLeft),
          contentRight:
            scrollBox.left +
            Number.parseFloat(scrollStyle.borderLeftWidth) +
            scroll.clientWidth -
            Number.parseFloat(scrollStyle.paddingRight),
          gutter:
            scrollStyle.scrollbarGutter === 'stable'
              ? scrollBox.width -
                scroll.clientWidth -
                Number.parseFloat(scrollStyle.borderLeftWidth) -
                Number.parseFloat(scrollStyle.borderRightWidth)
              : 0,
          search: box('.nf-sidebar-search'),
          bar: box('[data-activity-bar="true"]'),
          content: box('[data-sidebar-content="true"]'),
          scroll: box('.nf-sidebar-scroll'),
          librarySearchBackground: background('.nf-library-search'),
          topSearchBackground: background('.nf-sidebar-search'),
          footBorderTop: getComputedStyle(
            document.querySelector('[data-sidebar-foot="true"]'),
          ).borderTopWidth,
          settings: box('[data-sidebar-settings="true"]'),
          foot: box('[data-sidebar-foot="true"]'),
        };
        for (const [name, selector] of Object.entries(wanted)) {
          result[name] = box(selector);
          if (selector.includes('[data-library-new') || selector.includes('.nf-icon-button')) {
            result[`${name}Icon`] = iconSize(selector);
          }
        }
        return result;
      }, selectors);

    const libraryGrid = await readGrid({
      filter: '.nf-library-search',
      libraryHead: '.nf-sidebar-section[aria-label="Library"] .nf-library-head',
      libraryRow: '.nf-library-row[data-active="true"]',
      libraryOpen: '.nf-library-row[data-active="true"] .nf-library-open',
      libraryMenu: '.nf-library-row[data-active="true"] .nf-row-menu',
      libraryAdd: '.nf-library-section [data-library-new="true"]',
    });
    assert.ok(libraryGrid !== null);
    const close = (left, right, label) =>
      assert.ok(Math.abs(left - right) <= 0.5, `${label} (${left} vs ${right})`);

    // The content column starts after the 48 px activity bar; the bar is the
    // only boundary between the sections and the content grid.
    assert.ok(
      Math.abs(libraryGrid.bar.width - 48) < 1,
      `the activity bar is 48 px (${libraryGrid.bar.width})`,
    );
    assert.ok(
      libraryGrid.content.left >= libraryGrid.bar.right - 1,
      'the content column starts at the bar edge',
    );
    assert.equal(
      await page.locator('.nf-sidebar-section[aria-label="Topics"]').count(),
      0,
      'the Outline panel is not mounted under the Library tab',
    );

    // One content box: the scroll padding is the only horizontal inset.
    for (const [name, element] of [
      ['filter', libraryGrid.filter],
      ['library header', libraryGrid.libraryHead],
      ['library row', libraryGrid.libraryRow],
    ]) {
      assert.ok(element !== null);
      close(element.left, libraryGrid.contentLeft, `${name} left edge is the grid edge`);
    }
    close(libraryGrid.libraryRow.right, libraryGrid.contentRight, 'library row right edge');
    // S1: one scroll owner with a reserved invisible gutter (design §7). The
    // card is 312 px, so the scroll box is 312 − 2 (card borders) − 48 (bar) =
    // 262 px and the usable box is 262 − 8 − 8 − 10 = 236 px in every state.
    close(libraryGrid.gutter, 10, 'the reserved gutter is 10 px');
    close(
      libraryGrid.contentRight - libraryGrid.contentLeft,
      236,
      'the content box keeps the reserved gutter',
    );

    // One row height: search, filter, library rows and tree rows are 28 px.
    assert.equal(libraryGrid.search.height, 28, 'top search is 28 px');
    assert.equal(libraryGrid.filter.height, 28, 'library filter is 28 px');
    assert.equal(libraryGrid.libraryRow.height, 28, 'library row is 28 px');
    assert.equal(
      libraryGrid.librarySearchBackground,
      libraryGrid.topSearchBackground,
      'both search surfaces use surface-1',
    );

    // Selection is the full row: the invisible menu stays inside the surface.
    close(
      libraryGrid.libraryRow.width,
      libraryGrid.contentRight - libraryGrid.contentLeft,
      'selected width equals the row content width',
    );
    assert.ok(
      libraryGrid.libraryOpen.width < libraryGrid.libraryRow.width - 15,
      'the open button leaves the 20 px menu inside the selected row',
    );
    assert.ok(libraryGrid.libraryMenu.left > libraryGrid.libraryOpen.right - 1);
    close(libraryGrid.libraryAdd.width, 22, 'Library add is 22 px');
    close(libraryGrid.libraryAdd.right, libraryGrid.contentRight - 6, 'Library add right edge');
    assert.ok(Math.abs((libraryGrid.libraryAddIcon?.width ?? 0) - 13) <= 0.5);

    // The Outline tab uses the same grid, 28 px rows, and no section divider.
    await ui.showOutline();
    const topicRow = page.locator('.nf-tree-row[data-block-id]').first();
    const topicId = await topicRow.getAttribute('data-block-id');
    await topicRow.click();
    await h.waitSelected(topicId);
    const outlineGrid = await readGrid({
      topicsHead: '.nf-sidebar-section[aria-label="Outline"] .nf-section-head',
      topicRow: '.nf-tree-row[data-selected="true"]',
      topicsAdd: '.nf-topics-section .nf-icon-button',
    });
    assert.ok(outlineGrid !== null);
    for (const [name, element] of [
      ['topics header', outlineGrid.topicsHead],
      ['topics row', outlineGrid.topicRow],
    ]) {
      assert.ok(element !== null);
      close(element.left, outlineGrid.contentLeft, `${name} left edge is the grid edge`);
    }
    close(outlineGrid.topicRow.right, outlineGrid.contentRight, 'topics row right edge');
    assert.equal(outlineGrid.topicRow.height, 28, 'topic row is 28 px');
    close(
      outlineGrid.topicRow.width,
      outlineGrid.contentRight - outlineGrid.contentLeft,
      'the topic selection is the full row',
    );
    assert.equal(
      await page.locator('.nf-topics-section').evaluate(
        (element) => getComputedStyle(element).borderTopWidth,
      ),
      '0px',
      'the tab boundary replaces the Topics section divider',
    );
    close(outlineGrid.topicsAdd.width, 22, 'Outline add is 22 px');
    close(outlineGrid.topicsAdd.right, outlineGrid.contentRight - 6, 'Outline add right edge');
    assert.ok(Math.abs((outlineGrid.topicsAddIcon?.width ?? 0) - 13) <= 0.5);

    // Section separation and the expanded Settings footer contract.
    assert.equal(libraryGrid.footBorderTop, '1px', 'the footer has a top divider');
    assert.ok(
      Math.abs(libraryGrid.foot.width - (await box('.nf-sidebar')).width) <= 2,
      'the footer spans the whole card',
    );
    const footerGear = await box('[data-sidebar-settings="true"] svg');
    assert.ok(Math.abs(footerGear.width - 17) <= 0.5, 'the footer gear is 17 px');
    assert.ok(Math.abs(footerGear.height - 17) <= 0.5, 'the footer gear is 17 px');
    const footerGearCentre = await iconCenter('[data-sidebar-settings="true"] svg');
    assert.ok(
      Math.abs(footerGearCentre.x - (libraryGrid.bar.left + libraryGrid.bar.width / 2)) <= 0.5,
      'the footer gear keeps the bar column centre',
    );
    await h.screenshot(resolve(screenshotDir, 'sidebar-expanded-264-selected.png'), {
      width: 1440,
      height: 900,
    });
  });

  it('resizes the sidebar content column 180..640, snaps near 264, and resets on double-click', async () => {
    const env = ui.isolated('sidebar-resize');
    page = await ui.launch(env);
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();
    await ui.showOutline();
    const topicRow = page.locator('.nf-tree-row[data-block-id]').first();
    const topicId = await topicRow.getAttribute('data-block-id');
    await topicRow.click();
    await h.waitSelected(topicId);

    // The activity bar is always 48 px and the persisted number is the content
    // column: a 264 setting renders a 312 px card. The card's own 1 px borders
    // stay inside the content column exactly as before S1, so the measured
    // column is `card - 48 - 2`; the bar is never subtracted from the stored
    // width.
    const BAR = 48;
    const cardWidth = async () => (await box('.nf-sidebar')).width;
    const contentWidth = async () => (await cardWidth()) - BAR;

    async function dragTo(target) {
      const separator = await box('.nf-separator');
      const current = await cardWidth();
      const x = separator.left + separator.width / 2;
      const y = separator.top + 120;
      await page.mouse.move(x, y);
      await page.mouse.down();
      const delta = target + BAR - current;
      const steps = Math.max(1, Math.ceil(Math.abs(delta) / 10));
      for (let step = 1; step <= steps; step += 1) {
        await page.mouse.move(x + (delta * step) / steps, y);
      }
      await page.mouse.up();
    }

    async function waitWidth(target, tolerance = 2) {
      await page.waitForFunction(
        ({ expected, allowed, bar }) =>
          Math.abs(
            (document.querySelector('.nf-sidebar')?.getBoundingClientRect().width ?? 0) -
              bar -
              expected,
          ) <= allowed,
        { expected: target, allowed: tolerance, bar: BAR },
        { timeout: 5000 },
      );
    }

    // Range: the old 208/360 literals are gone, and the 48 px bar never counts
    // towards the persisted content width.
    await dragTo(180);
    await waitWidth(180);
    assert.ok(Math.abs((await contentWidth()) - 180) <= 1, 'the 180 px floor holds');
    assert.ok(
      Math.abs((await box('.nf-sidebar')).width - (180 + BAR)) <= 2,
      'the card is the content width plus the bar',
    );
    await h.screenshot(resolve(screenshotDir, 'sidebar-expanded-180-selected.png'), {
      width: 1440,
      height: 900,
    });

    await dragTo(900);
    await waitWidth(640);
    assert.ok(Math.abs((await contentWidth()) - 640) <= 1, 'the 640 px ceiling holds');

    // A steady 560 px drag persists across a relaunch.
    await dragTo(560);
    await waitWidth(560);
    await page.waitForFunction(
      () => window.__noteforestTest.state().sidebarCollapsed === false,
      undefined,
      { timeout: 5000 },
    );
    await h.screenshot(resolve(screenshotDir, 'sidebar-expanded-560-selected.png'), {
      width: 1440,
      height: 900,
    });
    await h.flushSession();
    await h.quit();
    page = await ui.launch(env);
    await h.setWindowSize(1440, 900);
    await waitExpandedSidebar();
    assert.ok(
      Math.abs((await contentWidth()) - 560) <= 2,
      `the 560 px width persists (${await contentWidth()})`,
    );

    // Releasing within 10 px of the default settles onto 264 — a 264 content
    // column, never 216 (the bar is never subtracted from the stored width).
    await dragTo(270);
    await page.waitForFunction(
      () =>
        Math.abs(
          (document.querySelector('.nf-sidebar')?.getBoundingClientRect().width ?? 0) -
            48 -
            264,
        ) <= 0.5,
      undefined,
      { timeout: 5000 },
    );
    assert.ok(Math.abs((await contentWidth()) - 264) <= 0.5, 'the drag snaps to 264');
    assert.ok(
      Math.abs((await box('.nf-sidebar')).width - (264 + BAR)) <= 2,
      'the snapped card is 312 px',
    );
    // The rendered column keeps the pre-S1 geometry (the card's two 1 px
    // borders); the 48 px bar is added to the card, never taken from this.
    const column = await box('[data-sidebar-content="true"]');
    assert.ok(
      Math.abs(column.width - 262) <= 2,
      `the rendered content column is 262 px, not 216 (${column.width})`,
    );
    assert.equal(
      await page.evaluate(() => window.__noteforestTest.state().sidebarWidth),
      264,
      'the persisted width is the content width',
    );
    // The session stores the content width, so a relaunch renders 264 again
    // without any migration of an existing session file.
    await h.flushSession();
    const storedSession = JSON.parse(
      await readFile(join(env.NOTEFOREST_APP_SUPPORT, 'shell-session.json'), 'utf8'),
    );
    assert.equal(storedSession.sidebarWidth, 264, 'the session stores 264, not 312');
    await h.screenshot(resolve(screenshotDir, 'sidebar-expanded-264-selected.png'), {
      width: 1440,
      height: 900,
    });

    // Collapse: the canvas gains exactly the content column, and the bar stays.
    const cardBefore = await box('.nf-sidebar');
    const toolbarBefore = await box('.nf-toolbar');
    await page.locator('[aria-label="Collapse sidebar"]').click();
    await waitRail();
    const railCard = await box('.nf-sidebar');
    const toolbarAfter = await box('.nf-toolbar');
    assert.equal(railCard.width, 48, 'the collapsed card is the bar');
    assert.ok(
      Math.abs(cardBefore.width - railCard.width - 264) <= 2,
      `collapse gives the canvas exactly the 264 px content column (${cardBefore.width} -> ${railCard.width})`,
    );
    assert.ok(
      Math.abs(toolbarBefore.left - toolbarAfter.left - 264) <= 2,
      'the canvas gains the content column, not the bar',
    );
    await page.locator('[data-sidebar-expand="true"]').click();
    await waitExpandedSidebar();
    assert.ok(Math.abs((await contentWidth()) - 264) <= 2, 'expand restores the 264 content column');

    // A double-click on the separator resets immediately to 264.
    await dragTo(420);
    await waitWidth(420);
    const separator = page.locator('.nf-separator');
    assert.equal(await separator.getAttribute('aria-label'), 'Resize sidebar');
    assert.match(await separator.getAttribute('title'), /double-click to reset/);
    await separator.dblclick();
    await waitWidth(264, 0.5);
    assert.ok(Math.abs((await contentWidth()) - 264) <= 0.5, 'double-click resets to 264');
  });

  it('targets the active layout for zoom and fit without touching the hidden layout', async () => {
    await launch('zoom');
    await ui.seedDemo();
    const packagePath = (await h.state()).activeTab;

    const initial = await viewState(packagePath);
    assert.equal(initial.layout, 'continuous');
    assert.equal(initial.zoom, 1);
    assert.equal(initial.pageZoom, 1);
    assert.equal(initial.pageFit, 'page');
    assert.equal(await page.locator('[data-zoom-target]').getAttribute('data-zoom-target'), 'continuous');
    assert.deepEqual(
      (await page.locator('[data-zoom-target]').getAttribute('data-zoom-commands')).split(' '),
      ['actual', 'fit-width'],
      'Continuous offers no Fit page',
    );

    // Continuous zoom changes only the Continuous zoom.
    await page.locator('[data-zoom-action="in"]').click();
    await waitZoomLabel('110%');
    const continuousZoomed = await viewState(packagePath);
    assert.equal(continuousZoomed.zoom, 1.1, 'Continuous zoom changed');
    assert.equal(continuousZoomed.pageZoom, 1, 'the Page zoom is untouched');
    assert.equal(await page.locator('[data-zoom-menu]').count(), 0, 'the zoom dropdown is gone');
    assert.equal(await page.locator('[data-zoom-action="out"]').count(), 1);
    assert.equal(await page.locator('[data-zoom-value]').count(), 1);
    assert.equal(await page.locator('[data-zoom-action="in"]').count(), 1);
    // The percentage itself is the reset control. ⌘0 keeps its keyboard
    // coverage in the Page block below: on macOS the accelerator is also a
    // native menu item dispatched over IPC, so a keyboard reset issued before a
    // layout switch can land after it. One keyboard reset per test keeps this
    // suite about the layout-aware commands, not about IPC arrival order.
    await page.locator('[data-zoom-value]').click();
    await waitZoomLabel('100%');
    assert.equal((await viewState(packagePath)).zoom, 1);

    // Layout + mode from the canvas header: switching layout preserves the
    // current mode, so Continuous Edit opens Page Edit.
    await page.locator('[data-view-layout="page"]').click();
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.layout === 'page',
      packagePath,
      { timeout: 10000 },
    );
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view');
    const pageOpened = await viewState(packagePath);
    assert.equal(pageOpened.interactionMode, 'edit', 'Page keeps the Edit mode');
    assert.equal(pageOpened.zoom, 1, 'the hidden Continuous zoom stayed at 100%');
    assert.equal(await page.locator('[data-zoom-target]').getAttribute('data-zoom-target'), 'page');
    assert.deepEqual(
      (await page.locator('[data-zoom-target]').getAttribute('data-zoom-commands')).split(' '),
      ['actual', 'fit-page', 'fit-width'],
      'Page offers Fit page',
    );

    // Page zoom changes only the Page zoom. Compare against the value Page
    // opened at (the effective fit zoom), not a fixed 100%: fit depends on the
    // window geometry.
    const pageZoomBefore = (await viewState(packagePath)).pageZoom;
    await page.locator('[data-zoom-action="in"]').click();
    await page.waitForFunction(
      (expected) => (window.__noteforestTest.viewState()[expected.path]?.pageZoom ?? 1) > expected.zoom,
      { path: packagePath, zoom: pageZoomBefore },
      { timeout: 10000 },
    );
    const pageZoomed = await viewState(packagePath);
    assert.ok(
      pageZoomed.pageZoom > pageZoomBefore,
      `Page zoom changed (${pageZoomed.pageZoom} > ${pageZoomBefore})`,
    );
    assert.equal(pageZoomed.zoom, 1, 'the Continuous zoom is untouched');
    assert.equal(
      await page.locator('[data-zoom-value]').innerText(),
      `${Math.round(pageZoomed.pageZoom * 100)}%`,
    );

    // Fit page / Fit width / Actual size are Page view state, delivered by the
    // layout-aware keys (the old zoom dropdown is gone).
    //
    // Actual size first, through the percentage control, while the Page fit is
    // the settled default: the Page surface writes the effective fit back into
    // `pageZoom` one paint after a fit change, so a reset issued immediately
    // after ⇧1/⇧2 can lose to that late write (open risk in the S1 report; the
    // Page surface is out of this slice). The ⌘0 keyboard reset of the same
    // command stays covered by the page-view suite.
    await page.locator('[data-zoom-value]').click();
    await page.waitForFunction(
      (path) => {
        const view = window.__noteforestTest.viewState()[path];
        return view?.pageFit === 'none' && Math.abs(view?.pageZoom - 1) < 0.001;
      },
      packagePath,
      { timeout: 10000 },
    );
    await waitZoomLabel('100%');
    const afterActual = await viewState(packagePath);
    assert.equal(afterActual.zoom, 1, 'Actual size never changed the Continuous zoom');

    await page.keyboard.press('Shift+1');
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.pageFit === 'page',
      packagePath,
      { timeout: 10000 },
    );
    assert.equal(await page.locator('[data-zoom-target="page"]').getAttribute('data-page-fit'), 'page');
    await page.keyboard.press('Shift+2');
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.pageFit === 'width',
      packagePath,
      { timeout: 10000 },
    );
    assert.equal(
      await page.locator('[data-zoom-target="page"]').getAttribute('data-page-fit'),
      'width',
      'Fit width is the Page fit',
    );

    // Mode works inside Page and inside Continuous.
    await page.locator('[data-view-interaction="read"]').click();
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.interactionMode === 'read',
      packagePath,
      { timeout: 10000 },
    );
    assert.equal(
      await page.locator('.nf-editor[data-active="true"] .nf-page-view').getAttribute('data-interaction-mode'),
      'read',
    );
    await page.locator('[data-view-interaction="edit"]').click();
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.interactionMode === 'edit',
      packagePath,
      { timeout: 10000 },
    );
    await page.locator('[data-view-layout="continuous"]').click();
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.layout === 'continuous',
      packagePath,
      { timeout: 10000 },
    );
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view', { state: 'detached' });
    // The Page zoom is whatever Page last showed (fit width is geometry-driven,
    // so it is not necessarily 100%); returning to Continuous must not touch it.
    const pageZoomBeforeLeaving = (await viewState(packagePath)).pageZoom;
    const backToContinuous = await viewState(packagePath);
    assert.ok(
      Math.abs(backToContinuous.pageZoom - pageZoomBeforeLeaving) < 0.001,
      `returning to Continuous kept the Page zoom (${backToContinuous.pageZoom} vs ${pageZoomBeforeLeaving})`,
    );
    assert.equal(backToContinuous.zoom, 1, 'the Continuous zoom is the one shown again');
    await page.locator('[data-view-interaction="read"]').click();
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.interactionMode === 'read',
      packagePath,
      { timeout: 10000 },
    );
    assert.equal(
      await page.locator('.nf-editor[data-active="true"] .nf-prosemirror').getAttribute('contenteditable'),
      'false',
    );
    await page.locator('[data-view-interaction="edit"]').click();
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.interactionMode === 'edit',
      packagePath,
      { timeout: 10000 },
    );

    // Continuous zoom still works after the round trip; Page state is untouched.
    const pageZoomBeforeContinuousZoom = (await viewState(packagePath)).pageZoom;
    await page.locator('[data-zoom-action="in"]').click();
    await waitZoomLabel('110%');
    const final = await viewState(packagePath);
    assert.equal(final.zoom, 1.1);
    assert.equal(
      final.pageZoom,
      pageZoomBeforeContinuousZoom,
      'Continuous zoom did not leak into Page zoom',
    );

    // Labels collapse to icons at a narrow window; no page-level horizontal scroll.
    await h.setWindowSize(960, 768);
    await page.waitForFunction(
      () => window.innerWidth <= 1000,
      undefined,
      { timeout: 5000 },
    );
    const narrow = await page.evaluate(() => {
      const segments = [...document.querySelectorAll('[data-view-controls] .nf-view-segment')];
      const toolbar = document.querySelector('.nf-toolbar')?.getBoundingClientRect();
      const header = document.querySelector('[data-canvas-header="true"]')?.getBoundingClientRect();
      return {
        labels: segments.map((segment) => segment.textContent?.trim() ?? ''),
        labelled: segments.every((segment) => (segment.getAttribute('aria-label') ?? '').length > 0),
        toolbarHeight: toolbar?.height ?? 0,
        headerHeight: header?.height ?? 0,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      };
    });
    assert.deepEqual(narrow.labels, ['', '', '', ''], 'layout/mode are icon-only');
    assert.equal(narrow.labelled, true, 'icon-only controls keep accessible labels');
    assert.equal(narrow.toolbarHeight, 44, 'the Toolbar keeps one rail at 960');
    assert.equal(narrow.headerHeight, 34, 'the canvas header is 34 px');
    assert.ok(
      narrow.scrollWidth <= narrow.innerWidth,
      `no page-level horizontal scroll (${narrow.scrollWidth} <= ${narrow.innerWidth})`,
    );
    assert.equal(await page.locator('.nf-canvas-panel [data-view-controls="true"]').count(), 1);
  });
});
