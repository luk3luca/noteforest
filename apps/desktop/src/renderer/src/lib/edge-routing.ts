/**
 * Pure router for primary branch edges (M2e, V4).
 *
 * Invariants, all covered by unit tests:
 * - the path always starts at the parent (or its shared trunk) and ends at the
 *   child; the arrowhead is only at the child;
 * - a right-hand edge never moves left (no backwards U-turn);
 * - one child uses a simple elbow from the parent port through a branch lane;
 * - two or more right-placed children share one vertical trunk; the first
 *   (topmost) child owns a continuous path from the parent port and the trunk
 *   starts exactly at that child's T-junction, without a gap;
 * - the arrowhead is a fixed-size polygon independent of the path length, and
 *   the final horizontal/vertical segment is at least `stemMin` long;
 * - wrapped children and anchored callouts share one trunk that emerges just
 *   below the parent's bottom edge, one horizontal arm per row, and a fixed
 *   right arrowhead into the row's left edge; the trunk starts inside the
 *   parent card and never crosses a row card.
 */

import {
  arrowPath,
  arrowPoints,
  roundedPath,
  simplifyPath,
  type EdgePoint,
} from '@noteforest/layout';
import {
  classifyPlacement,
  clamp,
  GEOMETRY,
  rectBottom,
  rectCenter,
  rectRight,
  type Rect,
} from './geometry';

export type Point = EdgePoint;

export { arrowPath, arrowPoints, roundedPath };

export type EdgeDirection = 'right' | 'down';

export interface RouteOptions {
  /** Gap between the arrow tip and the card edge. */
  gap?: number;
  radius?: number;
  laneMinOffset?: number;
  laneMaxOffset?: number;
  stemMin?: number;
  /** Below trunk origin from the parent card's left edge. */
  trunkInset?: number;
  /** Visible gap between the parent card bottom and the below trunk start. */
  trunkGap?: number;
}

export interface RoutedArrow {
  direction: EdgeDirection;
  tip: Point;
  /** Exactly three points: tip, base corner, base corner. */
  points: [Point, Point, Point];
  path: string;
}

export interface RoutedEdge {
  id: string;
  placement: 'right' | 'below';
  path: string;
  start: Point;
  end: Point;
  arrow: RoutedArrow;
  defect: boolean;
}

export interface RoutedTrunk {
  /** Stable id: `<parentId>:right` or `<parentId>:below:trunk|bus`. */
  id: string;
  parentId: string;
  placement: 'right' | 'below';
  kind: 'trunk' | 'bus';
  path: string;
  start: Point;
  end: Point;
}

function sameY(left: Point, right: Point): boolean {
  return Math.abs(left.y - right.y) < 0.5;
}

