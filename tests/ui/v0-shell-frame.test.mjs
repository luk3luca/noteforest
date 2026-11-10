import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { addAnchor, addBranch, addTopLevelBlock, textDoc } from '../support/fixtures.mjs';

/**
 * V0 shell frame: one TopBar (traffic lights, tabs, new, layout-aware view
 * controls, palette), one Sidebar (search/new/collapse, single Settings entry),
 * a minimal StatusStrip, and a PageToolbar with page navigation + Export only.
 *
 * The suite proves the layout-aware zoom (Page controls change Page view state
 * and never the hidden Continuous zoom; Continuous controls change `zoom` and
 * never `pageZoom`), not just that the buttons exist.
 */

const tempRoot = artifactsPath('v0-ui');
const screenshotDir = artifactsPath('v0-shell');
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

async function waitZoomLabel(expectation) {
  await page.waitForFunction(
    (expected) => document.querySelector('[data-zoom-value]')?.textContent?.trim() === expected,
    expectation,
    { timeout: 10000 },
  );
}

async function chooseZoomCommand(name) {
  await page.locator('[data-zoom-menu]').click();
  await page.getByRole('menuitem', { name }).click();
  await page.locator('.nf-menu').waitFor({ state: 'detached' });
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

describe('V0 shell frame', () => {
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

  it('shows one TopBar with tabs, new, view controls, and palette — no title row or Settings gear', async () => {
    await launch('topbar');
    await ui.seedDemo();

    assert.equal(await page.locator('.nf-topbar').count(), 1, 'exactly one TopBar');
    assert.equal(await page.locator('.nf-titlebar').count(), 0, 'the separate title row is gone');
    assert.equal(
      await page.locator('.nf-app > header[data-topbar="true"]').count(),
      1,
      'the TopBar is the first shell region',
    );
    const topbarHeight = await page
      .locator('.nf-topbar')
      .evaluate((element) => element.getBoundingClientRect().height);
    assert.equal(topbarHeight, 44, 'TopBar is 44 px');

    const topbarText = await page.locator('.nf-topbar').innerText();
    assert.match(topbarText, /Linear algebra/, 'the active tab title is the document identity');
    assert.doesNotMatch(topbarText, /NoteForest/, 'no separate app-name identity');
    assert.equal(
      await page.locator('.nf-topbar [role="tablist"]').count(),
      1,
      'the tab strip lives in the TopBar',
    );
    assert.equal(
      await page.locator('.nf-topbar [data-view-controls="true"]').count(),
      1,
      'view controls live in the TopBar',
    );
    assert.equal(
      await page.locator('.nf-topbar [data-topbar-new="true"]').count(),
      1,
      'the TopBar new-note button exists',
    );
    assert.equal(
      await page.locator('.nf-topbar [aria-label="Command palette"]').count(),
      1,
      'the palette button stays in the TopBar',
    );
    assert.equal(
      await page.locator('.nf-topbar [aria-label="Settings"]').count(),
      0,
      'the TopBar has no Settings gear',
    );

    // One visible Settings entry: the sidebar footer.
    assert.equal(
      await page.locator('.nf-sidebar-foot').getByRole('button', { name: 'Settings' }).count(),
      1,
      'one Settings entry in the sidebar footer',
    );
    assert.match(await page.locator('.nf-sidebar-foot').innerText(), /Settings/);
    assert.equal(
      await page.getByRole('button', { name: 'Settings' }).count(),
      1,
      'the whole visible chrome has exactly one Settings entry',
    );
    const chromeText = await page.evaluate(() =>
      [
        document.querySelector('.nf-topbar')?.textContent ?? '',
        document.querySelector('.nf-sidebar')?.textContent ?? '',
        document.querySelector('.nf-statusbar')?.textContent ?? '',
      ].join('\n'),
    );
    assert.doesNotMatch(chromeText, /Graphite/, 'the static Graphite label is gone');

    // The footer entry really opens Settings.
    await page.locator('.nf-sidebar-settings').click();
    await page.waitForSelector('.nf-dialog');
    assert.equal(await page.locator('.nf-dialog-title').innerText(), 'Settings');
    await page.getByRole('button', { name: 'Done' }).click();
    await page.waitForSelector('.nf-dialog', { state: 'detached' });

    // Sidebar header: search, the same New note command, collapse toggle.
    assert.equal(await page.locator('.nf-sidebar-search').count(), 1);
    assert.equal(
      await page.locator('.nf-sidebar-head [aria-label="New note"]').count(),
      1,
      'the sidebar New note uses the same label as the TopBar',
    );
    assert.equal(
      await page.locator('.nf-sidebar-head [aria-label="Collapse sidebar"]').count(),
      1,
    );
    await page.locator('.nf-sidebar-search').click();
    await page.waitForSelector('.nf-palette');
    assert.equal(
      await page.getByRole('option', { name: /Settings/ }).count() > 0,
      true,
      'the palette still reaches Settings',
    );
    await page.keyboard.press('Escape');
    await page.waitForSelector('.nf-palette', { state: 'detached' });

    // Rename/Reveal live in the tab context menu; the palette keeps the commands.
    await page.locator('.nf-tab[data-active="true"]').click({ button: 'right' });
    await page.locator('.nf-menu').waitFor();
    assert.equal(
      await page.getByRole('menuitem', { name: 'Rename document…' }).count(),
      1,
      'the tab menu can rename the document',
    );
    assert.equal(
      await page.getByRole('menuitem', { name: 'Reveal in Finder' }).count(),
      1,
      'the tab menu can reveal the document',
    );
    await page.getByRole('menuitem', { name: 'Rename document…' }).click();
    await page.waitForSelector('.nf-dialog');
    assert.equal(await page.locator('.nf-dialog-title').innerText(), 'Rename document');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.waitForSelector('.nf-dialog', { state: 'detached' });

    await h.screenshot(resolve(screenshotDir, 'topbar-1440x900.png'), {
      width: 1440,
      height: 900,
    });
  });

  it('collapses the sidebar to a TopBar reveal, toggles with ⌘\\, and persists it', async () => {
    const env = ui.isolated('sidebar');
    page = await ui.launch(env);
    await h.setWindowSize(1440, 900);
    await ui.seedDemo();
    const packagePath = (await h.state()).activeTab;

    await page.locator('.nf-sidebar-panel').waitFor();
    assert.equal(await page.locator('#nf-sidebar').count(), 1);

    await page.locator('[aria-label="Collapse sidebar"]').click();
    await page.locator('.nf-sidebar').waitFor({ state: 'detached' });
    assert.equal(await page.locator('.nf-sidebar-panel').count(), 0, 'the panel disappears');
    const reveal = page.locator('[data-sidebar-reveal="true"]');
    await reveal.waitFor();
    assert.equal(await reveal.getAttribute('aria-label'), 'Show sidebar');
    const geometry = await page.evaluate(() => {
      const topbar = document.querySelector('.nf-topbar')?.getBoundingClientRect();
      const button = document.querySelector('[data-sidebar-reveal="true"]')?.getBoundingClientRect();
      const tabs = document.querySelector('.nf-tab-strip')?.getBoundingClientRect();
      return {
        topbarLeft: topbar?.left ?? -1,
        revealLeft: button?.left ?? -1,
        tabsLeft: tabs?.left ?? -1,
      };
    });
    assert.ok(
      geometry.revealLeft > geometry.topbarLeft + 60,
      `the reveal sits after the traffic lights (${geometry.revealLeft} vs ${geometry.topbarLeft})`,
    );
    assert.ok(
      geometry.revealLeft < geometry.tabsLeft,
      'the reveal sits at the left of the TopBar, before the tabs',
    );
    await h.screenshot(resolve(screenshotDir, 'sidebar-collapsed-1440x900.png'), {
      width: 1440,
      height: 900,
    });

    // Reveal restores the panel; ⌘\ collapses it again.
    await reveal.click();
    await page.locator('.nf-sidebar-panel').waitFor();
    await page.keyboard.press('Meta+\\');
    await page.locator('.nf-sidebar').waitFor({ state: 'detached' });
    await page.locator('[data-sidebar-reveal="true"]').click();
    await page.locator('.nf-sidebar-panel').waitFor();
    assert.equal((await h.state()).activeTab, packagePath, 'sidebar toggles never change the document');

    // Collapsed state persists across a relaunch.
    await page.locator('[aria-label="Collapse sidebar"]').click();
    await page.locator('.nf-sidebar').waitFor({ state: 'detached' });
    await h.flushSession();
    await h.quit();
    page = await ui.launch(env);
    await h.setWindowSize(1440, 900);
    await page.waitForFunction(
      () => window.__noteforestTest.state().sidebarCollapsed === true,
      undefined,
      { timeout: 10000 },
    );
    assert.equal(await page.locator('.nf-sidebar').count(), 0, 'the panel stays collapsed');
    await page.locator('[data-sidebar-reveal="true"]').waitFor();
  });

  it('keeps the StatusStrip status-only and the PageToolbar nav + Export only', async () => {
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
    await page.waitForSelector('[data-anchor-health="true"]');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-anchor-health="true"]', { state: 'detached' });

    // Page: contextual toolbar with page navigation + Export only.
    await showPage();
    const toolbar = page.locator('.nf-page-toolbar');
    await toolbar.waitFor();
    assert.equal(await toolbar.getAttribute('aria-label'), 'Page controls');
    assert.equal(await toolbar.locator('[data-page-nav="prev"]').count(), 1);
    assert.equal(await toolbar.locator('[data-page-nav="next"]').count(), 1);
    assert.match(await toolbar.locator('[data-page-counter]').innerText(), /Page 1 of \d+/);
    assert.equal(await toolbar.locator('[data-page-export="true"]').count(), 1);
    assert.equal(await toolbar.locator('[data-page-fit]').count(), 0, 'no page fit in the toolbar');
    assert.equal(await toolbar.locator('[data-page-zoom]').count(), 0, 'no page zoom in the toolbar');
    assert.equal(
      await toolbar.locator('[data-page-open-continuous]').count(),
      0,
      'no Open in continuous editor in the toolbar',
    );
    assert.equal(
      await page.locator('.nf-page-view').getByRole('button', { name: 'Zoom in' }).count(),
      0,
      'the Page surface has no zoom buttons',
    );
    // The TopBar still owns layout/mode in Page.
    assert.equal(
      await page.locator('.nf-topbar [data-view-layout="page"]').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(
      await page.locator('.nf-topbar [data-view-interaction="read"]').getAttribute('aria-pressed'),
      'true',
    );
    await h.screenshot(resolve(screenshotDir, 'page-toolbar-1440x900.png'), {
      width: 1440,
      height: 900,
    });
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
    await page.locator('[data-zoom-menu]').click();
    await page.waitForSelector('.nf-menu');
    assert.equal(
      await page.getByRole('menuitem', { name: 'Fit page' }).count(),
      0,
      'Fit page is hidden in Continuous',
    );
    assert.equal(await page.getByRole('menuitem', { name: 'Fit width' }).count(), 1);
    await page.keyboard.press('Escape');
    await page.waitForSelector('.nf-menu', { state: 'detached' });
    await page.keyboard.press('Meta+0');
    await waitZoomLabel('100%');
    assert.equal((await viewState(packagePath)).zoom, 1);

    // Layout + mode from the TopBar also open Page in Read.
    await page.locator('[data-view-layout="page"]').click();
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.layout === 'page',
      packagePath,
      { timeout: 10000 },
    );
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view');
    const pageOpened = await viewState(packagePath);
    assert.equal(pageOpened.interactionMode, 'read', 'Page opens in Read');
    assert.equal(pageOpened.zoom, 1, 'the hidden Continuous zoom stayed at 100%');
    assert.equal(await page.locator('[data-zoom-target]').getAttribute('data-zoom-target'), 'page');
    assert.deepEqual(
      (await page.locator('[data-zoom-target]').getAttribute('data-zoom-commands')).split(' '),
      ['actual', 'fit-page', 'fit-width'],
      'Page offers Fit page',
    );

    // Page zoom changes only the Page zoom.
    await page.locator('[data-zoom-action="in"]').click();
    await page.waitForFunction(
      (path) => (window.__noteforestTest.viewState()[path]?.pageZoom ?? 1) > 1,
      packagePath,
      { timeout: 10000 },
    );
    const pageZoomed = await viewState(packagePath);
    assert.ok(pageZoomed.pageZoom > 1, 'Page zoom changed');
    assert.equal(pageZoomed.zoom, 1, 'the Continuous zoom is untouched');
    assert.equal(
      await page.locator('[data-zoom-value]').innerText(),
      `${Math.round(pageZoomed.pageZoom * 100)}%`,
    );

    // Fit page / Fit width / Actual size are Page view state.
    await chooseZoomCommand('Fit page');
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.pageFit === 'page',
      packagePath,
      { timeout: 10000 },
    );
    assert.equal(await page.locator('[data-zoom-target="page"]').getAttribute('data-page-fit'), 'page');
    await chooseZoomCommand('Fit width');
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.pageFit === 'width',
      packagePath,
      { timeout: 10000 },
    );
    await chooseZoomCommand('Actual size');
    await page.waitForFunction(
      (path) => {
        const view = window.__noteforestTest.viewState()[path];
        return view?.pageFit === 'none' && Math.abs(view?.pageZoom - 1) < 0.001;
      },
      packagePath,
      { timeout: 10000 },
    );
    await waitZoomLabel('100%');
    const afterFits = await viewState(packagePath);
    assert.equal(afterFits.zoom, 1, 'Page fit never changed the Continuous zoom');

    // Mode works inside Page and inside Continuous.
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
    const backToContinuous = await viewState(packagePath);
    assert.equal(backToContinuous.pageZoom, 1, 'returning to Continuous kept the Page zoom');
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
    await page.locator('[data-zoom-action="in"]').click();
    await waitZoomLabel('110%');
    const final = await viewState(packagePath);
    assert.equal(final.zoom, 1.1);
    assert.equal(final.pageZoom, 1, 'Continuous zoom did not leak into Page zoom');

    // Labels collapse to icons at a narrow window; no page-level horizontal scroll.
    await h.setWindowSize(960, 768);
    await page.waitForFunction(
      () => window.innerWidth <= 1000,
      undefined,
      { timeout: 5000 },
    );
    const narrow = await page.evaluate(() => {
      const label = document.querySelector('.nf-view-label');
      const topbar = document.querySelector('.nf-topbar')?.getBoundingClientRect();
      return {
        labelDisplay: label === null ? null : getComputedStyle(label).display,
        topbarHeight: topbar?.height ?? 0,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      };
    });
    assert.equal(narrow.labelDisplay, 'none', 'view labels collapse to icons');
    assert.equal(narrow.topbarHeight, 44, 'the TopBar keeps one rail at 960');
    assert.ok(
      narrow.scrollWidth <= narrow.innerWidth,
      `no page-level horizontal scroll (${narrow.scrollWidth} <= ${narrow.innerWidth})`,
    );
    assert.equal(await page.locator('.nf-topbar [data-view-controls="true"]').count(), 1);
  });
});
