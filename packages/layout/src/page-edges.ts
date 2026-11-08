/**
 * Page-local edge mapping shared by the Page renderer and the PDF print model.
 *
 * The continuous layout already decides which blocks are related and how each
 * primary child was placed. This module projects those edges onto the
 * paginator's derived pages; it never re-layouts, re-paginates, or infers a
 * topology from a target's y coordinate.
 *
 * Semantic topology (R2f):
 * - same-page primary edges are grouped by `(page, parentBlockId, placement)`;
 * - a `right` group leaves the parent's right edge, shares one vertical rail,
 *   and enters every target from the left;
 * - a `below` group leaves the parent's bottom at one shared trunk x and enters
 *   every callout/wrapped child from the left;
 * - cross-page primary edges keep `to-edge`/`from-edge` indicators, and
 *   references keep the target-only dashed indicator rule.
 */

import type {
  ContinuousLayout,
  DerivedPage,
  EdgeLayout,
  EdgePlacement,
  PageFragment,
} from './types.js';
import { EDGE_STYLE, simplifyPath } from './edge-style.js';
import {
  routeIntersectsRect,
  routePageEdge,
  straightPageRoute,
  type PageRoute,
} from './page-routing.js';

export type PageEdgeDirection = 'same-page' | 'to-edge' | 'from-edge';

export interface PageEdgePoint {
  x: number;
  y: number;
}

/**
 * One shared source trunk for a `(parent, placement)` group on one page.
 *
 * Every tree edge in the group points at the same record: the right group owns
 * one vertical rail, the below group one vertical trunk. The renderer still
 * draws each branch polyline (they overlap on the trunk), so highlight and print
 * consumers do not need a second geometry pass.
 */
export interface PageEdgeTrunk {
  id: string;
  pageNumber: number;
  parentBlockId: string;
  placement: EdgePlacement;
  /** Parent port: right edge center, or bottom at `x` for the below group. */
  port: PageEdgePoint;
  /** Shared rail x (right) or trunk x (below). */
  x: number;
  /** Start of the vertical trunk segment. */
  start: PageEdgePoint;
  /** End of the vertical trunk segment. */
  end: PageEdgePoint;
}

export interface PageEdge {
  branchId: string;
  role: 'primary' | 'reference';
  fromBlockId: string;
  toBlockId: string;
  from: PageEdgePoint;
  to: PageEdgePoint;
  direction: PageEdgeDirection;
  /** The page on the other side of a cross-page indicator (1-based). */
  targetPage: number | null;
  /** Semantic placement for primary edges; absent for references. */
  placement?: EdgePlacement;
  /** Shared same-page primary trunk; null for references and page indicators. */
  trunk: PageEdgeTrunk | null;
  /** Short print label (`p.N`) used by the PDF compositor. */
  label?: string;
  /** Canonical branch label or anchor quote, when one is present. */
  branchLabel?: string;
  anchorId?: string;
  /** Shared orthogonal route used by Page Read/Edit and the print model. */
  route: PageRoute;
}

interface BlockPageLocation {
  page: DerivedPage;
  fragment: PageFragment;
}

interface PrimaryGroupEdge {
  edge: EdgeLayout;
  target: BlockPageLocation;
  laneIndex: number;
}

interface PrimaryGroup {
  page: DerivedPage;
  parentId: string;
  placement: EdgePlacement;
  source: BlockPageLocation;
  entries: PrimaryGroupEdge[];
}

function fragmentLocations(pages: readonly DerivedPage[]): Map<string, BlockPageLocation[]> {
  const map = new Map<string, BlockPageLocation[]>();
  for (const page of pages) {
    for (const fragment of page.fragments) {
      const list = map.get(fragment.blockId) ?? [];
      list.push({ page, fragment });
      map.set(fragment.blockId, list);
    }
  }
  for (const list of map.values()) list.sort((a, b) => a.page.pageNumber - b.page.pageNumber);
  return map;
}

function firstLocation(
  map: Map<string, BlockPageLocation[]>,
  blockId: string,
): BlockPageLocation | undefined {
  return map.get(blockId)?.[0];
}

function locationOnPage(
  map: Map<string, BlockPageLocation[]>,
  blockId: string,
  pageNumber: number,
): BlockPageLocation | undefined {
  return map.get(blockId)?.find((location) => location.page.pageNumber === pageNumber);
}

function fragmentCenter(
  location: BlockPageLocation,
  side: 'left' | 'right',
): PageEdgePoint {
  const fragment = location.fragment;
  return {
    x: side === 'left' ? fragment.page.x : fragment.page.x + fragment.page.width,
    y: fragment.page.y + Math.min(fragment.page.height / 2, 60),
  };
}

