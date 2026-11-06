import { describe, expect, it } from 'vitest';
import {
  arrowPoints,
  branchConnectorPath,
  pathMovesForward,
  roundedPath,
  routeBelowStackGroup,
  routeBranchEdge,
  routeChildGroup,
  type Point,
} from '../src/renderer/src/lib/edge-routing';
import { GEOMETRY, type Rect } from '../src/renderer/src/lib/geometry';

const parent: Rect = { x: 0, y: 0, width: 400, height: 120 };
const rightChild: Rect = { x: 424, y: 10, width: 240, height: 100 };
const belowChild: Rect = { x: 28, y: 180, width: 280, height: 80 };

function child(id: string, y: number, x = 424, height = 100): { id: string; rect: Rect } {
  return { id, rect: { x, y, width: 240, height } };
}

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

/**
 * Distance from each Q control point (the rounded corner) to the adjacent
 * line endpoints. A near-right elbow cuts at most `edgeRadius` on each side.
 */
function cornerOffsets(path: string): number[] {
  const tokens = path.match(/[MLQ]|-?\d+(?:\.\d+)?/g) ?? [];
  interface Segment {
    command: 'M' | 'L' | 'Q';
    points: Point[];
  }
  const segments: Segment[] = [];
  let command: Segment['command'] = 'M';
  let numbers: number[] = [];
  for (const token of tokens) {
    if (token === 'M' || token === 'L' || token === 'Q') {
      if (numbers.length > 0) {
        const points: Point[] = [];
        for (let index = 0; index + 1 < numbers.length; index += 2) {
          points.push({ x: numbers[index] ?? 0, y: numbers[index + 1] ?? 0 });
        }
        segments.push({ command, points });
      }
      command = token;
      numbers = [];
    } else {
      numbers.push(Number(token));
    }
  }
  if (numbers.length > 0) {
    const points: Point[] = [];
    for (let index = 0; index + 1 < numbers.length; index += 2) {
      points.push({ x: numbers[index] ?? 0, y: numbers[index + 1] ?? 0 });
    }
    segments.push({ command, points });
  }
  const offsets: number[] = [];
  let previous: Point | null = null;
  for (const segment of segments) {
    if (segment.command === 'Q') {
      const control = segment.points[0];
      const after = segment.points[1];
      if (previous !== null && control !== undefined) {
        offsets.push(Math.hypot(previous.x - control.x, previous.y - control.y));
      }
      if (control !== undefined && after !== undefined) {
        offsets.push(Math.hypot(after.x - control.x, after.y - control.y));
      }
    }
    previous = segment.points.at(-1) ?? previous;
  }
  return offsets;
}

function containsPoint(points: readonly Point[], point: Point): boolean {
  return points.some(
    (candidate) => Math.abs(candidate.x - point.x) < 0.05 && Math.abs(candidate.y - point.y) < 0.05,
  );
}

function lastSegment(points: readonly Point[]): { length: number; horizontal: boolean } {
  const end = points.at(-1);
  const before = points.at(-2);
  if (end === undefined || before === undefined) return { length: 0, horizontal: false };
  return {
    length: Math.hypot(end.x - before.x, end.y - before.y),
    horizontal: Math.abs(end.y - before.y) < 0.5,
  };
}

