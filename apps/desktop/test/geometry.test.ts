import { describe, expect, it } from 'vitest';
import {
  GEOMETRY,
  classifyPlacement,
  distributePorts,
  fitsToRight,
  intersects,
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

  it('keeps the M2d depth-column tokens stable', () => {
    expect(GEOMETRY.topLevelMaxWidth).toBe(480);
    expect(GEOMETRY.topLevelMinWidth).toBe(160);
    expect(GEOMETRY.childMinWidth).toBe(144);
    expect(GEOMETRY.childMaxWidth).toBe(420);
    expect(GEOMETRY.columnGap).toBe(16);
    expect(GEOMETRY.canvasMaxWidth).toBe(1600);
    expect(GEOMETRY.wrapIndent).toBe(18);
  });
});
