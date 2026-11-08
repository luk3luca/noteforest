import { describe, expect, it } from 'vitest';
import {
  arrowPoints,
  buildPageEdges,
  buildPageEdgeModel,
  EDGE_STYLE,
  isOrthogonalRoute,
  openArrowPath,
  pageRouteMidpoint,
  routeIntersectsRect,
  roundedPath,
  routePageEdge,
  simplifyPath,
  type ContinuousLayout,
  type DerivedPage,
  type EdgeLayout,
  type PageFragment,
  type PageRouteRect,
} from '../src/index.js';

const BOUNDS = { width: 1000, height: 700 };

function fragment(blockId: string, rect: PageRouteRect): PageFragment {
  return {
    blockId,
    chapterId: 'chapter-1',
    role: 'child',
    depth: 1,
    source: { ...rect },
    page: { ...rect },
    startSegment: 0,
    endSegment: 0,
    isFirst: true,
    isLast: true,
    isPageStart: true,
    continuesToPage: null,
    continuedFromPage: null,
  };
}

function page(pageNumber: number, fragments: PageFragment[]): DerivedPage {
  return {
    pageNumber,
    chapterId: 'chapter-1',
    chapterIndex: 0,
    chapterTitle: 'Chapter 1',
    yStart: 0,
    yEnd: BOUNDS.height,
    isChapterStart: pageNumber === 1,
    fragments,
    continuationOut: [],
    continuationIn: [],
    overflow: false,
  };
}

function layout(edges: EdgeLayout[], pages: DerivedPage[]): ContinuousLayout {
  return {
    documentId: 'route-fixture',
    title: 'Route fixture',
    pageSetup: {
      size: 'A4',
      orientation: 'landscape',
      margins: { top: 12, right: 12, bottom: 12, left: 12 },
    },
    geometry: {
      pageWidthMm: 297,
      pageHeightMm: 210,
      pageWidthPx: 1122.52,
      pageHeightPx: 793.7,
      contentWidthPx: BOUNDS.width,
      contentHeightPx: BOUNDS.height,
      marginsPx: { top: 45.35, right: 45.35, bottom: 45.35, left: 45.35 },
    },
    chapters: [
      {
        id: 'chapter-1',
        title: 'Chapter 1',
        index: 0,
        topLevelBlockIds: ['source'],
        height: BOUNDS.height,
      },
    ],
    blocks: [],
    blockById: {},
    anchors: [],
    edges,
    defects: [],
    measurementCalls: 0,
  } as unknown as ContinuousLayout;
}

function branch(
  branchId: string,
  fromBlockId: string,
  toBlockId: string,
  role: EdgeLayout['role'] = 'primary',
  anchorId: string | null = null,
): EdgeLayout {
  return {
    branchId,
    role,
    fromBlockId,
    toBlockId,
    anchorId,
    chapterId: 'chapter-1',
    from: { x: 0, y: 0 },
    to: { x: 0, y: 0 },
    crossChapter: false,
  };
}

