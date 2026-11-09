import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { pageTrunkContinuityDocument, writePagePackage } from '../support/page-fixtures.mjs';

/**
 * R2g Page trunk continuity.
 *
 * One trunk per `(parent, placement)` group, aligned at one x across every page
 * from the parent port to the last child arm. R2i wraps the root child group
 * below the root, so page 1 owns the root group port, page 2 is a pass-through
 * page for the root group, and page 3 owns the last child arm. The nested below
 * trunk of child 1 runs in parallel at its own x and stops at its own last arm.
 * Cross-page tree edges have no `p.N` chip.
 */

const tempRoot = artifactsPath('r2g-ui');
const outputDir = artifactsPath('r2g', 'ui');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

const MANUAL_BREAKS = ['r2g-grandchild', 'r2g-child-2'];
const MIN_STEM = 12;
const TRUNK_GAP = 0;

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

async function goToPage(target) {
  let current = await currentPage();
  while (current !== target) {
    const from = current;
    await activePageView()
      .locator(`[data-page-nav="${target > current ? 'next' : 'prev'}"]`)
      .click();
    current = target > current ? from + 1 : from - 1;
    await page.waitForFunction(
      (expected) => {
        const view = document.querySelector('.nf-editor[data-active="true"] .nf-page-view');
        return (
          view !== null &&
          Number(view.getAttribute('data-current-page')) === expected &&
          view.getAttribute('data-ready') === 'true' &&
          view.getAttribute('data-updating') === 'false'
        );
      },
      current,
      { timeout: 10000 },
    );
  }
}

async function fragmentBoxes() {
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

function fragmentOf(boxes, blockId) {
  const box = boxes.find((candidate) => candidate.blockId === blockId);
  assert.ok(box !== undefined, `fragment ${blockId} exists`);
  return box;
}

async function contentBox() {
  return activePageView()
    .locator('[data-page-content]')
    .evaluate((element) => ({
      width: Number.parseFloat(element.style.width),
      height: Number.parseFloat(element.style.height),
    }));
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

function assertPointClose(actual, expected, tolerance = 0.02) {
  assert.ok(
    Math.abs(actual.x - expected.x) <= tolerance &&
      Math.abs(actual.y - expected.y) <= tolerance,
    `point ${actual.x},${actual.y} is close to ${expected.x},${expected.y}`,
  );
}

function parseLead(value) {
  if (value === null || value === undefined || value === '') return null;
  const points = value.split(' ').map(parsePoint);
  assert.equal(points.length, 2, 'trunk lead has two points');
  return points;
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
  return activePageView()
    .locator('[data-page-edge-id]')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const path = element.querySelector('.nf-page-edge-path');
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
          placement: element.getAttribute('data-page-edge-placement') ?? '',
          trunkId: element.getAttribute('data-page-edge-trunk-id') ?? '',
          trunkPlacement: element.getAttribute('data-page-edge-trunk-placement') ?? '',
          trunkX: Number(element.getAttribute('data-page-edge-trunk-x')),
          trunkPortPage: Number(element.getAttribute('data-page-edge-trunk-port-page')),
          trunkSegmentPage: Number(
            element.getAttribute('data-page-edge-trunk-segment-page'),
          ),
          trunkSegmentStart:
            element.getAttribute('data-page-edge-trunk-segment-start') ?? '',
          trunkSegmentEnd: element.getAttribute('data-page-edge-trunk-segment-end') ?? '',
          pathD: path?.getAttribute('d') ?? '',
        };
      }),
    );
}

async function readTrunks() {
  return activePageView()
    .locator('[data-page-trunk-id]')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const path = element.querySelector('.nf-page-trunk-path');
        return {
          trunkId: element.getAttribute('data-page-trunk-id') ?? '',
          parent: element.getAttribute('data-page-trunk-parent') ?? '',
          placement: element.getAttribute('data-page-trunk-placement') ?? '',
          x: Number(element.getAttribute('data-page-trunk-x')),
          port: element.getAttribute('data-page-trunk-port') ?? '',
          portPage: Number(element.getAttribute('data-page-trunk-port-page')),
          page: Number(element.getAttribute('data-page-trunk-page')),
          start: element.getAttribute('data-page-trunk-start') ?? '',
          end: element.getAttribute('data-page-trunk-end') ?? '',
          lead: element.getAttribute('data-page-trunk-lead') ?? '',
          segmentCount: Number(
            element.getAttribute('data-page-trunk-segment-count'),
          ),
          pathD: path?.getAttribute('d') ?? '',
        };
      }),
    );
}

