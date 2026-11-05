import { describe, expect, it } from 'vitest';
import { GEOMETRY, type Rect } from '../src/renderer/src/lib/geometry';
import { routeReferenceEdge } from '../src/renderer/src/lib/reference-routing';

function rect(x: number, y: number, width = 200, height = 80): Rect {
  return { x, y, width, height };
}

describe('reference edge routing', () => {
  it('routes a right-hand reference from the source right edge to the target left edge', () => {
    const source = rect(100, 100);
    const target = rect(400, 180);
    const route = routeReferenceEdge(source, target);
    expect(route.direction).toBe('right');
    expect(route.start).toEqual({ x: 300, y: 140 });
    expect(route.end.x).toBe(target.x - GEOMETRY.edgeGap);
    expect(route.end.y).toBe(220);
    expect(route.path).toContain('C ');
    expect(route.path.startsWith('M 300 140 C ')).toBe(true);
    // Open chevron: two strokes, no filled polygon.
    expect(route.arrowPath.match(/L /g)?.length).toBe(2);
    expect(route.arrowPath.endsWith('Z')).toBe(false);
  });

  it('routes a left-hand reference from the source left edge to the target right edge', () => {
    const source = rect(500, 100);
    const target = rect(100, 160);
    const route = routeReferenceEdge(source, target);
    expect(route.direction).toBe('left');
    expect(route.start).toEqual({ x: 500, y: 140 });
    expect(route.end.x).toBe(300 + GEOMETRY.edgeGap);
    expect(route.end.y).toBe(200);
  });

  it('routes a lower reference through the vertical axis', () => {
    const source = rect(100, 100);
    const target = rect(120, 320, 180, 60);
    const route = routeReferenceEdge(source, target);
    expect(route.direction).toBe('down');
    expect(route.start).toEqual({ x: 200, y: 180 });
    expect(route.end.x).toBe(210);
    expect(route.end.y).toBe(320 - GEOMETRY.edgeGap);
  });

  it('separates a two-way reference pair by lane without changing its endpoints', () => {
    const source = rect(100, 100);
    const target = rect(420, 100);
    const forward = routeReferenceEdge(source, target, { lane: -5 });
    const backward = routeReferenceEdge(target, source, { lane: 5 });
    expect(forward.start).not.toEqual(backward.end);
    expect(forward.path).not.toBe(backward.path);
    // The control points carry the lane offset, not the card edges.
    expect(forward.path).toContain('C ');
    expect(routeReferenceEdge(source, target, { lane: -5 })).toEqual(forward);
  });

  it('keeps a custom tip gap and never mutates the input rectangles', () => {
    const source = rect(10, 10);
    const target = rect(300, 10);
    const before = JSON.stringify({ source, target });
    const route = routeReferenceEdge(source, target, { gap: 6 });
    expect(route.end.x).toBe(target.x - 6);
    expect(JSON.stringify({ source, target })).toBe(before);
  });
});