describe('page route primitives', () => {
  it('draws orthogonal polylines with rounded corners and no cubic command', () => {
    const points = [
      { x: 10, y: 10 },
      { x: 60, y: 10 },
      { x: 60, y: 60 },
      { x: 120, y: 60 },
    ];
    const path = roundedPath(points, EDGE_STYLE.radius);
    expect(path).not.toMatch(/\bC\b/);
    expect(path).toContain(' Q ');
    expect(path.startsWith('M 10 10')).toBe(true);
    expect(path.endsWith('L 120 60')).toBe(true);
    expect(simplifyPath([...points, { x: 120, y: 60 }])).toHaveLength(4);
  });

  it('uses the fixed arrowhead in every cardinal direction', () => {
    const right = arrowPoints({ x: 100, y: 100 }, 'right');
    expect(right[0]).toEqual({ x: 100, y: 100 });
    expect(right[1]).toEqual({
      x: 100 - EDGE_STYLE.arrowLength,
      y: 100 - EDGE_STYLE.arrowHalfWidth,
    });
    const left = arrowPoints({ x: 100, y: 100 }, 'left');
    expect(left[1]).toEqual({
      x: 100 + EDGE_STYLE.arrowLength,
      y: 100 - EDGE_STYLE.arrowHalfWidth,
    });
    const down = arrowPoints({ x: 100, y: 100 }, 'down');
    expect(down[1]).toEqual({
      x: 100 - EDGE_STYLE.arrowHalfWidth,
      y: 100 - EDGE_STYLE.arrowLength,
    });
    const up = arrowPoints({ x: 100, y: 100 }, 'up');
    expect(up[1]).toEqual({
      x: 100 - EDGE_STYLE.arrowHalfWidth,
      y: 100 + EDGE_STYLE.arrowLength,
    });
    for (const direction of ['right', 'left', 'down', 'up'] as const) {
      expect(openArrowPath({ x: 10, y: 10 }, ...(direction === 'right'
        ? [1, 0]
        : direction === 'left'
          ? [-1, 0]
          : direction === 'down'
            ? [0, 1]
            : [0, -1]))).not.toMatch(/[CZ]/);
      expect(openArrowPath({ x: 10, y: 10 }, 0, 0)).toBe('');
    }
  });

  it('keeps a corner when a near-aligned segment is shorter than five tenths', () => {
    // Regression found on the showcase (R2d): a 0.443 px vertical jog used to
    // be treated as horizontal by the old 0.5 px collinearity tolerance, which
    // folded an orthogonal route into a diagonal. The shared simplifier must
    // keep the corner.
    const points = [
      { x: 441, y: 248.99 },
      { x: 445, y: 248.99 },
      { x: 449, y: 248.99 },
      { x: 451, y: 248.99 },
      { x: 453, y: 248.99 },
      { x: 641.328, y: 248.99 },
      { x: 642.33, y: 248.99 },
      { x: 642.33, y: 248.5469 },
      { x: 642.33, y: 232.9532 },
      { x: 642.33, y: 211.75 },
    ];
    expect(simplifyPath(points)).toEqual([
      { x: 441, y: 248.99 },
      { x: 642.33, y: 248.99 },
      { x: 642.33, y: 211.75 },
    ]);
    expect(roundedPath(points, EDGE_STYLE.radius)).toContain('Q');
  });

  it('computes a deterministic midpoint on the polyline', () => {
    expect(pageRouteMidpoint([])).toEqual({ x: 0, y: 0 });
    expect(pageRouteMidpoint([{ x: 4, y: 4 }])).toEqual({ x: 4, y: 4 });
    expect(
      pageRouteMidpoint([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ]),
    ).toEqual({ x: 10, y: 0 });
  });
});

