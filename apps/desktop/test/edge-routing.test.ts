import { describe, expect, it } from 'vitest';
import {
  pathMovesForward,
  roundedPath,
  routeBranchEdge,
  routeChildGroup,
  type Point,
} from '../src/renderer/src/lib/edge-routing';
import { GEOMETRY, type Rect } from '../src/renderer/src/lib/geometry';

const parent: Rect = { x: 0, y: 0, width: 400, height: 120 };
const rightChild: Rect = { x: 440, y: 20, width: 240, height: 100 };
const belowChild: Rect = { x: 18, y: 160, width: 280, height: 80 };

function child(id: string, y: number, x = 440, height = 80): { id: string; rect: Rect } {
  return { id, rect: { x, y, width: 240, height } };
}

function containsPoint(points: readonly Point[], point: Point): boolean {
  return points.some(
    (candidate) => Math.abs(candidate.x - point.x) < 0.05 && Math.abs(candidate.y - point.y) < 0.05,
  );
}

describe('edge routing', () => {
  it('routes a single right child as a simple elbow from the parent edge', () => {
    const edge = routeBranchEdge({ id: 'edge', parent, child: rightChild });
    expect(edge.placement).toBe('right');
    expect(edge.defect).toBe(false);
    expect(edge.start.x).toBe(parent.x + parent.width);
    expect(edge.start.y).toBeCloseTo(parent.y + parent.height / 2, 5);
    expect(edge.end.x).toBeCloseTo(rightChild.x - GEOMETRY.edgeGap, 5);
    expect(edge.end.y).toBeCloseTo(rightChild.y + rightChild.height / 2, 5);
    expect(edge.path).toContain('Q');
    expect(edge.path.startsWith('M ')).toBe(true);
  });

  it('routes a wrapped child through a bottom trunk and a bus above the child', () => {
    const edge = routeBranchEdge({ id: 'edge', parent, child: belowChild });
    expect(edge.placement).toBe('below');
    expect(edge.defect).toBe(false);
    expect(edge.start.y).toBeCloseTo(belowChild.y - 12, 5);
    expect(edge.end.y).toBeLessThan(belowChild.y);
    expect(edge.end.x).toBeCloseTo(belowChild.x + belowChild.width / 2, 5);
  });

  it('keeps the first branch continuous from the parent port into the trunk (2 children)', () => {
    const one = child('one', 20);
    const two = child('two', 220);
    const group = routeChildGroup({ parentId: 'p', parent, children: [one, two] });
    expect(group.edges).toHaveLength(2);
    expect(group.trunks).toHaveLength(1);
    const trunk = group.trunks[0];
    const first = group.edges[0];
    if (trunk === undefined || first === undefined) throw new Error('missing route');
    expect(trunk.placement).toBe('right');
    expect(trunk.kind).toBe('trunk');
    // The trunk starts at the first child's T-junction, not at the parent port.
    expect(trunk.start.y).toBeCloseTo(one.rect.y + one.rect.height / 2, 5);
    expect(trunk.end.y).toBeCloseTo(two.rect.y + two.rect.height / 2, 5);
    expect(trunk.start.x).toBeGreaterThan(parent.x + parent.width);
    expect(trunk.start.x).toBeLessThan(one.rect.x);
    // The first edge starts at the parent's port and its path passes through
    // the trunk junction; no rounded corner can create a gap.
    expect(first.start.x).toBe(parent.x + parent.width);
    expect(first.start.y).toBeCloseTo(parent.y + parent.height / 2, 5);
    expect(first.end.x).toBeCloseTo(one.rect.x - GEOMETRY.edgeGap, 5);
    expect(containsPoint(parsePoints(first.path), trunk.start)).toBe(true);
    expect(containsPoint(parsePoints(first.path), first.start)).toBe(true);
    // The other child starts on the trunk.
    const second = group.edges[1];
    if (second === undefined) throw new Error('missing second route');
    expect(second.start.x).toBeCloseTo(trunk.start.x, 5);
    expect(second.start.y).toBeCloseTo(two.rect.y + two.rect.height / 2, 5);
    expect(second.end.x).toBeCloseTo(two.rect.x - GEOMETRY.edgeGap, 5);
    expect(second.end.x).toBeGreaterThan(second.start.x);
  });

  it('keeps one trunk and five connected short arrows for five children', () => {
    const children = Array.from({ length: 5 }, (_value, index) => child(`c${index}`, index * 90));
    const group = routeChildGroup({ parentId: 'p', parent, children });
    expect(group.edges).toHaveLength(5);
    expect(group.trunks).toHaveLength(1);
    const trunk = group.trunks[0];
    if (trunk === undefined) throw new Error('missing trunk');
    const first = children[0];
    if (first === undefined) throw new Error('missing first child');
    // A straight vertical span across all child junctions.
    expect(trunk.path.startsWith('M ')).toBe(true);
    expect(trunk.path).not.toContain('Q');
    expect(trunk.start.y).toBeCloseTo(first.rect.y + first.rect.height / 2, 5);
    expect(trunk.end.y).toBeCloseTo((children[4]?.rect.y ?? 0) + (children[4]?.rect.height ?? 0) / 2, 5);
    const firstEdge = group.edges[0];
    if (firstEdge === undefined) throw new Error('missing first edge');
    expect(containsPoint(parsePoints(firstEdge.path), trunk.start)).toBe(true);
    for (const [index, edge] of group.edges.entries()) {
      const target = index === 0 ? first.rect : (children[index]?.rect ?? first.rect);
      expect(edge.end.x).toBeCloseTo(target.x - GEOMETRY.edgeGap, 5);
      expect(pathMovesForward(parsePoints(edge.path))).toBe(true);
    }
  });

  it('aligns the trunk inside a 16 px depth-column gap without a negative stub', () => {
    const tightParent: Rect = { x: 0, y: 0, width: 300, height: 90 };
    const tightChildren = [child('a', 0, 316, 60), child('b', 120, 316, 60)];
    const group = routeChildGroup({ parentId: 'p', parent: tightParent, children: tightChildren });
    const trunk = group.trunks[0];
    const first = group.edges[0];
    if (trunk === undefined || first === undefined) throw new Error('missing route');
    expect(trunk.start.x).toBeGreaterThan(300);
    expect(trunk.start.x).toBeLessThan(316 - GEOMETRY.edgeGap);
    expect((first.end.x ?? 0) - (group.edges[1]?.start.x ?? 0)).toBeGreaterThanOrEqual(4);
    expect(first.defect).toBe(false);
  });

  it('uses one bottom trunk and one bus for wrapped children', () => {
    const first = { id: 'w1', rect: { x: 18, y: 180, width: 280, height: 80 } };
    const second = { id: 'w2', rect: { x: 330, y: 200, width: 280, height: 80 } };
    const group = routeChildGroup({
      parentId: 'p',
      parent,
      children: [first, second],
    });
    expect(group.edges).toHaveLength(2);
    expect(group.trunks).toHaveLength(2);
    const trunk = group.trunks.find((item) => item.kind === 'trunk');
    const bus = group.trunks.find((item) => item.kind === 'bus');
    expect(trunk?.placement).toBe('below');
    expect(trunk?.start.x).toBeCloseTo(parent.x + 18, 5);
    expect(trunk?.start.y).toBeCloseTo(parent.y + parent.height, 5);
    expect(bus?.start.y).toBeCloseTo(180 - 12, 5);
    expect(bus?.end.y).toBeCloseTo(180 - 12, 5);
    for (const [index, edge] of group.edges.entries()) {
      const target = index === 0 ? first.rect : second.rect;
      expect(edge.placement).toBe('below');
      expect(edge.start.y).toBeCloseTo(180 - 12, 5);
      expect(edge.end.y).toBeLessThan(target.y);
    }
  });

  it('routes mixed right and wrapped groups with separate trunks', () => {
    const mixed = [
      { id: 'right-1', rect: rightChild },
      { id: 'right-2', rect: { x: 440, y: 150, width: 240, height: 80 } },
      { id: 'below', rect: belowChild },
    ];
    const group = routeChildGroup({ parentId: 'p', parent, children: mixed });
    expect(group.edges).toHaveLength(3);
    const placements = group.edges.map((edge) => edge.placement).sort();
    expect(placements).toEqual(['below', 'right', 'right']);
    expect(group.trunks.filter((item) => item.placement === 'right')).toHaveLength(1);
    expect(group.trunks.filter((item) => item.placement === 'below' && item.kind === 'trunk')).toHaveLength(1);
    expect(group.trunks.filter((item) => item.placement === 'below' && item.kind === 'bus')).toHaveLength(1);
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
