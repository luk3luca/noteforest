import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { pageCalloutModesDocument, writePagePackage } from '../support/page-fixtures.mjs';

/**
 * R2j Page callout modes A + B2.
 *
 * The same canonical fixture resolves per parent from the placed parent box
 * and the resolved Page right limit:
 * - A: anchored callouts in the free right lane; direct children below at the
 *   child indent; the callout leader may exit the parent card's right side.
 * - B2: callouts first on the inner/right below trunk (24/38); children lower
 *   on the outer/left trunk (12/26).
 * - Stacked fallback: neither lane fits, so callouts first and children below
 *   share the one below trunk.
 *
 * Continuous is never measured here. Page Read/Edit and the print model consume
 * the same layout/page-edge records.
 */

const tempRoot = artifactsPath('r2j-ui');
const outputDir = artifactsPath('r2j', 'ui');
const evidenceDir = artifactsPath('r2j');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

const CALLOUT_RIGHT_GAP = 24;
const CALLOUT_CARD_INDENT = 38;
const CHILD_INDENT = 26;
const CALLOUT_TRUNK_INSET = 24;
const CHILD_TRUNK_INSET = 12;
const CALLOUT_GAP = 12;
const SIBLING_GAP = 16;
const STEM_MIN = 12;
const TOLERANCE = 1.5;

const A5_PORTRAIT = {
  size: 'A5',
  orientation: 'portrait',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
};
const A5_PORTRAIT_STACKED = {
  size: 'A5',
  orientation: 'portrait',
  margins: { top: 46, right: 46, bottom: 46, left: 46 },
};

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

function currentSheet() {
  return activePageView().locator('.nf-page-sheet[data-page-current="true"]');
}

