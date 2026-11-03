/**
 * Pure orthogonal router for primary branch edges.
 *
 * Invariants, all covered by unit tests:
 * - the path always starts at the parent and ends at the child;
 * - the last segment points into the child (arrowhead at the child only);
 * - a right-hand edge never moves left (no backwards U-turn);
 * - a below edge goes down, across, then down into the child's top edge.
 */

import {
  classifyPlacement,
  clamp,
  distributePorts,
  GEOMETRY,
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
  /** Position among the parent's visible children (0-based). */
  index?: number;
  /** Number of visible children of this parent. */
  count?: number;
  gap?: number;
  radius?: number;
  indent?: number;
  busOffset?: number;
}

export interface RoutedEdge {
  id: string;
  placement: EdgePlacement;
  path: string;
  start: Point;
  end: Point;
  defect: boolean;
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

function routeRight(parent: Rect, child: Rect, options: RouteOptions): Polyline {
  const gap = options.gap ?? GEOMETRY.edgeGap;
  const radius = options.radius ?? GEOMETRY.edgeRadius;
  const count = Math.max(1, options.count ?? 1);
  const index = clamp(options.index ?? 0, 0, count - 1);
  const ports = distributePorts(count, parent.y, parent.height);
  const startY = ports[index] ?? rectCenter(parent).y;
  const start: Point = { x: rectRight(parent) + gap, y: startY };
  const end: Point = { x: child.x - gap, y: rectCenter(child).y };
  const minimumGap = Math.max(GEOMETRY.edgeMinGap, radius * 2);
  if (end.x - start.x < minimumGap) {
    return { points: [start, end], defect: true };
  }
  const trunkX = clamp(
    rectRight(parent) + Math.max(8, Math.min(18, (end.x - start.x) / 2)),
    start.x,
    end.x - radius,
  );
  return {
    points: [start, { x: trunkX, y: start.y }, { x: trunkX, y: end.y }, end],
    defect: false,
  };
}

function routeBelow(parent: Rect, child: Rect, options: RouteOptions): Polyline {
  const gap = options.gap ?? GEOMETRY.edgeGap;
  const indent = options.indent ?? GEOMETRY.wrapIndent;
  const busOffset = options.busOffset ?? GEOMETRY.edgeBusOffset;
  const rawTrunkX = parent.x + indent;
  const start: Point = {
    x: clamp(rawTrunkX, parent.x + 4, rectRight(parent) - 4),
    y: parent.y + parent.height + gap,
  };
  const busY = child.y - busOffset;
  const end: Point = { x: child.x + child.width / 2, y: child.y - gap };
  if (busY - start.y < 4 || end.x <= start.x) {
    return { points: [start, end], defect: true };
  }
  return {
    points: [start, { x: start.x, y: busY }, { x: end.x, y: busY }, end],
    defect: false,
  };
}

export interface RouteBranchEdgeInput {
  id: string;
  parent: Rect;
  child: Rect;
  index?: number;
  count?: number;
  options?: RouteOptions;
}

export function routeBranchEdge(input: RouteBranchEdgeInput): RoutedEdge {
  const { parent, child } = input;
  const placement = classifyPlacement(parent, child);
  const options: RouteOptions = { ...input.options, index: input.index, count: input.count };
  if (placement === 'right') {
    const routed = routeRight(parent, child, options);
    const points = simplify(routed.points);
    return {
      id: input.id,
      placement,
      path: roundedPath(points, options.radius ?? GEOMETRY.edgeRadius),
      start: points[0] ?? { x: 0, y: 0 },
      end: points.at(-1) ?? { x: 0, y: 0 },
      defect: routed.defect,
    };
  }
  const routed = routeBelow(parent, child, options);
  const points = simplify(routed.points);
  return {
    id: input.id,
    placement: placement === 'overlap' ? 'below' : placement,
    path: roundedPath(points, options.radius ?? GEOMETRY.edgeRadius),
    start: points[0] ?? { x: 0, y: 0 },
    end: points.at(-1) ?? { x: 0, y: 0 },
    defect: routed.defect || placement === 'overlap',
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