describe('edge routing — fixed arrowhead and minimum stem', () => {
  it('routes a centered single child with a 12 px horizontal stem', () => {
    const edge = routeBranchEdge({ id: 'edge', parent, child: rightChild });
    expect(edge.placement).toBe('right');
    expect(edge.defect).toBe(false);
    expect(edge.start.x).toBe(parent.x + parent.width);
    expect(edge.start.y).toBeCloseTo(parent.y + parent.height / 2, 5);
    expect(edge.end.x).toBeCloseTo(rightChild.x - GEOMETRY.edgeGap, 5);
    expect(edge.end.y).toBeCloseTo(rightChild.y + rightChild.height / 2, 5);
    const points = parsePoints(edge.path);
    const segment = lastSegment(points);
    expect(segment.horizontal).toBe(true);
    expect(segment.length).toBeGreaterThanOrEqual(GEOMETRY.stemMin);
    expect(edge.path.startsWith('M ')).toBe(true);
  });

  it('uses a fixed 6 × 6 arrow polygon independent of path length', () => {
    const centered = routeBranchEdge({ id: 'a', parent, child: rightChild });
    const far = routeBranchEdge({
      id: 'b',
      parent,
      child: { x: 416, y: 420, width: 240, height: 100 },
    });
    for (const edge of [centered, far]) {
      const [tip, top, bottom] = edge.arrow.points;
      if (tip === undefined || top === undefined || bottom === undefined) {
        throw new Error('missing arrow points');
      }
      expect(edge.arrow.path.endsWith('Z')).toBe(true);
      expect(Math.abs(tip.x - top.x)).toBe(GEOMETRY.edgeArrowLength);
      expect(Math.abs(tip.x - bottom.x)).toBe(GEOMETRY.edgeArrowLength);
      expect(Math.abs(top.y - bottom.y)).toBe(GEOMETRY.edgeArrowHalfWidth * 2);
      expect(tip.x).toBeGreaterThan(top.x);
      expect(edge.arrow.direction).toBe('right');
    }
    expect(arrowPoints({ x: 20, y: 10 })).toHaveLength(3);
    expect(arrowPoints({ x: 20, y: 10 }, 'down')[1]?.y).toBe(10 - GEOMETRY.edgeArrowLength);
  });

  it('keeps a legible stem for close parent → child distances', () => {
    const close = routeBranchEdge({
      id: 'close',
      parent,
      child: { x: 416, y: 20, width: 200, height: 80 },
    });
    expect(close.defect).toBe(false);
    const points = parsePoints(close.path);
    expect(lastSegment(points).length).toBeGreaterThanOrEqual(GEOMETRY.stemMin);
    // The arrowhead is shorter than the stem, so it cannot collide with the
    // elbow even at the 16 px parent → child gap.
    expect(GEOMETRY.edgeArrowLength).toBeLessThan(GEOMETRY.stemMin);
  });

  it('flags a stem shorter than the minimum instead of squashing the arrow', () => {
    const tight: Rect = { x: 410, y: 10, width: 160, height: 100 };
    const edge = routeBranchEdge({ id: 'tight', parent, child: tight });
    expect(edge.defect).toBe(true);
    const points = parsePoints(edge.path);
    expect(lastSegment(points).length).toBeLessThan(GEOMETRY.stemMin);
    expect(edge.end.x).toBeLessThan(tight.x);
    // Even the defect keeps the fixed arrowhead.
    const [tip, top] = edge.arrow.points;
    expect(tip !== undefined && top !== undefined ? tip.x - top.x : 0).toBe(GEOMETRY.edgeArrowLength);
  });

  it('keeps the final stem horizontal for small and large vertical offsets', () => {
    for (const y of [-60, 20, 160, 420]) {
      const edge = routeBranchEdge({
        id: `offset-${y}`,
        parent,
        child: { x: 416, y, width: 240, height: 80 },
      });
      if (edge.placement !== 'right') continue;
      const points = parsePoints(edge.path);
      const segment = lastSegment(points);
      expect(segment.horizontal).toBe(true);
      expect(segment.length).toBeGreaterThanOrEqual(GEOMETRY.stemMin);
      expect(pathMovesForward(points)).toBe(true);
    }
  });
});

