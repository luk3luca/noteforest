import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import {
  compactionDocument,
  pageArrowsDocument,
  writePagePackage,
} from '../support/page-fixtures.mjs';

/**
 * R2d page edge style.
 *
 * Page/PDF now shares one visual language with Continuous: orthogonal routes,
 * rounded corners, the fixed arrowhead, left target entry where the page has
 * room, and no cubic Bezier for standard same-page edges. The compaction
 * parent → later-sibling regression is the main assertion: the route must go
 * around earlier cards, not behind them.
 */

const tempRoot = artifactsPath('r2d-ui');
const outputDir = artifactsPath('r2d', 'ui');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

const MIN_STEM = 12;

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

/** The sheet the toolbar indicator names: page-local queries read this one. */
function currentSheet() {
  return activePageView().locator('.nf-page-sheet[data-page-current="true"]');
}

/** The current page's slot: the sheet plus the Page Edit overlay over it. */
function currentSlot() {
  return activePageView().locator('[data-page-slot-current="true"]');
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

async function showContinuous() {
  await page.keyboard.press('Meta+2');
  await page.waitForSelector('.nf-editor[data-active="true"] [data-block-card]');
}

async function pageCount() {
  return Number(await activePageView().getAttribute('data-page-count'));
}

async function modelRuns() {
  return Number(await activePageView().getAttribute('data-model-runs'));
}

async function waitForRunAtLeast(expected) {
  await page.waitForFunction(
    (count) => {
      const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
      if (view === null || view.getAttribute('data-ready') !== 'true') return false;
      return Number(view.getAttribute('data-model-runs')) >= count;
    },
    expected,
    { timeout: 30000 },
  );
}

async function currentPageNumber() {
  return Number(await activePageView().getAttribute('data-current-page'));
}

async function setPageSettingsOverride(packagePath, override) {
  return page.evaluate(
    ({ path, value }) => window.__noteforestTest.setPageSettingsOverride(path, value),
    { path: packagePath, value: override },
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

async function fragmentBoxes() {
  return currentSheet()
    .locator('.nf-page-fragment')
    .evaluateAll((elements) =>
      elements.map((element) => ({
        blockId: element.getAttribute('data-fragment-block') ?? '',
        left: Number.parseFloat(element.style.left),
        top: Number.parseFloat(element.style.top),
        width: Number.parseFloat(element.style.width),
        height: Number.parseFloat(element.style.height),
      })),
    );
}

function parsePoint(value) {
  const [x, y] = (value ?? '').split(',').map(Number);
  assert.ok(Number.isFinite(x) && Number.isFinite(y), `point ${value} parses`);
  return { x, y };
}

function parseRoute(value) {
  return (value ?? '')
    .split(' ')
    .filter((part) => part.length > 0)
    .map(parsePoint);
}

function isOrthogonal(points) {
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (
      Math.abs(previous.x - current.x) > 0.01 &&
      Math.abs(previous.y - current.y) > 0.01
    ) {
      return false;
    }
  }
  return true;
}

function routeHitsRect(points, rect, tolerance = 1) {
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const left = Math.min(start.x, end.x);
    const right = Math.max(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const bottom = Math.max(start.y, end.y);
    const horizontal = Math.abs(start.y - end.y) < 0.01;
    const hit = horizontal
      ? top > rect.top + tolerance &&
        top < rect.top + rect.height - tolerance &&
        right > rect.left + tolerance &&
        left < rect.left + rect.width - tolerance
      : left > rect.left + tolerance &&
        left < rect.left + rect.width - tolerance &&
        bottom > rect.top + tolerance &&
        top < rect.top + rect.height - tolerance;
    if (hit) return true;
  }
  return false;
}

async function readEdges() {
  return currentSheet()
    .locator('[data-page-edge-id]')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const path = element.querySelector('.nf-page-edge-path');
        const arrow = element.querySelector('.nf-page-edge-arrow');
        return {
          branchId: element.getAttribute('data-page-edge-id') ?? '',
          role: element.getAttribute('data-page-edge-role') ?? '',
          direction: element.getAttribute('data-page-edge-direction') ?? '',
          targetPage: element.getAttribute('data-page-edge-target-page'),
          fromBlock: element.getAttribute('data-page-edge-from-block') ?? '',
          toBlock: element.getAttribute('data-page-edge-to-block') ?? '',
          from: element.getAttribute('data-page-edge-from') ?? '',
          to: element.getAttribute('data-page-edge-to') ?? '',
          route: element.getAttribute('data-page-edge-route') ?? '',
          tip: element.getAttribute('data-page-edge-tip') ?? '',
          entry: element.getAttribute('data-page-edge-entry') ?? '',
          arrow: element.getAttribute('data-page-edge-arrow') ?? '',
          stem: Number(element.getAttribute('data-page-edge-stem')),
          blocked: element.getAttribute('data-page-edge-blocked') === 'true',
          anchorStart: element.getAttribute('data-page-edge-anchor-start') === 'true',
          pathD: path?.getAttribute('d') ?? '',
          arrowD: arrow?.getAttribute('d') ?? '',
          pathWidth:
            path === null || path === undefined
              ? ''
              : getComputedStyle(path).strokeWidth,
          pathDash:
            path === null || path === undefined
              ? ''
              : getComputedStyle(path).strokeDasharray,
          arrowFill:
            arrow === null || arrow === undefined
              ? ''
              : getComputedStyle(arrow).fill,
          arrowStroke:
            arrow === null || arrow === undefined
              ? ''
              : getComputedStyle(arrow).stroke,
        };
      }),
    );
}

