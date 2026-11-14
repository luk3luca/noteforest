import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import {
  multiPageBlocksDocument,
  pageArrowsDocument,
  writePagePackage,
} from '../support/page-fixtures.mjs';

const tempRoot = artifactsPath('r2a-ui');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

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

async function currentPageNumber() {
  return Number(await activePageView().getAttribute('data-current-page'));
}

async function selectedBlockId() {
  const state = await h.state();
  const runtime = state.runtimes.find((item) => item.packagePath === state.activeTab);
  return runtime?.selectedBlockId ?? null;
}

async function setPageSettingsOverride(packagePath, override) {
  return page.evaluate(
    ({ path, value }) => window.__noteforestTest.setPageSettingsOverride(path, value),
    { path: packagePath, value: override },
  );
}

function edgeGroup(branchId) {
  return activePageView().locator(`[data-page-edge-id="${branchId}"]`);
}

async function edgeData(branchId) {
  return edgeGroup(branchId).evaluate((element) => ({
    role: element.getAttribute('data-page-edge-role'),
    direction: element.getAttribute('data-page-edge-direction'),
    targetPage: element.getAttribute('data-page-edge-target-page'),
    from: element.getAttribute('data-page-edge-from'),
    to: element.getAttribute('data-page-edge-to'),
    anchorId: element.getAttribute('data-page-edge-anchor-id'),
    anchorStart: element.getAttribute('data-page-edge-anchor-start'),
    trunkGroup: element.getAttribute('data-page-edge-trunk-group'),
    pathClass: element.querySelector('.nf-page-edge-path')?.getAttribute('class') ?? '',
  }));
}

function parsePoint(value) {
  const [x, y] = (value ?? '').split(',').map(Number);
  assert.ok(Number.isFinite(x) && Number.isFinite(y), `point ${value} parses`);
  return { x, y };
}

async function fragmentBox(blockId) {
  return page
    .locator(`.nf-editor[data-active="true"] [data-fragment-block="${blockId}"]`)
    .evaluate((element) => ({
      left: Number.parseFloat(element.style.left),
      top: Number.parseFloat(element.style.top),
      width: Number.parseFloat(element.style.width),
      height: Number.parseFloat(element.style.height),
    }));
}

async function allEdges() {
  return activePageView()
    .locator('[data-page-edge-id]')
    .evaluateAll((elements) =>
      elements.map((element) => ({
        branchId: element.getAttribute('data-page-edge-id'),
        role: element.getAttribute('data-page-edge-role'),
        direction: element.getAttribute('data-page-edge-direction'),
        targetPage: element.getAttribute('data-page-edge-target-page'),
        from: element.getAttribute('data-page-edge-from'),
        to: element.getAttribute('data-page-edge-to'),
        trunkGroup: element.getAttribute('data-page-edge-trunk-group'),
      })),
    );
}