describe('obstacle-aware page routing', () => {
  it('routes a parent to a later sibling around the intervening card', () => {
    const source = { x: 0, y: 0, width: 140, height: 80 };
    const middle = { x: 156, y: 0, width: 150, height: 100 };
    const later = { x: 322, y: 0, width: 150, height: 100 };
    const route = routePageEdge({
      from: { x: source.x + source.width, y: 40 },
      to: { x: later.x, y: 50 },
      sourceRect: source,
      targetRect: later,
      obstacles: [middle],
      bounds: BOUNDS,
    });
    expect(route.blocked).toBe(false);
    expect(route.entry).toBe('left');
    expect(route.direction).toBe('right');
    expect(route.stem).toBeGreaterThanOrEqual(EDGE_STYLE.stemMin);
    expect(isOrthogonalRoute(route.points)).toBe(true);
    expect(routeIntersectsRect(route, middle)).toBe(false);
    expect(route.tip).toEqual({ x: later.x, y: 50 });
    const last = route.points.at(-1)!;
    const beforeLast = route.points.at(-2)!;
    expect(last.x - beforeLast.x).toBeGreaterThanOrEqual(EDGE_STYLE.stemMin - 0.001);
    expect(Math.abs(last.y - beforeLast.y)).toBeLessThan(0.001);
  });

  it('never crosses any earlier sibling in a packed row', () => {
    const source = { x: 0, y: 0, width: 140, height: 80 };
    const siblings = [156, 322, 488, 654].map((x, index) => ({
      x,
      y: 0,
      width: 150,
      height: 96 + index * 4,
    }));
    const obstacles = siblings;
    for (const [index, target] of siblings.entries()) {
      const route = routePageEdge({
        from: { x: source.x + source.width, y: 40 },
        to: { x: target.x, y: target.y + Math.min(target.height / 2, 60) },
        sourceRect: source,
        targetRect: target,
        obstacles: obstacles.filter((item) => item !== target),
        bounds: BOUNDS,
      });
      expect(route.blocked, `sibling ${index} is routable`).toBe(false);
      expect(route.entry).toBe('left');
      expect(route.stem).toBeGreaterThanOrEqual(EDGE_STYLE.stemMin - 0.001);
      for (const obstacle of obstacles) {
        if (obstacle === target) continue;
        expect(routeIntersectsRect(route, obstacle), `sibling ${index} avoids ${obstacle.x}`).toBe(
          false,
        );
      }
      expect(route.points.every((point) => point.x >= 0 && point.x <= BOUNDS.width)).toBe(true);
      expect(route.points.every((point) => point.y >= 0 && point.y <= BOUNDS.height)).toBe(true);
    }
  });

  it('keeps a straight horizontal edge straight when nothing blocks it', () => {
    const source = { x: 0, y: 0, width: 100, height: 80 };
    const target = { x: 124, y: 0, width: 100, height: 80 };
    const route = routePageEdge({
      from: { x: 100, y: 40 },
      to: { x: 124, y: 40 },
      sourceRect: source,
      targetRect: target,
      obstacles: [],
      bounds: BOUNDS,
    });
    expect(route.points).toEqual([
      { x: 100, y: 40 },
      { x: 124, y: 40 },
    ]);
    expect(roundedPath(route.points, EDGE_STYLE.radius)).not.toMatch(/\bC\b/);
  });

  it('falls back to the target top only when the left edge has no room', () => {
    const source = { x: 0, y: 0, width: 200, height: 80 };
    const target = { x: 0, y: 240, width: 200, height: 80 };
    const route = routePageEdge({
      from: { x: 200, y: 40 },
      to: { x: 0, y: 280 },
      sourceRect: source,
      targetRect: target,
      obstacles: [],
      bounds: BOUNDS,
    });
    expect(route.blocked).toBe(false);
    expect(route.entry).toBe('top');
    expect(route.direction).toBe('down');
    expect(route.tip).toEqual({ x: 100, y: 240 });
    expect(route.stem).toBe(EDGE_STYLE.stemMin);
    expect(isOrthogonalRoute(route.points)).toBe(true);
    expect(
      routeIntersectsRect(route, target),
    ).toBe(false);
  });

  it('prefers a full top stem over an 11 px left stem on a wrapped row', () => {
    const source = { x: 0, y: 0, width: 200, height: 80 };
    const target = { x: 12, y: 240, width: 180, height: 80 };
    const route = routePageEdge({
      from: { x: 200, y: 40 },
      to: { x: 12, y: 280 },
      sourceRect: source,
      targetRect: target,
      obstacles: [],
      bounds: BOUNDS,
    });
    expect(route.blocked).toBe(false);
    expect(route.entry).toBe('top');
    expect(route.direction).toBe('down');
    expect(route.stem).toBe(EDGE_STYLE.stemMin);
    expect(route.tip).toEqual({ x: 102, y: 240 });
    expect(isOrthogonalRoute(route.points)).toBe(true);
  });

  it('locks a wrapped tree target to a shortened left entry when required', () => {
    const source = { x: 0, y: 0, width: 200, height: 80 };
    const target = { x: 12, y: 240, width: 180, height: 80 };
    const route = routePageEdge({
      from: { x: 200, y: 40 },
      to: { x: 12, y: 280 },
      sourceRect: source,
      targetRect: target,
      obstacles: [],
      bounds: BOUNDS,
      requiredEntry: 'left',
    });
    expect(route.entry).toBe('left');
    expect(route.direction).toBe('right');
    expect(route.tip).toEqual({ x: 12, y: 280 });
    expect(route.stem).toBe(11);
    expect(isOrthogonalRoute(route.points)).toBe(true);
    expect(route.blocked).toBe(false);
    const before = route.points.at(-2)!;
    const tip = route.points.at(-1)!;
    expect(Math.abs(before.y - tip.y)).toBeLessThan(0.01);
    expect(tip.x - before.x).toBeGreaterThan(0);
  });

  it('keeps a below-stack tree target on the left entry through the obstacle router', () => {
    const source = { x: 0, y: 0, width: 200, height: 80 };
    const target = { x: 30, y: 240, width: 180, height: 80 };
    const route = routePageEdge({
      from: { x: 12, y: 80 },
      to: { x: 30, y: 280 },
      sourceRect: source,
      targetRect: target,
      obstacles: [],
      bounds: BOUNDS,
      sourceSide: 'bottom',
      requiredEntry: 'left',
    });
    expect(route.entry).toBe('left');
    expect(route.direction).toBe('right');
    expect(route.tip).toEqual({ x: 30, y: 280 });
    expect(route.stem).toBeGreaterThanOrEqual(EDGE_STYLE.stemMin - 0.01);
    expect(isOrthogonalRoute(route.points)).toBe(true);
    expect(routeIntersectsRect(route, target)).toBe(false);
  });

  it('honours an anchor start and exits through the source card right edge', () => {
    const source = { x: 0, y: 0, width: 200, height: 100 };
    const target = { x: 224, y: 0, width: 100, height: 100 };
    const route = routePageEdge({
      from: { x: 80, y: 30 },
      to: { x: 224, y: 50 },
      sourceExit: { x: 200, y: 30 },
      sourceRect: source,
      targetRect: target,
      obstacles: [],
      bounds: BOUNDS,
    });
    expect(route.points[0]).toEqual({ x: 80, y: 30 });
    const firstTurn = route.points[1]!;
    expect(firstTurn.y).toBe(30);
    expect(firstTurn.x).toBeGreaterThanOrEqual(200);
    expect(isOrthogonalRoute(route.points)).toBe(true);
    expect(route.tip).toEqual({ x: 224, y: 50 });
  });

  it('separates duplicate edges between the same two fragments with parallel rails', () => {
    const source = { x: 0, y: 0, width: 100, height: 100 };
    const target = { x: 300, y: 200, width: 100, height: 100 };
    const first = routePageEdge({
      from: { x: 100, y: 50 },
      to: { x: 300, y: 250 },
      sourceRect: source,
      targetRect: target,
      obstacles: [],
      bounds: BOUNDS,
      laneIndex: 0,
    });
    const second = routePageEdge({
      from: { x: 100, y: 50 },
      to: { x: 300, y: 250 },
      sourceRect: source,
      targetRect: target,
      obstacles: [],
      bounds: BOUNDS,
      laneIndex: 1,
    });
    expect(first.blocked).toBe(false);
    expect(second.blocked).toBe(false);
    expect(JSON.stringify(first.points)).not.toBe(JSON.stringify(second.points));
    const firstRail = first.points[1];
    const secondRail = second.points[1];
    expect(firstRail).toBeDefined();
    expect(secondRail).toBeDefined();
    expect((secondRail as { x: number }).x).toBeGreaterThan((firstRail as { x: number }).x);
  });
});