describe('edge routing — shared trunk', () => {
  it('keeps the first branch continuous from the parent port into the trunk (2 children)', () => {
    const one = child('one', 0, 424, 60);
    const two = child('two', 200, 424, 60);
    const group = routeChildGroup({ parentId: 'p', parent, children: [one, two] });
    expect(group.edges).toHaveLength(2);
    expect(group.trunks).toHaveLength(1);
    const trunk = group.trunks[0];
    const first = group.edges[0];
    if (trunk === undefined || first === undefined) throw new Error('missing route');
    expect(trunk.placement).toBe('right');
    expect(trunk.kind).toBe('trunk');
    expect(trunk.start.y).toBeCloseTo(one.rect.y + one.rect.height / 2, 5);
    expect(trunk.end.y).toBeCloseTo(two.rect.y + two.rect.height / 2, 5);
    expect(trunk.start.x).toBeGreaterThan(parent.x + parent.width);
    expect(trunk.start.x).toBeLessThan(one.rect.x);
    // The shared trunk leaves the parent with a visible horizontal lead
    // (siblingGap - edgeGap - stemMin) instead of hugging the card edge.
    expect(trunk.start.x - (parent.x + parent.width)).toBe(
      GEOMETRY.siblingGap - GEOMETRY.edgeGap - GEOMETRY.stemMin,
    );
    expect(trunk.start.x - (parent.x + parent.width)).toBeGreaterThanOrEqual(8);
    expect(first.start.x).toBe(parent.x + parent.width);
    expect(first.start.y).toBeCloseTo(parent.y + parent.height / 2, 5);
    expect(first.end.x).toBeCloseTo(one.rect.x - GEOMETRY.edgeGap, 5);
    expect(containsPoint(parsePoints(first.path), trunk.start)).toBe(true);
    expect(containsPoint(parsePoints(first.path), first.start)).toBe(true);
    const second = group.edges[1];
    if (second === undefined) throw new Error('missing second route');
    expect(second.start.x).toBeCloseTo(trunk.start.x, 5);
    expect(second.start.y).toBeCloseTo(two.rect.y + two.rect.height / 2, 5);
    expect(second.end.x).toBeCloseTo(two.rect.x - GEOMETRY.edgeGap, 5);
    expect(second.end.x).toBeGreaterThan(second.start.x);
    for (const edge of group.edges) {
      expect(lastSegment(parsePoints(edge.path)).horizontal).toBe(true);
      expect(lastSegment(parsePoints(edge.path)).length).toBeGreaterThanOrEqual(GEOMETRY.stemMin);
    }
  });

  it('keeps one trunk and three short arrows for three children at a 16 px gap', () => {
    const children = Array.from({ length: 3 }, (_value, index) => child(`t${index}`, index * 76, 416, 60));
    const group = routeChildGroup({ parentId: 'p', parent, children });
    expect(group.edges).toHaveLength(3);
    expect(group.trunks).toHaveLength(1);
    const trunk = group.trunks[0];
    if (trunk === undefined) throw new Error('missing trunk');
    expect(trunk.start.y).toBeCloseTo(30, 5);
    expect(trunk.end.y).toBeCloseTo(182, 5);
    for (const [index, edge] of group.edges.entries()) {
      const target = children[index];
      if (target === undefined) throw new Error('missing child');
      expect(edge.end.x).toBeCloseTo(target.rect.x - GEOMETRY.edgeGap, 5);
      expect(lastSegment(parsePoints(edge.path)).horizontal).toBe(true);
      expect(lastSegment(parsePoints(edge.path)).length).toBeGreaterThanOrEqual(GEOMETRY.stemMin);
    }
  });

  it('keeps one trunk and five connected short arrows for five children', () => {
    const children = Array.from({ length: 5 }, (_value, index) => child(`c${index}`, index * 80, 416, 56));
    const group = routeChildGroup({ parentId: 'p', parent, children });
    expect(group.edges).toHaveLength(5);
    expect(group.trunks).toHaveLength(1);
    const trunk = group.trunks[0];
    const first = children[0];
    const last = children[4];
    if (trunk === undefined || first === undefined || last === undefined) {
      throw new Error('missing route');
    }
    expect(trunk.path.startsWith('M ')).toBe(true);
    expect(trunk.path).not.toContain('Q');
    expect(trunk.start.y).toBeCloseTo(first.rect.y + first.rect.height / 2, 5);
    expect(trunk.end.y).toBeCloseTo(last.rect.y + last.rect.height / 2, 5);
    const firstEdge = group.edges[0];
    if (firstEdge === undefined) throw new Error('missing first edge');
    expect(containsPoint(parsePoints(firstEdge.path), trunk.start)).toBe(true);
    for (const [index, edge] of group.edges.entries()) {
      const target = children[index];
      if (target === undefined) throw new Error('missing child');
      expect(edge.end.x).toBeCloseTo(target.rect.x - GEOMETRY.edgeGap, 5);
      expect(pathMovesForward(parsePoints(edge.path))).toBe(true);
      expect(lastSegment(parsePoints(edge.path)).length).toBeGreaterThanOrEqual(GEOMETRY.stemMin);
    }
  });

  it('starts the trunk at the first child when the first child is above the parent center', () => {
    const above = child('above', -80, 416, 60);
    const below = child('below', 160, 416, 60);
    const group = routeChildGroup({ parentId: 'p', parent, children: [above, below] });
    const trunk = group.trunks[0];
    const first = group.edges.find((edge) => edge.id === 'above');
    if (trunk === undefined || first === undefined) throw new Error('missing route');
    expect(first.end.y).toBeLessThan(parent.y + parent.height / 2);
    expect(trunk.start.y).toBeCloseTo(above.rect.y + above.rect.height / 2, 5);
    expect(containsPoint(parsePoints(first.path), trunk.start)).toBe(true);
    expect(pathMovesForward(parsePoints(first.path))).toBe(true);
  });

  it('spans the trunk to a far child without bending', () => {
    const near = child('near', 0, 416, 56);
    const far = child('far', 420, 416, 56);
    const group = routeChildGroup({ parentId: 'p', parent, children: [near, far] });
    const trunk = group.trunks[0];
    const farEdge = group.edges.find((edge) => edge.id === 'far');
    if (trunk === undefined || farEdge === undefined) throw new Error('missing route');
    expect(trunk.end.y).toBeCloseTo(448, 5);
    expect(farEdge.start.x).toBeCloseTo(trunk.start.x, 5);
    expect(farEdge.start.y).toBeCloseTo(448, 5);
    expect(farEdge.path).not.toContain('Q');
  });

  it('flags a defect when the gap is narrower than the stem minimum', () => {
    const tightParent: Rect = { x: 0, y: 0, width: 300, height: 90 };
    const tightChildren = [child('a', 0, 310, 60), child('b', 100, 310, 60)];
    const group = routeChildGroup({ parentId: 'p', parent: tightParent, children: tightChildren });
    expect(group.edges.every((edge) => edge.defect)).toBe(true);
    expect(group.edges.every((edge) => edge.arrow.points.length === 3)).toBe(true);
  });

  it('builds a continuous first-child path with a sharp T-junction', () => {
    const start = { x: 400, y: 60 };
    const end = { x: 414, y: 30 };
    const path = branchConnectorPath(start, 402, 30, end, GEOMETRY.edgeRadius);
    const points = parsePoints(path);
    expect(points[0]).toEqual(start);
    expect(containsPoint(points, { x: 402, y: 30 })).toBe(true);
    expect(points.at(-1)).toEqual(end);
    expect(pathMovesForward(points)).toBe(true);
  });
});