function edgeLabel(targetPage: number | null): string | undefined {
  return targetPage ? `p.${targetPage}` : undefined;
}

function edgePages(pages: readonly DerivedPage[]): PageEdge[][] {
  return pages.map(() => []);
}

function edgesForPage(result: PageEdge[][], page: DerivedPage): PageEdge[] {
  return result[page.pageNumber - 1] ?? [];
}

/**
 * The layout always records a placement for a real primary target. Synthetic
 * route fixtures without block records are horizontal by construction, so
 * `right` is the only safe default; y is never used as a fallback.
 */
function placementOf(layout: ContinuousLayout, edge: EdgeLayout): EdgePlacement {
  return layout.blockById[edge.toBlockId]?.placement ?? 'right';
}

function pageObstacles(page: DerivedPage, fromBlockId: string, toBlockId: string) {
  return page.fragments
    .filter(
      (fragment) =>
        fragment.blockId !== fromBlockId && fragment.blockId !== toBlockId,
    )
    .map((fragment) => fragment.page);
}

function resolveAnchorLocal(
  layout: ContinuousLayout,
  edge: EdgeLayout,
  page: DerivedPage,
  source: BlockPageLocation,
): { x: number; y: number; width: number; height: number } | null {
  if (!edge.anchorId) return null;
  const anchor = layout.anchors.find(
    (candidate) =>
      candidate.anchorId === edge.anchorId && candidate.blockId === edge.fromBlockId,
  );
  if (!anchor?.rect) return null;
  const localY = anchor.rect.y - page.yStart;
  if (
    localY < source.fragment.page.y - 0.5 ||
    localY > source.fragment.page.y + source.fragment.page.height + 0.5
  ) {
    return null;
  }
  return {
    x: anchor.rect.x,
    y: localY,
    width: anchor.rect.width,
    height: anchor.rect.height,
  };
}

/**
 * Route one same-page reference edge. References are not tree edges: they keep
 * the R2d right-to-left router and never join a primary trunk.
 */
function referenceSamePageEdge(input: {
  edge: EdgeLayout;
  base: Omit<PageEdge, 'from' | 'to' | 'direction' | 'targetPage' | 'trunk' | 'route'>;
  layout: ContinuousLayout;
  page: DerivedPage;
  source: BlockPageLocation;
  target: BlockPageLocation;
  obstacles: ReturnType<typeof pageObstacles>;
  bounds: { width: number; height: number };
  laneIndex: number;
}): PageEdge {
  const { edge, base, layout, page, source, target, obstacles, bounds, laneIndex } = input;
  const sourceBox = source.fragment.page;
  const targetBox = target.fragment.page;
  const anchorLocal = resolveAnchorLocal(layout, edge, page, source);
  let fromPoint = fragmentCenter(source, 'right');
  if (anchorLocal !== null) {
    fromPoint = {
      x: anchorLocal.x + anchorLocal.width,
      y: anchorLocal.y + anchorLocal.height / 2,
    };
  }
  const to = fragmentCenter(target, 'left');
  const route = routePageEdge({
    from: fromPoint,
    to,
    sourceExit:
      anchorLocal === null
        ? null
        : {
            x: sourceBox.x + sourceBox.width,
            y: fromPoint.y,
          },
    sourceRect: sourceBox,
    targetRect: targetBox,
    obstacles,
    bounds,
    laneIndex,
  });
  return {
    ...base,
    from: fromPoint,
    to,
    direction: 'same-page',
    targetPage: null,
    trunk: null,
    route,
  };
}

function treeRoute(input: {
  from: PageEdgePoint;
  trunkX: number;
  armY: number;
  targetBox: { x: number; y: number; width: number; height: number };
  sourceBox: { x: number; y: number; width: number; height: number };
  obstacles: ReturnType<typeof pageObstacles>;
  bounds: { width: number; height: number };
  laneIndex: number;
  sourceSide: 'right' | 'bottom';
}): PageRoute {
  const { from, trunkX, armY, targetBox, sourceBox, obstacles, bounds, laneIndex, sourceSide } =
    input;
  const tip = { x: targetBox.x, y: armY };
  const semantic: PageRoute = {
    points: simplifyPath([
      from,
      { x: trunkX, y: from.y },
      { x: trunkX, y: armY },
      tip,
    ]),
    tip,
    direction: 'right',
    entry: 'left',
    stem: Math.max(0, targetBox.x - trunkX),
    blocked: false,
  };
  if (!obstacles.some((rect) => routeIntersectsRect(semantic, rect))) return semantic;
  // Obstacle fallback: keep the semantic left entry, but let the R2d router
  // find a clear path. This is the only allowed deviation from the group trunk.
  return routePageEdge({
    from,
    to: tip,
    sourceRect: sourceBox,
    targetRect: targetBox,
    obstacles,
    bounds,
    laneIndex,
    sourceSide,
    requiredEntry: 'left',
  });
}

