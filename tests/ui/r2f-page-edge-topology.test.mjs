import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { artifactsPath } from '../support/harness.mjs';
import { createUiSession } from '../support/ui-session.mjs';
import { pageEdgeTopologyDocument, writePagePackage } from '../support/page-fixtures.mjs';

/**
 * R2f Page edge topology.
 *
 * Page Read/Edit and the PDF print model must use the layout's semantic
 * placement, not a y-based guess. R2i wraps the whole direct-child group below
 * the root when the child 1 subtree does not fit right; the grandchild then
 * stays beside child 1 on its own nested right trunk. R2j mode A moves the two
 * anchored callouts into the root's right trunk, so children and callouts own
 * independent group trunks and every tree edge enters from the left. The
 * fixture is the topology in the product-owner screenshot.
 */

const tempRoot = artifactsPath('r2f-ui');
const outputDir = artifactsPath('r2f', 'ui');
const ui = createUiSession({ tempRoot });
const h = ui.harness;
let page;

const MIN_STEM = 12;
const CALLOUT_GAP = 12;

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
          anchorStart: element.getAttribute('data-page-edge-anchor-start') === 'true',
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

function assertLeftEntry(edge, label) {
  assert.equal(edge.entry, 'left', `${label}: semantic entry is left`);
  assert.equal(edge.arrow, 'right', `${label}: arrow points right`);
  const tip = parsePoint(edge.tip);
  // The router keeps a 12 px stem except when the card itself starts at the
  // content edge; then only the real available room can be used.
  const stemFloor = tip.x < MIN_STEM - 0.01 ? Math.max(0, tip.x - 0.01) : MIN_STEM - 0.01;
  assert.ok(edge.stem >= stemFloor, `${label}: stem is at least ${stemFloor}px`);
  const route = parseRoute(edge.route);
  assert.ok(isOrthogonal(route), `${label}: route is orthogonal`);
  assert.equal(edge.pathD.includes('C'), false, `${label}: no cubic Bezier command`);
  const routeTip = route.at(-1);
  const before = route.at(-2);
  assert.ok(routeTip !== undefined && before !== undefined, `${label}: route has an arm`);
  assert.ok(
    Math.abs(tip.x - routeTip.x) <= 0.01 && Math.abs(tip.y - routeTip.y) <= 0.01,
    `${label}: tip matches the route end`,
  );
  // Left entry means the final arm is horizontal and arrives at the card's
  // left edge, never at its top or right edge.
  assert.ok(Math.abs(before.y - tip.y) <= 0.01, `${label}: final arm is horizontal`);
  assert.ok(tip.x - before.x >= stemFloor, `${label}: final arm enters from the left`);
}