describe('edge routing — left-entry below stack', () => {
  const callout: Rect = { x: 36, y: 180, width: 220, height: 80 };
  const second: Rect = { x: 36, y: 280, width: 220, height: 80 };

  it('routes a single below row as one left-entry elbow', () => {
    const group = routeBelowStackGroup({
      parentId: 'p',
      parent,
      children: [{ id: 'callout-edge', rect: callout }],
    });
    expect(group.edges).toHaveLength(1);
    expect(group.trunks).toHaveLength(0);
    const edge = group.edges[0];
    if (edge === undefined) throw new Error('missing route');
    expect(edge.placement).toBe('below');
    expect(edge.defect).toBe(false);
    expect(edge.end.x).toBeCloseTo(callout.x - GEOMETRY.edgeGap, 5);
    expect(edge.end.y).toBeCloseTo(callout.y + callout.height / 2, 5);
    expect(edge.arrow.direction).toBe('right');
    const points = parsePoints(edge.path);
    expect(points[0]?.y).toBeCloseTo(parent.y + parent.height + GEOMETRY.trunkGap, 5);
    // The trunk starts inside the parent card, a few px right of its corner.
    expect(points[0]?.x).toBeCloseTo(parent.x + GEOMETRY.trunkInset, 5);
    expect(points[0]?.x).toBeGreaterThan(parent.x);
    expect(points[0]?.x).toBeLessThan(parent.x + parent.width);
    expect(points[0]?.x).toBeLessThan(callout.x);
    expect(points.every((point) => point.x <= edge.end.x + 0.5)).toBe(true);
    expect(points.at(-1)).toEqual(edge.end);
    expect(lastSegment(points).horizontal).toBe(true);
    expect(lastSegment(points).length).toBeGreaterThanOrEqual(GEOMETRY.stemMin);
  });

  it('keeps a visible token gap between the parent bottom and a single-row trunk', () => {
    const group = routeBelowStackGroup({
      parentId: 'p',
      parent,
      children: [{ id: 'callout-edge', rect: callout }],
    });
    const edge = group.edges[0];
    if (edge === undefined) throw new Error('missing route');
    const points = parsePoints(edge.path);
    expect(points[0]?.y).toBeCloseTo(
      parent.y + parent.height + GEOMETRY.trunkGap,
      5,
    );
    expect((points[0]?.y ?? 0) - (parent.y + parent.height)).toBe(GEOMETRY.trunkGap);
    expect(GEOMETRY.trunkGap).toBeGreaterThan(0);
  });

  it('shares one left trunk and enters every callout row from the left', () => {
    const group = routeBelowStackGroup({
      parentId: 'p',
      parent,
      children: [
        { id: 'first', rect: callout },
        { id: 'second', rect: second },
      ],
    });
    expect(group.edges).toHaveLength(2);
    expect(group.trunks).toHaveLength(1);
    const trunk = group.trunks[0];
    if (trunk === undefined) throw new Error('missing trunk');
    expect(trunk.kind).toBe('trunk');
    expect(trunk.start.y).toBeCloseTo(parent.y + parent.height + GEOMETRY.trunkGap, 5);
    expect(trunk.end.y).toBeCloseTo(second.y + second.height / 2, 5);
    expect(trunk.start.x).toBeCloseTo(parent.x + GEOMETRY.trunkInset, 5);
    expect(trunk.start.x).toBeGreaterThan(parent.x);
    expect(trunk.start.x).toBeLessThan(callout.x);
    expect(trunk.end.x).toBe(trunk.start.x);
    for (const edge of group.edges) {
      expect(edge.arrow.direction).toBe('right');
      expect(edge.placement).toBe('below');
      const points = parsePoints(edge.path);
      expect(points[0]?.x).toBeCloseTo(trunk.start.x, 5);
      expect(points[0]?.y).toBeCloseTo(edge.end.y, 5);
      expect(lastSegment(points).horizontal).toBe(true);
      expect(lastSegment(points).length).toBeGreaterThanOrEqual(GEOMETRY.stemMin);
      // The trunk stays inside the parent and left of every row card: no
      // vertical line through a card.
      expect(points.every((point) => point.x <= callout.x + 0.5)).toBe(true);
    }
  });

  it('keeps callouts before wrapped direct children in one trunk', () => {
    const directBelow: Rect = { x: 28, y: 380, width: 280, height: 80 };
    const group = routeBelowStackGroup({
      parentId: 'p',
      parent,
      children: [
        { id: 'callout', rect: callout },
        { id: 'wrapped-direct', rect: directBelow },
      ],
    });
    expect(group.edges.map((edge) => edge.id)).toEqual(['callout', 'wrapped-direct']);
    expect(group.trunks).toHaveLength(1);
    const trunk = group.trunks[0];
    if (trunk === undefined) throw new Error('missing trunk');
    expect(trunk.start.x).toBeCloseTo(parent.x + GEOMETRY.trunkInset, 5);
    expect(trunk.start.x).toBeGreaterThan(parent.x);
    expect(trunk.start.x).toBeLessThan(Math.min(callout.x, directBelow.x));
    for (const edge of group.edges) {
      expect(edge.arrow.direction).toBe('right');
      expect(lastSegment(parsePoints(edge.path)).length).toBeGreaterThanOrEqual(
        GEOMETRY.stemMin,
      );
    }
  });

  it('gives a minimum-indented below row a full stem from the in-card trunk', () => {
    const indented: Rect = { x: GEOMETRY.rowIndent, y: 220, width: 160, height: 80 };
    const group = routeBelowStackGroup({
      parentId: 'p',
      parent,
      children: [{ id: 'indented', rect: indented }],
    });
    const edge = group.edges[0];
    if (edge === undefined) throw new Error('missing route');
    expect(edge.defect).toBe(false);
    expect(edge.arrow.direction).toBe('right');
    const start = parsePoints(edge.path)[0];
    expect(start?.x).toBeCloseTo(parent.x + GEOMETRY.trunkInset, 5);
    expect(edge.end.x - (start?.x ?? 0)).toBeGreaterThanOrEqual(GEOMETRY.stemMin);
    expect(parsePoints(edge.path).every((point) => point.x <= indented.x - GEOMETRY.edgeGap + 0.5)).toBe(
      true,
    );
  });

  it('flags a row closer than the stem minimum without moving the trunk outside the parent', () => {
    const tooClose: Rect = { x: 10, y: 220, width: 160, height: 80 };
    const group = routeBelowStackGroup({
      parentId: 'p',
      parent,
      children: [{ id: 'too-close', rect: tooClose }],
    });
    const edge = group.edges[0];
    if (edge === undefined) throw new Error('missing route');
    expect(edge.defect).toBe(true);
    expect(edge.arrow.direction).toBe('right');
    const start = parsePoints(edge.path)[0];
    expect(start?.x).toBeCloseTo(parent.x + GEOMETRY.trunkInset, 5);
    expect(start?.x).toBeGreaterThan(parent.x);
  });

  it('routes a below group made only of wrapped direct children', () => {
    const first = { id: 'd1', rect: { x: GEOMETRY.rowIndent, y: 200, width: 280, height: 80 } };
    const second = { id: 'd2', rect: { x: GEOMETRY.rowIndent, y: 300, width: 280, height: 80 } };
    const group = routeBelowStackGroup({
      parentId: 'p',
      parent,
      children: [first, second],
    });
    expect(group.edges.map((edge) => edge.id)).toEqual(['d1', 'd2']);
    expect(group.trunks).toHaveLength(1);
    const trunk = group.trunks[0];
    if (trunk === undefined) throw new Error('missing trunk');
    expect(trunk.start.x).toBeCloseTo(parent.x + GEOMETRY.trunkInset, 5);
    expect(trunk.start.y).toBeCloseTo(
      parent.y + parent.height + GEOMETRY.trunkGap,
      5,
    );
    expect(trunk.start.x).toBeGreaterThan(parent.x);
    expect(group.edges.every((edge) => edge.arrow.direction === 'right')).toBe(true);
    expect(group.edges.every((edge) => edge.placement === 'below')).toBe(true);
  });

  it('routes a capped far-right callout from the shared trunk with a full stem', () => {
    // Safe-zone cap: callout starts at parent.left + 160 and is 240 px wide,
    // ending 16 px before the right group at 416.
    const capped: Rect = { x: parent.x + GEOMETRY.callout.maxAnchorOffset, y: 220, width: 240, height: 80 };
    const wrapped: Rect = { x: GEOMETRY.rowIndent, y: 320, width: 280, height: 80 };
    const group = routeBelowStackGroup({
      parentId: 'p',
      parent,
      children: [
        { id: 'capped-callout', rect: capped },
        { id: 'wrapped-direct', rect: wrapped },
      ],
    });
    expect(group.edges.map((edge) => edge.id)).toEqual(['capped-callout', 'wrapped-direct']);
    expect(group.trunks).toHaveLength(1);
    const trunk = group.trunks[0];
    if (trunk === undefined) throw new Error('missing trunk');
    expect(trunk.start.x).toBeCloseTo(parent.x + GEOMETRY.trunkInset, 5);
    expect(capped.x + capped.width).toBeLessThanOrEqual(416 - GEOMETRY.callout.safeGap);
    for (const edge of group.edges) {
      expect(edge.arrow.direction).toBe('right');
      expect(lastSegment(parsePoints(edge.path)).horizontal).toBe(true);
      expect(lastSegment(parsePoints(edge.path)).length).toBeGreaterThanOrEqual(GEOMETRY.stemMin);
      expect(parsePoints(edge.path).every((point) => point.x <= edge.end.x + 0.5)).toBe(true);
    }
    const cappedEdge = group.edges[0];
    expect(cappedEdge?.end.x).toBeCloseTo(capped.x - GEOMETRY.edgeGap, 5);
  });

  it('sorts rows by their measured Y but keeps every arm at its own row center', () => {
    const high = { id: 'high', rect: { x: 36, y: 300, width: 220, height: 80 } };
    const low = { id: 'low', rect: { x: 36, y: 200, width: 220, height: 80 } };
    const group = routeBelowStackGroup({
      parentId: 'p',
      parent,
      children: [high, low],
    });
    expect(group.edges.map((edge) => edge.id)).toEqual(['low', 'high']);
    for (const edge of group.edges) {
      const target = edge.id === 'low' ? low.rect : high.rect;
      expect(edge.end.y).toBeCloseTo(target.y + target.height / 2, 5);
      expect(edge.arrow.direction).toBe('right');
    }
    expect(group.trunks).toHaveLength(1);
  });

  it('keeps the trunk inside the parent even when a row starts unusually far left', () => {
    const narrow: Rect = { x: 4, y: 220, width: 144, height: 80 };
    const group = routeBelowStackGroup({
      parentId: 'p',
      parent,
      children: [{ id: 'narrow', rect: narrow }],
    });
    const edge = group.edges[0];
    if (edge === undefined) throw new Error('missing route');
    const start = parsePoints(edge.path)[0];
    expect(start?.x).toBeCloseTo(parent.x + GEOMETRY.trunkInset, 5);
    expect(start?.x).toBeGreaterThan(parent.x);
    expect(edge.defect).toBe(true);
  });

  it('flags a below row that starts above the parent bottom instead of hiding it', () => {
    const above: Rect = { x: 36, y: 60, width: 160, height: 80 };
    const group = routeBelowStackGroup({
      parentId: 'p',
      parent,
      children: [{ id: 'above', rect: above }],
    });
    expect(group.edges[0]?.defect).toBe(true);
  });
});

