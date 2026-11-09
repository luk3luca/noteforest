/**
 * Page-local edge mapping shared by the Page renderer and the PDF print model.
 *
 * The continuous layout already decides which blocks are related and how each
 * primary child was placed. This module projects those edges onto the
 * paginator's derived pages; it never re-layouts, re-paginates, or infers a
 * topology from a target's y coordinate.
 *
 * Semantic topology (R2f/R2g):
 * - primary tree edges are grouped by `(parentBlockId, placement)` across every
 *   page, not only within one page;
 * - a `right` group owns one vertical rail at a stable x, leaving the parent's
 *   right edge; a `below` group owns one vertical trunk attached to the
 *   parent card bottom;
 * - the group trunk keeps the same x on every page from the parent port to the
 *   last child arm: the parent page runs to the content bottom when later
 *   children exist, intermediate pages pass through top-to-bottom, and the last
 *   child page stops at the last arm;
 * - each child gets one left-entering arm from its group trunk, even when the
 *   parent is on an earlier page; cross-page tree edges have no `p.N` chip;
 * - page-local segments are still emitted for the renderer and print model;
 * - references keep the target-only `from-edge` dashed indicator rule.
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

export type PageEdgeDirection = 'same-page' | 'trunk' | 'to-edge' | 'from-edge';

export interface PageEdgePoint {
  x: number;
  y: number;
}

/** One page-local vertical run of a group trunk. */
export interface PageEdgeTrunkSegment {
  pageNumber: number;
  /** Visible segment start in page content coordinates. */
  start: PageEdgePoint;
  /** Visible segment end in page content coordinates. */
  end: PageEdgePoint;
  /**
   * Parent-page horizontal lead from the card port to the vertical run. It is
   * null for later pages and for attached below groups.
   */
  lead: { from: PageEdgePoint; to: PageEdgePoint } | null;
}

/**
 * One parent's child-group trunk across every page it spans.
 *
 * The id and x are stable across page boundaries. `port` is the parent card
 * port (right edge center for `right`, card bottom for `below`); `segments`
 * holds the visible page-local runs, including pass-through pages with no child
 * of this group.
 */
export interface PageEdgeTrunk {
  id: string;
  parentBlockId: string;
  placement: EdgePlacement;
  /**
   * R2j B2 below-group split. `null` for right groups and for the shared below
   * group of the stacked/legacy path.
   */
  trunkGroup: 'callout' | 'child' | null;
  /** Parent port: right edge center, or card bottom at `x` for the below group. */
  port: PageEdgePoint;
  /** Page that owns the parent port (1-based). */
  portPage: number;
  /** Shared rail x (right) or trunk x (below), identical on every page. */
  x: number;
  /** Contiguous page segments from the parent port page to the last child page. */
  segments: PageEdgeTrunkSegment[];
}

/** A group trunk paired with the one segment the current page renders. */
export interface PageEdgeTrunkView {
  trunk: PageEdgeTrunk;
  segment: PageEdgeTrunkSegment;
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
  /** Shared primary group trunk; null for references and page indicators. */
  trunk: PageEdgeTrunk | null;
  /** This edge's page-local trunk segment; null outside a trunk group. */
  trunkSegment: PageEdgeTrunkSegment | null;
  /** Short print label (`p.N`) used by legacy page indicators. */
  label?: string;
  /** Canonical branch label or anchor quote, when one is present. */
  branchLabel?: string;
  anchorId?: string;
  /** Shared orthogonal route used by Page Read/Edit and the print model. */
  route: PageRoute;
}

/**
 * One page's projected edges and group-trunk segments.
 *
 * `trunks` carries pass-through segments for pages that have no child of a
 * group, so the renderer and the print model can draw trunk continuity even
 * when the page has no edge record for that group.
 */
