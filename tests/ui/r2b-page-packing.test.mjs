import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { sidePackingDocument, writePagePackage } from '../support/page-fixtures.mjs';

/**
 * R2b Page packing UI.
 *
 * The page default is compact + beside: direct children start at the parent's
 * y in the right column, anchored callouts stay below the parent in the left
 * lane, and the lane ends one sibling gap before the right group. Continuous
 * does not mount the page layout at all, so it cannot change here.
 */

const tempRoot = artifactsPath('r2b-ui');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

const SIBLING_GAP = 16;
const CALLOUT_GAP = 12;
const CARD_CHROME = 2 * (8 + 1);

async function launch(name, width = 1440, height = 900) {
  page = await ui.launch(ui.isolated(name));
  await h.setWindowSize(width, height);
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

function activePageView() {
  return page.locator('.nf-editor[data-active="true"] .nf-page-view');
}

async function waitPageReady(expectedCount = null) {
  await page.waitForFunction(
    (count) => {
      const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
      if (view === null) return false;
      if (view.getAttribute('data-ready') !== 'true') return false;
      if (view.getAttribute('data-updating') === 'true') return false;
      if (count !== null && Number(view.getAttribute('data-page-count')) !== count) return false;
      return true;
    },
    expectedCount,
    { timeout: 30000 },
  );
}

async function showPageRead() {
  await page.keyboard.press('Meta+3');
  await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view');
  await waitPageReady();
}

async function pageCount() {
  return Number(await activePageView().getAttribute('data-page-count'));
}

async function fragmentBox(blockId) {
  return page
    .locator(`.nf-editor[data-active="true"] [data-fragment-block="${blockId}"]`)
    .evaluate((element) => ({
      left: Number.parseFloat(element.style.left),
      top: Number.parseFloat(element.style.top),
      width: Number.parseFloat(element.style.width),
      height: Number.parseFloat(element.style.height),
      role: element.getAttribute('data-fragment-role'),
      depth: Number(element.getAttribute('data-fragment-depth')),
    }));
}

async function contentBox() {
  return activePageView()
    .locator('[data-page-content]')
    .evaluate((element) => ({
      width: Number.parseFloat(element.style.width),
      height: Number.parseFloat(element.style.height),
    }));
}

async function allFragmentBoxes() {
  return activePageView()
    .locator('.nf-page-fragment')
    .evaluateAll((elements) =>
      elements.map((element) => ({
        blockId: element.getAttribute('data-fragment-block') ?? '',
        role: element.getAttribute('data-fragment-role'),
        left: Number.parseFloat(element.style.left),
        top: Number.parseFloat(element.style.top),
        width: Number.parseFloat(element.style.width),
        height: Number.parseFloat(element.style.height),
      })),
    );
}

function closeTo(actual, expected, tolerance = 0.75) {
  return Math.abs(actual - expected) <= tolerance;
}

function assertNoOverlap(boxes, label) {
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      const a = boxes[left];
      const b = boxes[right];
      const horizontal = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
      const vertical = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
      assert.ok(
        horizontal <= 0.5 || vertical <= 0.5,
        `${label}: ${a.blockId} and ${b.blockId} do not overlap`,
      );
    }
  }
}

