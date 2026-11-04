/**
 * Pure orthogonal router for primary branch edges.
 *
 * Invariants, all covered by unit tests:
 * - the path always starts at the parent (or its shared trunk) and ends at the
 *   child; the arrowhead is only at the child;
 * - a right-hand edge never moves left (no backwards U-turn);
 * - one child uses a simple elbow;
 * - two or more right-placed children share one vertical trunk from the
 *   parent's right edge, with a short horizontal arrow at each child's level;
 * - wrapped children share one bottom trunk at `parent.left + 18`, a horizontal
 *   bus 12 px above the first child row, and a short vertical arrow into each
 *   child top.
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

function rightTrunkX(parent: Rect, children: readonly GroupChild[], offset: number): number {
  const parentRight = rectRight(parent);
  const firstChildLeft = Math.min(...children.map((child) => child.rect.x));
  const preferred = parentRight + offset;
  return clamp(preferred, parentRight + 4, Math.max(parentRight + 4, firstChildLeft - 4));
}

function routeSingleRight(
  parent: Rect,
  child: GroupChild,
  options: RouteOptions,
): RoutedEdge {
  const gap = options.gap ?? GEOMETRY.edgeGap;
  const radius = options.radius ?? GEOMETRY.edgeRadius;
  const offset = options.trunkOffset ?? 14;
  const childCenter = rectCenter(child.rect);
  const start: Point = { x: rectRight(parent), y: rectCenter(parent).y };
  const end: Point = { x: child.rect.x - gap, y: childCenter.y };
  const trunkX = clamp(
    rectRight(parent) + offset,
    start.x + 2,
    Math.max(start.x + 2, end.x - radius),
  );
  if (end.x - start.x < Math.max(GEOMETRY.edgeMinGap, radius * 2)) {
    return {
      id: child.id,
      placement: 'right',
      path: edgePath([start, end], radius),
      start,
      end,
      defect: true,
    };
  }
  const points = [start, { x: trunkX, y: start.y }, { x: trunkX, y: end.y }, end];
  return {
    id: child.id,
    placement: 'right',
    path: edgePath(points, radius),
    start,
    end,
    defect: false,
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
  const offset = options.trunkOffset ?? 14;
  const parentRight = rectRight(parent);
  const parentCenter = rectCenter(parent);
  const trunkX = rightTrunkX(parent, children, offset);
  const centers = children.map((child) => rectCenter(child.rect).y);
  const high = Math.min(parentCenter.y, ...centers);
  const low = Math.max(parentCenter.y, ...centers);
  const trunkPoints = [
    { x: parentRight, y: parentCenter.y },
    { x: trunkX, y: parentCenter.y },
    { x: trunkX, y: high },
    { x: trunkX, y: low },
  ];
  const edges: RoutedEdge[] = [];
  let defect = false;
  for (const child of children) {
    const end: Point = { x: child.rect.x - gap, y: rectCenter(child.rect).y };
    const start: Point = { x: trunkX, y: end.y };
    const childDefect = end.x - start.x < Math.max(GEOMETRY.edgeMinGap, radius * 2);
    defect = defect || childDefect;
    const points = [start, end];
    edges.push({
      id: child.id,
      placement: 'right',
      path: edgePath(points, radius),
      start,
      end,
      defect: childDefect,
    });
  }
  return {
    edges,
    trunks: [
      {
        id: `${parentId}:right`,
        parentId,
        placement: 'right',
        kind: 'trunk',
        path: edgePath(trunkPoints, radius),
        start: trunkPoints[0] as Point,
        end: trunkPoints[trunkPoints.length - 1] as Point,
      },
    ],
  };
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
      defect: defect,
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
