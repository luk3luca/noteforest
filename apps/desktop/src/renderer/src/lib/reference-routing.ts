/**
 * Pure router for reference edges (M3d1).
 *
 * Reference edges are associative: they are routed only after every card has
 * been placed, never feed back into layout, and never share the primary edge
 * trunk. The route is a soft cubic curve between the facing card edges, with an
 * open chevron arrowhead (UX §10.3). The router is deterministic; a `lane`
 * offset separates a reference pair that points both ways.
 *
 * No React, DOM, or measurement types.
 */

import { GEOMETRY, type Rect } from './geometry';

export interface ReferencePoint {
  x: number;
  y: number;
}

export interface RoutedReferenceEdge {
  path: string;
  start: ReferencePoint;
  end: ReferencePoint;
  /** Two open strokes that form the arrowhead; no filled polygon. */
  arrowPath: string;
  direction: 'right' | 'left' | 'down' | 'up';
}

export interface ReferenceRouteOptions {
  /** Perpendicular offset from the direct curve, used to separate cycles. */
  lane?: number;
  /** Gap between the arrow tip and the target card edge. */
  gap?: number;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function centerY(rect: Rect): number {
  return rect.y + rect.height / 2;
}

function centerX(rect: Rect): number {
  return rect.x + rect.width / 2;
}

function right(rect: Rect): number {
  return rect.x + rect.width;
}

function bottom(rect: Rect): number {
  return rect.y + rect.height;
}

/** Open chevron at `tip`, pointing along the unit vector (`dx`, `dy`). */
function openArrow(tip: ReferencePoint, dx: number, dy: number): string {
  const length = Math.hypot(dx, dy);
  if (length === 0) return '';
  const ux = dx / length;
  const uy = dy / length;
  const size = GEOMETRY.edgeArrowLength + 1;
  const spread = 0.46;
  const wing = (angle: number): ReferencePoint => ({
    x: round(tip.x - Math.cos(angle) * size),
    y: round(tip.y - Math.sin(angle) * size),
  });
  const base = Math.atan2(uy, ux);
  const first = wing(base - spread);
  const second = wing(base + spread);
  return `M ${first.x} ${first.y} L ${round(tip.x)} ${round(tip.y)} L ${second.x} ${second.y}`;
}

/**
 * Route one reference edge between two visible card rectangles.
 *
 * The curve leaves the source edge facing the target and enters the target edge
 * facing the source. The arrowhead is open (two strokes), never the filled
 * primary polygon.
 */
export function routeReferenceEdge(
  source: Rect,
  target: Rect,
  options: ReferenceRouteOptions = {},
): RoutedReferenceEdge {
  const lane = options.lane ?? 0;
  const gap = options.gap ?? GEOMETRY.edgeGap;
  const dx = centerX(target) - centerX(source);
  const dy = centerY(target) - centerY(source);
  const horizontal = Math.abs(dx) >= Math.abs(dy);

  let start: ReferencePoint;
  let end: ReferencePoint;
  let controlOne: ReferencePoint;
  let controlTwo: ReferencePoint;
  let direction: RoutedReferenceEdge['direction'];
  let tipX: number;
  let tipY: number;

  if (horizontal) {
    if (dx >= 0) {
      start = { x: round(right(source)), y: round(centerY(source)) };
      end = { x: round(target.x - gap), y: round(centerY(target)) };
      direction = 'right';
    } else {
      start = { x: round(source.x), y: round(centerY(source)) };
      end = { x: round(right(target) + gap), y: round(centerY(target)) };
      direction = 'left';
    }
    const span = Math.abs(end.x - start.x);
    const bend = clamp(span * 0.5, 24, 140);
    const sign = direction === 'right' ? 1 : -1;
    controlOne = { x: round(start.x + bend * sign), y: round(start.y + lane) };
    controlTwo = { x: round(end.x - bend * sign), y: round(end.y + lane) };
    tipX =
      direction === 'right'
        ? Math.round(Math.max(target.x - gap, start.x))
        : Math.round(Math.min(right(target) + gap, start.x));
    tipY = Math.round(end.y);
  } else {
    if (dy >= 0) {
      start = { x: round(centerX(source)), y: round(bottom(source)) };
      end = { x: round(centerX(target)), y: round(target.y - gap) };
      direction = 'down';
    } else {
      start = { x: round(centerX(source)), y: round(source.y) };
      end = { x: round(centerX(target)), y: round(bottom(target) + gap) };
      direction = 'up';
    }
    const span = Math.abs(end.y - start.y);
    const bend = clamp(span * 0.5, 24, 140);
    const sign = direction === 'down' ? 1 : -1;
    controlOne = { x: round(start.x + lane), y: round(start.y + bend * sign) };
    controlTwo = { x: round(end.x + lane), y: round(end.y - bend * sign) };
    tipX = Math.round(end.x);
    tipY = direction === 'down' ? Math.round(Math.max(target.y - gap, start.y)) : Math.round(Math.min(bottom(target) + gap, start.y));
  }

  // The open arrow points from the last control point into the target edge.
  const arrow = openArrow({ x: tipX, y: tipY }, tipX - controlTwo.x, tipY - controlTwo.y);
  return {
    path: `M ${start.x} ${start.y} C ${controlOne.x} ${controlOne.y}, ${controlTwo.x} ${controlTwo.y}, ${tipX} ${tipY}`,
    start,
    end: { x: tipX, y: tipY },
    arrowPath: arrow,
    direction,
  };
}