describe('page edge mapper routes', () => {
  it('attaches the same route data to every same-page edge', () => {
    const source = fragment('source', { x: 0, y: 0, width: 140, height: 80 });
    const middle = fragment('middle', { x: 156, y: 0, width: 150, height: 100 });
    const later = fragment('later', { x: 322, y: 0, width: 150, height: 100 });
    const pages = [page(1, [source, middle, later])];
    const model = layout(
      [branch('b-later', 'source', 'later'), branch('b-middle', 'source', 'middle')],
      pages,
    );
    const edges = buildPageEdges(model, pages)[0]!;
    const laterEdge = edges.find((edge) => edge.branchId === 'b-later')!;
    expect(laterEdge.route.blocked).toBe(false);
    expect(routeIntersectsRect(laterEdge.route, middle.page)).toBe(false);
    expect(laterEdge.route.tip).toEqual({ x: later.page.x, y: later.page.y + later.page.height / 2 });
    expect(JSON.stringify(buildPageEdges(model, pages))).toBe(JSON.stringify(buildPageEdges(model, pages)));
  });

  it('continues a cross-page primary edge on its group trunk', () => {
    const out = fragment('source', { x: 0, y: 0, width: 100, height: 80 });
    const incoming = fragment('target', { x: 300, y: 0, width: 100, height: 80 });
    const pages = [page(1, [out]), page(2, [incoming])];
    const model = layout([branch('b-cross', 'source', 'target')], pages);
    const byPage = buildPageEdgeModel(model, pages);
    expect(byPage.edges[0]!.some((edge) => edge.branchId === 'b-cross')).toBe(false);
    const view = byPage.trunks[0]!.find((candidate) => candidate.trunk.id === 'source:right')!;
    expect(view).toBeDefined();
    const trunk = view.trunk;
    expect(trunk.portPage).toBe(1);
    expect(trunk.port).toEqual({ x: 100, y: 40 });
    expect(trunk.segments.map((segment) => segment.pageNumber)).toEqual([1, 2]);
    expect(trunk.segments[0]!.start).toEqual({ x: trunk.x, y: 40 });
    expect(trunk.segments[0]!.lead).toEqual({
      from: trunk.port,
      to: { x: trunk.x, y: 40 },
    });
    expect(trunk.segments[0]!.end).toEqual({ x: trunk.x, y: BOUNDS.height });
    expect(trunk.segments[1]!.start).toEqual({ x: trunk.x, y: 0 });
    expect(trunk.segments[1]!.lead).toBeNull();
    const arm = byPage.edges[1]!.find((edge) => edge.branchId === 'b-cross')!;
    expect(arm.direction).toBe('trunk');
    expect(arm.targetPage).toBeNull();
    expect(arm.label).toBeUndefined();
    expect(arm.from).toEqual({ x: trunk.x, y: 0 });
    expect(arm.to).toEqual({ x: incoming.page.x, y: 40 });
    expect(arm.route.entry).toBe('left');
    expect(arm.route.direction).toBe('right');
    expect(trunk.segments[1]!.end).toEqual({ x: trunk.x, y: arm.to.y });
    expect(arm.trunk!.id).toBe(trunk.id);
  });

  it('keeps the parent lead when a right-group arm sits above the parent port', () => {
    const source = fragment('source', { x: 0, y: 0, width: 100, height: 200 });
    const target = fragment('target', { x: 300, y: 0, width: 100, height: 20 });
    const pages = [page(1, [source, target])];
    const model = layout([branch('b-above', 'source', 'target')], pages);
    const byPage = buildPageEdgeModel(model, pages);
    const edge = byPage.edges[0]!.find((candidate) => candidate.branchId === 'b-above')!;
    const trunk = byPage.trunks[0]![0]!.trunk;
    // The parent port is at y=60 (center clamped to 60); the short child arm is
    // at y=10. The trunk spans both, and the horizontal lead still leaves the
    // parent port at y=60.
    expect(trunk.port).toEqual({ x: 100, y: 60 });
    expect(byPage.trunks[0]![0]!.segment.start).toEqual({ x: trunk.x, y: 10 });
    expect(byPage.trunks[0]![0]!.segment.end).toEqual({ x: trunk.x, y: 60 });
    expect(byPage.trunks[0]![0]!.segment.lead).toEqual({
      from: { x: 100, y: 60 },
      to: { x: trunk.x, y: 60 },
    });
    expect(edge.from).toEqual({ x: 100, y: 60 });
    expect(edge.to).toEqual({ x: 300, y: 10 });
    expect(edge.route.entry).toBe('left');
    expect(
      edge.route.points.some(
        (point) => Math.abs(point.x - trunk.x) < 0.01 && Math.abs(point.y - 10) < 0.01,
      ),
    ).toBe(true);
  });

  it('keeps reference cross-page edges target-only', () => {
    const out = fragment('source', { x: 0, y: 0, width: 100, height: 80 });
    const incoming = fragment('target', { x: 50, y: 0, width: 100, height: 80 });
    const pages = [page(1, [out]), page(2, [incoming])];
    const model = layout([branch('b-ref', 'source', 'target', 'reference')], pages);
    const byPage = buildPageEdges(model, pages);
    expect(byPage[0]!.some((edge) => edge.branchId === 'b-ref')).toBe(false);
    const fromEdge = byPage[1]!.find((edge) => edge.branchId === 'b-ref')!;
    expect(fromEdge.direction).toBe('from-edge');
    expect(fromEdge.role).toBe('reference');
    expect(fromEdge.route.points).toEqual([fromEdge.from, fromEdge.to]);
  });
});
