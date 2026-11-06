import { describe, expect, it } from 'vitest';
import {
  GEOMETRY,
  calloutLaneWidth,
  classifyPlacement,
  distributePorts,
  fitsToRight,
  intersects,
  lanePush,
  rightGroupStart,
  type Rect,
} from '../src/renderer/src/lib/geometry';

const parent: Rect = { x: 100, y: 100, width: 400, height: 120 };
const rightChild: Rect = { x: 540, y: 100, width: 240, height: 100 };
const belowChild: Rect = { x: 118, y: 260, width: 300, height: 100 };

describe('geometry', () => {
  it('classifies a child to the right of its parent', () => {
    expect(classifyPlacement(parent, rightChild)).toBe('right');
    expect(fitsToRight(parent, rightChild)).toBe(true);
  });

  it('classifies a child below its parent', () => {
    expect(classifyPlacement(parent, belowChild)).toBe('below');
    expect(fitsToRight(parent, belowChild)).toBe(false);
  });

  it('flags overlapping rectangles as a layout defect', () => {
    const overlap: Rect = { x: 200, y: 150, width: 200, height: 80 };
    expect(intersects(parent, overlap)).toBe(true);
    expect(classifyPlacement(parent, overlap)).toBe('overlap');
  });

  it('distributes ordered ports inside the parent edge', () => {
    const ports = distributePorts(3, 100, 120);
    expect(ports).toHaveLength(3);
    expect(ports[0]).toBeLessThan(ports[1] ?? 0);
    expect(ports[1]).toBeLessThan(ports[2] ?? 0);
    expect(ports[0]).toBeGreaterThan(100);
    expect(ports[2]).toBeLessThan(220);
  });

  it('keeps the parent-relative layout tokens stable', () => {
    expect(GEOMETRY.topLevelMaxWidth).toBe(480);
    expect(GEOMETRY.topLevelMinWidth).toBe(160);
    expect(GEOMETRY.childMinWidth).toBe(144);
    expect(GEOMETRY.childMaxWidth).toBe(420);
    expect(GEOMETRY.childGap).toBe(16);
    expect(GEOMETRY.siblingGap).toBe(16);
    expect(GEOMETRY.canvasMaxWidth).toBe(1600);
    expect(GEOMETRY.wrapIndent).toBe(18);
    expect(GEOMETRY.stemMin).toBe(12);
    expect(GEOMETRY.edgeArrowLength).toBe(6);
    expect(GEOMETRY.edgeArrowHalfWidth).toBe(3);
    expect(GEOMETRY.edgeGap).toBe(2);
    expect(GEOMETRY.rowIndent).toBe(26);
    expect(GEOMETRY.trunkInset).toBe(12);
    expect(GEOMETRY.calloutGap).toBe(16);
    expect(GEOMETRY.calloutMinWidth).toBe(240);
    expect(GEOMETRY.calloutMaxWidth).toBe(480);
    expect(GEOMETRY.edgeRadius).toBe(2);
  });

  it('gives a narrow parent a bounded independent callout lane', () => {
    // A 160 px parent yields the 240 px lane floor, not a 160 px lane.
    expect(calloutLaneWidth(160)).toBe(240);
    expect(calloutLaneWidth(320)).toBe(320);
    // A wide parent/long callout is capped at the lane maximum.
    expect(calloutLaneWidth(640)).toBe(480);
    // A measured natural width only raises the lane.
    expect(calloutLaneWidth(160, 300)).toBe(300);
    expect(calloutLaneWidth(400, 200)).toBe(400);
    expect(calloutLaneWidth(160, 900)).toBe(480);
    expect(calloutLaneWidth(0)).toBe(240);
    expect(calloutLaneWidth(Number.NaN)).toBe(240);
  });

  it('pushes the right group only by the lane excess past the parent', () => {
    const narrow = { x: 100, width: 160 };
    // Lane floor: 240 right edge vs 260 parent right edge -> 80 px excess.
    expect(lanePush(narrow, 240)).toBe(80);
    expect(rightGroupStart(narrow, 240)).toBe(100 + 240 + GEOMETRY.siblingGap);
    // A lane no wider than the parent changes nothing.
    expect(lanePush(narrow, 160)).toBe(0);
    expect(rightGroupStart(narrow, 160)).toBe(260 + GEOMETRY.siblingGap);
    // No callout lane keeps the plain parent-relative rule.
    expect(rightGroupStart(narrow, undefined)).toBe(260 + GEOMETRY.siblingGap);
  });
});