function currentSlot() {
  return activePageView().locator('[data-page-slot-current="true"]');
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

async function defectsShown() {
  return activePageView().locator('[data-page-defects="true"]').count();
}

async function currentPage() {
  return Number(await activePageView().getAttribute('data-current-page'));
}

/** Scroll to one page start through the jump surface, then settle. */
async function gotoPage(number) {
  await ui.gotoPage(number);
  await page.waitForFunction(
    (expected) => {
      const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
      return (
        Number(view?.getAttribute('data-current-page')) === expected &&
        view?.getAttribute('data-updating') === 'false'
      );
    },
    number,
    { timeout: 10000 },
  );
}

async function fragmentBox(blockId) {
  return currentSheet()
    .locator(`[data-fragment-block="${blockId}"]`)
    .evaluate((element) => ({
      blockId: element.getAttribute('data-fragment-block') ?? '',
      role: element.getAttribute('data-fragment-role'),
      left: Number.parseFloat(element.style.left),
      top: Number.parseFloat(element.style.top),
      width: Number.parseFloat(element.style.width),
      height: Number.parseFloat(element.style.height),
    }));
}

async function allFragmentBoxes() {
  return currentSheet()
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

async function contentBox() {
  return currentSheet()
    .locator('[data-page-content]')
    .evaluate((element) => ({
      width: Number.parseFloat(element.style.width),
      height: Number.parseFloat(element.style.height),
    }));
}

async function anchorBox(anchorId) {
  return currentSheet()
    .locator(`.nf-anchor[data-anchor-id="${anchorId}"]`)
    .evaluate((element) => {
      const view = element.closest('.nf-page-view');
      const content = view.querySelector('.nf-page-content');
      const wrap = view.querySelector('.nf-page-sheet-wrap');
      const zoom = Number(wrap?.getAttribute('data-page-scale') ?? '1');
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

async function readEdges() {
  return currentSheet()
    .locator('[data-page-edge-id]')
    .evaluateAll((elements) =>
      elements.map((element) => ({
        branchId: element.getAttribute('data-page-edge-id') ?? '',
        role: element.getAttribute('data-page-edge-role') ?? '',
        direction: element.getAttribute('data-page-edge-direction') ?? '',
        targetPage: element.getAttribute('data-page-edge-target-page'),
        from: element.getAttribute('data-page-edge-from') ?? '',
        to: element.getAttribute('data-page-edge-to') ?? '',
        route: element.getAttribute('data-page-edge-route') ?? '',
        entry: element.getAttribute('data-page-edge-entry') ?? '',
        arrow: element.getAttribute('data-page-edge-arrow') ?? '',
        stem: Number(element.getAttribute('data-page-edge-stem')),
        placement: element.getAttribute('data-page-edge-placement') ?? '',
        trunkId: element.getAttribute('data-page-edge-trunk-id') ?? '',
        trunkGroup: element.getAttribute('data-page-edge-trunk-group') ?? '',
        trunkPlacement: element.getAttribute('data-page-edge-trunk-placement') ?? '',
        trunkX: Number(element.getAttribute('data-page-edge-trunk-x')),
        anchorStart: element.getAttribute('data-page-edge-anchor-start') === 'true',
        label: element.getAttribute('data-page-edge-label'),
      })),
    );
}

async function readTrunks() {
  return currentSheet()
    .locator('[data-page-trunk-id]')
    .evaluateAll((elements) =>
      elements.map((element) => ({
        id: element.getAttribute('data-page-trunk-id') ?? '',
        parent: element.getAttribute('data-page-trunk-parent') ?? '',
        placement: element.getAttribute('data-page-trunk-placement') ?? '',
        group: element.getAttribute('data-page-trunk-group') ?? '',
        x: Number(element.getAttribute('data-page-trunk-x')),
        port: element.getAttribute('data-page-trunk-port') ?? '',
        portPage: Number(element.getAttribute('data-page-trunk-port-page')),
        page: Number(element.getAttribute('data-page-trunk-page')),
        start: element.getAttribute('data-page-trunk-start') ?? '',
        end: element.getAttribute('data-page-trunk-end') ?? '',
        lead: element.getAttribute('data-page-trunk-lead'),
        segmentCount: Number(element.getAttribute('data-page-trunk-segment-count')),
      })),
    );
}

function parsePoint(value) {
  const [x, y] = (value ?? '').split(',').map(Number);
  assert.ok(Number.isFinite(x) && Number.isFinite(y), `point ${value} parses`);
  return { x, y };
}

function closeTo(actual, expected, tolerance = TOLERANCE) {
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

async function writeEvidence(name, fixture) {
  const boxes = await allFragmentBoxes();
  const content = await contentBox();
  const usedArea = boxes.reduce((total, box) => total + box.width * box.height, 0);
  const contentArea = content.width * content.height;
  const evidence = {
    fixture,
    pageCount: await pageCount(),
    content,
    whitespaceRatio: contentArea > 0 ? Number((1 - usedArea / contentArea).toFixed(4)) : 0,
    boxes,
    trunks: await readTrunks(),
  };
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(resolve(evidenceDir, `${name}.json`), JSON.stringify(evidence, null, 2), 'utf8');
  return evidence;
}

describe('R2j Page callout modes', () => {
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

  it('mode A: callouts right of the parent and children below at the child indent', async () => {
    const env = ui.isolated('r2j-a');
    await launch('r2j-a');
    await openPackage(env, 'Page callout modes A', pageCalloutModesDocument());
    await showPageRead();
    assert.equal(await defectsShown(), 0, 'mode A renders no defect banner');

    const root = await fragmentBox('cm-root');
    const calloutA = await fragmentBox('cm-callout-a');
    const calloutB = await fragmentBox('cm-callout-b');
    const childA = await fragmentBox('cm-child');
    const childB = await fragmentBox('cm-child-b');
    const nestedCallout = await fragmentBox('cm-nested-callout');
    const grandchild = await fragmentBox('cm-grandchild');
    const content = await contentBox();
    const boxes = await allFragmentBoxes();

    // Right lane: both callouts start one calloutRightGap right of the parent
    // card, at the parent's top y, stacked with the callout gap.
    for (const callout of [calloutA, calloutB]) {
      assert.ok(
        closeTo(callout.left - root.left, root.width + CALLOUT_RIGHT_GAP, 2),
        `${callout.blockId} starts in the right lane (${callout.left - root.left})`,
      );
      assert.equal(callout.role, 'callout');
    }
    assert.ok(closeTo(calloutA.top, root.top, 1), 'the first callout aligns with the parent top');
    assert.ok(
      calloutB.top >= calloutA.top + calloutA.height + CALLOUT_GAP - 0.75,
      'the second callout stacks below the first',
    );

    // Direct children below, in one level column at the child indent, after the
    // callout stack.
    assert.ok(
      closeTo(childA.left - root.left, CHILD_INDENT, 1.5),
      `the first child uses the child indent (${childA.left - root.left})`,
    );
    assert.ok(closeTo(childB.left, childA.left, 0.75), 'siblings share one child column');
    assert.ok(
      childA.top >= root.top + root.height - 0.75,
      'the child group starts below the parent card',
    );
    assert.ok(
      childA.top >= calloutB.top + calloutB.height + SIBLING_GAP - 0.75,
      'the child group starts below the whole callout stack',
    );
    assert.ok(
      childB.top >= childA.top + childA.height - 0.75,
      'the second child starts below the first child subtree',
    );

    // Nested groups repeat the mode independently at the child origin.
    assert.ok(
      nestedCallout.left >= childA.left + childA.width - 0.75,
      'the nested callout sits right of its own parent',
    );
    assert.ok(
      closeTo(nestedCallout.left - childA.left, childA.width + CALLOUT_RIGHT_GAP, 2),
      'the nested callout uses its own right lane',
    );
    assert.ok(
      grandchild.top >= childA.top + childA.height - 0.75,
      'the nested child group starts below its parent',
    );
    assert.ok(
      closeTo(grandchild.left - childA.left, CHILD_INDENT, 1.5),
      'the nested child uses the child indent',
    );

    const edges = await readEdges();
    const edgeOf = (branchId) => {
      const edge = edges.find((candidate) => candidate.branchId === branchId);
      assert.ok(edge !== undefined, `${branchId} exists`);
      return edge;
    };
    const rootCalloutA = edgeOf('branch-cm-callout-a');
    const rootCalloutB = edgeOf('branch-cm-callout-b');
    const rootChild = edgeOf('branch-cm-child');
    const rootChildB = edgeOf('branch-cm-child-b');
    const nested = edgeOf('branch-cm-nested-callout');
    const nestedChild = edgeOf('branch-cm-grandchild');

    for (const edge of edges) {
      assert.equal(edge.role, 'primary');
      assert.equal(edge.entry, 'left');
      assert.equal(edge.arrow, 'right');
      assert.equal(edge.label, null);
      assert.equal(edge.targetPage, null);
      assert.ok(edge.stem >= 11.99, `${edge.branchId}: full left stem`);
    }
    assert.equal(rootCalloutA.placement, 'right');
    assert.equal(rootCalloutB.placement, 'right');
    assert.equal(rootCalloutA.trunkId, 'cm-root:right');
    assert.equal(rootCalloutB.trunkId, 'cm-root:right');
    assert.equal(rootCalloutA.trunkGroup, '');
    assert.equal(rootCalloutA.trunkPlacement, 'right');
    assert.equal(rootCalloutA.anchorStart, true);
    assert.equal(rootCalloutB.anchorStart, true);
    // The callout leader exits the parent's right side.
    assert.ok(
      closeTo(parsePoint(rootCalloutA.from).x, root.left + root.width, 0.75),
      'the mode A leader starts at the parent right side',
    );

    assert.equal(rootChild.placement, 'below');
    assert.equal(rootChildB.placement, 'below');
    assert.equal(rootChild.trunkId, 'cm-root:below');
    assert.equal(rootChildB.trunkId, 'cm-root:below');
    assert.equal(rootChild.trunkGroup, '');
    assert.ok(
      parsePoint(rootChild.from).x < childA.left - 0.75,
      'the child trunk sits left of the child column',
    );

    assert.equal(nested.placement, 'right');
    assert.equal(nested.trunkId, 'cm-child:right');
    assert.equal(nestedChild.placement, 'below');
    assert.equal(nestedChild.trunkId, 'cm-child:below');
    assert.ok(
      nested.trunkId !== rootCalloutA.trunkId && nestedChild.trunkId !== rootChild.trunkId,
      'nested trunks stay independent',
    );

    const trunks = await readTrunks();
    assert.deepEqual(
      trunks.map((trunk) => trunk.id).sort(),
      ['cm-child:below', 'cm-child:right', 'cm-root:below', 'cm-root:right'],
    );
    assert.equal(trunks.filter((trunk) => trunk.group !== '').length, 0);

    assertNoOverlap(boxes, 'mode A');
    assertInsideContent(boxes, content, 'mode A');
    await writeEvidence('page-callout-modes-a', 'pageCalloutModes A');

    await h.screenshot(artifactsPath('r2j', 'ui', 'callout-modes-a-1440x900.png'), {
      width: 1440,
      height: 900,
    });
  });

  it('mode B2: two below trunks, callouts first on the inner/right trunk', async () => {
    const env = ui.isolated('r2j-b2');
    await launch('r2j-b2');
    const packagePath = await openPackage(env, 'Page callout modes B2', pageCalloutModesDocument());
    await showPageRead();
    await setPageSettingsOverride(packagePath, { setup: A5_PORTRAIT });
    await waitPageReady();
    assert.equal(await defectsShown(), 0, 'mode B2 renders no defect banner');

    const root = await fragmentBox('cm-root');
    const calloutA = await fragmentBox('cm-callout-a');
    const calloutB = await fragmentBox('cm-callout-b');
    const childA = await fragmentBox('cm-child');
    const childB = await fragmentBox('cm-child-b');
    const nestedCallout = await fragmentBox('cm-nested-callout');
    const grandchild = await fragmentBox('cm-grandchild');
    const content = await contentBox();
    const boxes = await allFragmentBoxes();

    // Callouts first, on the inner/right card column.
    for (const callout of [calloutA, calloutB]) {
      assert.ok(
        closeTo(callout.left - root.left, CALLOUT_CARD_INDENT, 1.5),
        `${callout.blockId} uses the callout card indent (${callout.left - root.left})`,
      );
    }
    assert.ok(
      calloutA.top >= root.top + root.height + CALLOUT_GAP - 0.75,
      'the callout stack starts below the parent card',
    );
    assert.ok(
      calloutB.top >= calloutA.top + calloutA.height + CALLOUT_GAP - 0.75,
      'the second callout stacks below the first',
    );

    // Children lower, on the outer/left card column.
    assert.ok(
      closeTo(childA.left - root.left, CHILD_INDENT, 1.5),
      `the first child uses the child indent (${childA.left - root.left})`,
    );
    assert.ok(closeTo(childB.left, childA.left, 0.75), 'siblings share one child column');
    assert.ok(
      childA.top >= calloutB.top + calloutB.height + SIBLING_GAP - 0.75,
      'the child group starts below the whole callout stack',
    );
    assert.ok(
      childB.top >= childA.top + childA.height - 0.75,
      'the second child starts below the first child subtree',
    );

    // Nested groups use the same B2 split at their own origin.
    assert.ok(
      closeTo(nestedCallout.left - childA.left, CALLOUT_CARD_INDENT, 1.5),
      'the nested callout uses its own B2 card column',
    );
    assert.ok(
      closeTo(grandchild.left - childA.left, CHILD_INDENT, 1.5),
      'the nested child uses its own child column',
    );
    assert.ok(
      nestedCallout.top >= childA.top + childA.height + CALLOUT_GAP - 0.75,
      'the nested callout starts below the child card',
    );
    assert.ok(
      grandchild.top >= nestedCallout.top + nestedCallout.height + SIBLING_GAP - 0.75,
      'the nested child group starts below the nested callout',
    );

    const edges = await readEdges();
    const edgeOf = (branchId) => {
      const edge = edges.find((candidate) => candidate.branchId === branchId);
      assert.ok(edge !== undefined, `${branchId} exists`);
      return edge;
    };
    const rootCalloutA = edgeOf('branch-cm-callout-a');
    const rootCalloutB = edgeOf('branch-cm-callout-b');
    const rootChild = edgeOf('branch-cm-child');
    const rootChildB = edgeOf('branch-cm-child-b');
    const nested = edgeOf('branch-cm-nested-callout');
    const nestedChild = edgeOf('branch-cm-grandchild');

    assert.equal(rootCalloutA.trunkId, 'cm-root:below:callout');
    assert.equal(rootCalloutB.trunkId, 'cm-root:below:callout');
    assert.equal(rootCalloutA.trunkGroup, 'callout');
    assert.equal(rootCalloutA.trunkPlacement, 'below');
    assert.equal(rootChild.trunkId, 'cm-root:below:child');
    assert.equal(rootChildB.trunkId, 'cm-root:below:child');
    assert.equal(rootChild.trunkGroup, 'child');
    assert.equal(rootChild.trunkPlacement, 'below');
    assert.ok(
      closeTo(rootCalloutA.trunkX - root.left, CALLOUT_TRUNK_INSET, 1),
      `the callout trunk is the inner/right trunk (${rootCalloutA.trunkX - root.left})`,
    );
    assert.ok(
      closeTo(rootChild.trunkX - root.left, CHILD_TRUNK_INSET, 1),
      `the child trunk is the outer/left trunk (${rootChild.trunkX - root.left})`,
    );
    assert.ok(rootChild.trunkX < rootCalloutA.trunkX, 'the child trunk stays left of the callout trunk');
    assert.ok(
      rootCalloutA.trunkX < calloutA.left - 0.75,
      'the callout trunk sits left of its callout cards',
    );
    assert.ok(
      rootChild.trunkX < childA.left - 0.75,
      'the child trunk sits left of its child cards',
    );

    assert.equal(nested.trunkId, 'cm-child:below:callout');
    assert.equal(nestedChild.trunkId, 'cm-child:below:child');
    assert.ok(
      nested.trunkId !== rootCalloutA.trunkId &&
        nestedChild.trunkId !== rootChild.trunkId,
      'nested B2 trunks stay independent',
    );

    for (const edge of edges) {
      assert.equal(edge.role, 'primary');
      assert.equal(edge.entry, 'left');
      assert.equal(edge.label, null);
      assert.equal(edge.targetPage, null);
      assert.ok(edge.stem >= 11.99, `${edge.branchId}: full left stem`);
    }
    const trunks = await readTrunks();
    assert.deepEqual(
      trunks.map((trunk) => trunk.id).sort(),
      [
        'cm-child:below:callout',
        'cm-child:below:child',
        'cm-root:below:callout',
        'cm-root:below:child',
      ],
    );
    for (const trunk of trunks) {
      assert.equal(trunk.placement, 'below');
      assert.notEqual(trunk.group, '');
    }

    assertNoOverlap(boxes, 'mode B2');
    assertInsideContent(boxes, content, 'mode B2');
    await writeEvidence('page-callout-modes-b2', 'pageCalloutModes B2');

    await h.screenshot(artifactsPath('r2j', 'ui', 'callout-modes-b2-1440x900.png'), {
      width: 1440,
      height: 900,
    });
  });

  it('stacked fallback: one shared below trunk when neither A nor B2 fits', async () => {
    const env = ui.isolated('r2j-stacked');
    await launch('r2j-stacked');
    const packagePath = await openPackage(
      env,
      'Page callout modes stacked',
      pageCalloutModesDocument(),
    );
    await showPageRead();
    await setPageSettingsOverride(packagePath, { setup: A5_PORTRAIT_STACKED });
    await waitPageReady();
    assert.equal(await defectsShown(), 0, 'the stacked fallback renders no defect banner');

    const root = await fragmentBox('cm-root');
    const calloutA = await fragmentBox('cm-callout-a');
    const calloutB = await fragmentBox('cm-callout-b');
    const childA = await fragmentBox('cm-child');
    const content = await contentBox();
    const boxes = await allFragmentBoxes();

    // The card is clamped to the callout lane (38). The stacked/B2 distinction
    // is carried by the trunk group, not by x alone.
    assert.ok(
      closeTo(calloutA.left - root.left, CALLOUT_CARD_INDENT, 1.5),
      `the stacked callout sits on the callout lane (${calloutA.left - root.left})`,
    );
    assert.ok(
      calloutA.top >= root.top + root.height + CALLOUT_GAP - 0.75,
      'the callout starts below the parent card',
    );
    assert.ok(
      calloutB.top >= calloutA.top + calloutA.height + CALLOUT_GAP - 0.75,
      'the second callout stacks below the first',
    );
    assert.ok(
      childA.top >= calloutB.top + calloutB.height - 0.75,
      'the child group starts below the callout stack',
    );
    assert.ok(
      childA.left >= CHILD_TRUNK_INSET + STEM_MIN - TOLERANCE,
      `the full-width child group keeps the below stem origin (${childA.left})`,
    );

    const edges = await readEdges();
    for (const edge of edges) {
      assert.equal(edge.entry, 'left');
      assert.equal(edge.label, null);
      assert.equal(edge.targetPage, null);
    }
    const rootCalloutA = edges.find((edge) => edge.branchId === 'branch-cm-callout-a');
    const rootChild = edges.find((edge) => edge.branchId === 'branch-cm-child');
    assert.ok(rootCalloutA !== undefined && rootChild !== undefined);
    assert.equal(rootCalloutA.trunkId, 'cm-root:below');
    assert.equal(rootChild.trunkId, 'cm-root:below');
    assert.equal(rootCalloutA.trunkGroup, '');
    assert.ok(
      rootChild.stem >= STEM_MIN - TOLERANCE,
      `the full-width child edge keeps a visible stem (${rootChild.stem})`,
    );

    const trunks = await readTrunks();
    assert.ok(
      trunks.every((trunk) => trunk.group === ''),
      'the stacked fallback never emits a B2 group trunk',
    );
    const rootBelow = trunks.filter((trunk) => trunk.id === 'cm-root:below');
    assert.equal(rootBelow.length, 1, 'one shared below trunk');
    assert.ok((rootBelow[0]?.segmentCount ?? 0) >= 1, 'the shared trunk has at least one segment');

    assertNoOverlap(boxes, 'stacked fallback');
    assertInsideContent(boxes, content, 'stacked fallback');
    await writeEvidence('page-callout-modes-stacked', 'pageCalloutModes stacked');

    await h.screenshot(artifactsPath('r2j', 'ui', 'callout-modes-stacked-1440x900.png'), {
      width: 1440,
      height: 900,
    });
  });

  it('continues B2 group trunks across pages and keeps nested trunks independent', async () => {
    const env = ui.isolated('r2j-pages');
    await launch('r2j-pages');
    const packagePath = await openPackage(env, 'Page callout modes pages', pageCalloutModesDocument());
    await showPageRead();
    await setPageSettingsOverride(packagePath, {
      setup: A5_PORTRAIT,
      manualBreakBeforeBlockIds: ['cm-callout-b', 'cm-child-b'],
    });
    await waitPageReady();

    const count = await pageCount();
    assert.ok(count >= 3, `the manual breaks derive at least three pages (${count})`);
    const root = await fragmentBox('cm-root');
    const perPage = [];
    for (let number = 1; number <= count; number += 1) {
      await gotoPage(number);
      const trunks = await readTrunks();
      const edges = await readEdges();
      perPage.push({ number, trunks, edges });
      for (const edge of edges) {
        assert.equal(edge.label, null, `page ${number}: no tree p.N chip`);
        assert.equal(edge.targetPage, null, `page ${number}: no tree page target`);
      }
    }

    const page1 = perPage[0];
    const page2 = perPage[1];
    const page3 = perPage[2];
    const content = await gotoPage(1).then(() => contentBox());
    const rootCallout = page1.trunks.find((trunk) => trunk.id === 'cm-root:below:callout');
    const rootChild = page1.trunks.find((trunk) => trunk.id === 'cm-root:below:child');
    assert.ok(rootCallout !== undefined && rootChild !== undefined);
    assert.equal(rootCallout.segmentCount, 2, 'the callout trunk reaches page 2');
    assert.equal(rootChild.segmentCount, 3, 'the child trunk reaches page 3');
    for (const trunk of [rootCallout, rootChild]) {
      assert.equal(trunk.portPage, 1);
      assert.ok(
        closeTo(
          trunk.x - root.left,
          trunk.group === 'callout' ? CALLOUT_TRUNK_INSET : CHILD_TRUNK_INSET,
          1,
        ),
      );
    }
    assert.ok(rootChild.x < rootCallout.x, 'the two trunks never merge');
    assert.ok(closeTo(parsePoint(rootCallout.start).y, root.top + root.height, 1));
    assert.ok(closeTo(parsePoint(rootCallout.end).y, content.height, 1));
    assert.ok(closeTo(parsePoint(rootChild.end).y, content.height, 1));

    // Page 2 still carries both root trunks; the callout trunk ends at its
    // last arm, while the child trunk passes through to the page bottom.
    const callout2 = page2.trunks.find((trunk) => trunk.id === 'cm-root:below:callout');
    const child2 = page2.trunks.find((trunk) => trunk.id === 'cm-root:below:child');
    assert.ok(callout2 !== undefined && child2 !== undefined);
    assert.equal(parsePoint(callout2.start).y, 0);
    assert.ok(parsePoint(callout2.end).y < parsePoint(child2.end).y + 0.75);
    assert.ok(closeTo(parsePoint(child2.end).y, content.height, 1));
    const calloutEdges2 = page2.edges.filter((edge) => edge.branchId === 'branch-cm-callout-b');
    assert.equal(calloutEdges2.length, 1);
    assert.ok(
      closeTo(parsePoint(callout2.end).y, parsePoint(calloutEdges2[0].to).y, 0.75),
      'the callout trunk ends at the last callout arm',
    );

    // Page 3 ends the child trunk at the last child arm; the callout group is
    // already finished.
    const child3 = page3.trunks.find((trunk) => trunk.id === 'cm-root:below:child');
    assert.ok(child3 !== undefined);
    assert.equal(page3.trunks.some((trunk) => trunk.id === 'cm-root:below:callout'), false);
    const childEdge3 = page3.edges.find((edge) => edge.branchId === 'branch-cm-child-b');
    assert.ok(childEdge3 !== undefined);
    assert.ok(
      closeTo(parsePoint(child3.end).y, parsePoint(childEdge3.to).y, 0.75),
      'the child trunk ends at the last child arm',
    );

    // Nested groups keep their own ids and x; they never borrow a root trunk.
    const nestedTrunkIds = perPage
      .flatMap((entry) => entry.trunks.map((trunk) => trunk.id))
      .filter((id) => id.startsWith('cm-child:'));
    assert.ok(nestedTrunkIds.length > 0, 'the nested groups emit their own trunks');
    assert.ok(
      nestedTrunkIds.every(
        (id) => id !== 'cm-root:below:callout' && id !== 'cm-root:below:child',
      ),
    );

    await writeEvidence('page-callout-modes-pages', 'pageCalloutModes page breaks');
    await h.screenshot(artifactsPath('r2j', 'ui', 'callout-modes-pages-1440x900.png'), {
      width: 1440,
      height: 900,
    });
  });

  it('keeps Page Read/Edit geometry and the resolved Page width independent of the viewport', async () => {
    const env = ui.isolated('r2j-parity');
    await launch('r2j-parity');
    const packagePath = await openPackage(env, 'Page callout modes parity', pageCalloutModesDocument());
    await showPageRead();
    const readBoxes = await allFragmentBoxes();
    const readCount = await pageCount();
    const readRouteSnapshot = await readEdges();

    await h.setWindowSize(960, 720);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await waitPageReady(readCount);
    const narrowBoxes = await allFragmentBoxes();
    assert.deepEqual(narrowBoxes, readBoxes, 'the resolved Page geometry ignores the viewport');
    assert.equal(await pageCount(), readCount, 'the page count ignores the viewport');
    assert.deepEqual(
      await readEdges(),
      readRouteSnapshot,
      'the page-edge model ignores the viewport',
    );

    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.interactionMode === 'edit',
      packagePath,
      { timeout: 5000 },
    );
    await waitPageReady(readCount);
    const editBoxes = await allFragmentBoxes();
    assert.deepEqual(editBoxes, readBoxes, 'Page Edit uses the same A geometry');
    assert.deepEqual(
      await readEdges(),
      readRouteSnapshot,
      'Page Edit uses the same A routes and trunks',
    );

    await currentSheet().locator('[data-fragment-block="cm-child"]').dblclick();
    const overlay = currentSlot().locator('[data-page-edit-overlay="true"]');
    await overlay.waitFor({ timeout: 10000 });
    assert.equal(await activePageView().locator('[contenteditable="true"]').count(), 1);
    await page.keyboard.press('Escape');
    await overlay.waitFor({ state: 'detached', timeout: 10000 });

    await h.screenshot(artifactsPath('r2j', 'ui', 'callout-modes-edit-960x720.png'), {
      width: 960,
      height: 720,
    });
  });
});
