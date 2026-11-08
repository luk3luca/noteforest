/**
 * Shared edge-style primitives.
 *
 * Continuous and Page/PDF must speak one visual language: the same fixed
 * arrowhead, the same corner radius, the same minimum stem, and the same
 * orthogonal polyline with rounded corners. This module is pure and package
 * local so the layout package, the desktop renderer, and the print model can
 * all consume the same numbers and path helpers without a reverse dependency.
 *
 * The renderer's `design-tokens.ts` re-exports these values into `GEOMETRY`;
 * do not duplicate them in components.
 */

export interface EdgePoint {
  x: number;
  y: number;
}

export type EdgeArrowDirection = 'right' | 'left' | 'down' | 'up';

/**
 * Edge geometry and stroke tokens.
 *
 * The values are the M2e/M3 edge contract. `page*` entries are R2d-only route
 * clearances; they never change card placement.
 */
export const EDGE_STYLE = Object.freeze({
  /** Space kept between the arrow tip and the child's left edge. */
  gap: 2,
  /** Near-right-angle corner radius. */
  radius: 2,
  /** Minimum final straight run before a fixed arrowhead. */
  stemMin: 12,
  /** Shared trunk lane, clamped between these offsets from the parent edge. */
  laneMin: 2,
  laneMax: 14,
  /** Fixed arrowhead polygon, independent of path length. */
  arrowLength: 6,
  arrowHalfWidth: 3,
  edgeWidth: 1.25,
  edgeWidthActive: 1.75,
  edgeWidthMuted: 1,
  /** Minimum routed segment gap. */
  minGap: 4,
  /** Reference edges use an open chevron one px larger than the primary head. */
  referenceArrowLength: 7,
  referenceArrowSpread: 0.46,
  /**
   * Clearance kept between a Page route and a fragment card. The route may run
   * in the sibling gap; it never enters the card box.
   */
  pageClearance: 3,
  /** Horizontal lane separation for parallel duplicate page edges. */
  pageLaneStep: 4,
  /** Cost of a right-angle turn, in px, for the page route search. */
  pageTurnPenalty: 60,
});

function sameY(left: EdgePoint, right: EdgePoint): boolean {
  return Math.abs(left.y - right.y) < 0.01;
}

function sameX(left: EdgePoint, right: EdgePoint): boolean {
  return Math.abs(left.x - right.x) < 0.01;
}

