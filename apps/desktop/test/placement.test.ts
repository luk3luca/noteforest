import { describe, expect, it } from 'vitest';
import {
  childGroupStart,
  contentBounds,
  fitZoom,
} from '../src/renderer/src/lib/placement';
import { GEOMETRY, type Rect } from '../src/renderer/src/lib/geometry';
import { planDirectChildPlacement } from '../src/renderer/src/lib/child-placement';

/** Editor viewport at a 1440 px window with the default 264 px sidebar. */
const viewport1440 = 1440 - 264 - 1;
/** Editor viewport at a 1024 px window with the default 264 px sidebar. */
const viewport1024 = 1024 - 264 - 1;

const emptyWidths = [
  GEOMETRY.topLevelMinWidth,
  GEOMETRY.childMinWidth,
  GEOMETRY.childMinWidth,
  GEOMETRY.childMinWidth,
];

/**
 * Build one empty chain by repeatedly applying the parent-relative rule. This
 * is the same calculation the CSS flow performs: the next card starts at the
 * previous card's right edge plus the gap.
 */
function emptyChain(depths: number): { rects: Rect[]; xs: number[] } {
  const rects: Rect[] = [];
  const xs: number[] = [];
  let x = 0;
  for (let depth = 0; depth < depths; depth += 1) {
    const width = depth === 0 ? GEOMETRY.topLevelMinWidth : GEOMETRY.childMinWidth;
    xs.push(x);
    rects.push({ x, y: depth * 100, width, height: 44 });
    x = childGroupStart({ x, width });
  }
  return { rects, xs };
}

describe('parent-relative placement', () => {
  it('starts a child group after its parent card plus the gap', () => {
    expect(childGroupStart({ x: 40, width: 300 })).toBe(40 + 300 + GEOMETRY.childGap);
    expect(childGroupStart({ x: 0, width: GEOMETRY.topLevelMinWidth })).toBe(176);
    expect(childGroupStart({ x: 336, width: GEOMETRY.childMinWidth })).toBe(496);
  });

  it('lets different parents place their children at different x', () => {
    const parentA = { x: 0, width: 300 };
    const parentB = { x: 0, width: 420 };
    const childAX = childGroupStart(parentA);
    const childBX = childGroupStart(parentB);
    expect(childAX).toBe(316);
    expect(childBX).toBe(436);
    expect(childAX).not.toBe(childBX);
    // Each child is still exactly one gap after its own parent, not a shared
    // depth column.
    expect(childAX - (parentA.x + parentA.width)).toBe(GEOMETRY.childGap);
    expect(childBX - (parentB.x + parentB.width)).toBe(GEOMETRY.childGap);
  });

  it('fits the 4-level empty chain at 1440 without horizontal overflow', () => {
    const chain = emptyChain(4);
    expect(chain.xs).toEqual([0, 176, 336, 496]);
    const bounds = contentBounds(chain.rects);
    expect(bounds?.width).toBe(640);
    expect((bounds?.width ?? 0) + GEOMETRY.editorPaddingX * 2).toBeLessThanOrEqual(viewport1440);
    expect(fitZoom(viewport1440, bounds?.width ?? 0)).toBe(1.5);
    // The chain still fits at the 1024 screenshot width.
    expect((bounds?.width ?? 0) + 28 * 2).toBeLessThanOrEqual(viewport1024);
  });

  it('overflows and needs horizontal scroll when the chain is deeper', () => {
    const chain = emptyChain(8);
    const bounds = contentBounds(chain.rects);
    expect(bounds?.width).toBe(1280);
    expect((bounds?.width ?? 0) + GEOMETRY.editorPaddingX * 2).toBeGreaterThan(viewport1440);
    const zoom = fitZoom(viewport1440, bounds?.width ?? 0);
    expect(zoom).toBeLessThan(1);
    expect(zoom).toBeGreaterThanOrEqual(0.5);
  });

  it('measures only the visible cards passed to contentBounds', () => {
    const visible: Rect[] = [
      { x: 0, y: 0, width: 160, height: 44 },
      { x: 176, y: 0, width: 144, height: 44 },
    ];
    expect(contentBounds(visible)?.width).toBe(320);
    expect(contentBounds([])).toBeNull();
    // Hidden cards are display:none and excluded by the caller.
    const bounds = contentBounds([
      ...visible,
      { x: 900, y: 0, width: 0, height: 44 },
    ]);
    expect(bounds?.width).toBe(320);
  });

  it('clamps Fit width zoom and ignores invalid sizes', () => {
    expect(fitZoom(1175, 640)).toBe(1.5);
    expect(fitZoom(1175, 1280)).toBeCloseTo(0.86, 2);
    expect(fitZoom(1175, 4000)).toBe(0.5);
    expect(fitZoom(0, 640)).toBe(1);
    expect(fitZoom(1175, 0)).toBe(1);
  });
});

describe('direct-child right/below placement', () => {
  const parent: Rect = { x: 0, y: 0, width: 400, height: 100 };
  const columnLeft = 416;

  function candidate(id: string, width: number, x = columnLeft, y = 0): { id: string; rect: Rect } {
    return { id, rect: { x, y, width, height: 60 } };
  }

  it('keeps a lone direct child right: the editor scrolls the chain', () => {
    const plan = planDirectChildPlacement({
      parent,
      children: [candidate('only', 420)],
      availableWidth: 500,
    });
    expect(plan).toEqual({ right: ['only'], below: [] });
  });

  it('places every direct child right when the whole group fits', () => {
    const plan = planDirectChildPlacement({
      parent,
      children: [candidate('a', 144), candidate('b', 240), candidate('c', 180)],
      availableWidth: 1078,
    });
    expect(plan).toEqual({ right: ['a', 'b', 'c'], below: [] });
  });

  it('wraps only the direct children that do not fit, in branch order', () => {
    const plan = planDirectChildPlacement({
      parent,
      children: [candidate('short', 144), candidate('wide', 320), candidate('medium', 300)],
      availableWidth: 700,
    });
    // available = 700 - 416 = 284: 144 fits; 320 and 300 do not.
    expect(plan).toEqual({ right: ['short'], below: ['wide', 'medium'] });
  });

  it('wraps every direct child when the right column is narrower than the minimum', () => {
    const plan = planDirectChildPlacement({
      parent,
      children: [candidate('a', GEOMETRY.childMinWidth), candidate('b', GEOMETRY.childMinWidth)],
      availableWidth: 500,
    });
    expect(plan).toEqual({ right: [], below: ['a', 'b'] });
  });

  it('uses the cached natural width while a child is already below', () => {
    const plan = planDirectChildPlacement({
      parent,
      children: [
        { ...candidate('cached', 80), naturalWidth: 320 },
        candidate('small', 144),
      ],
      availableWidth: 700,
    });
    expect(plan.below).toEqual(['cached']);
    expect(plan.right).toEqual(['small']);
  });

  it('handles the exact fit boundary and empty groups deterministically', () => {
    const exact = planDirectChildPlacement({
      parent,
      children: [candidate('exact', 284), candidate('a', 144)],
      availableWidth: 700,
    });
    expect(exact.right).toEqual(['exact', 'a']);
    expect(planDirectChildPlacement({ parent, children: [], availableWidth: 0 })).toEqual({
      right: [],
      below: [],
    });
  });
});