async function assertBesideGeometry(label, { nestedBeside = true } = {}) {
  const root = await fragmentBox('side-root');
  const rootCallout = await fragmentBox('side-callout-root');
  const midCallout = await fragmentBox('side-callout-mid');
  const child = await fragmentBox('side-child');
  const content = await contentBox();
  const boxes = await allFragmentBoxes();

  assert.equal(root.role, 'top-level');
  assert.equal(rootCallout.role, 'callout');
  assert.equal(midCallout.role, 'callout');
  assert.equal(child.role, 'child');
  assert.equal(root.depth, 0);
  assert.equal(child.depth, 1);

  // Direct child starts at the parent y, in the right column.
  assert.ok(closeTo(child.top, root.top, 0.75), `${label}: child starts at the parent y`);
  assert.ok(
    closeTo(child.left, root.left + root.width + SIBLING_GAP, 0.75),
    `${label}: child starts one sibling gap right of the parent`,
  );
  // Callouts stay below the parent and end before the right group.
  assert.ok(
    rootCallout.top >= root.top + root.height + CALLOUT_GAP - 0.75,
    `${label}: root callout starts below the parent with the callout gap`,
  );
  assert.ok(
    midCallout.top >= rootCallout.top + rootCallout.height + CALLOUT_GAP - 0.75,
    `${label}: the second root callout stacks below the first`,
  );
  for (const callout of [rootCallout, midCallout]) {
    assert.ok(
      callout.left + callout.width <= child.left - SIBLING_GAP + 0.75,
      `${label}: callout lane ends one sibling gap before the right group`,
    );
  }
  assert.ok(
    rootCallout.left + rootCallout.width <= root.left + root.width + 0.75,
    `${label}: the callout lane does not exceed the parent band`,
  );

  // The callout is not clipped: content width stays at or above the readable
  // minimum unless the fixture lane itself is narrower.
  assert.ok(
    rootCallout.width - CARD_CHROME >= 160 - 0.75,
    `${label}: root callout keeps a readable content width`,
  );

  if (nestedBeside) {
    const childCallout = await fragmentBox('side-callout-child');
    const grandChild = await fragmentBox('side-grandchild');
    assert.equal(childCallout.role, 'callout');
    assert.equal(grandChild.role, 'child');
    assert.ok(
      closeTo(grandChild.top, child.top, 0.75),
      `${label}: the nested direct child starts at the child y`,
    );
    assert.ok(
      closeTo(grandChild.left, child.left + child.width + SIBLING_GAP, 0.75),
      `${label}: the nested direct child sits in the child's right column`,
    );
    assert.ok(
      childCallout.top >= child.top + child.height + CALLOUT_GAP - 0.75,
      `${label}: the nested callout stays below the child`,
    );
    assert.ok(
      childCallout.left + childCallout.width <= grandChild.left - SIBLING_GAP + 0.75,
      `${label}: the nested callout lane ends before the nested right group`,
    );
  }

  assertNoOverlap(boxes, label);
  for (const box of boxes) {
    assert.ok(box.left >= -0.75, `${label}: ${box.blockId} does not start left of the content box`);
    assert.ok(
      box.left + box.width <= content.width + 0.75,
      `${label}: ${box.blockId} does not overflow the content width`,
    );
    assert.ok(box.top >= -0.75, `${label}: ${box.blockId} does not start above the content box`);
    assert.ok(
      box.top + box.height <= content.height + 0.75,
      `${label}: ${box.blockId} does not overflow the content height`,
    );
  }
  return { root, child, rootCallout, midCallout };
}

async function setSettings(settings) {
  const runsBefore = Number(await activePageView().getAttribute('data-model-runs'));
  await page.evaluate(
    (value) => window.__noteforestTest.setSettings(value),
    settings,
  );
  await page.waitForFunction(
    (runs) => {
      const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
      return (
        view !== null &&
        Number(view.getAttribute('data-model-runs')) > runs &&
        view.getAttribute('data-ready') === 'true' &&
        view.getAttribute('data-updating') === 'false'
      );
    },
    runsBefore,
    { timeout: 30000 },
  );
}

async function setPageSettingsOverride(packagePath, override) {
  const runsBefore = Number(await activePageView().getAttribute('data-model-runs'));
  await page.evaluate(
    ({ path, value }) => window.__noteforestTest.setPageSettingsOverride(path, value),
    { path: packagePath, value: override },
  );
  await page.waitForFunction(
    (runs) => {
      const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
      return (
        view !== null &&
        Number(view.getAttribute('data-model-runs')) > runs &&
        view.getAttribute('data-ready') === 'true' &&
        view.getAttribute('data-updating') === 'false'
      );
    },
    runsBefore,
    { timeout: 30000 },
  );
}

async function anchorBox(anchorId) {
  return activePageView()
    .locator(`[data-anchor-id="${anchorId}"]`)
    .evaluate((element) => {
      const view = element.closest('.nf-page-view');
      const content = view.querySelector('.nf-page-content');
      const wrap = view.querySelector('.nf-page-sheet-wrap');
      const zoom = Number(wrap?.getAttribute('data-page-zoom') ?? '100') / 100;
      const rect = element.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      return {
        left: (rect.left - contentRect.left) / zoom,
        top: (rect.top - contentRect.top) / zoom,
        width: rect.width / zoom,
        height: rect.height / zoom,
      };
    });
}