/** Remove duplicate and collinear intermediate points. */
export function simplifyPath(points: readonly EdgePoint[]): EdgePoint[] {
  const compact: EdgePoint[] = [];
  for (const point of points) {
    const last = compact.at(-1);
    if (last !== undefined && Math.abs(last.x - point.x) < 0.25 && Math.abs(last.y - point.y) < 0.25) {
      continue;
    }
    compact.push(point);
  }
  const result: EdgePoint[] = [];
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

function pointTowards(from: EdgePoint, towards: EdgePoint, distance: number): EdgePoint {
  const length = Math.hypot(towards.x - from.x, towards.y - from.y);
  if (length === 0) return from;
  const ratio = Math.min(Math.max(distance, 0), length) / length;
  return {
    x: from.x + (towards.x - from.x) * ratio,
    y: from.y + (towards.y - from.y) * ratio,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** SVG path with rounded right-angle corners. Never emits a cubic `C`. */
export function roundedPath(points: readonly EdgePoint[], radius: number): string {
  const simplified = simplifyPath(points);
  if (simplified.length === 0) return '';
  if (simplified.length === 1) {
    const single = simplified[0] as EdgePoint;
    return `M ${round(single.x)} ${round(single.y)}`;
  }
  const first = simplified[0] as EdgePoint;
  let path = `M ${round(first.x)} ${round(first.y)}`;
  for (let index = 1; index < simplified.length - 1; index += 1) {
    const previous = simplified[index - 1] as EdgePoint;
    const current = simplified[index] as EdgePoint;
    const next = simplified[index + 1] as EdgePoint;
    const cornerRadius = Math.min(
      radius,
      Math.hypot(current.x - previous.x, current.y - previous.y) / 2,
      Math.hypot(next.x - current.x, next.y - current.y) / 2,
    );
    const before = pointTowards(current, previous, cornerRadius);
    const after = pointTowards(current, next, cornerRadius);
    if (cornerRadius <= 0.001) {
      // Radius zero is a true right angle: no degenerate Q segment.
      path += ` L ${round(current.x)} ${round(current.y)}`;
      continue;
    }
    path += ` L ${round(before.x)} ${round(before.y)} Q ${round(current.x)} ${round(current.y)} ${round(after.x)} ${round(after.y)}`;
  }
  const last = simplified[simplified.length - 1] as EdgePoint;
  path += ` L ${round(last.x)} ${round(last.y)}`;
  return path;
}

/** Fixed-size arrowhead polygon at `tip`, pointing in `direction`. */
export function arrowPoints(
  tip: EdgePoint,
  direction: EdgeArrowDirection = 'right',
): [EdgePoint, EdgePoint, EdgePoint] {
  const length = EDGE_STYLE.arrowLength;
  const half = EDGE_STYLE.arrowHalfWidth;
  if (direction === 'down') {
    return [
      tip,
      { x: tip.x - half, y: tip.y - length },
      { x: tip.x + half, y: tip.y - length },
    ];
  }
  if (direction === 'left') {
    return [
      tip,
      { x: tip.x + length, y: tip.y - half },
      { x: tip.x + length, y: tip.y + half },
    ];
  }
  if (direction === 'up') {
    return [
      tip,
      { x: tip.x - half, y: tip.y + length },
      { x: tip.x + half, y: tip.y + length },
    ];
  }
  return [
    tip,
    { x: tip.x - length, y: tip.y - half },
    { x: tip.x - length, y: tip.y + half },
  ];
}

export function arrowPath(tip: EdgePoint, direction: EdgeArrowDirection = 'right'): string {
  const [a, b, c] = arrowPoints(tip, direction);
  return `M ${round(a.x)} ${round(a.y)} L ${round(b.x)} ${round(b.y)} L ${round(c.x)} ${round(c.y)} Z`;
}

/** Unit vector for an arrow direction. */
export function arrowDirectionVector(direction: EdgeArrowDirection): EdgePoint {
  if (direction === 'left') return { x: -1, y: 0 };
  if (direction === 'down') return { x: 0, y: 1 };
  if (direction === 'up') return { x: 0, y: -1 };
  return { x: 1, y: 0 };
}

/**
 * Open chevron at `tip`, pointing along the unit vector (`dx`, `dy`). This is
 * the reference-edge arrowhead: same size/spread rules as Continuous, never a
 * filled polygon.
 */
export function openArrowPath(tip: EdgePoint, dx: number, dy: number): string {
  const length = Math.hypot(dx, dy);
  if (length === 0) return '';
  const ux = dx / length;
  const uy = dy / length;
  const size = EDGE_STYLE.referenceArrowLength;
  const spread = EDGE_STYLE.referenceArrowSpread;
  const wing = (angle: number): EdgePoint => ({
    x: round(tip.x - Math.cos(angle) * size),
    y: round(tip.y - Math.sin(angle) * size),
  });
  const base = Math.atan2(uy, ux);
  const first = wing(base - spread);
  const second = wing(base + spread);
  return `M ${first.x} ${first.y} L ${round(tip.x)} ${round(tip.y)} L ${second.x} ${second.y}`;
}

/** Open chevron for a cardinal arrow direction. */
export function openArrowForDirection(
  tip: EdgePoint,
  direction: EdgeArrowDirection,
): string {
  const vector = arrowDirectionVector(direction);
  return openArrowPath(tip, vector.x, vector.y);
}