function edgeOf(edges, branchId) {
  const edge = edges.find((candidate) => candidate.branchId === branchId);
  assert.ok(edge !== undefined, `edge ${branchId} exists`);
  return edge;
}

function trunkOf(trunks, trunkId) {
  const trunk = trunks.find((candidate) => candidate.trunkId === trunkId);
  assert.ok(trunk !== undefined, `trunk ${trunkId} exists`);
  return trunk;
}

function assertLeftArm(edge, label) {
  assert.equal(edge.entry, 'left', `${label}: entry is left`);
  assert.equal(edge.arrow, 'right', `${label}: arrow points right`);
  assert.ok(edge.stem >= MIN_STEM - 0.01, `${label}: final stem is at least ${MIN_STEM}px`);
  const route = parseRoute(edge.route);
  assert.ok(isOrthogonal(route), `${label}: route is orthogonal`);
  assert.equal(edge.pathD.includes('C'), false, `${label}: no cubic Bezier command`);
  const tip = parsePoint(edge.tip);
  const routeTip = route.at(-1);
  const before = route.at(-2);
  assert.ok(routeTip !== undefined && before !== undefined, `${label}: route has an arm`);
  assert.ok(
    Math.abs(tip.x - routeTip.x) <= 0.01 && Math.abs(tip.y - routeTip.y) <= 0.01,
    `${label}: tip matches route end`,
  );
  assert.ok(Math.abs(before.y - tip.y) <= 0.01, `${label}: final arm is horizontal`);
  assert.ok(tip.x - before.x >= MIN_STEM - 0.01, `${label}: arm enters from the left`);
}

function routeSnapshot(edges, trunks) {
  return {
    edges: edges
      .map((edge) => ({
        branchId: edge.branchId,
        direction: edge.direction,
        targetPage: edge.targetPage,
        placement: edge.placement,
        from: edge.from,
        to: edge.to,
        route: edge.route,
        entry: edge.entry,
        arrow: edge.arrow,
        stem: edge.stem,
        trunkId: edge.trunkId,
        trunkPlacement: edge.trunkPlacement,
        trunkX: edge.trunkX,
        trunkPortPage: edge.trunkPortPage,
        trunkSegmentPage: edge.trunkSegmentPage,
        trunkSegmentStart: edge.trunkSegmentStart,
        trunkSegmentEnd: edge.trunkSegmentEnd,
      }))
      .sort((left, right) => left.branchId.localeCompare(right.branchId)),
    trunks: trunks
      .map((trunk) => ({
        trunkId: trunk.trunkId,
        parent: trunk.parent,
        placement: trunk.placement,
        x: trunk.x,
        port: trunk.port,
        portPage: trunk.portPage,
        page: trunk.page,
        start: trunk.start,
        end: trunk.end,
        lead: trunk.lead,
        segmentCount: trunk.segmentCount,
      }))
      .sort((left, right) => left.trunkId.localeCompare(right.trunkId)),
  };
}

async function setPageBreaks(packagePath) {
  const resolved = await page.evaluate(
    ({ path, value }) => window.__noteforestTest.setPageSettingsOverride(path, value),
    {
      path: packagePath,
      value: { manualBreakBeforeBlockIds: MANUAL_BREAKS },
    },
  );
  assert.deepEqual(resolved.manualBreakBeforeBlockIds, MANUAL_BREAKS);
}

async function setEditMode(packagePath) {
  await page.keyboard.press('Meta+e');
  await page.waitForFunction(
    (path) => window.__noteforestTest.viewState()[path]?.interactionMode === 'edit',
    packagePath,
    { timeout: 5000 },
  );
  await waitPageReady();
}