describe('edge routing — placement groups and defects', () => {
  it('routes mixed right and below children with a V4 right trunk and one below trunk', () => {
    const mixed = [
      { id: 'right-1', rect: rightChild },
      { id: 'right-2', rect: { x: 416, y: 150, width: 240, height: 80 } },
      { id: 'below-1', rect: belowChild },
      { id: 'below-2', rect: { x: 36, y: 300, width: 280, height: 80 } },
    ];
    const group = routeChildGroup({ parentId: 'p', parent, children: mixed });
    expect(group.edges).toHaveLength(4);
    const placements = group.edges.map((edge) => edge.placement).sort();
    expect(placements).toEqual(['below', 'below', 'right', 'right']);
    expect(group.trunks.filter((item) => item.placement === 'right')).toHaveLength(1);
    expect(group.trunks.filter((item) => item.placement === 'below')).toHaveLength(1);
    const below = group.edges.find((edge) => edge.placement === 'below');
    if (below === undefined) throw new Error('missing below route');
    expect(below.arrow.direction).toBe('right');
    expect(lastSegment(parsePoints(below.path)).horizontal).toBe(true);
  });

  it('flags overlapping cards instead of hiding a layout defect', () => {
    const overlap: Rect = { x: 100, y: 40, width: 200, height: 100 };
    const edge = routeBranchEdge({ id: 'defect', parent, child: overlap });
    expect(edge.defect).toBe(true);
    expect(edge.placement).toBe('below');
    expect(edge.arrow.direction).toBe('right');
  });

  it('renders rounded orthogonal paths only', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 80, y: 40 },
    ];
    const path = roundedPath(points, GEOMETRY.edgeRadius);
    expect(path).toContain('Q');
    expect(path.match(/[A-Za-z]/g)?.every((letter) => ['M', 'L', 'Q'].includes(letter))).toBe(true);
    // Near-right angle: each corner is cut by at most the 2 px radius.
    for (const distance of cornerOffsets(path)) {
      expect(distance).toBeLessThanOrEqual(GEOMETRY.edgeRadius + 0.01);
    }
    expect(GEOMETRY.edgeRadius).toBeLessThanOrEqual(3);
  });

  it('keeps a sharp 12 px stem on the minimum-indented below elbow', () => {
    const indented: Rect = { x: GEOMETRY.rowIndent, y: 220, width: 160, height: 80 };
    const group = routeBelowStackGroup({
      parentId: 'p',
      parent,
      children: [{ id: 'indented', rect: indented }],
    });
    const edge = group.edges[0];
    if (edge === undefined) throw new Error('missing route');
    const points = parsePoints(edge.path);
    expect(lastSegment(points).length).toBeGreaterThanOrEqual(GEOMETRY.stemMin);
    // No Q on the minimum stem: rounding would eat into the arrow clearance.
    const path = edge.path;
    expect(path.includes('Q')).toBe(false);
    expect(edge.placement).toBe('below');
  });

  it('rounds a below elbow only with the stem left after the 12 px reserve', () => {
    const roomy: Rect = { x: 60, y: 220, width: 160, height: 80 };
    const group = routeBelowStackGroup({
      parentId: 'p',
      parent,
      children: [{ id: 'roomy', rect: roomy }],
    });
    const edge = group.edges[0];
    if (edge === undefined) throw new Error('missing route');
    expect(edge.path).toContain('Q');
    expect(lastSegment(parsePoints(edge.path)).length).toBeGreaterThanOrEqual(GEOMETRY.stemMin);
    for (const distance of cornerOffsets(edge.path)) {
      expect(distance).toBeLessThanOrEqual(GEOMETRY.edgeRadius + 0.01);
    }
  });
});