async function assertOrthogonalPageRoutes(label) {
  const edges = await readEdges();
  assert.ok(edges.length > 0, `${label}: page has edges`);
  const bounds = await contentBox();
  const fragments = await fragmentBoxes();
  for (const edge of edges) {
    assert.equal(edge.blocked, false, `${label}/${edge.branchId}: route is not blocked`);
    assert.equal(
      edge.pathD.includes('C'),
      false,
      `${label}/${edge.branchId}: no cubic Bezier command`,
    );
    const route = parseRoute(edge.route);
    assert.ok(route.length >= 2, `${label}/${edge.branchId}: route has points`);
    assert.ok(isOrthogonal(route), `${label}/${edge.branchId}: route is orthogonal`);
    for (const point of route) {
      assert.ok(
        point.x >= -0.6 && point.x <= bounds.width + 0.6,
        `${label}/${edge.branchId}: x ${point.x} stays in the page content`,
      );
      assert.ok(
        point.y >= -0.6 && point.y <= bounds.height + 0.6,
        `${label}/${edge.branchId}: y ${point.y} stays in the page content`,
      );
    }
    if (edge.direction === 'same-page' || edge.direction === 'trunk') {
      for (const fragment of fragments) {
        if (fragment.blockId === edge.fromBlock || fragment.blockId === edge.toBlock) {
          continue;
        }
        assert.equal(
          routeHitsRect(route, fragment),
          false,
          `${label}/${edge.branchId}: route never hides behind ${fragment.blockId}`,
        );
      }
      const tip = parsePoint(edge.tip);
      const routeTip = route.at(-1);
      assert.ok(
        Math.abs(tip.x - routeTip.x) <= 0.01 && Math.abs(tip.y - routeTip.y) <= 0.01,
        `${label}/${edge.branchId}: tip matches the route end`,
      );
      if (edge.entry === 'left') {
        assert.equal(edge.arrow, 'right', `${label}/${edge.branchId}: left entry points right`);
        assert.ok(
          edge.stem >= MIN_STEM - 0.01,
          `${label}/${edge.branchId}: final stem is at least ${MIN_STEM}px`,
        );
        const before = route.at(-2);
        assert.ok(before !== undefined, `${label}/${edge.branchId}: has a penultimate point`);
        assert.ok(
          Math.abs(before.y - tip.y) <= 0.01 && tip.x - before.x >= MIN_STEM - 0.01,
          `${label}/${edge.branchId}: final segment enters the left edge horizontally`,
        );
      }
    } else {
      assert.equal(route.length, 2, `${label}/${edge.branchId}: cross-page indicator is straight`);
      assert.equal(route[0].y, route[1].y, `${label}/${edge.branchId}: cross-page line is horizontal`);
    }
    if (edge.role === 'primary') {
      assert.ok(edge.arrowD.endsWith('Z'), `${label}/${edge.branchId}: primary arrow is filled`);
      assert.notEqual(edge.arrowFill, 'none', `${label}/${edge.branchId}: primary arrow has fill`);
    } else {
      assert.equal(
        edge.arrowD.endsWith('Z'),
        false,
        `${label}/${edge.branchId}: reference arrow is an open chevron`,
      );
      assert.equal(edge.arrowFill, 'none', `${label}/${edge.branchId}: reference arrow is not filled`);
      assert.notEqual(edge.pathDash, 'none', `${label}/${edge.branchId}: reference route is dashed`);
    }
  }
  const widths = new Set(edges.map((edge) => edge.pathWidth));
  assert.equal(widths.size, 1, `${label}: primary and reference use one stroke width`);
  return edges;
}