function routeSnapshot(edges) {
  return edges
    .map((edge) => ({
      branchId: edge.branchId,
      placement: edge.placement,
      trunkId: edge.trunkId,
      trunkPlacement: edge.trunkPlacement,
      trunkX: edge.trunkX,
      from: edge.from,
      to: edge.to,
      route: edge.route,
      entry: edge.entry,
      arrow: edge.arrow,
      stem: edge.stem,
      direction: edge.direction,
    }))
    .sort((left, right) => left.branchId.localeCompare(right.branchId));
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

describe('R2f Page edge topology', () => {
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

  it('shares one below trunk for wrapped children and callouts, and a nested right trunk', async () => {
    const env = ui.isolated('r2f-read');
    await launch('r2f-read');
    await openPackage(env, 'R2f page topology', pageEdgeTopologyDocument());
    await showPageRead();

    assert.equal(await pageCount(), 1, 'the topology fixture fits one landscape page');
    const boxes = await fragmentBoxes();
    const content = await contentBox();
    const root = fragmentOf(boxes, 'top-root');
    const child1 = fragmentOf(boxes, 'top-child-1');
    const child2 = fragmentOf(boxes, 'top-child-2');
    const grandchild = fragmentOf(boxes, 'top-grandchild');
    const callout1 = fragmentOf(boxes, 'top-callout-1');
    const callout2 = fragmentOf(boxes, 'top-callout-2');

    // R2i wraps the direct-child group below the root at the child indent; R2j
    // mode A moves both callouts into the root's right lane. Child 2 stays in
    // the same level column and the grandchild fits beside child 1.
    assert.ok(
      child1.left >= root.left + 26 - 0.75 && child1.left < root.left + root.width - 0.75,
      'child 1 wraps below the root at the child indent',
    );
    assert.ok(
      Math.abs(child2.left - child1.left) <= 0.75,
      'child 2 shares child 1 level column',
    );
    assert.ok(
      child1.top >= root.top + root.height - 0.75,
      'the wrapped child group starts below the parent card',
    );
    assert.ok(
      child2.top >= child1.top + child1.height - 0.75,
      'child 2 starts below the child 1 card',
    );
    assert.ok(
      grandchild.left >= child1.left + child1.width - 0.75,
      'the grandchild sits beside child 1',
    );
    assert.ok(
      Math.abs(grandchild.top - child1.top) <= 1,
      'the grandchild shares the child 1 y',
    );
    // The two anchored callouts share the right lane; the anchor order decides
    // which one is first, so assert the lane/stack, not a fixture-specific
    // branch position.
    const laneCallouts = [callout1, callout2].sort((left, right) => left.top - right.top);
    const firstCallout = laneCallouts[0];
    const secondCallout = laneCallouts[1];
    assert.ok(
      Math.abs(firstCallout.top - root.top) <= 0.75,
      `the first callout starts at the parent y in the right lane (${firstCallout.top} vs ${root.top})`,
    );
    for (const callout of [callout1, callout2]) {
      assert.ok(
        callout.left >= root.left + root.width - 0.75,
        `${callout.blockId} sits right of the parent card`,
      );
    }
    assert.ok(
      Math.abs(callout1.left - callout2.left) <= 0.75,
      'both callouts share the right lane x',
    );
    assert.ok(
      secondCallout.top >= firstCallout.top + firstCallout.height + CALLOUT_GAP - 0.75,
      'the second callout stacks below the first',
    );
    assert.ok(
      child1.top >= secondCallout.top + secondCallout.height - 0.75,
      'the child group starts below the whole callout stack',
    );

    const edges = await readEdges();
    assert.equal(edges.length, 5, 'the fixture exposes five primary tree edges');
    const child1Edge = edgeOf(edges, 'branch-top-child-1');
    const child2Edge = edgeOf(edges, 'branch-top-child-2');
    const grandchildEdge = edgeOf(edges, 'branch-top-grandchild');
    const callout1Edge = edgeOf(edges, 'branch-top-callout-1');
    const callout2Edge = edgeOf(edges, 'branch-top-callout-2');

    for (const edge of edges) {
      assert.equal(edge.role, 'primary');
      assert.equal(edge.direction, 'same-page');
      assertLeftEntry(edge, edge.branchId);
    }

    // Below group: the wrapped children share one trunk and enter left from
    // the parent card bottom.
    assert.equal(child1Edge.placement, 'below');
    assert.equal(child2Edge.placement, 'below');
    assert.equal(child1Edge.trunkPlacement, 'below');
    assert.equal(child2Edge.trunkPlacement, 'below');
    assert.equal(child1Edge.trunkId, child2Edge.trunkId);
    assert.equal(child2Edge.trunkX, child1Edge.trunkX);
    assert.ok(
      Math.abs(parsePoint(child1Edge.from).y - (root.top + root.height)) <= 0.75,
      'the below trunk starts attached to the parent bottom edge',
    );
    assert.ok(
      parsePoint(child1Edge.from).x < child1.left - 0.75,
      'the below trunk sits left of the wrapped group',
    );
    assert.ok(
      Math.abs(parsePoint(child1Edge.to).x - child1.left) <= 0.75,
      'child 1 arm ends at its left edge',
    );
    assert.ok(
      Math.abs(parsePoint(child2Edge.to).x - child2.left) <= 0.75,
      'child 2 arm ends at its left edge',
    );

    // Callouts own an independent right trunk; they never join the below
    // group. The leader exits the parent card's right side.
    for (const edge of [callout1Edge, callout2Edge]) {
      assert.equal(edge.placement, 'right');
      assert.equal(edge.trunkPlacement, 'right');
      assert.equal(edge.trunkId, 'top-root:right');
      assert.notEqual(edge.trunkId, child1Edge.trunkId);
      assert.ok(
        edge.trunkX > root.left + root.width - 0.75,
        'the callout rail starts right of the parent card',
      );
      assert.ok(edge.trunkX < callout1.left + 0.75, 'the callout rail stays left of its cards');
      assert.ok(
        Math.abs(parsePoint(edge.from).x - (root.left + root.width)) <= 0.75,
        'the mode A leader starts at the parent right side',
      );
    }
    assert.equal(callout2Edge.trunkId, callout1Edge.trunkId);
    assert.deepEqual(callout1Edge.from, callout2Edge.from);

    // The grandchild is a right target of child 1 on an independent nested
    // right trunk, never either root group trunk.
    assert.equal(grandchildEdge.placement, 'right');
    assert.equal(grandchildEdge.trunkPlacement, 'right');
    assert.match(grandchildEdge.trunkId, /^top-child-1:right$/);
    assert.notEqual(grandchildEdge.trunkId, child1Edge.trunkId);
    assert.notEqual(grandchildEdge.trunkId, callout1Edge.trunkId);
    assert.ok(
      grandchildEdge.trunkX > child1.left + child1.width - 0.75,
      'the nested right trunk starts right of child 1',
    );
    assert.ok(
      grandchildEdge.trunkX < grandchild.left + 0.75,
      'the nested right trunk stays left of the grandchild',
    );
    assert.ok(
      Math.abs(parsePoint(grandchildEdge.from).x - (child1.left + child1.width)) <= 0.75,
      'the nested right trunk leaves the child 1 right edge',
    );
    assert.ok(
      Math.abs(parsePoint(grandchildEdge.to).x - grandchild.left) <= 0.75,
      'the grandchild enters at its left edge',
    );

    // R2d obstacle rule still holds: no route hides behind another card.
    for (const edge of edges) {
      const route = parseRoute(edge.route);
      for (const fragment of boxes) {
        if (fragment.blockId === edge.fromBlock || fragment.blockId === edge.toBlock) {
          continue;
        }
        assert.equal(
          routeHitsRect(route, fragment),
          false,
          `${edge.branchId} never hides behind ${fragment.blockId}`,
        );
      }
      for (const point of route) {
        assert.ok(
          point.x >= -0.6 && point.x <= content.width + 0.6,
          `${edge.branchId}: x stays in the content box`,
        );
        assert.ok(
          point.y >= -0.6 && point.y <= content.height + 0.6,
          `${edge.branchId}: y stays in the content box`,
        );
      }
    }

    // Anchored callouts still declare their anchor origin for the accessible
    // branch information, even though the visible route uses the shared trunk.
    assert.equal(callout1Edge.anchorStart, true);
    assert.equal(callout2Edge.anchorStart, true);

    await h.screenshot(artifactsPath('r2f', 'ui', 'page-edge-topology-1440x900.png'), {
      width: 1440,
      height: 900,
    });
  });

  it('renders the same routes in Page Edit', async () => {
    const env = ui.isolated('r2f-edit');
    await launch('r2f-edit');
    const packagePath = await openPackage(env, 'R2f page topology edit', pageEdgeTopologyDocument());
    await showPageRead();
    const before = routeSnapshot(await readEdges());

    await setEditMode(packagePath);
    assert.equal(
      await activePageView().locator('.nf-page-edges').count(),
      1,
      'Page Edit keeps the one edge layer',
    );
    const after = routeSnapshot(await readEdges());
    assert.deepEqual(after, before, 'Page Read and Page Edit use identical routes');

    for (const edge of await readEdges()) {
      assertLeftEntry(edge, `Page Edit ${edge.branchId}`);
    }
    await h.screenshot(artifactsPath('r2f', 'ui', 'page-edge-topology-edit-1440x900.png'), {
      width: 1440,
      height: 900,
    });
  });
});