function pointTowards(from: Point, towards: Point, distance: number): Point {
  const length = Math.hypot(towards.x - from.x, towards.y - from.y);
  if (length === 0) return from;
  const ratio = clamp(distance, 0, length) / length;
  return {
    x: from.x + (towards.x - from.x) * ratio,
    y: from.y + (towards.y - from.y) * ratio,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function edgePath(points: Point[], radius: number): string {
  return roundedPath(simplifyPath(points), radius);
}

/**
 * Path used for the first child of a shared trunk: the parent corner may be
 * rounded, but the junction with the trunk is sharp. A rounded corner there
 * would leave a visible wedge between the curve and the trunk.
 */
export function branchConnectorPath(
  parentPort: Point,
  trunkX: number,
  childY: number,
  childEnd: Point,
  radius: number,
): string {
  const corner: Point = { x: trunkX, y: parentPort.y };
  const junction: Point = { x: trunkX, y: childY };
  const start = `M ${round(parentPort.x)} ${round(parentPort.y)}`;
  if (sameY(parentPort, junction)) {
    // Keep the junction as an explicit vertex even when the line is straight:
    // the trunk starts exactly there, so the path documents its T-junction.
    return `${start} L ${round(junction.x)} ${round(junction.y)} L ${round(childEnd.x)} ${round(childEnd.y)}`;
  }
  const before = pointTowards(corner, parentPort, Math.min(radius, Math.abs(corner.x - parentPort.x)));
  const after = pointTowards(corner, junction, Math.min(radius, Math.abs(junction.y - corner.y) / 2));
  return [
    start,
    `L ${round(before.x)} ${round(before.y)}`,
    `Q ${round(corner.x)} ${round(corner.y)} ${round(after.x)} ${round(after.y)}`,
    `L ${round(junction.x)} ${round(junction.y)}`,
    `L ${round(childEnd.x)} ${round(childEnd.y)}`,
  ].join(' ');
}

function makeArrow(tip: Point, direction: EdgeDirection): RoutedArrow {
  return {
    direction,
    tip,
    points: arrowPoints(tip, direction),
    path: arrowPath(tip, direction),
  };
}

export interface GroupChild {
  id: string;
  rect: Rect;
}

export interface RouteGroupInput {
  /** Parent block id, used for stable trunk ids. */
  parentId: string;
  parent: Rect;
  children: readonly GroupChild[];
  options?: RouteOptions;
}

export interface RoutedGroup {
  edges: RoutedEdge[];
  trunks: RoutedTrunk[];
}

/**
 * Branch lane x for a right-hand group. It stays as close to the parent as
 * needed so that each edge keeps a 12 px final stem before the arrow tip. With
 * the editor's 16 px gap the lane lands 2 px outside the card; with a wider
 * gap it moves right, up to 14 px.
 */
export function rightLaneX(
  parent: Rect,
  children: readonly GroupChild[],
  options: RouteOptions = {},
): number {
  const gap = options.gap ?? GEOMETRY.edgeGap;
  const stemMin = options.stemMin ?? GEOMETRY.stemMin;
  const parentRight = rectRight(parent);
  const childLeft = Math.min(...children.map((child) => child.rect.x));
  const tipX = childLeft - gap;
  const laneMin = parentRight + (options.laneMinOffset ?? GEOMETRY.edgeLaneMin);
  const laneMax = parentRight + (options.laneMaxOffset ?? GEOMETRY.edgeLaneMax);
  return clamp(tipX - stemMin, laneMin, Math.max(laneMin, laneMax));
}

function routeSingleRight(
  parent: Rect,
  child: GroupChild,
  options: RouteOptions,
): RoutedEdge {
  const gap = options.gap ?? GEOMETRY.edgeGap;
  const radius = options.radius ?? GEOMETRY.edgeRadius;
  const stemMin = options.stemMin ?? GEOMETRY.stemMin;
  const childCenter = rectCenter(child.rect);
  const start: Point = { x: rectRight(parent), y: rectCenter(parent).y };
  const end: Point = { x: child.rect.x - gap, y: childCenter.y };
  const laneX = rightLaneX(parent, [child], options);
  const defect = end.x - laneX < stemMin - 0.5;
  return {
    id: child.id,
    placement: 'right',
    // The final bend into the child stays sharp so the full 12 px stem is
    // horizontal; only the parent-side corner is rounded.
    path: branchConnectorPath(start, laneX, end.y, end, radius),
    start,
    end,
    arrow: makeArrow(end, 'right'),
    defect,
  };
}

function routeRightGroup(
  parent: Rect,
  children: readonly GroupChild[],
  parentId: string,
  options: RouteOptions,
): RoutedGroup {
  if (children.length === 1) {
    const only = children[0];
    return only === undefined
      ? { edges: [], trunks: [] }
      : { edges: [routeSingleRight(parent, only, options)], trunks: [] };
  }

  const gap = options.gap ?? GEOMETRY.edgeGap;
  const radius = options.radius ?? GEOMETRY.edgeRadius;
  const stemMin = options.stemMin ?? GEOMETRY.stemMin;
  const parentCenter = rectCenter(parent);
  const parentPort: Point = { x: rectRight(parent), y: parentCenter.y };
  // Trunk topology follows the measured vertical order, not branch order: a
  // branch reordered by drag must still connect to its own child.
  const ordered = [...children].sort(
    (left, right) => rectCenter(left.rect).y - rectCenter(right.rect).y,
  );
  const laneX = rightLaneX(parent, ordered, options);
  const first = ordered[0] as GroupChild;
  const last = ordered[ordered.length - 1] as GroupChild;
  const firstY = rectCenter(first.rect).y;
  const lastY = rectCenter(last.rect).y;

  const edges: RoutedEdge[] = [];
  for (const child of ordered) {
    const end: Point = { x: child.rect.x - gap, y: rectCenter(child.rect).y };
    const start: Point = { x: laneX, y: end.y };
    edges.push({
      id: child.id,
      placement: 'right',
      path: edgePath([start, end], radius),
      start,
      end,
      arrow: makeArrow(end, 'right'),
      defect: end.x - start.x < stemMin - 0.5,
    });
  }

  // The shared trunk owns the parent port and the horizontal lead, not just
  // the vertical run. Selecting any child in the group can then highlight the
  // whole lead/trunk path; the child edges are only the short arms.
  const corner: Point = { x: laneX, y: parentCenter.y };
  const verticalTop = Math.min(firstY, parentCenter.y);
  const verticalBottom = Math.max(lastY, parentCenter.y);
  const leadPath = edgePath([parentPort, corner], 0);
  const verticalPath = edgePath(
    [
      { x: laneX, y: verticalTop },
      { x: laneX, y: verticalBottom },
    ],
    0,
  );
  const trunks: RoutedTrunk[] = [
    {
      id: `${parentId}:right`,
      parentId,
      placement: 'right',
      kind: 'trunk',
      // Two subpaths: the horizontal lead from the parent port and the
      // vertical run spanning every child arm. Straight corners keep the
      // stroke continuous at the junctions.
      path: `${leadPath} ${verticalPath}`,
      start: parentPort,
      end: { x: laneX, y: verticalBottom },
    },
  ];
  return { edges, trunks };
}

/**
 * Route a below stack (anchored callouts first, then wrapped direct children).
 *
 * All rows share one trunk that starts on the parent's bottom edge, inset from
 * its left corner, and runs down past every row. Each row gets one horizontal
 * arm at the card's center Y with a fixed right-pointing arrowhead into the
 * card's left edge. The trunk never moves left of the parent card and stays
 * left of every row, so it can never cross a card. There are no down arrows and
 * no U-turns.
 */
export function routeBelowStackGroup(input: RouteGroupInput): RoutedGroup {
  const { parent, children } = input;
  if (children.length === 0) return { edges: [], trunks: [] };
  const gap = input.options?.gap ?? GEOMETRY.edgeGap;
  const stemMin = input.options?.stemMin ?? GEOMETRY.stemMin;
  const radius = input.options?.radius ?? GEOMETRY.edgeRadius;
  const parentBottom = rectBottom(parent);
  // The trunk begins a small gap below the card instead of touching its border;
  // the gap is shared by single-row elbows and the multi-row shared trunk.
  const trunkStartY =
    parentBottom + (input.options?.trunkGap ?? GEOMETRY.trunkGap);
  const minRowLeft = Math.min(...children.map((child) => child.rect.x));
  // The trunk is anchored inside the parent card. Rows are expected to be
  // indented by rowIndent, which leaves a full stem; a row that comes back
  // too close (or left of the trunk) is a layout defect, never a reason to move
  // the trunk outside the card it belongs to.
  const trunkX = parent.x + (input.options?.trunkInset ?? GEOMETRY.trunkInset);
  const ordered = [...children].sort(
    (left, right) => rectCenter(left.rect).y - rectCenter(right.rect).y,
  );
  const last = ordered[ordered.length - 1] as GroupChild;
  const lastY = rectCenter(last.rect).y;
  const trunkDefect =
    lastY - trunkStartY < GEOMETRY.edgeMinGap ||
    minRowLeft < trunkX + gap + stemMin - 0.5;

  const edges: RoutedEdge[] = [];
  for (const child of ordered) {
    const rowCenter = rectCenter(child.rect).y;
    const end: Point = { x: child.rect.x - gap, y: rowCenter };
    const start: Point = { x: trunkX, y: rowCenter };
    // A single row keeps one continuous elbow from the gapped trunk origin.
    // With two or more rows the shared trunk owns the vertical run and each
    // edge is a short arm from the trunk.
    const points =
      ordered.length === 1
        ? [{ x: trunkX, y: trunkStartY }, start, end]
        : [start, end];
    // Round the single elbow only with what is left after the required 12 px
    // stem. At the minimum row indent nothing is left, so the arm stays sharp
    // instead of eating into the arrowhead clearance.
    const horizontal = end.x - trunkX;
    const elbowRadius =
      ordered.length === 1 ? Math.min(radius, Math.max(0, horizontal - stemMin)) : 0;
    edges.push({
      id: child.id,
      placement: 'below',
      // Sharp T-junction for shared arms: a rounded corner would leave a visible
      // wedge at the trunk. A lone row may use the same tiny radius as the
      // right-hand elbows when the stem allows it.
      path: edgePath(points, elbowRadius),
      start: points[0] as Point,
      end,
      arrow: makeArrow(end, 'right'),
      defect: trunkDefect || end.x - trunkX < stemMin - 0.5,
    });
  }

  const trunks: RoutedTrunk[] =
    ordered.length === 1
      ? []
      : [
          {
            id: `${input.parentId}:below:trunk`,
            parentId: input.parentId,
            placement: 'below',
            kind: 'trunk',
            // Straight: rounded ends would pull the stroke away from the arms.
            path: edgePath([{ x: trunkX, y: trunkStartY }, { x: trunkX, y: lastY }], 0),
            start: { x: trunkX, y: trunkStartY },
            end: { x: trunkX, y: lastY },
          },
        ];
  return { edges, trunks };
}

/** Route a group of children that are all to the right of the parent. */
export function routeRightChildren(input: RouteGroupInput): RoutedGroup {
  return routeRightGroup(input.parent, input.children, input.parentId, input.options ?? {});
}

/**
 * Route every visible child of one parent. Two or more right-placed children
 * share one V4 trunk; below-placed children (callouts or wrapped direct
 * children) share one left trunk with a horizontal arm per row. Separate
 * parents get separate lanes and trunks, so parallel parents keep parallel
 * local gutters.
 */
export function routeChildGroup(input: RouteGroupInput): RoutedGroup {
  const options = input.options ?? {};
  const right: GroupChild[] = [];
  const below: GroupChild[] = [];
  for (const child of input.children) {
    const placement = classifyPlacement(input.parent, child.rect);
    if (placement === 'right') right.push(child);
    else below.push(child);
  }
  const parts: RoutedGroup[] = [];
  if (right.length > 0) {
    parts.push(routeRightGroup(input.parent, right, input.parentId, options));
  }
  if (below.length > 0) {
    parts.push(
      routeBelowStackGroup({
        parentId: input.parentId,
        parent: input.parent,
        children: below,
        options,
      }),
    );
  }
  return {
    edges: parts.flatMap((part) => part.edges),
    trunks: parts.flatMap((part) => part.trunks),
  };
}

/** Route a single edge. Kept for callers that only need one child. */
export function routeBranchEdge(input: {
  id: string;
  parent: Rect;
  child: Rect;
  options?: RouteOptions;
}): RoutedEdge {
  const group = routeChildGroup({
    parentId: 'single',
    parent: input.parent,
    children: [{ id: input.id, rect: input.child }],
    options: input.options,
  });
  const edge = group.edges[0];
  if (edge !== undefined) return edge;
  const tip = { x: 0, y: 0 };
  return {
    id: input.id,
    placement: 'below',
    path: '',
    start: tip,
    end: tip,
    arrow: makeArrow(tip, 'down'),
    defect: true,
  };
}

/** True when a routed path never travels backwards (used by tests). */
export function pathMovesForward(points: readonly Point[]): boolean {
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous === undefined || current === undefined) continue;
    if (current.x < previous.x - 0.5) return false;
  }
  return true;
}