describe('R2a page arrows and Continuous cleanup', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('draws same-page primary, anchored, and reference arrows in Page Read and Page Edit', async () => {
    const env = ui.isolated('r2a-same-page');
    await launch('r2a-same-page');
    await openPackage(env, 'Page arrows', pageArrowsDocument());
    await showPageRead();

    assert.equal(await pageCount(), 1, 'the short arrow fixture fits one page');
    const svg = activePageView().locator('.nf-page-edges');
    assert.equal(await svg.count(), 1, 'one SVG edge layer lives inside the page content');
    assert.equal(await svg.getAttribute('aria-hidden'), 'true');
    assert.equal(
      Number(await svg.getAttribute('data-page-edge-count')),
      3,
      'three same-page edges are projected',
    );
    assert.equal(await svg.evaluate((element) => getComputedStyle(element).pointerEvents), 'none');

    const source = await fragmentBox('source');
    const direct = await fragmentBox('direct');
    const directEdge = await edgeData('branch-direct');
    assert.equal(directEdge.role, 'primary');
    assert.equal(directEdge.direction, 'same-page');
    // R2j mode A: the callout owns the right lane, so the direct child moves
    // below the source and uses its own below trunk.
    assert.ok(
      direct.top >= source.top + source.height - 0.75,
      'the direct child starts below the source card',
    );
    const directFrom = parsePoint(directEdge.from);
    const directTo = parsePoint(directEdge.to);
    assert.ok(
      directFrom.x < direct.left - 0.75,
      'the child below trunk sits left of the child card',
    );
    assert.ok(Math.abs(directTo.x - direct.left) <= 0.6, 'primary ends at target left edge');
    assert.equal(directEdge.pathClass.includes('nf-page-edge-path-primary'), true);

    const calloutEdge = await edgeData('branch-callout');
    const calloutFrom = parsePoint(calloutEdge.from);
    assert.equal(calloutEdge.anchorId, 'anchor-1');
    assert.equal(calloutEdge.anchorStart, 'true');
    // The callout is right of the source, so its visible leader exits the
    // source card's right side; the anchor stays declared for accessibility.
    assert.ok(
      Math.abs(calloutFrom.x - (source.left + source.width)) <= 0.6,
      'mode A callout leader exits the source right side',
    );
    assert.ok(
      Math.abs(calloutFrom.y - (source.top + source.height / 2)) <= 0.6,
      'the right-group leader starts at the source right port',
    );

    const referenceEdge = await edgeData('branch-reference');
    assert.equal(referenceEdge.role, 'reference');
    assert.equal(referenceEdge.direction, 'same-page');
    assert.equal(referenceEdge.pathClass.includes('nf-page-edge-path-reference'), true);
    const dash = await edgeGroup('branch-reference')
      .locator('.nf-page-edge-path')
      .evaluate((element) => getComputedStyle(element).strokeDasharray);
    assert.notEqual(dash, 'none', 'reference arrows are dashed');

    // Same-page branch/anchor quotes stay in the callout card and the edge's
    // accessible title; route chips no longer sit on top of block text.
    const labels = activePageView().locator('[data-page-edge-label="branch"]');
    assert.equal(await labels.count(), 0, 'same-page branch chips do not cover text');
    assert.ok(
      (await activePageView().locator('[data-page-edge-id="branch-reference"] title').count()) > 0,
      'the labeled reference keeps its accessible route title',
    );

    // Neither the paths nor the labels capture a pointer.
    const hit = await activePageView().locator('.nf-page-edges').evaluate((element) => {
      const path = element.querySelector('.nf-page-edge-path');
      if (path === null || !(path instanceof SVGPathElement)) return null;
      const point = path.getPointAtLength(path.getTotalLength() / 2);
      const matrix = path.getScreenCTM();
      if (matrix === null) return null;
      const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
      const target = document.elementFromPoint(screen.x, screen.y);
      return {
        found: target !== null,
        inEdges: target?.closest('.nf-page-edges') !== null && target?.closest('.nf-page-edges') !== undefined,
        inLabels:
          target?.closest('.nf-page-edge-labels') !== null &&
          target?.closest('.nf-page-edge-labels') !== undefined,
      };
    });
    assert.ok(hit !== null && hit.found);
    assert.equal(hit.inEdges, false, 'edge hit testing reaches the page/card, not the SVG');
    assert.equal(hit.inLabels, false, 'labels never intercept the pointer');

    // Arrow chrome does not break the Page fragment selection path.
    await activePageView().locator('[data-fragment-block="direct"]').click();
    assert.equal(await selectedBlockId(), 'direct');
    assert.equal(await activePageView().locator('[contenteditable="true"]').count(), 0);

    // Page Edit keeps the arrows and the overlay paints above them.
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.interactionMode === 'edit',
      (await h.state()).activeTab,
      { timeout: 5000 },
    );
    assert.equal(await svg.count(), 1, 'Page Edit keeps the edge layer');
    assert.equal(Number(await svg.getAttribute('data-page-edge-count')), 3);
    await activePageView().locator('[data-fragment-block="direct"]').dblclick();
    const overlay = activePageView().locator('[data-page-edit-overlay="true"]');
    await overlay.waitFor({ timeout: 10000 });
    const stacking = await overlay.evaluate((element) => {
      const overlayZ = Number(getComputedStyle(element).zIndex);
      const edgesZ = Number(
        getComputedStyle(element.closest('.nf-page-sheet-wrap')?.querySelector('.nf-page-edges') ??
          element).zIndex,
      );
      return { overlayZ, edgesZ };
    });
    assert.ok(
      Number.isFinite(stacking.overlayZ) && Number.isFinite(stacking.edgesZ),
      'both layers report a stacking index',
    );
    assert.ok(stacking.overlayZ > stacking.edgesZ, 'Page Edit sits above the arrow layer');
    assert.equal(await activePageView().locator('[contenteditable="true"]').count(), 1);
  });

  it('continues both B2 tree trunks across pages while references keep their indicators', async () => {
    const env = ui.isolated('r2a-cross-page');
    await launch('r2a-cross-page');
    const packagePath = await openPackage(env, 'Page arrows cross page', pageArrowsDocument());
    // A narrow page forces mode B2: callouts and children sit below the source
    // on two independent trunks. The manual breaks put callout B and the
    // reference target on page 2; the direct child follows the callout stack.
    const resolved = await setPageSettingsOverride(packagePath, {
      setup: {
        size: 'A5',
        orientation: 'portrait',
        margins: { top: 30, right: 30, bottom: 30, left: 30 },
      },
      manualBreakBeforeBlockIds: ['callout', 'ref'],
    });
    assert.equal(resolved.theme.pagePacking, 'beside');
    assert.deepEqual(resolved.manualBreakBeforeBlockIds, ['callout', 'ref']);
    await showPageRead();
    const count = await pageCount();
    assert.ok(count >= 2, `the manual breaks derive at least two pages, got ${count}`);
    assert.equal(await currentPageNumber(), 1);

    // Page 1 owns the two below trunk starts. No primary tree edge is on this
    // page and no p.N chip is drawn for a tree trunk.
    const first = await allEdges();
    assert.deepEqual(first, []);
    assert.equal(
      await activePageView().locator('[data-page-edge-label]').count(),
      0,
      'no p.N chip is drawn for a tree edge',
    );
    const page1Trunks = await activePageView()
      .locator('[data-page-trunk-id]')
      .evaluateAll((elements) =>
        elements.map((element) => ({
          id: element.getAttribute('data-page-trunk-id'),
          group: element.getAttribute('data-page-trunk-group'),
          x: Number(element.getAttribute('data-page-trunk-x')),
          start: element.getAttribute('data-page-trunk-start'),
          end: element.getAttribute('data-page-trunk-end'),
        })),
      );
    assert.deepEqual(
      page1Trunks.map((trunk) => trunk.id).sort(),
      ['source:below:callout', 'source:below:child'],
    );
    const source = await fragmentBox('source');
    const pageContent = await activePageView()
      .locator('[data-page-content]')
      .evaluate((element) => Number.parseFloat(element.style.height));
    for (const trunk of page1Trunks) {
      assert.ok(Math.abs(parsePoint(trunk.start).y - (source.top + source.height)) <= 0.75);
      assert.ok(Math.abs(parsePoint(trunk.end).y - pageContent) <= 0.75);
    }
    const page1Callout = page1Trunks.find((trunk) => trunk.group === 'callout');
    const page1Child = page1Trunks.find((trunk) => trunk.group === 'child');
    assert.ok(page1Callout !== undefined && page1Child !== undefined);
    assert.ok(page1Child.x < page1Callout.x, 'the two trunks stay independent');

    const bounds = await activePageView().locator('[data-page-content]').evaluate((element) => {
      const content = element.getBoundingClientRect();
      const svgElement = element.querySelector('.nf-page-edges');
      if (svgElement === null) return null;
      const svg = svgElement.getBoundingClientRect();
      return {
        content: { left: content.left, right: content.right, top: content.top, bottom: content.bottom },
        svg: { left: svg.left, right: svg.right, top: svg.top, bottom: svg.bottom },
      };
    });
    assert.ok(bounds !== null);
    assert.ok(Math.abs(bounds.svg.left - bounds.content.left) <= 1);
    assert.ok(Math.abs(bounds.svg.right - bounds.content.right) <= 1);
    assert.ok(Math.abs(bounds.svg.top - bounds.content.top) <= 1);
    assert.ok(Math.abs(bounds.svg.bottom - bounds.content.bottom) <= 1);
    assert.equal(
      await activePageView().locator('.nf-page-edges').evaluate((element) => getComputedStyle(element).overflow),
      'hidden',
      'trunk ink is clipped to the page content box',
    );

    await page.locator('[data-canvas-header] [data-page-nav="next"]').click();
    await page.waitForFunction(
      () =>
        Number(
          document
            .querySelector('.nf-editor[data-active="true"] .nf-page-view')
            ?.getAttribute('data-current-page'),
        ) === 2,
      undefined,
      { timeout: 5000 },
    );
    const second = await allEdges();
    const calloutIn = second.find((edge) => edge.branchId === 'branch-callout');
    const directIn = second.find((edge) => edge.branchId === 'branch-direct');
    assert.equal(calloutIn?.direction, 'trunk');
    assert.equal(calloutIn?.targetPage, null);
    assert.equal(calloutIn?.trunkGroup, 'callout');
    assert.equal(directIn?.direction, 'trunk');
    assert.equal(directIn?.targetPage, null);
    assert.equal(directIn?.trunkGroup, 'child');
    const page2Trunks = await activePageView()
      .locator('[data-page-trunk-id]')
      .evaluateAll((elements) =>
        elements.map((element) => ({
          id: element.getAttribute('data-page-trunk-id'),
          group: element.getAttribute('data-page-trunk-group'),
          x: Number(element.getAttribute('data-page-trunk-x')),
          start: element.getAttribute('data-page-trunk-start'),
          end: element.getAttribute('data-page-trunk-end'),
          segments: Number(element.getAttribute('data-page-trunk-segment-count')),
        })),
      );
    assert.deepEqual(
      page2Trunks.map((trunk) => trunk.id).sort(),
      ['source:below:callout', 'source:below:child'],
    );
    for (const trunk of page2Trunks) {
      assert.equal(trunk.segments, 2);
      assert.equal(parsePoint(trunk.start).x, trunk.x);
      assert.equal(parsePoint(trunk.end).x, trunk.x);
      assert.equal(parsePoint(trunk.start).y, 0);
    }

    // The reference target is on the last page: only it gets a `← p.1` chip.
    const lastPage = count;
    let current = Number(await activePageView().getAttribute('data-current-page'));
    while (current < lastPage) {
      const next = current + 1;
      await page.locator('[data-canvas-header] [data-page-nav="next"]').click();
      await page.waitForFunction(
        (expected) =>
          Number(
            document
              .querySelector('.nf-editor[data-active="true"] .nf-page-view')
              ?.getAttribute('data-current-page'),
          ) === expected,
        next,
        { timeout: 5000 },
      );
      current = next;
    }
    const lastEdges = await allEdges();
    const referenceIn = lastEdges.find((edge) => edge.branchId === 'branch-reference');
    assert.equal(referenceIn?.direction, 'from-edge');
    assert.equal(referenceIn?.targetPage, '1');
    assert.ok(
      Math.abs(parsePoint(referenceIn?.from).x) <= 0.6,
      'reference indicator starts at the content edge',
    );
    const inLabels = await activePageView()
      .locator('[data-page-edge-label="from-edge"]')
      .evaluateAll((elements) => elements.map((element) => element.textContent?.trim()));
    assert.deepEqual(inLabels, ['← p.1'], 'only the reference gets a page chip');

    // Page Edit keeps the last-page reference indicator and the same single
    // edge layer.
    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.interactionMode === 'edit',
      packagePath,
      { timeout: 5000 },
    );
    assert.equal(await activePageView().locator('[data-page-edge-label="from-edge"]').count(), 1);
    assert.equal(await activePageView().locator('.nf-page-edges').count(), 1);
  });

  it('never measures pages or renders page chrome in Continuous at 1440 and 960', async () => {
    const env = ui.isolated('r2a-continuous');
    await launch('r2a-continuous');
    const packagePath = await openPackage(env, 'Continuous without pages', multiPageBlocksDocument());

    await page.evaluate(() => {
      const probe = { hosts: 0 };
      window.__r2aProbe = probe;
      probe.observer = new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node instanceof Element && node.classList.contains('nf-measure-host')) {
              probe.hosts += 1;
            }
          }
        }
      });
      probe.observer.observe(document.body, { childList: true, subtree: true });
    });

    async function probe() {
      return page.evaluate(() => ({
        hosts: window.__r2aProbe?.hosts ?? -1,
        liveHosts: document.querySelectorAll('.nf-measure-host').length,
        markers: document.querySelectorAll('[data-page-marker]').length,
        markerLayers:
          document.querySelectorAll('.nf-page-markers, .nf-page-marker, .nf-page-marker-chip').length,
        pageViews: document.querySelectorAll('.nf-page-view').length,
        sheets: document.querySelectorAll('.nf-page-sheet').length,
        pageIndicators: document.querySelectorAll('[data-page-indicator]').length,
        continues: document.querySelectorAll('.nf-page-continues-list').length,
        ghosts: document.querySelectorAll('.nf-page-ghost-list').length,
        edges: document.querySelectorAll('.nf-page-edges').length,
      }));
    }

    async function assertContinuous(where) {
      const state = await probe();
      assert.equal(state.hosts, 0, `${where}: no page measurement host was created`);
      assert.equal(state.liveHosts, 0, `${where}: no measurement host is mounted`);
      assert.equal(state.markers, 0, `${where}: no data-page-marker`);
      assert.equal(state.markerLayers, 0, `${where}: no marker chrome`);
      assert.equal(state.pageViews, 0, `${where}: no Page view`);
      assert.equal(state.sheets, 0, `${where}: no page sheet`);
      assert.equal(state.pageIndicators, 0, `${where}: no page numbers`);
      assert.equal(state.continues, 0, `${where}: no continuation chips`);
      assert.equal(state.ghosts, 0, `${where}: no ghost markers`);
      assert.equal(state.edges, 0, `${where}: no page arrow layer`);
    }

    await page.waitForTimeout(350);
    await assertContinuous('Continuous Edit 1440');

    // A canonical revision change would run the old Continuous marker model.
    // It must not create any measurement host now.
    const structure = await ui.structure();
    const firstBlockId = structure.chapters[0].topLevelBlockIds[0];
    await ui.applyCommand({
      type: 'block.editContent',
      blockId: firstBlockId,
      content: {
        type: 'doc',
        children: [
          { type: 'paragraph', children: [{ type: 'text', text: 'Edited in Continuous only.' }] },
        ],
      },
    });
    await page.waitForTimeout(500);
    await assertContinuous('Continuous Edit after an edit');

    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.interactionMode === 'read',
      packagePath,
      { timeout: 5000 },
    );
    await page.waitForTimeout(350);
    await assertContinuous('Continuous Read 1440');

    await h.setWindowSize(960, 720);
    await page.waitForTimeout(350);
    await assertContinuous('Continuous Read 960');

    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.interactionMode === 'edit',
      packagePath,
      { timeout: 5000 },
    );
    await page.waitForTimeout(350);
    await assertContinuous('Continuous Edit 960');

    // Page mounts the one model; returning to Continuous disposes it and a new
    // edit must not measure again.
    await showPageRead();
    assert.ok(Number(await activePageView().getAttribute('data-page-count')) > 1);
    const pageHosts = await page.evaluate(() => window.__r2aProbe?.hosts ?? 0);
    assert.ok(pageHosts > 0, 'Page measured through its own model');
    await page.keyboard.press('Meta+2');
    await page.waitForSelector('.nf-editor[data-active="true"] .nf-page-view', {
      state: 'detached',
    });
    await page.evaluate(() => {
      window.__r2aProbe.hosts = 0;
    });
    await ui.applyCommand({
      type: 'block.editContent',
      blockId: firstBlockId,
      content: {
        type: 'doc',
        children: [
          { type: 'paragraph', children: [{ type: 'text', text: 'Back to Continuous, still no pages.' }] },
        ],
      },
    });
    await page.waitForTimeout(500);
    await assertContinuous('Continuous after leaving Page');
  });
});