async function pointerProbe() {
  return currentSheet().locator('.nf-page-edges').evaluate((element) => {
    const path = element.querySelector('.nf-page-edge-path');
    if (path === null || !(path instanceof SVGPathElement)) return null;
    const point = path.getPointAtLength(path.getTotalLength() / 2);
    const matrix = path.getScreenCTM();
    if (matrix === null) return null;
    const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    const target = document.elementFromPoint(screen.x, screen.y);
    return {
      found: target !== null,
      inEdges:
        target?.closest('.nf-page-edges') !== null &&
        target?.closest('.nf-page-edges') !== undefined,
      inLabels:
        target?.closest('.nf-page-edge-labels') !== null &&
        target?.closest('.nf-page-edge-labels') !== undefined,
    };
  });
}

describe('R2d page edge style', () => {
  before(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(outputDir, { recursive: true });
  });

  afterEach(async () => {
    await h.quit();
  });

  after(async () => {
    assert.deepEqual(h.pageErrors, [], `renderer errors: ${h.pageErrors.join('; ')}`);
  });

  it('renders Page Read arrows as shared orthogonal routes and avoids earlier siblings', async () => {
    const env = ui.isolated('r2d-page-read');
    await launch('r2d-page-read');
    await openPackage(env, 'R2d page read', compactionDocument());
    await showPageRead();

    assert.equal(await pageCount(), 1, 'the compaction fixture fits one landscape page');
    const edges = await assertOrthogonalPageRoutes('Page Read 1440');

    const leaf2 = edges.find((edge) => edge.branchId === 'branch-comp-leaf-2');
    const leaf3 = edges.find((edge) => edge.branchId === 'branch-comp-leaf-3');
    assert.ok(leaf2 !== undefined && leaf3 !== undefined);
    assert.equal(leaf2.entry, 'left');
    assert.equal(leaf3.entry, 'left');

    const callout = edges.find((edge) => edge.branchId === 'branch-comp-callout');
    assert.equal(callout.anchorStart, true, 'the callout edge starts at the resolved anchor');
    const reference = edges.find((edge) => edge.branchId === 'branch-comp-reference');
    assert.equal(reference.role, 'reference');
    assert.equal(reference.direction, 'same-page');

    // The regression's exact shape: parent → third/fourth sibling must not
    // intersect the callout/child/later cards.
    const fragments = await fragmentBoxes();
    const blockers = fragments.filter((fragment) =>
      ['comp-callout', 'comp-child', 'comp-leaf-2'].includes(fragment.blockId),
    );
    for (const edge of [leaf2, leaf3]) {
      for (const blocker of blockers) {
        if (blocker.blockId === edge.toBlock) continue;
        assert.equal(
          routeHitsRect(parseRoute(edge.route), blocker),
          false,
          `${edge.branchId} stays out of ${blocker.blockId}`,
        );
      }
    }

    // One shared arrow/glow language with Continuous: primary filled, reference
    // open and dashed, same width. Page CSS consumes the shared token.
    const probe = await pointerProbe();
    assert.ok(probe !== null && probe.found);
    assert.equal(probe.inEdges, false, 'the SVG never intercepts a pointer');
    assert.equal(probe.inLabels, false, 'labels never intercept a pointer');
    assert.equal(
      await activePageView()
        .locator('.nf-page-edges')
        .evaluate((element) => getComputedStyle(element).pointerEvents),
      'none',
    );

    // Page fragment selection still works through the arrow layer.
    await currentSheet().locator('[data-fragment-block="comp-child"]').click();
    const state = await h.state();
    assert.equal(
      state.runtimes.find((item) => item.packagePath === state.activeTab)?.selectedBlockId,
      'comp-child',
    );

    await h.screenshot(
      artifactsPath('r2d', 'ui', 'page-read-arrows-1440x900-landscape.png'),
      { width: 1440, height: 900 },
    );
  });

  it('keeps the orthogonal route language at 960x720 and on A4 portrait', async () => {
    const env = ui.isolated('r2d-sizes');
    await launch('r2d-sizes');
    const packagePath = await openPackage(env, 'R2d page sizes', compactionDocument());
    await showPageRead();

    await h.setWindowSize(960, 720);
    await waitPageReady();
    await assertOrthogonalPageRoutes('Page Read 960 landscape');
    await h.screenshot(
      artifactsPath('r2d', 'ui', 'page-read-arrows-960x720-landscape.png'),
      { width: 960, height: 720 },
    );

    const portraitStart = await modelRuns();
    const portrait = await setPageSettingsOverride(packagePath, {
      setup: { orientation: 'portrait' },
    });
    assert.equal(portrait.setup.orientation, 'portrait');
    await waitForRunAtLeast(portraitStart + 1);
    await waitPageReady();
    await assertOrthogonalPageRoutes('Page Read 960 portrait');
    await h.screenshot(
      artifactsPath('r2d', 'ui', 'page-read-arrows-960x720-portrait.png'),
      { width: 960, height: 720 },
    );

    await h.setWindowSize(1440, 900);
    await waitPageReady();
    await assertOrthogonalPageRoutes('Page Read 1440 portrait');
    await h.screenshot(
      artifactsPath('r2d', 'ui', 'page-read-arrows-1440x900-portrait.png'),
      { width: 1440, height: 900 },
    );

    const landscapeStart = await modelRuns();
    await setPageSettingsOverride(packagePath, { setup: { orientation: 'landscape' } });
    await waitForRunAtLeast(landscapeStart + 1);
    await waitPageReady();
    await h.setWindowSize(1440, 900);
    await assertOrthogonalPageRoutes('Page Read 1440 landscape restored');
    await h.screenshot(
      artifactsPath('r2d', 'ui', 'page-read-arrows-1440x900-landscape-restored.png'),
      { width: 1440, height: 900 },
    );
  });

  it('keeps the same routes in Page Edit and leaves Continuous geometry unchanged', async () => {
    const env = ui.isolated('r2d-edit');
    await launch('r2d-edit');
    const packagePath = await openPackage(env, 'R2d page edit', compactionDocument());
    await showPageRead();
    await assertOrthogonalPageRoutes('Page Read before edit');

    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.interactionMode === 'edit',
      packagePath,
      { timeout: 5000 },
    );
    await waitPageReady();
    await assertOrthogonalPageRoutes('Page Edit');

    await currentSheet().locator('[data-fragment-block="comp-child"]').dblclick();
    const overlay = currentSlot().locator('[data-page-edit-overlay="true"]');
    await overlay.waitFor({ timeout: 10000 });
    const stacking = await overlay.evaluate((element) => {
      const overlayZ = Number(getComputedStyle(element).zIndex);
      const edgesZ = Number(
        getComputedStyle(
          element.closest('.nf-page-sheet-wrap')?.querySelector('.nf-page-edges') ?? element,
        ).zIndex,
      );
      return { overlayZ, edgesZ };
    });
    assert.ok(stacking.overlayZ > stacking.edgesZ, 'Page Edit overlay sits above the arrow layer');
    await h.screenshot(
      artifactsPath('r2d', 'ui', 'page-edit-overlay-arrows-1440x900.png'),
      { width: 1440, height: 900 },
    );
    await page.keyboard.press('Escape');
    await overlay.waitFor({ state: 'detached', timeout: 10000 });

    // Continuous keeps its own router and never mounts the page arrow layer.
    await showContinuous();
    assert.equal(await page.locator('.nf-page-view').count(), 0);
    assert.equal(await page.locator('.nf-page-edges').count(), 0);
    const continuous = await page
      .locator('.nf-editor[data-active="true"] .nf-edge-path')
      .evaluateAll((elements) => elements.map((element) => element.getAttribute('d') ?? ''));
    assert.ok(continuous.length > 0, 'Continuous still renders primary arrows');
    for (const path of continuous) {
      assert.equal(path.includes('C'), false, 'Continuous primary elbows stay orthogonal');
    }
    assert.ok(
      (await page.locator('[data-reference-edge-id]').count()) > 0,
      'Continuous reference edges remain',
    );
    await h.screenshot(
      artifactsPath('r2d', 'ui', 'continuous-arrows-1440x900.png'),
      { width: 1440, height: 900 },
    );
  });

  it('renders cross-page trunk arms and the reference indicator with the shared style', async () => {
    const env = ui.isolated('r2d-cross-page');
    await launch('r2d-cross-page');
    const packagePath = await openPackage(env, 'R2d cross page', pageArrowsDocument());
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
    assert.ok(count >= 2, `expected at least two pages, got ${count}`);
    assert.equal(await currentPageNumber(), 1);

    const bounds = await contentBox();
    // Page 1 owns the two B2 trunk starts; the arms are on page 2.
    const firstEdges = await readEdges();
    assert.deepEqual(firstEdges, []);
    const firstTrunks = await currentSheet()
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
    assert.deepEqual(firstTrunks.map((trunk) => trunk.id).sort(), [
      'source:below:callout',
      'source:below:child',
    ]);
    for (const trunk of firstTrunks) {
      assert.equal(trunk.segments, 2, 'both below trunks span both pages');
      assert.ok(parsePoint(trunk.start).y > 0);
      assert.ok(Math.abs(parsePoint(trunk.end).y - bounds.height) <= 0.6);
    }
    const calloutFirst = firstTrunks.find((trunk) => trunk.group === 'callout');
    const childFirst = firstTrunks.find((trunk) => trunk.group === 'child');
    assert.ok(calloutFirst !== undefined && childFirst !== undefined);
    assert.ok(childFirst.x < calloutFirst.x, 'the two trunks never merge');
    assert.equal(
      await currentSheet().locator('[data-page-edge-label]').count(),
      0,
      'no p.N chip is drawn for a tree edge',
    );

    await ui.gotoPage(2);
    await ui.waitCurrentPage(2);
    await waitPageReady();
    const incoming = await assertOrthogonalPageRoutes('Page 2');
    const calloutIn = incoming.find((edge) => edge.branchId === 'branch-callout');
    const directIn = incoming.find((edge) => edge.branchId === 'branch-direct');
    assert.equal(calloutIn.direction, 'trunk');
    assert.equal(calloutIn.targetPage, null);
    assert.equal(calloutIn.entry, 'left');
    assert.equal(calloutIn.pathD.includes('C'), false);
    assert.equal(directIn.direction, 'trunk');
    assert.equal(directIn.targetPage, null);
    assert.equal(directIn.entry, 'left');
    assert.equal(directIn.pathD.includes('C'), false);
    const secondTrunks = await currentSheet()
      .locator('[data-page-trunk-id]')
      .evaluateAll((elements) =>
        elements.map((element) => ({
          id: element.getAttribute('data-page-trunk-id'),
          x: Number(element.getAttribute('data-page-trunk-x')),
          start: element.getAttribute('data-page-trunk-start'),
          end: element.getAttribute('data-page-trunk-end'),
        })),
      );
    assert.deepEqual(
      secondTrunks.map((trunk) => trunk.id).sort(),
      ['source:below:callout', 'source:below:child'],
    );
    for (const trunk of secondTrunks) {
      const first = firstTrunks.find((candidate) => candidate.id === trunk.id);
      assert.equal(trunk.x, first?.x, 'the trunk x is stable across pages');
      assert.deepEqual(parsePoint(trunk.start), { x: first?.x, y: 0 });
    }

    // The reference target is on the last page and keeps the only page chip.
    const lastPage = count;
    await ui.gotoPage(lastPage);
    await ui.waitCurrentPage(lastPage);
    const referenceIn = (await readEdges()).find(
      (edge) => edge.branchId === 'branch-reference',
    );
    assert.equal(referenceIn?.direction, 'from-edge');
    assert.equal(referenceIn?.targetPage, '1');
    const inLabels = await currentSheet()
      .locator('[data-page-edge-label="from-edge"]')
      .evaluateAll((elements) => elements.map((element) => element.textContent?.trim()));
    assert.deepEqual(inLabels, ['← p.1'], 'only the reference keeps a page chip');

    await page.keyboard.press('Meta+e');
    await page.waitForFunction(
      (path) => window.__noteforestTest.viewState()[path]?.interactionMode === 'edit',
      packagePath,
      { timeout: 5000 },
    );
    await waitPageReady();
    assert.equal(await currentSheet().locator('.nf-page-edges').count(), 1);
    assert.equal(await currentSheet().locator('[data-page-edge-label="from-edge"]').count(), 1);
    assert.equal(await currentSheet().locator('[data-page-trunk-id]').count(), 0);
    await h.screenshot(
      artifactsPath('r2d', 'ui', 'page-read-cross-page-1440x900.png'),
      { width: 1440, height: 900 },
    );
  });

  it('ends the primary shaft at the arrow base, so the head carries no darker band (VF item 4)', async () => {
    const env = ui.isolated('vf-arrow-shaft');
    await launch('vf-arrow-shaft');
    await openPackage(env, 'VF arrow shaft', pageArrowsDocument());
    await showPageRead();
    await waitPageReady();

    // The model route still ends at the tip: `data-page-edge-route` is the
    // router's polyline and must not lose its last point to a render change.
    const edges = await readEdges();
    const primary = edges.filter((edge) => edge.role === 'primary');
    const references = edges.filter((edge) => edge.role === 'reference');
    assert.ok(primary.length >= 2, 'the fixture has more than one primary edge');
    assert.ok(references.length >= 1, 'the fixture has a reference edge');

    const arrowLength = 6;
    const vector = { right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, down: { x: 0, y: 1 }, up: { x: 0, y: -1 } };
    const lastPoint = (pathD) => {
      const match = pathD.match(/(?:L|M) (-?[\d.]+) (-?[\d.]+)\s*$/);
      assert.ok(match !== null, `path "${pathD}" ends with a line command`);
      return { x: Number(match[1]), y: Number(match[2]) };
    };
    for (const edge of primary) {
      const tip = parsePoint(edge.tip);
      const route = parseRoute(edge.route);
      const routeTip = route.at(-1);
      assert.ok(
        Math.abs(routeTip.x - tip.x) <= 0.01 && Math.abs(routeTip.y - tip.y) <= 0.01,
        `${edge.branchId}: the model route still ends at the tip`,
      );
      const end = lastPoint(edge.pathD);
      const direction = vector[edge.arrow ?? 'right'];
      assert.ok(direction !== undefined, `${edge.branchId}: known arrow direction`);
      const base = {
        x: tip.x - direction.x * arrowLength,
        y: tip.y - direction.y * arrowLength,
      };
      assert.ok(
        Math.hypot(end.x - base.x, end.y - base.y) <= 0.02,
        `${edge.branchId}: the rendered shaft ends at the arrow base (${end.x},${end.y} vs ${base.x},${base.y})`,
      );
      assert.ok(
        Math.abs(Math.hypot(tip.x - end.x, tip.y - end.y) - arrowLength) <= 0.02,
        `${edge.branchId}: the shaft is one arrow length short of the tip`,
      );
    }
    // The reference chevron keeps its line to the tip: it is an open head, so
    // the shaft must reach it.
    for (const edge of references) {
      if (edge.direction !== 'same-page') continue;
      const tip = parsePoint(edge.tip);
      const end = lastPoint(edge.pathD);
      assert.ok(
        Math.abs(end.x - tip.x) <= 0.02 && Math.abs(end.y - tip.y) <= 0.02,
        `${edge.branchId}: the reference route still reaches its chevron`,
      );
      assert.equal(edge.arrowD.endsWith('Z'), false, 'the reference head stays open');
    }

    // 200 % evidence: one arrow, cropped from the real Page Read surface.
    for (let index = 0; index < 10; index += 1) {
      await page.locator('[data-zoom-action="in"]').click();
    }
    await page.waitForFunction(
      () =>
        Number(
          document
            .querySelector('.nf-editor[data-active="true"] .nf-page-view')
            ?.getAttribute('data-page-zoom'),
        ) === 200,
      undefined,
      { timeout: 10000 },
    );
    const arrowHead = currentSheet()
      .locator('[data-page-edge-id="branch-direct"] .nf-page-edge-arrow')
      .first();
    const box = await arrowHead.boundingBox();
    assert.ok(box !== null, 'the arrowhead has a screen box at 200 %');
    await h.screenshot(artifactsPath('vf-release-fixes', 'page-read-200-context.png'), {
      width: 1440,
      height: 900,
    });
    // Pixel-exact crop around the head: at 200 % the fixed 6 px head is 12 CSS
    // px wide, so this is the largest honest Page Read view of the artefact.
    const cropWidth = 56;
    const cropHeight = 40;
    await page.screenshot({
      path: artifactsPath('vf-release-fixes', 'arrow-page-read-200.png'),
      clip: {
        x: Math.max(0, box.x + box.width / 2 - cropWidth / 2),
        y: Math.max(0, box.y + box.height / 2 - cropHeight / 2),
        width: cropWidth,
        height: cropHeight,
      },
      scale: 'css',
    });
  });
});