function primaryGroupEdges(
  group: PrimaryGroup,
  bounds: { width: number; height: number },
): PageEdge[] {
  const sourceBox = group.source.fragment.page;
  const targets = group.entries.map((entry) => {
    const targetBox = entry.target.fragment.page;
    return {
      entry,
      targetBox,
      armY: targetBox.y + Math.min(targetBox.height / 2, 60),
    };
  });
  if (targets.length === 0) return [];
  const minTargetX = Math.min(...targets.map((target) => target.targetBox.x));
  const sourceRight = sourceBox.x + sourceBox.width;
  const sourceBottom = sourceBox.y + sourceBox.height;
  const trunkId = `${group.page.pageNumber}:${group.parentId}:${group.placement}`;
  let trunkX: number;
  let port: PageEdgePoint;
  let trunkStart: PageEdgePoint;
  let trunkEnd: PageEdgePoint;

  if (group.placement === 'right') {
    const desired = minTargetX - EDGE_STYLE.stemMin;
    const laneMin = sourceRight + EDGE_STYLE.laneMin;
    const laneMax = Math.max(laneMin, sourceRight + EDGE_STYLE.laneMax);
    trunkX = Math.min(Math.max(desired, laneMin), laneMax);
    // A rail must stay left of every target so the arm can enter from the left.
    trunkX = Math.max(Math.min(trunkX, minTargetX - 1), sourceRight + 0.5);
    port = fragmentCenter(group.source, 'right');
    const armYs = targets.map((target) => target.armY);
    trunkStart = { x: trunkX, y: Math.min(port.y, ...armYs) };
    trunkEnd = { x: trunkX, y: Math.max(port.y, ...armYs) };
  } else {
    // The below trunk sits inside the parent card when the rows are indented
    // enough. A wrapped row that starts at the wrap indent pulls the trunk to
    // the parent's left edge instead, so the final left stem stays readable.
    const inset = sourceBox.x + EDGE_STYLE.trunkInset;
    trunkX = Math.max(sourceBox.x, Math.min(inset, minTargetX - EDGE_STYLE.stemMin));
    trunkX = Math.max(0, Math.min(trunkX, Math.max(0, bounds.width - 0.5)));
    port = { x: trunkX, y: sourceBottom };
    const armYs = targets.map((target) => target.armY);
    trunkStart = { x: trunkX, y: Math.min(port.y, ...armYs) };
    trunkEnd = { x: trunkX, y: Math.max(port.y, ...armYs) };
  }

  const trunk: PageEdgeTrunk = {
    id: trunkId,
    pageNumber: group.page.pageNumber,
    parentBlockId: group.parentId,
    placement: group.placement,
    port,
    x: trunkX,
    start: trunkStart,
    end: trunkEnd,
  };

  return targets.map(({ entry, targetBox, armY }) => {
    const obstacles = pageObstacles(group.page, group.parentId, entry.edge.toBlockId);
    const route = treeRoute({
      from: port,
      trunkX,
      armY,
      targetBox,
      sourceBox,
      obstacles,
      bounds,
      laneIndex: entry.laneIndex,
      sourceSide: group.placement === 'below' ? 'bottom' : 'right',
    });
    return {
      branchId: entry.edge.branchId,
      role: entry.edge.role,
      fromBlockId: entry.edge.fromBlockId,
      toBlockId: entry.edge.toBlockId,
      ...(entry.edge.label === undefined ? {} : { branchLabel: entry.edge.label }),
      ...(entry.edge.anchorId === null ? {} : { anchorId: entry.edge.anchorId }),
      from: port,
      to: { x: targetBox.x, y: armY },
      direction: 'same-page',
      targetPage: null,
      placement: group.placement,
      trunk,
      route,
    };
  });
}

/**
 * Project every branch onto the derived page list.
 *
 * The returned array is aligned with `pages` (index = pageNumber - 1); each
 * page list is stable-sorted by branch id so the DOM stays deterministic.
 */
