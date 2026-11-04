/**
 * Pure orthogonal router for primary branch edges.
 *
 * Invariants, all covered by unit tests:
 * - the path always starts at the parent (or its shared trunk) and ends at the
 *   child; the arrowhead is only at the child;
 * - a right-hand edge never moves left (no backwards U-turn);
 * - one child uses a simple elbow;
 * - two or more right-placed children share one vertical trunk;
 * - the first child's branch is a continuous path from the parent's right edge
 *   to the child's left edge, and the trunk starts at that branch's T-junction
 *   without a rounded corner, so there is no gap;
 * - wrapped children share one bottom trunk at `parent.left + wrapIndent`, a
 *   horizontal bus 12 px above the first child row, and a short vertical arrow
 *   into each child top (reserved for the M4 page renderer; the editor uses
 *   depth columns and does not wrap).
 */

import {
  classifyPlacement,
  clamp,
  GEOMETRY,
  rectBottom,
  rectCenter,
  rectRight,
  type EdgePlacement,
  type Rect,
} from './geometry';

export interface Point {
  x: number;
  y: number;
}

export interface RouteOptions {
  gap?: number;
  radius?: number;
  indent?: number;
  busOffset?: number;
  trunkOffset?: number;
}

export interface RoutedEdge {
  id: string;
  placement: 'right' | 'below';
  path: string;
  start: Point;
  end: Point;
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

interface Polyline {
  points: Point[];
  defect: boolean;
}

function sameY(left: Point, right: Point): boolean {
  return Math.abs(left.y - right.y) < 0.5;
}

function sameX(left: Point, right: Point): boolean {
  return Math.abs(left.x - right.x) < 0.5;
}

/** Remove duplicate and collinear intermediate points. */
function simplify(points: Point[]): Point[] {
  const compact: Point[] = [];
  for (const point of points) {
    const last = compact.at(-1);
    if (last !== undefined && Math.abs(last.x - point.x) < 0.25 && Math.abs(last.y - point.y) < 0.25) {
      continue;
    }
    compact.push(point);
  }
  const result: Point[] = [];
  for (const [index, point] of compact.entries()) {
    const previous = compact[index - 1];
    const next = compact[index + 1];
    if (
      previous !== undefined &&
      next !== undefined &&
      ((sameX(previous, point) && sameX(point, next)) ||
        (sameY(previous, point) && sameY(point, next)))
    ) {
      continue;
    }
    result.push(point);
  }
  return result;
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

/** SVG path with rounded right-angle corners. */
export function roundedPath(points: Point[], radius: number): string {
  const simplified = simplify(points);
  if (simplified.length === 0) return '';
  if (simplified.length === 1) {
    const single = simplified[0] as Point;
    return `M ${round(single.x)} ${round(single.y)}`;
  }
  const first = simplified[0] as Point;
  let path = `M ${round(first.x)} ${round(first.y)}`;
  for (let index = 1; index < simplified.length - 1; index += 1) {
    const previous = simplified[index - 1] as Point;
    const current = simplified[index] as Point;
    const next = simplified[index + 1] as Point;
    const cornerRadius = Math.min(
      radius,
      Math.hypot(current.x - previous.x, current.y - previous.y) / 2,
      Math.hypot(next.x - current.x, next.y - current.y) / 2,
    );
    const before = pointTowards(current, previous, cornerRadius);
    const after = pointTowards(current, next, cornerRadius);
    path += ` L ${round(before.x)} ${round(before.y)} Q ${round(current.x)} ${round(current.y)} ${round(after.x)} ${round(after.y)}`;
  }
  const last = simplified[simplified.length - 1] as Point;
  path += ` L ${round(last.x)} ${round(last.y)}`;
  return path;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function edgePath(points: Point[], radius: number): string {
  return roundedPath(simplify(points), radius);
}

/**
 * Path used for the first child of a shared trunk: the parent corner may be
 * rounded, but the junction with the trunk is sharp. A rounded corner there
 * would leave a visible wedge between the curve and the trunk, which is the M2c
 * gap defect.
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
 * Vertical trunk x. It hugs the parent when the gap is wide enough, and moves
 * towards the middle when the depth-column gap is tight (16 px by default), so
 * both the parent stub and every child stub stay visible.
 */
function rightTrunkX(
  parent: Rect,
  children: readonly GroupChild[],
  options: RouteOptions,
): number {
  const parentRight = rectRight(parent);
  const gap = options.gap ?? GEOMETRY.edgeGap;
  const offset = options.trunkOffset ?? 14;
  const firstChildLeft = Math.min(...children.map((child) => child.rect.x));
  const endX = firstChildLeft - gap;
  const minimum = parentRight + 4;
  const maximum = endX - GEOMETRY.edgeMinGap;
  if (maximum < minimum) return Math.max(parentRight + 1, maximum);
  return clamp(parentRight + offset, minimum, maximum);
}

function routeSingleRight(
  parent: Rect,
  child: GroupChild,
  options: RouteOptions,
): RoutedEdge {
  const gap = options.gap ?? GEOMETRY.edgeGap;
  const radius = options.radius ?? GEOMETRY.edgeRadius;
  const childCenter = rectCenter(child.rect);
  const start: Point = { x: rectRight(parent), y: rectCenter(parent).y };
  const end: Point = { x: child.rect.x - gap, y: childCenter.y };
  const trunkX = rightTrunkX(parent, [child], options);
  const defect = end.x - trunkX < GEOMETRY.edgeMinGap;
  const points = [
    start,
    { x: trunkX, y: start.y },
    { x: trunkX, y: end.y },
    end,
  ];
  return {
    id: child.id,
    placement: 'right',
    path: edgePath(points, radius),
    start,
    end,
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
  const parentRight = rectRight(parent);
  const parentCenter = rectCenter(parent);
  const trunkX = rightTrunkX(parent, children, options);
  const centers = children.map((child) => rectCenter(child.rect).y);
  const top = Math.min(...centers);
  const bottom = Math.max(...centers);
  const first = children[0] as GroupChild;
  const firstY = rectCenter(first.rect).y;
  const firstEndX = first.rect.x - gap;

  const edges: RoutedEdge[] = [];

  // The first child owns the continuous parent → trunk → child path.
  const firstStart: Point = { x: parentRight, y: parentCenter.y };
  const firstEnd: Point = { x: firstEndX, y: firstY };
  const firstDefect = firstEndX - trunkX < GEOMETRY.edgeMinGap;
  edges.push({
    id: first.id,
    placement: 'right',
    path: branchConnectorPath(firstStart, trunkX, firstY, firstEnd, radius),
    start: firstStart,
    end: firstEnd,
    defect: firstDefect,
  });

  for (const child of children.slice(1)) {
    const end: Point = { x: child.rect.x - gap, y: rectCenter(child.rect).y };
    const start: Point = { x: trunkX, y: end.y };
    const childDefect = end.x - start.x < GEOMETRY.edgeMinGap;
    edges.push({
      id: child.id,
      placement: 'right',
      path: edgePath([start, end], radius),
      start,
      end,
      defect: childDefect,
    });
  }

  const trunkStart: Point = { x: trunkX, y: top };
  const trunkEnd: Point = { x: trunkX, y: bottom };
  const trunks: RoutedTrunk[] = [];
  if (bottom - top > 0.5) {
    trunks.push({
      id: `${parentId}:right`,
      parentId,
      placement: 'right',
      kind: 'trunk',
      // A straight line: rounded ends would pull the stroke away from the
      // first/last child's T-junction and re-introduce the gap.
      path: edgePath([trunkStart, trunkEnd], 0),
      start: trunkStart,
      end: trunkEnd,
    });
  }
  return { edges, trunks };
}

function routeBelowGroup(
  parent: Rect,
  children: readonly GroupChild[],
  parentId: string,
  options: RouteOptions,
): RoutedGroup {
  const gap = options.gap ?? GEOMETRY.edgeGap;
  const radius = options.radius ?? GEOMETRY.edgeRadius;
  const indent = options.indent ?? GEOMETRY.wrapIndent;
  const busOffset = options.busOffset ?? GEOMETRY.edgeBusOffset;
  const trunkX = clamp(parent.x + indent, parent.x + 4, rectRight(parent) - 4);
  const busY = Math.min(...children.map((child) => child.rect.y)) - busOffset;
  const centers = children.map((child) => child.rect.x + child.rect.width / 2);
  const busStart = Math.min(trunkX, ...centers);
  const busEnd = Math.max(trunkX, ...centers);
  const trunkStart: Point = { x: trunkX, y: rectBottom(parent) };
  const trunkEnd: Point = { x: trunkX, y: busY };
  const trunkDefect = busY - rectBottom(parent) < 4;
  const edges: RoutedEdge[] = [];
  let defect = trunkDefect;
  for (const child of children) {
    const end: Point = {
      x: child.rect.x + child.rect.width / 2,
      y: child.rect.y - gap,
    };
    const start: Point = { x: end.x, y: busY };
    const childDefect = end.y - start.y < 4;
    defect = defect || childDefect;
    edges.push({
      id: child.id,
      placement: 'below',
      path: edgePath([start, end], radius),
      start,
      end,
      defect,
    });
  }
  return {
    edges,
    trunks: [
      {
        id: `${parentId}:below:trunk`,
        parentId,
        placement: 'below',
        kind: 'trunk',
        path: edgePath([trunkStart, trunkEnd], radius),
        start: trunkStart,
        end: trunkEnd,
      },
      {
        id: `${parentId}:below:bus`,
        parentId,
        placement: 'below',
        kind: 'bus',
        path: edgePath([{ x: busStart, y: busY }, { x: busEnd, y: busY }], radius),
        start: { x: busStart, y: busY },
        end: { x: busEnd, y: busY },
      },
    ],
  };
}

/**
 * Route every visible child of one parent. Two or more right-placed children
 * share one trunk; wrapped children share a bottom trunk and bus. Separate
 * parents get separate trunks, so parallel parents keep parallel gutters.
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
    parts.push(routeBelowGroup(input.parent, below, input.parentId, options));
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
  return {
    id: input.id,
    placement: 'below',
    path: '',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 0 },
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

export function placementOf(parent: Rect, child: Rect): EdgePlacement {
  return classifyPlacement(parent, child);
}
