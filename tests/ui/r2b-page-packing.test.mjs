import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { sidePackingDocument, writePagePackage } from '../support/page-fixtures.mjs';

/**
 * R2b Page packing UI.
 *
 * The page default is compact + beside. R2j chooses a callout mode per parent:
 * mode A on a wide page (callouts in the parent's right lane, children below),
 * mode B2 on a narrow page (two independent below trunks), and the stacked
 * fallback when neither fits. The explicit `stacked` packing keeps the
 * historical below-callout geometry. Continuous does not mount the page layout
 * at all, so it cannot change here.
 */

const tempRoot = artifactsPath('r2b-ui');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

// Fixed Page corridor: lead 4 + stem 14.
const SIBLING_GAP = 18;
const CALLOUT_GAP = 16;
const CALLOUT_RIGHT_GAP = 24;
const CALLOUT_CARD_INDENT = 38;
const CHILD_INDENT = 26;

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
  await ui.ensureInteractionMode('read');
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

async function assertModeAGeometry(label) {
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

  // Mode A: callouts in the parent's right lane, stacked from the parent top.
  for (const callout of [rootCallout, midCallout]) {
    assert.ok(
      closeTo(callout.left, root.left + root.width + CALLOUT_RIGHT_GAP, 2),
      `${label}: ${callout.blockId} sits in the parent right lane`,
    );
  }
  assert.ok(closeTo(rootCallout.top, root.top, 1), `${label}: the first callout starts at the parent y`);
  assert.ok(
    midCallout.top >= rootCallout.top + rootCallout.height + CALLOUT_GAP - 0.75,
    `${label}: the second root callout stacks below the first`,
  );

  // The lane decision moves the whole direct-child group below at the child
  // indent, even though the child card alone could fit beside the parent.
  assert.ok(
    closeTo(child.left, root.left + CHILD_INDENT, 1.5),
    `${label}: the child uses the child indent`,
  );
  assert.ok(
    child.top >= midCallout.top + midCallout.height + SIBLING_GAP - 0.75,
    `${label}: the child group starts below the callout stack`,
  );

  // The nested parent repeats mode A independently.
  const childCallout = await fragmentBox('side-callout-child');
  const grandChild = await fragmentBox('side-grandchild');
  assert.equal(childCallout.role, 'callout');
  assert.equal(grandChild.role, 'child');
  assert.ok(
    closeTo(childCallout.left, child.left + child.width + CALLOUT_RIGHT_GAP, 2),
    `${label}: the nested callout uses the child right lane`,
  );
  assert.ok(closeTo(childCallout.top, child.top, 1), `${label}: the nested callout starts at the child y`);
  assert.ok(
    closeTo(grandChild.left, child.left + CHILD_INDENT, 1.5),
    `${label}: the nested child uses the child indent`,
  );
  assert.ok(
    grandChild.top >= childCallout.top + childCallout.height + SIBLING_GAP - 0.75,
    `${label}: the nested child group starts below the nested callout`,
  );

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

async function assertB2Geometry(label) {
  const root = await fragmentBox('side-root');
  const rootCallout = await fragmentBox('side-callout-root');
  const midCallout = await fragmentBox('side-callout-mid');
  const child = await fragmentBox('side-child');
  const childCallout = await fragmentBox('side-callout-child');
  const grandChild = await fragmentBox('side-grandchild');
  const content = await contentBox();
  const boxes = await allFragmentBoxes();

  // B2: no right lane. Callouts first on the inner/right column, children
  // lower on the outer/left column.
  for (const callout of [rootCallout, midCallout]) {
    assert.ok(
      closeTo(callout.left, root.left + CALLOUT_CARD_INDENT, 1.5),
      `${label}: ${callout.blockId} uses the callout card indent`,
    );
  }
  assert.ok(
    rootCallout.top >= root.top + root.height + CALLOUT_GAP - 0.75,
    `${label}: the callout group starts below the parent card`,
  );
  assert.ok(
    midCallout.top >= rootCallout.top + rootCallout.height + CALLOUT_GAP - 0.75,
    `${label}: the second root callout stacks below the first`,
  );
  assert.ok(
    closeTo(child.left, root.left + CHILD_INDENT, 1.5),
    `${label}: the wrapped child uses the Page child indent`,
  );
  assert.ok(
    child.top >= midCallout.top + midCallout.height + SIBLING_GAP - 0.75,
    `${label}: the child group starts below the whole callout stack`,
  );

  // The nested group repeats B2 at its own origin.
  assert.ok(
    closeTo(childCallout.left, child.left + CALLOUT_CARD_INDENT, 1.5),
    `${label}: the nested callout uses its own B2 card column`,
  );
  assert.ok(
    closeTo(grandChild.left, child.left + CHILD_INDENT, 1.5),
    `${label}: the nested child uses its own child column`,
  );
  assert.ok(
    childCallout.top >= child.top + child.height + CALLOUT_GAP - 0.75,
    `${label}: the nested callout starts below the child`,
  );
  assert.ok(
    grandChild.top >= childCallout.top + childCallout.height + SIBLING_GAP - 0.75,
    `${label}: the nested child group starts below the nested callout`,
  );

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

  it('Page Read uses mode A with anchor arrows and no overflow at 1440x900', async () => {
    const env = ui.isolated('r2b-read');
    await launch('r2b-read');
    const packagePath = await openPackage(env, 'Side packing', sidePackingDocument());
    await showPageRead();

    // Compact defaults to beside/tree packing; R2j applies the per-parent A/B2
    // choice on top of it.
    const resolved = await page.evaluate(
      (path) => window.__noteforestTest.resolvedPageSettings(path),
      packagePath,
    );
    assert.equal(resolved.theme.pagePacking, 'beside', 'beside is selected for this suite');
    assert.equal(await pageCount(), 1, 'the short packing fixture fits one page');

    const { root, child, rootCallout } = await assertModeAGeometry('landscape 1440');

    // The anchor stays declared for accessibility; the visible mode A leader
    // exits the parent card's right side.
    const anchor = await anchorBox('anchor-root');
    assert.ok(
      anchor.top >= rootCallout.top && anchor.top < root.top + root.height,
      'the anchor stays inside the parent card, left of the right-lane callout',
    );
    assert.ok(
      closeTo(rootCallout.left, root.left + root.width + CALLOUT_RIGHT_GAP, 2),
      'the callout is in the right lane, not the stacked anchor lane',
    );
    assert.ok(rootCallout.left > anchor.left, 'the right lane is right of the anchor');

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
    assert.equal(
      await activePageView().locator('[data-page-edge-id="branch-callout-root"]').getAttribute('data-page-edge-trunk-id'),
      'side-root:right',
    );
  });

  it('keeps mode A at 960 and in portrait, and switches to B2 on a narrow page', async () => {
    const env = ui.isolated('r2b-sizes');
    await launch('r2b-sizes');
    await openPackage(env, 'Side packing sizes', sidePackingDocument());
    await showPageRead();

    await h.setWindowSize(960, 720);
    await assertModeAGeometry('landscape 960');

    // A5 portrait has no right lane: B2 splits the below group into the two
    // independent trunks and keeps the nested group independent.
    await setSettings({
      page: {
        setup: {
          size: 'A5',
          orientation: 'portrait',
          margins: { top: 12, right: 12, bottom: 12, left: 12 },
        },
        theme: { preset: 'compact', pagePacking: 'beside' },
        manualBreakBeforeBlockIds: [],
      },
      continuous: { zoom: 1 },
    });
    await waitPageReady();
    const b2 = await assertB2Geometry('A5 portrait 1440');
    assert.ok(b2 !== null);

    await h.setWindowSize(960, 720);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await assertB2Geometry('A5 portrait 960');

    // The choice is deterministic from the resolved Page width: switching back
    // to A4 landscape restores mode A.
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
    await assertModeAGeometry('landscape restored');
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
    const beside = await assertModeAGeometry('landscape after stacked override');

    // Page Edit keeps the same mode A geometry and the arrow layer.
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.interactionMode === 'edit',
      packagePath,
      { timeout: 5000 },
    );
    assert.equal(await activePageView().locator('.nf-page-edges').count(), 1);
    await assertModeAGeometry('Page Edit');

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
    await assertModeAGeometry('after Page Edit commit');

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