export function buildPageEdges(
  layout: ContinuousLayout,
  pages: readonly DerivedPage[],
): PageEdge[][] {
  // The mapping itself has no state, including the group lane counters. The
  // type below is kept local so the public PageEdge shape stays data-only.
  const result = edgePages(pages);
  const locations = fragmentLocations(pages);
  const laneCounts = new Map<string, number>();
  const groups = new Map<string, PrimaryGroup>();
  const bounds = {
    width: layout.geometry.contentWidthPx,
    height: layout.geometry.contentHeightPx,
  };

  for (const edge of layout.edges) {
    const fromLocation = firstLocation(locations, edge.fromBlockId);
    const toLocation = firstLocation(locations, edge.toBlockId);
    if (!fromLocation || !toLocation) continue;
    const fromPage = fromLocation.page;
    const toPage = toLocation.page;
    const base = {
      branchId: edge.branchId,
      role: edge.role,
      fromBlockId: edge.fromBlockId,
      toBlockId: edge.toBlockId,
      ...(edge.label === undefined ? {} : { branchLabel: edge.label }),
      ...(edge.anchorId === null ? {} : { anchorId: edge.anchorId }),
    };

    if (fromPage.pageNumber === toPage.pageNumber) {
      const page = fromPage;
      const source = locationOnPage(locations, edge.fromBlockId, page.pageNumber);
      const target = locationOnPage(locations, edge.toBlockId, page.pageNumber);
      if (!source || !target) continue;
      const obstacles = pageObstacles(page, edge.fromBlockId, edge.toBlockId);
      const laneKey = `${page.pageNumber}:${edge.fromBlockId}:${edge.toBlockId}`;
      const laneIndex = laneCounts.get(laneKey) ?? 0;
      laneCounts.set(laneKey, laneIndex + 1);

      if (edge.role === 'primary') {
        const placement = placementOf(layout, edge);
        const key = `${page.pageNumber}:${edge.fromBlockId}:${placement}`;
        let group = groups.get(key);
        if (!group) {
          group = {
            page,
            parentId: edge.fromBlockId,
            placement,
            source,
            entries: [],
          };
          groups.set(key, group);
        }
        group.entries.push({ edge, target, laneIndex });
        continue;
      }

      edgesForPage(result, page).push(
        referenceSamePageEdge({
          edge,
          base,
          layout,
          page,
          source,
          target,
          obstacles,
          bounds,
          laneIndex,
        }),
      );
      continue;
    }

    if (edge.role === 'primary') {
      const placement = placementOf(layout, edge);
      const outLocation = locationOnPage(locations, edge.fromBlockId, fromPage.pageNumber);
      if (outLocation) {
        const from = fragmentCenter(outLocation, 'right');
        const to = { x: layout.geometry.contentWidthPx, y: from.y };
        edgesForPage(result, fromPage).push({
          ...base,
          from,
          to,
          direction: 'to-edge',
          targetPage: toPage.pageNumber,
          placement,
          trunk: null,
          label: edgeLabel(toPage.pageNumber),
          route: straightPageRoute(from, to),
        });
      }
      const inLocation = locationOnPage(locations, edge.toBlockId, toPage.pageNumber);
      if (inLocation) {
        const to = fragmentCenter(inLocation, 'left');
        const from = { x: 0, y: to.y };
        edgesForPage(result, toPage).push({
          ...base,
          from,
          to,
          direction: 'from-edge',
          targetPage: fromPage.pageNumber,
          placement,
          trunk: null,
          label: edgeLabel(fromPage.pageNumber),
          route: straightPageRoute(from, to),
        });
      }
      continue;
    }

    // Reference edges use a page-edge indicator on the target page only.
    const inLocation = locationOnPage(locations, edge.toBlockId, toPage.pageNumber);
    if (inLocation) {
      const to = fragmentCenter(inLocation, 'left');
      const from = { x: 0, y: to.y };
      edgesForPage(result, toPage).push({
        ...base,
        from,
        to,
        direction: 'from-edge',
        targetPage: fromPage.pageNumber,
        trunk: null,
        label: edgeLabel(fromPage.pageNumber),
        route: straightPageRoute(from, to),
      });
    }
  }

  for (const group of groups.values()) {
    for (const edge of primaryGroupEdges(group, bounds)) {
      edgesForPage(result, group.page).push(edge);
    }
  }

  for (const pageEdges of result) {
    pageEdges.sort((a, b) => (a.branchId < b.branchId ? -1 : a.branchId > b.branchId ? 1 : 0));
  }
  return result;
}
