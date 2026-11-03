import { describe, expect, it } from 'vitest';
import {
  pathMovesForward,
  roundedPath,
  routeBranchEdge,
  type Point,
} from '../src/renderer/src/lib/edge-routing';
import type { Rect } from '../src/renderer/src/lib/geometry';

const parent: Rect = { x: 0, y: 0, width: 400, height: 120 };
const rightChild: Rect = { x: 440, y: 20, width: 240, height: 100 };
const belowChild: Rect = { x: 18, y: 160, width: 280, height: 80 };

describe('edge routing', () => {
  it('routes a right child from the parent right edge to the child left edge', () => {
    const edge = routeBranchEdge({ id: 'edge', parent, child: rightChild });
    expect(edge.placement).toBe('right');
    expect(edge.defect).toBe(false);
    expect(edge.start.x).toBeGreaterThan(parent.x + parent.width);
    expect(edge.end.x).toBeLessThan(rightChild.x);
    expect(edge.start.y).toBeGreaterThan(parent.y);
    expect(edge.end.y).toBeCloseTo(rightChild.y + rightChild.height / 2, 5);
    expect(edge.path.startsWith('M ')).toBe(true);
  });

  it('routes a wrapped child through a bottom trunk and a bus above the child', () => {
    const edge = routeBranchEdge({ id: 'edge', parent, child: belowChild });
    expect(edge.placement).toBe('below');
    expect(edge.defect).toBe(false);
    expect(edge.start.x).toBeCloseTo(parent.x + 18, 5);
    expect(edge.start.y).toBeGreaterThan(parent.y + parent.height);
    expect(edge.end.y).toBeLessThan(belowChild.y);
    expect(edge.end.x).toBeCloseTo(belowChild.x + belowChild.width / 2, 5);
  });

  it('uses ordered ports for multiple right children', () => {
    const first = routeBranchEdge({ id: 'a', parent, child: rightChild, index: 0, count: 3 });
    const last = routeBranchEdge({ id: 'b', parent, child: rightChild, index: 2, count: 3 });
    expect(first.start.y).toBeLessThan(last.start.y);
    expect(first.end.x).toBe(last.end.x);
  });

  it('never travels backwards on a right route', () => {
    const edge = routeBranchEdge({ id: 'edge', parent, child: rightChild });
    const points = parsePoints(edge.path);
    expect(pathMovesForward(points)).toBe(true);
    expect(edge.end.x).toBeGreaterThan(edge.start.x);
  });

  it('flags overlapping cards instead of hiding a layout defect', () => {
    const overlap: Rect = { x: 100, y: 40, width: 200, height: 100 };
    const edge = routeBranchEdge({ id: 'defect', parent, child: overlap });
    expect(edge.defect).toBe(true);
    expect(edge.placement).toBe('below');
  });

  it('routes forward when the child is very close to the parent', () => {
    const tight: Rect = { x: 408, y: 10, width: 160, height: 100 };
    const edge = routeBranchEdge({ id: 'tight', parent, child: tight });
    expect(edge.defect).toBe(true);
    expect(edge.end.x).toBeLessThan(tight.x);
  });

  it('renders rounded orthogonal paths only', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 80, y: 40 },
    ];
    const path = roundedPath(points, 6);
    expect(path).toContain('Q');
    expect(path.match(/[A-Za-z]/g)?.every((letter) => ['M', 'L', 'Q'].includes(letter))).toBe(true);
  });
});

function parsePoints(path: string): Point[] {
  const numbers = path
    .split(/[^0-9.-]+/)
    .filter((part) => part.length > 0)
    .map(Number);
  const points: Point[] = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    points.push({ x: numbers[index] ?? 0, y: numbers[index + 1] ?? 0 });
  }
  return points;
}
