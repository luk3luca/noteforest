export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function right(r: Rect): number {
  return r.x + r.width;
}

export function bottom(r: Rect): number {
  return r.y + r.height;
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(right(a), right(b)) - Math.max(a.x, b.x);
  const h = Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Shortest distance between the axis-aligned bounds of two rectangles.
 * Returns 0 when the rectangles overlap.
 */
export function clearGap(a: Rect, b: Rect): number {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(right(a), right(b)));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(bottom(a), bottom(b)));
  if (dx === 0 && dy === 0) return 0;
  return Math.hypot(dx, dy);
}

export function containsPoint(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