export interface PageEdgeModel {
  edges: PageEdge[][];
  trunks: PageEdgeTrunkView[][];
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
  parentId: string;
  placement: EdgePlacement;
  /** R2j B2 split; null keeps one shared below group. */
  trunkGroup: 'callout' | 'child' | null;
  /** Below-trunk inset from the parent left. */
  trunkInset: number;
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

function lastLocation(
  map: Map<string, BlockPageLocation[]>,
  blockId: string,
): BlockPageLocation | undefined {
  return map.get(blockId)?.at(-1);
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

function trunkPages(pages: readonly DerivedPage[]): PageEdgeTrunkView[][] {
  return pages.map(() => []);
}

function edgesForPage(result: PageEdge[][], page: DerivedPage): PageEdge[] {
  return result[page.pageNumber - 1] ?? [];
}

function trunkViewsForPage(
  result: PageEdgeTrunkView[][],
  pageNumber: number,
): PageEdgeTrunkView[] {
  return result[pageNumber - 1] ?? [];
}

/**
 * The layout always records a placement for a real primary target. Synthetic
 * route fixtures without block records are horizontal by construction, so
 * `right` is the only safe default; y is never used as a fallback.
 */

function pageObstacles(page: DerivedPage, fromBlockId: string, toBlockId: string) {
  return page.fragments
    .filter(
      (fragment) =>
        fragment.blockId !== fromBlockId && fragment.blockId !== toBlockId,
    )
    .map((fragment) => fragment.page);
}

function armY(target: BlockPageLocation): number {
  const box = target.fragment.page;
  return box.y + Math.min(box.height / 2, 60);
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
  base: Omit<
    PageEdge,
    'from' | 'to' | 'direction' | 'targetPage' | 'trunk' | 'trunkSegment' | 'route'
  >;
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
    trunkSegment: null,
    route,
  };
}

function treeRoute(input: {
  from: PageEdgePoint;
  trunkX: number;
  armY: number;
  targetBox: { x: number; y: number; width: number; height: number };
  sourceBox: { x: number; y: number; width: number; height: number } | null;
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

interface BuiltGroup {
  trunk: PageEdgeTrunk;
  edges: PageEdge[];
  views: PageEdgeTrunkView[];
}

function buildPrimaryGroup(input: {
  group: PrimaryGroup;
  locations: Map<string, BlockPageLocation[]>;
  bounds: { width: number; height: number };
}): BuiltGroup | null {
  const { group, locations, bounds } = input;
  const source = firstLocation(locations, group.parentId);
  if (source === undefined || group.entries.length === 0) return null;
  const sourceBox = source.fragment.page;
  const parentLast = lastLocation(locations, group.parentId) ?? source;
  const minTargetX = Math.min(
    ...group.entries.map((entry) => entry.target.fragment.page.x),
  );
  let trunkX: number;
  let port: PageEdgePoint;
  let portPage: number;

  if (group.placement === 'right') {
    const desired = minTargetX - EDGE_STYLE.stemMin;
    const sourceRight = sourceBox.x + sourceBox.width;
    const laneMin = sourceRight + EDGE_STYLE.laneMin;
    const laneMax = Math.max(laneMin, sourceRight + EDGE_STYLE.laneMax);
    trunkX = Math.min(Math.max(desired, laneMin), laneMax);
    // A rail must stay left of every target so the arm can enter from the left.
    trunkX = Math.max(Math.min(trunkX, minTargetX - 1), sourceRight + 0.5);
    port = fragmentCenter(source, 'right');
    portPage = source.page.pageNumber;
  } else {
    // The below trunk sits inside the parent card when the rows are indented
    // enough. A wrapped row that starts at the wrap indent pulls the trunk to
    // the parent's left edge instead, so the final left stem stays readable.
    // R2j mode B2 supplies its own inset per group: 12 for children and 24 for
    // callouts, which keeps the two trunks independent.
    const inset = sourceBox.x + group.trunkInset;
    trunkX = Math.max(sourceBox.x, Math.min(inset, minTargetX - EDGE_STYLE.stemMin));
    trunkX = Math.max(0, Math.min(trunkX, Math.max(0, bounds.width - 0.5)));
    // A block can continue across pages: the below port is the true card
    // bottom, i.e. the last fragment, not the first fragment's page bottom.
    const parentBottom = parentLast.fragment.page.y + parentLast.fragment.page.height;
    port = { x: trunkX, y: parentBottom };
    portPage = parentLast.page.pageNumber;
  }

  const armsByPage = new Map<number, number[]>();
  for (const entry of group.entries) {
    const pageNumber = entry.target.page.pageNumber;
    const list = armsByPage.get(pageNumber) ?? [];
    list.push(armY(entry.target));
    armsByPage.set(pageNumber, list);
  }
  const lastChildPage = Math.max(
    ...group.entries.map((entry) => entry.target.page.pageNumber),
  );
  const firstPage = Math.min(portPage, lastChildPage);
  const lastPage = Math.max(portPage, lastChildPage);
  const segments: PageEdgeTrunkSegment[] = [];
  for (let pageNumber = firstPage; pageNumber <= lastPage; pageNumber += 1) {
    const arms = armsByPage.get(pageNumber) ?? [];
    let startY: number;
    let endY: number;
    if (pageNumber === portPage) {
      // The visible trunk starts attached to the parent port. A below trunk
      // begins on the card's bottom edge; no vertical gap.
      const topMost = Math.min(port.y, ...arms);
      startY = topMost;
      // A later child means the trunk must reach the page bottom and continue
      // on the next page; otherwise this page owns the last arm.
      endY = lastChildPage > portPage ? bounds.height : Math.max(port.y, ...arms);
    } else if (pageNumber === lastPage) {
      // Last child page: the trunk ends at the last arm, never past it.
      startY = 0;
      endY = arms.length > 0 ? Math.max(...arms) : bounds.height;
    } else {
      // Pass-through page with no child of this group: full vertical run.
      startY = 0;
      endY = bounds.height;
    }
    segments.push({
      pageNumber,
      start: { x: trunkX, y: Math.max(0, Math.min(bounds.height, startY)) },
      end: { x: trunkX, y: Math.max(0, Math.min(bounds.height, endY)) },
      lead:
        pageNumber === portPage &&
        group.placement === 'right' &&
        Math.abs(port.x - trunkX) > 0.01
          ? { from: port, to: { x: trunkX, y: port.y } }
          : null,
    });
  }

  const trunk: PageEdgeTrunk = {
    id:
      group.trunkGroup === null
        ? `${group.parentId}:${group.placement}`
        : `${group.parentId}:${group.placement}:${group.trunkGroup}`,
    parentBlockId: group.parentId,
    placement: group.placement,
    trunkGroup: group.trunkGroup,
    port,
    portPage,
    x: trunkX,
    segments,
  };

  const views = segments.map((segment) => ({ trunk, segment }));
  const edges: PageEdge[] = [];
  for (const entry of group.entries) {
    const targetPage = entry.target.page.pageNumber;
    const segment = segments.find((candidate) => candidate.pageNumber === targetPage);
    if (segment === undefined) continue;
    const targetBox = entry.target.fragment.page;
    const targetArmY = armY(entry.target);
    const samePage = targetPage === portPage;
    // Same-page right groups leave from the parent card port; below groups and
    // later-page arms start on the visible page-local trunk segment.
    const from =
      samePage && group.placement === 'right' ? port : segment.start;
    const sourceBox =
      samePage && source.page.pageNumber === targetPage ? source.fragment.page : null;
    const obstacles = pageObstacles(entry.target.page, group.parentId, entry.edge.toBlockId);
    const route = treeRoute({
      from,
      trunkX,
      armY: targetArmY,
      targetBox,
      sourceBox,
      obstacles,
      bounds,
      laneIndex: entry.laneIndex,
      sourceSide: samePage && group.placement === 'right' ? 'right' : 'bottom',
    });
    edges.push({
      branchId: entry.edge.branchId,
      role: entry.edge.role,
      fromBlockId: entry.edge.fromBlockId,
      toBlockId: entry.edge.toBlockId,
      ...(entry.edge.label === undefined ? {} : { branchLabel: entry.edge.label }),
      ...(entry.edge.anchorId === null ? {} : { anchorId: entry.edge.anchorId }),
      from,
      to: { x: targetBox.x, y: targetArmY },
      direction: samePage ? 'same-page' : 'trunk',
      targetPage: null,
      placement: group.placement,
      trunk,
      trunkSegment: segment,
      route,
    });
  }
  return { trunk, edges, views };
}

/**
 * Project every branch onto the derived page list.
 *
 * The returned edge array is aligned with `pages` (index = pageNumber - 1);
 * each page list is stable-sorted by branch id so the DOM stays deterministic.
 * `trunks` carries the same group-trunk segments, including pass-through pages,
 * for the renderer and print model.
 */
export function buildPageEdgeModel(
  layout: ContinuousLayout,
  pages: readonly DerivedPage[],
): PageEdgeModel {
  const result = edgePages(pages);
  const trunkResult = trunkPages(pages);
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

    if (edge.role === 'primary') {
      // Group by the real layout placement across every page. The page is not
      // part of the key: the trunk must be one record from parent to last arm.
      // R2j mode B2 adds one group discriminator so a parent can own separate
      // callout and child below trunks.
      const targetBlock = layout.blockById[edge.toBlockId];
      const placement = targetBlock?.placement ?? 'right';
      const trunkGroup = targetBlock?.trunkGroup ?? null;
      const key = `${edge.fromBlockId}:${placement}:${trunkGroup ?? 'shared'}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          parentId: edge.fromBlockId,
          placement,
          trunkGroup,
          trunkInset: targetBlock?.trunkInset ?? EDGE_STYLE.trunkInset,
          entries: [],
        };
        groups.set(key, group);
      }
      const laneKey = `${toPage.pageNumber}:${edge.fromBlockId}:${edge.toBlockId}`;
      const laneIndex = laneCounts.get(laneKey) ?? 0;
      laneCounts.set(laneKey, laneIndex + 1);
      group.entries.push({ edge, target: toLocation, laneIndex });
      continue;
    }

    const laneKey = `${toPage.pageNumber}:${edge.fromBlockId}:${edge.toBlockId}`;
    const laneIndex = laneCounts.get(laneKey) ?? 0;
    laneCounts.set(laneKey, laneIndex + 1);

    if (fromPage.pageNumber === toPage.pageNumber) {
      const page = fromPage;
      const source = fromLocation;
      const target = toLocation;
      const obstacles = pageObstacles(page, edge.fromBlockId, edge.toBlockId);
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

    // Reference edges use a page-edge indicator on the target page only.
    const to = fragmentCenter(toLocation, 'left');
    const from = { x: 0, y: to.y };
    edgesForPage(result, toPage).push({
      ...base,
      from,
      to,
      direction: 'from-edge',
      targetPage: fromPage.pageNumber,
      trunk: null,
      trunkSegment: null,
      label: edgeLabel(fromPage.pageNumber),
      route: straightPageRoute(from, to),
    });
  }

  // One trunk per `(parent, placement, B2 group)`, independent of nesting
  // depth. Sorting the groups keeps the DOM and print output deterministic.
  const orderedGroups = [...groups.values()].sort((left, right) => {
    const leftKey = `${left.parentId}:${left.placement}:${left.trunkGroup ?? 'shared'}`;
    const rightKey = `${right.parentId}:${right.placement}:${right.trunkGroup ?? 'shared'}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  for (const group of orderedGroups) {
    const built = buildPrimaryGroup({ group, locations, bounds });
    if (built === null) continue;
    for (const edge of built.edges) {
      const pageNumber = edge.trunkSegment?.pageNumber;
      const page = pageNumber === undefined ? undefined : pages[pageNumber - 1];
      if (page === undefined) continue;
      edgesForPage(result, page).push(edge);
    }
    for (const view of built.views) {
      trunkViewsForPage(trunkResult, view.segment.pageNumber).push(view);
    }
  }

  for (const pageEdges of result) {
    pageEdges.sort((a, b) => (a.branchId < b.branchId ? -1 : a.branchId > b.branchId ? 1 : 0));
  }
  for (const views of trunkResult) {
    views.sort((a, b) => {
      if (a.trunk.id !== b.trunk.id) return a.trunk.id < b.trunk.id ? -1 : 1;
      return a.segment.pageNumber - b.segment.pageNumber;
    });
  }
  return { edges: result, trunks: trunkResult };
}

/** Page edges only; kept for consumers that do not render trunk pass-through. */
export function buildPageEdges(
  layout: ContinuousLayout,
  pages: readonly DerivedPage[],
): PageEdge[][] {
  return buildPageEdgeModel(layout, pages).edges;
}
