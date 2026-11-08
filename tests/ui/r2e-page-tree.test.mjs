import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { compactionDocument, writePagePackage } from '../support/page-fixtures.mjs';

/**
 * R2c Page tree UI (supersedes the old row-fill compaction oracle).
 *
 * The compact page default is `beside`: direct siblings share one level
 * column at the right of the parent, the next sibling starts below the
 * previous subtree, and a child that does not fit to the right wraps below its
 * own parent with one wrap indent. Callouts stay below the parent in their
 * left lane. Continuous does not mount the page layout.
 */

const tempRoot = artifactsPath('r2c-ui');
const outputDir = artifactsPath('r2c', 'ui');
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

async function currentPage() {
  return Number(await activePageView().getAttribute('data-current-page'));
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

function assertInsideContent(boxes, content, label) {
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
}

/**
 * The fixture tree: root, anchored callout, direct children child/leaf-2/leaf-3
 * and the child's grandchild. Siblings share one x column; each next sibling
 * starts below the previous subtree. The grandchild is either beside its child
 * or wrapped below it at one indent.
 */
async function assertTreeGeometry(label) {
  const root = await fragmentBox('comp-root');
  const callout = await fragmentBox('comp-callout');
  const child = await fragmentBox('comp-child');
  const leaf2 = await fragmentBox('comp-leaf-2');
  const leaf3 = await fragmentBox('comp-leaf-3');
  const grandchild = await fragmentBox('comp-grandchild');
  const content = await contentBox();
  const boxes = await allFragmentBoxes();

  assert.equal(root.role, 'top-level');
  assert.equal(callout.role, 'callout');
  assert.equal(child.role, 'child');
  assert.equal(leaf2.role, 'child');
  assert.equal(leaf3.role, 'child');
  assert.equal(grandchild.role, 'child');
  assert.equal(root.depth, 0);
  assert.equal(child.depth, 1);
  assert.equal(leaf2.depth, 1);
  assert.equal(leaf3.depth, 1);
  assert.equal(grandchild.depth, 2);

  // Callouts stay below the parent, never in the sibling row.
  assert.ok(
    callout.top >= root.top + root.height + CALLOUT_GAP - 0.75,
    `${label}: the callout starts below the parent`,
  );
  assert.ok(
    callout.left <= root.left + root.width + 0.75,
    `${label}: the callout stays in the parent lane`,
  );

  // Direct children either all fit beside the parent at its y, or the whole
  // group wraps below it. They never become a row of sibling cards.
  const beside = closeTo(child.top, root.top, 1);
  if (beside) {
    assert.ok(
      closeTo(child.left, root.left + root.width + SIBLING_GAP, 0.75),
      `${label}: the child starts one sibling gap right of the parent`,
    );
  } else {
    assert.ok(
      child.top >= root.top + root.height + CALLOUT_GAP - 0.75,
      `${label}: the wrapped child starts below the parent/callouts`,
    );
    assert.ok(child.left >= root.left - 0.75, `${label}: the wrapped child keeps a left origin`);
  }
  assert.ok(closeTo(leaf2.left, child.left, 0.75), `${label}: leaf 2 shares the child column`);
  assert.ok(closeTo(leaf3.left, child.left, 0.75), `${label}: leaf 3 shares the child column`);
  assert.ok(
    leaf2.left + leaf2.width <= content.width + 0.75,
    `${label}: the level column stays inside the page`,
  );

  const childSubtreeBottom = Math.max(child.top + child.height, grandchild.top + grandchild.height);
  assert.ok(
    leaf2.top >= childSubtreeBottom + SIBLING_GAP - 0.75,
    `${label}: leaf 2 starts below the child subtree`,
  );
  assert.ok(
    leaf3.top >= leaf2.top + leaf2.height + SIBLING_GAP - 0.75,
    `${label}: leaf 3 starts below leaf 2`,
  );

  // The grandchild is either beside the child or wrapped below it; it never
  // appears to the right of a later sibling.
  if (grandchild.left > child.left + child.width + 0.5) {
    assert.ok(
      closeTo(grandchild.top, child.top, 1),
      `${label}: the beside grandchild shares the child y`,
    );
  } else {
    assert.ok(
      grandchild.top >= child.top + child.height - 0.75,
      `${label}: the wrapped grandchild starts below its parent`,
    );
    assert.ok(
      grandchild.left >= child.left - 0.75,
      `${label}: the wrapped grandchild keeps the child column`,
    );
  }

  assertNoOverlap(boxes, label);
  assertInsideContent(boxes, content, label);
  return { root, callout, child, leaf2, leaf3, grandchild, content, boxes };
}

async function setSettings(settings) {
  const runsBefore = Number(await activePageView().getAttribute('data-model-runs'));
  await page.evaluate((value) => window.__noteforestTest.setSettings(value), settings);
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

describe('Page tree geometry', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await rm(outputDir, { recursive: true, force: true });
    await mkdir(outputDir, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('Page Read keeps siblings in one level column at 1440x900', async () => {
    const env = ui.isolated('r2c-read');
    await launch('r2c-read');
    const packagePath = await openPackage(env, 'Compaction page', compactionDocument());
    await showPageRead();

    const resolved = await page.evaluate(
      (path) => window.__noteforestTest.resolvedPageSettings(path),
      packagePath,
    );
    assert.equal(resolved.theme.pagePacking, 'beside', 'the compact default is the tree/column packing');
    assert.ok((await pageCount()) >= 1, 'the tree fixture has at least one page');

    const geometry = await assertTreeGeometry('landscape 1440');
    assert.ok(geometry.callout.width - CARD_CHROME >= 144 - 0.75, 'callout stays readable');
    assert.ok(geometry.child.width - CARD_CHROME >= 160 - 0.75, 'child stays readable');

    const svg = activePageView().locator('.nf-page-edges');
    assert.equal(await svg.count(), 1);
    assert.equal(Number(await svg.getAttribute('data-page-edge-count')), 6);
    assert.equal(
      await activePageView()
        .locator('[data-page-edge-id="branch-comp-callout"]')
        .getAttribute('data-page-edge-anchor-start'),
      'true',
      'the callout edge starts at the resolved anchor',
    );
    assert.equal(
      await activePageView()
        .locator('[data-page-edge-id="branch-comp-reference"]')
        .getAttribute('data-page-edge-role'),
      'reference',
    );
    assert.notEqual(
      await activePageView()
        .locator('[data-page-edge-id="branch-comp-reference"] .nf-page-edge-path')
        .evaluate((element) => getComputedStyle(element).strokeDasharray),
      'none',
      'reference arrows remain dashed',
    );

    await h.screenshot(artifactsPath('r2c', 'ui', 'page-read-tree-1440x900-landscape.png'), {
      width: 1440,
      height: 900,
    });
  });

  it('keeps the tree column at 960x720 and in portrait, then restores landscape', async () => {
    const env = ui.isolated('r2c-sizes');
    await launch('r2c-sizes');
    await openPackage(env, 'Compaction page sizes', compactionDocument());
    await showPageRead();

    await h.setWindowSize(960, 720);
    await assertTreeGeometry('landscape 960');
    await h.screenshot(artifactsPath('r2c', 'ui', 'page-read-tree-960x720-landscape.png'), {
      width: 960,
      height: 720,
    });

    await setSettings({
      page: {
        setup: {
          size: 'A4',
          orientation: 'portrait',
          margins: { top: 12, right: 12, bottom: 12, left: 12 },
        },
        theme: { preset: 'compact' },
        manualBreakBeforeBlockIds: [],
      },
      continuous: { zoom: 1 },
    });
    await waitPageReady();
    // Portrait is narrower: the first row still packs the callout beside the
    // root, while the overflow leaves wrap below; nothing overflows or overlaps.
    const portrait = await assertTreeGeometry('portrait 1440', { fullRow: false });
    assert.ok(portrait.leaf2.top >= portrait.child.top, 'portrait wraps the overflow leaf');
    await h.setWindowSize(960, 720);
    await h.screenshot(artifactsPath('r2c', 'ui', 'page-read-tree-960x720-portrait.png'), {
      width: 960,
      height: 720,
    });

    await setSettings({
      page: {
        setup: {
          size: 'A4',
          orientation: 'landscape',
          margins: { top: 12, right: 12, bottom: 12, left: 12 },
        },
        theme: { preset: 'compact' },
        manualBreakBeforeBlockIds: [],
      },
      continuous: { zoom: 1 },
    });
    await waitPageReady();
    await assertTreeGeometry('landscape restored');
  });

  it('keeps the tree layout in Page Edit, commits the overlay, and leaves Continuous alone', async () => {
    const env = ui.isolated('r2c-edit');
    await launch('r2c-edit');
    const packagePath = await openPackage(env, 'Compaction page edit', compactionDocument());
    await showPageRead();
    await assertTreeGeometry('Page Read before edit');

    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.interactionMode === 'edit',
      packagePath,
      { timeout: 5000 },
    );
    assert.equal(await activePageView().locator('.nf-page-edges').count(), 1);
    const besideEdit = await assertTreeGeometry('Page Edit');
    await h.screenshot(artifactsPath('r2c', 'ui', 'page-edit-tree-1440x900-landscape.png'), {
      width: 1440,
      height: 900,
    });

    await activePageView().locator('[data-fragment-block="comp-child"]').dblclick();
    const overlay = activePageView().locator('[data-page-edit-overlay="true"]');
    await overlay.waitFor({ timeout: 10000 });
    await h.screenshot(artifactsPath('r2c', 'ui', 'page-edit-overlay-tree-1440x900-landscape.png'), {
      width: 1440,
      height: 900,
    });
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
    assert.ok(closeTo(overlayBox.left - overlayBox.marginLeft, besideEdit.child.left, 1));
    assert.ok(closeTo(overlayBox.top - overlayBox.marginTop, besideEdit.child.top, 1));
    assert.ok(closeTo(overlayBox.width, besideEdit.child.width, 1));
    assert.equal(await activePageView().locator('[contenteditable="true"]').count(), 1);

    await page.waitForFunction(
      () => document.activeElement?.closest('[data-page-edit-overlay]') !== null,
      undefined,
      { timeout: 5000 },
    );
    const editable = overlay.locator('.nf-page-edit-prose');
    await editable.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Still compact.');
    await page.keyboard.press('Meta+Enter');
    await overlay.waitFor({ state: 'detached', timeout: 20000 });
    await waitPageReady();
    const structure = await ui.structure();
    const childContent = JSON.stringify(structure.blocks['comp-child']?.content ?? {});
    assert.match(childContent, /Still compact\./);
    await assertTreeGeometry('after Page Edit commit');

    // Continuous does not use the page engine: no page sheet, and the
    // anchored callout keeps its below-parent continuous geometry.
    await page.keyboard.press('Meta+2');
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view', {
      state: 'detached',
    });
    const continuousRoot = await page
      .locator('.nf-editor[data-active="true"] [data-block-card="comp-root"]')
      .boundingBox();
    const continuousCallout = await page
      .locator('.nf-editor[data-active="true"] [data-block-card="comp-callout"]')
      .boundingBox();
    assert.ok(continuousRoot !== null && continuousCallout !== null);
    assert.ok(
      continuousCallout.y >= continuousRoot.y + continuousRoot.height - 1,
      'Continuous keeps its below-parent callout geometry',
    );
    assert.equal(await page.locator('.nf-page-sheet').count(), 0, 'Continuous has no page sheet');
  });

  it('honors a stacked override without changing the page model wiring', async () => {
    const env = ui.isolated('r2c-override');
    await launch('r2c-override');
    const packagePath = await openPackage(env, 'Compaction page override', compactionDocument());
    await showPageRead();
    await assertTreeGeometry('tree default');

    await setPageSettingsOverride(packagePath, { theme: { pagePacking: 'stacked' } });
    const stacked = await page.evaluate(
      (path) => window.__noteforestTest.resolvedPageSettings(path),
      packagePath,
    );
    assert.equal(stacked.theme.pagePacking, 'stacked');
    const root = await fragmentBox('comp-root');
    const callout = await fragmentBox('comp-callout');
    const child = await fragmentBox('comp-child');
    assert.ok(
      callout.top >= root.top + root.height - 0.75,
      'stacked: the callout starts below the root',
    );
    assert.ok(
      child.top >= callout.top + callout.height - 0.75,
      'stacked: the child starts below the callout stack',
    );
    assert.equal(await currentPage(), 1);

    await setPageSettingsOverride(packagePath, { theme: { pagePacking: 'beside' } });
    await assertTreeGeometry('tree restored');
  });
});