describe('R2b page packing', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('Page Read uses beside packing with anchor arrows and no overflow at 1440x900', async () => {
    const env = ui.isolated('r2b-read');
    await launch('r2b-read');
    const packagePath = await openPackage(env, 'Side packing', sidePackingDocument());
    await showPageRead();

    // R2c makes compaction the compact default. This suite is the beside
    // reference policy, so select it explicitly.
    await setSettings({
      page: {
        setup: {
          size: 'A4',
          orientation: 'landscape',
          margins: { top: 12, right: 12, bottom: 12, left: 12 },
        },
        theme: { preset: 'compact', pagePacking: 'beside' },
        manualBreakBeforeBlockIds: [],
      },
      continuous: { zoom: 1 },
    });

    const resolved = await page.evaluate(
      (path) => window.__noteforestTest.resolvedPageSettings(path),
      packagePath,
    );
    assert.equal(resolved.theme.pagePacking, 'beside', 'beside is selected for this suite');
    assert.equal(await pageCount(), 1, 'the short packing fixture fits one page');

    const { root, child, rootCallout } = await assertBesideGeometry('landscape 1440');

    // The callout is anchor-aligned when the lane allows it (AC-52), and the
    // connector starts at the resolved anchor, not at the clamped card edge.
    const anchor = await anchorBox('anchor-root');
    assert.ok(
      closeTo(rootCallout.left, anchor.left, 2) ||
        closeTo(rootCallout.left, root.left + 9, 1),
      `callout ${rootCallout.left} is anchor-aligned (${anchor.left}) or clamped to the lane left`,
    );
    assert.ok(anchor.top < rootCallout.top, 'the anchor is above its callout');
    assert.ok(rootCallout.left + rootCallout.width + SIBLING_GAP <= child.left + 0.75);

    const svg = activePageView().locator('.nf-page-edges');
    assert.equal(await svg.count(), 1);
    assert.equal(Number(await svg.getAttribute('data-page-edge-count')), 6);
    assert.equal(
      await activePageView().locator('[data-page-edge-id="branch-callout-root"]').getAttribute('data-page-edge-anchor-start'),
      'true',
    );
    assert.equal(
      await activePageView().locator('[data-page-edge-id="branch-callout-child"]').getAttribute('data-page-edge-anchor-start'),
      'true',
    );
    assert.equal(
      await activePageView().locator('[data-page-edge-id="branch-reference"]').getAttribute('data-page-edge-role'),
      'reference',
    );
    assert.notEqual(
      await activePageView()
        .locator('[data-page-edge-id="branch-reference"] .nf-page-edge-path')
        .evaluate((element) => getComputedStyle(element).strokeDasharray),
      'none',
      'reference arrows remain dashed',
    );
  });

  it('keeps beside packing at 960x720 and in portrait, or falls back deterministically', async () => {
    const env = ui.isolated('r2b-sizes');
    await launch('r2b-sizes');
    await openPackage(env, 'Side packing sizes', sidePackingDocument());
    await showPageRead();
    await setSettings({
      page: {
        setup: {
          size: 'A4',
          orientation: 'landscape',
          margins: { top: 12, right: 12, bottom: 12, left: 12 },
        },
        theme: { preset: 'compact', pagePacking: 'beside' },
        manualBreakBeforeBlockIds: [],
      },
      continuous: { zoom: 1 },
    });

    await h.setWindowSize(960, 720);
    await assertBesideGeometry('landscape 960');

    await setSettings({
      page: {
        setup: {
          size: 'A4',
          orientation: 'portrait',
          margins: { top: 12, right: 12, bottom: 12, left: 12 },
        },
        theme: { preset: 'compact', pagePacking: 'beside' },
        manualBreakBeforeBlockIds: [],
      },
      continuous: { zoom: 1 },
    });
    await waitPageReady();
    // Portrait still has enough width for the wide root child in this fixture,
    // but not for the nested child's own right column; the nested block falls
    // back to stacked while the root-level beside rule stays active.
    await assertBesideGeometry('portrait 1440', { nestedBeside: false });

    await h.setWindowSize(960, 720);
    await assertBesideGeometry('portrait 960', { nestedBeside: false });

    // The fallback is deterministic: switching back to landscape restores the
    // nested beside geometry.
    await setSettings({
      page: {
        setup: {
          size: 'A4',
          orientation: 'landscape',
          margins: { top: 12, right: 12, bottom: 12, left: 12 },
        },
        theme: { preset: 'compact', pagePacking: 'beside' },
        manualBreakBeforeBlockIds: [],
      },
      continuous: { zoom: 1 },
    });
    await waitPageReady();
    await assertBesideGeometry('landscape restored');
  });

  it('keeps the surface in Page Edit and restores stacked when the option is overridden', async () => {
    const env = ui.isolated('r2b-edit');
    await launch('r2b-edit');
    const packagePath = await openPackage(env, 'Side packing edit', sidePackingDocument());
    await showPageRead();

    // A stacked override is the R2a geometry: callouts first, then the direct
    // child below them. The option is honored by the page model, not just the
    // lab.
    await setPageSettingsOverride(packagePath, { theme: { pagePacking: 'stacked' } });
    const stacked = await page.evaluate(
      (path) => window.__noteforestTest.resolvedPageSettings(path),
      packagePath,
    );
    assert.equal(stacked.theme.pagePacking, 'stacked');
    const root = await fragmentBox('side-root');
    const child = await fragmentBox('side-child');
    const rootCallout = await fragmentBox('side-callout-root');
    const midCallout = await fragmentBox('side-callout-mid');
    assert.ok(
      child.top > rootCallout.top + rootCallout.height - 0.75,
      'stacked: the direct child starts below the first callout',
    );
    assert.ok(
      child.top >= midCallout.top + midCallout.height + CALLOUT_GAP - 0.75,
      'stacked: the direct child starts below the whole callout stack',
    );
    assert.ok(
      closeTo(child.left, root.left + root.width + SIBLING_GAP, 0.75),
      'stacked: the child keeps the right-column x but starts after the callouts',
    );

    await setPageSettingsOverride(packagePath, { theme: { pagePacking: 'beside' } });
    assert.equal(await pageCount(), 1);
    const beside = await assertBesideGeometry('landscape after stacked override');

    // Page Edit keeps the same beside geometry and the arrow layer.
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.interactionMode === 'edit',
      packagePath,
      { timeout: 5000 },
    );
    assert.equal(await activePageView().locator('.nf-page-edges').count(), 1);
    await assertBesideGeometry('Page Edit');

    await activePageView().locator('[data-fragment-block="side-child"]').dblclick();
    const overlay = activePageView().locator('[data-page-edit-overlay="true"]');
    await overlay.waitFor({ timeout: 10000 });
    const overlayBox = await overlay.evaluate((element) => {
      const sheet =
        element.closest('.nf-page-sheet') ??
        element.parentElement?.querySelector('.nf-page-sheet') ??
        element.ownerDocument.querySelector('.nf-page-view .nf-page-sheet');
      return {
        left: Number.parseFloat(element.style.left),
        top: Number.parseFloat(element.style.top),
        width: Number.parseFloat(element.style.width),
        marginLeft: Number.parseFloat(sheet?.getAttribute('data-margin-left') ?? '0'),
        marginTop: Number.parseFloat(sheet?.getAttribute('data-margin-top') ?? '0'),
      };
    });
    assert.ok(closeTo(overlayBox.left - overlayBox.marginLeft, beside.child.left, 1));
    assert.ok(closeTo(overlayBox.top - overlayBox.marginTop, beside.child.top, 1));
    assert.ok(closeTo(overlayBox.width, beside.child.width, 1));
    assert.equal(await activePageView().locator('[contenteditable="true"]').count(), 1);

    await page.waitForFunction(
      () => document.activeElement?.closest('[data-page-edit-overlay]') !== null,
      undefined,
      { timeout: 5000 },
    );
    const editable = overlay.locator('.nf-page-edit-prose');
    await editable.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Still beside.');
    await page.keyboard.press('Meta+Enter');
    await overlay.waitFor({ state: 'detached', timeout: 20000 });
    await waitPageReady(1);
    const structure = await ui.structure();
    const childContent = JSON.stringify(structure.blocks['side-child']?.content ?? {});
    assert.match(childContent, /Still beside\./);
    assert.equal(await pageCount(), 1, 'the edited page still fits one page');
    await assertBesideGeometry('after Page Edit commit');

    // Continuous does not use the page engine; it renders the classic below
    // callout and no page surface.
    await page.keyboard.press('Meta+2');
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view', {
      state: 'detached',
    });
    const continuousRoot = await page
      .locator('.nf-editor[data-active="true"] [data-block-card="side-root"]')
      .boundingBox();
    const continuousCallout = await page
      .locator('.nf-editor[data-active="true"] [data-block-card="side-callout-root"]')
      .boundingBox();
    assert.ok(continuousRoot !== null && continuousCallout !== null);
    assert.ok(
      continuousCallout.y >= continuousRoot.y + continuousRoot.height - 1,
      'Continuous keeps its own below-parent callout geometry',
    );
    assert.equal(await page.locator('.nf-page-sheet').count(), 0, 'Continuous has no page sheet');
  });
});