describe('R2g Page trunk continuity', () => {
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

  it('keeps each parent trunk aligned across pages, pass-through, and the last arm', async () => {
    const env = ui.isolated('r2g-read');
    await launch('r2g-read');
    const packagePath = await openPackage(
      env,
      'R2g page trunk continuity',
      pageTrunkContinuityDocument(),
    );
    await setPageBreaks(packagePath);
    await showPageRead();

    assert.equal(await pageCount(), 3, 'two manual breaks derive three pages');
    const content = await contentBox();

    // Parent page: root and child 1. R2i wrapped the whole root child group
    // below the root, so the root below trunk and child 1's nested below trunk
    // run in parallel to the page bottom.
    assert.equal(await currentPage(), 1);
    const page1Fragments = await fragmentBoxes();
    assert.deepEqual(
      page1Fragments.map((fragment) => fragment.blockId).sort(),
      ['r2g-child-1', 'r2g-root'],
    );
    const root = fragmentOf(page1Fragments, 'r2g-root');
    const child1 = fragmentOf(page1Fragments, 'r2g-child-1');
    assert.ok(
      child1.left >= root.left + 26 - 0.75 && child1.left < root.left + root.width - 0.75,
      'child 1 wraps below the root at the child indent',
    );
    assert.ok(
      child1.top >= root.top + root.height - 0.75,
      'child 1 starts below the root card',
    );
    const page1Edges = await readEdges();
    const page1Trunks = await readTrunks();
    assert.equal(page1Edges.length, 1, 'only the same-page child 1 arm is on page 1');
    assert.equal(page1Trunks.length, 2, 'root and nested below trunks are independent');
    assert.equal(
      await activePageView().locator('[data-page-edge-label]').count(),
      0,
      'no p.N indicator is drawn for a tree edge',
    );

    const rootTrunk = trunkOf(page1Trunks, 'r2g-root:below');
    assert.equal(rootTrunk.parent, 'r2g-root');
    assert.equal(rootTrunk.placement, 'below');
    assert.equal(rootTrunk.page, 1);
    assert.equal(rootTrunk.portPage, 1);
    assert.equal(rootTrunk.segmentCount, 3, 'one segment per page through the last child');
    assert.ok(
      rootTrunk.x > root.left && rootTrunk.x < child1.left,
      'the below trunk sits inside the parent lane, left of the wrapped group',
    );
    const rootPort = parsePoint(rootTrunk.port);
    assert.ok(
      Math.abs(rootPort.y - (root.top + root.height)) <= 0.75,
      'the below trunk port is the parent card bottom',
    );
    assert.ok(
      Math.abs(rootPort.x - rootTrunk.x) <= 0.75,
      'the below trunk port shares the trunk x',
    );
    const rootStart = parsePoint(rootTrunk.start);
    assert.deepEqual(rootStart, { x: rootTrunk.x, y: rootPort.y });
    assert.equal(parseLead(rootTrunk.lead), null, 'the below trunk has no horizontal lead');
    assert.ok(
      Math.abs(parsePoint(rootTrunk.end).y - content.height) <= 0.75,
      'the parent page trunk reaches the content bottom for a later child',
    );
    assert.equal(rootTrunk.pathD.includes('C'), false);

    const nestedTrunk = trunkOf(page1Trunks, 'r2g-child-1:below');
    assert.equal(nestedTrunk.parent, 'r2g-child-1');
    assert.equal(nestedTrunk.placement, 'below');
    assert.deepEqual(
      { page: nestedTrunk.page, portPage: nestedTrunk.portPage, segments: nestedTrunk.segmentCount },
      { page: 1, portPage: 1, segments: 2 },
    );
    assert.notEqual(nestedTrunk.trunkId, rootTrunk.trunkId);
    assert.notEqual(nestedTrunk.x, rootTrunk.x, 'nested trunk has its own x');
    assert.ok(
      Math.abs(nestedTrunk.x - (child1.left + 12)) <= 1.5,
      `nested below trunk keeps the 12 px left inset (${nestedTrunk.x} vs ${child1.left})`,
    );
    const nestedStart = parsePoint(nestedTrunk.start);
    assert.ok(
      Math.abs(
        nestedStart.y - (child1.top + child1.height + TRUNK_GAP),
      ) <= 0.75,
      'the nested below trunk starts attached to the card bottom',
    );
    assert.equal(parseLead(nestedTrunk.lead), null, 'the below trunk has no horizontal lead');
    assert.ok(
      Math.abs(parsePoint(nestedTrunk.end).y - content.height) <= 0.75,
      'the nested trunk continues to the page bottom',
    );

    const child1Edge = edgeOf(page1Edges, 'branch-r2g-child-1');
    assert.equal(child1Edge.direction, 'same-page');
    assert.equal(child1Edge.placement, 'below');
    assert.equal(child1Edge.trunkId, rootTrunk.trunkId);
    assert.equal(child1Edge.trunkX, rootTrunk.x);
    assert.equal(child1Edge.trunkSegmentPage, 1);
    assert.deepEqual(parsePoint(child1Edge.from), rootPort);
    const child1Target = parsePoint(child1Edge.to);
    assert.ok(Math.abs(child1Target.x - child1.left) <= 0.75);
    assertLeftArm(child1Edge, 'page 1 child 1');

    // Pass-through page: no root-group child, but the root trunk still runs
    // top-to-bottom at the same x; child 1's nested trunk ends at its arm.
    await goToPage(2);
    assert.equal(await currentPage(), 2);
    const page2Fragments = await fragmentBoxes();
    assert.deepEqual(
      page2Fragments.map((fragment) => fragment.blockId).sort(),
      ['r2g-grandchild', 'r2g-great-grandchild'],
    );
    const grandchild = fragmentOf(page2Fragments, 'r2g-grandchild');
    const greatGrandchild = fragmentOf(page2Fragments, 'r2g-great-grandchild');
    const page2Edges = await readEdges();
    const page2Trunks = await readTrunks();
    assert.equal(page2Edges.length, 2, 'the nested arm and the great-grandchild arm are on page 2');
    assert.equal(page2Trunks.length, 3, 'the root trunk passes through this page');
    assert.equal(
      await activePageView().locator('[data-page-edge-label]').count(),
      0,
      'a pass-through trunk has no page chip',
    );

    const rootPassThrough = trunkOf(page2Trunks, 'r2g-root:below');
    assert.equal(rootPassThrough.page, 2);
    assert.equal(rootPassThrough.x, rootTrunk.x, 'the trunk x is stable across pages');
    assert.deepEqual(parsePoint(rootPassThrough.start), { x: rootTrunk.x, y: 0 });
    assertPointClose(parsePoint(rootPassThrough.end), {
      x: rootTrunk.x,
      y: content.height,
    });
    assert.equal(parseLead(rootPassThrough.lead), null);

    const nestedPage2 = trunkOf(page2Trunks, 'r2g-child-1:below');
    assert.equal(nestedPage2.x, nestedTrunk.x);
    assert.equal(nestedPage2.segmentCount, 2, 'the nested trunk ends on its last child page');
    assert.deepEqual(parsePoint(nestedPage2.start), { x: nestedTrunk.x, y: 0 });

    const grandchildEdge = edgeOf(page2Edges, 'branch-r2g-grandchild');
    assert.equal(grandchildEdge.direction, 'trunk');
    assert.equal(grandchildEdge.targetPage, null);
    assert.equal(grandchildEdge.trunkId, nestedTrunk.trunkId);
    assert.equal(grandchildEdge.trunkSegmentPage, 2);
    assert.deepEqual(parsePoint(grandchildEdge.from), parsePoint(nestedPage2.start));
    assert.ok(
      Math.abs(parsePoint(grandchildEdge.to).x - grandchild.left) <= 0.75,
      'the grandchild arm enters at its left edge',
    );
    assert.deepEqual(parsePoint(nestedPage2.end), {
      x: nestedTrunk.x,
      y: parsePoint(grandchildEdge.to).y,
    });
    assertLeftArm(grandchildEdge, 'page 2 grandchild');

    // The great-grandchild stays beside the grandchild and owns an independent
    // nested right trunk, never the child 1 below trunk.
    const greatEdge = edgeOf(page2Edges, 'branch-r2g-great-grandchild');
    assert.equal(greatEdge.direction, 'same-page');
    assert.equal(greatEdge.placement, 'right');
    assert.match(greatEdge.trunkId, /^r2g-grandchild:right$/);
    assert.notEqual(greatEdge.trunkId, nestedTrunk.trunkId);
    assert.ok(
      greatEdge.trunkX > grandchild.left + grandchild.width - 0.75,
      'the great-grandchild right trunk starts right of the grandchild',
    );
    assert.ok(
      greatEdge.trunkX < greatGrandchild.left + 0.75,
      'the great-grandchild right trunk stays left of its target',
    );
    assert.ok(
      Math.abs(parsePoint(greatEdge.from).x - (grandchild.left + grandchild.width)) <= 0.75,
      'the great-grandchild trunk leaves the grandchild right edge',
    );
    assertLeftArm(greatEdge, 'page 2 great-grandchild');

    // Last child page: the root trunk ends at child 2's arm and the nested
    // trunk is gone; the trunk never continues past its last child.
    await goToPage(3);
    assert.equal(await currentPage(), 3);
    const page3Fragments = await fragmentBoxes();
    assert.deepEqual(
      page3Fragments.map((fragment) => fragment.blockId),
      ['r2g-child-2'],
    );
    const child2 = fragmentOf(page3Fragments, 'r2g-child-2');
    const page3Edges = await readEdges();
    const page3Trunks = await readTrunks();
    assert.equal(page3Edges.length, 1);
    assert.equal(page3Trunks.length, 1, 'the nested trunk does not continue past its last arm');
    assert.equal(
      await activePageView().locator('[data-page-edge-label]').count(),
      0,
      'the last tree arm has no page chip',
    );

    const rootLast = trunkOf(page3Trunks, 'r2g-root:below');
    assert.equal(rootLast.x, rootTrunk.x, 'the same trunk x reaches the last page');
    assert.equal(rootLast.segmentCount, 3);
    assert.deepEqual(parsePoint(rootLast.start), { x: rootTrunk.x, y: 0 });
    const child2Edge = page3Edges[0];
    assert.equal(child2Edge.branchId, 'branch-r2g-child-2');
    assert.equal(child2Edge.direction, 'trunk');
    assert.equal(child2Edge.targetPage, null);
    assert.equal(child2Edge.trunkId, rootTrunk.trunkId);
    assert.equal(child2Edge.trunkX, rootTrunk.x);
    assert.equal(child2Edge.trunkSegmentPage, 3);
    assert.deepEqual(parsePoint(child2Edge.from), parsePoint(rootLast.start));
    assert.ok(
      Math.abs(parsePoint(child2Edge.to).x - child2.left) <= 0.75,
      'the last child arm enters at its left edge',
    );
    assert.deepEqual(parsePoint(rootLast.end), {
      x: rootTrunk.x,
      y: parsePoint(child2Edge.to).y,
    });
    assertLeftArm(child2Edge, 'page 3 child 2');

    // No primary tree edge is a page-edge indicator, and no route hides behind
    // another card. Trunks themselves stay out of every card.
    for (const [pageNumber, edges, trunks, fragments] of [
      [1, page1Edges, page1Trunks, page1Fragments],
      [2, page2Edges, page2Trunks, page2Fragments],
      [3, page3Edges, page3Trunks, page3Fragments],
    ]) {
      for (const edge of edges) {
        assert.notEqual(edge.direction, 'to-edge', `page ${pageNumber}: no to-edge tree chip`);
        assert.notEqual(edge.direction, 'from-edge', `page ${pageNumber}: no from-edge tree chip`);
        const route = parseRoute(edge.route);
        for (const fragment of fragments) {
          if (fragment.blockId === edge.fromBlock || fragment.blockId === edge.toBlock) {
            continue;
          }
          assert.equal(
            routeHitsRect(route, fragment),
            false,
            `page ${pageNumber}: ${edge.branchId} never hides behind ${fragment.blockId}`,
          );
        }
      }
      for (const trunk of trunks) {
        const points =
          parseLead(trunk.lead) === null
            ? [parsePoint(trunk.start), parsePoint(trunk.end)]
            : [...parseLead(trunk.lead), parsePoint(trunk.end)];
        for (const fragment of fragments) {
          assert.equal(
            routeHitsRect(points, fragment),
            false,
            `page ${pageNumber}: trunk ${trunk.trunkId} never overlaps ${fragment.blockId}`,
          );
        }
      }
    }

    await goToPage(1);
    await h.screenshot(artifactsPath('r2g', 'ui', 'trunk-continuity-page1-1440x900.png'), {
      width: 1440,
      height: 900,
    });
    await goToPage(2);
    await h.screenshot(artifactsPath('r2g', 'ui', 'trunk-continuity-page2-1440x900.png'), {
      width: 1440,
      height: 900,
    });
    await goToPage(3);
    await h.screenshot(artifactsPath('r2g', 'ui', 'trunk-continuity-page3-1440x900.png'), {
      width: 1440,
      height: 900,
    });
  });

  it('renders identical trunk segments and arms in Page Read and Page Edit', async () => {
    const env = ui.isolated('r2g-edit');
    await launch('r2g-edit');
    const packagePath = await openPackage(
      env,
      'R2g page trunk continuity edit',
      pageTrunkContinuityDocument(),
    );
    await setPageBreaks(packagePath);
    await showPageRead();
    assert.equal(await pageCount(), 3);

    const read = [];
    for (let pageNumber = 1; pageNumber <= 3; pageNumber += 1) {
      await goToPage(pageNumber);
      read.push(routeSnapshot(await readEdges(), await readTrunks()));
    }

    await goToPage(1);
    await setEditMode(packagePath);
    assert.equal(
      await activePageView().locator('.nf-page-edges').count(),
      1,
      'Page Edit keeps the one edge layer',
    );
    for (let pageNumber = 1; pageNumber <= 3; pageNumber += 1) {
      await goToPage(pageNumber);
      assert.deepEqual(
        routeSnapshot(await readEdges(), await readTrunks()),
        read[pageNumber - 1],
        `Page Read and Page Edit share trunk/arm data on page ${pageNumber}`,
      );
    }
    await goToPage(1);
    await h.screenshot(
      artifactsPath('r2g', 'ui', 'trunk-continuity-edit-page1-1440x900.png'),
      { width: 1440, height: 900 },
    );
  });
});
