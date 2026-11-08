import { describe, expect, it } from 'vitest';
import {
  GEOMETRY,
  calloutLaneWidth,
  calloutNeedsWrap,
  calloutRightGroupX,
  calloutSafeRight,
  calloutSafeZoneWidth,
  classifyPlacement,
  distributePorts,
  fitsToRight,
  intersects,
  lanePush,
  placeCallout,
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
    expect(GEOMETRY.childGap).toBe(24);
    expect(GEOMETRY.siblingGap).toBe(24);
    expect(GEOMETRY.canvasMaxWidth).toBe(3200);
    expect(GEOMETRY.editorPaddingX).toBe(40);
    expect(GEOMETRY.editorPaddingTop).toBe(40);
    expect(GEOMETRY.editorPaddingBottom).toBe(88);
    expect(GEOMETRY.editorPaddingXMedium).toBe(32);
    expect(GEOMETRY.editorPaddingTopMedium).toBe(32);
    expect(GEOMETRY.editorPaddingBottomMedium).toBe(72);
    expect(GEOMETRY.editorPaddingXCompact).toBe(28);
    expect(GEOMETRY.editorPaddingTopCompact).toBe(28);
    expect(GEOMETRY.editorPaddingBottomCompact).toBe(64);
    expect(GEOMETRY.childRowGap).toBe(16);
    expect(GEOMETRY.chapterGap).toBe(28);
    expect(GEOMETRY.cardPadding).toBe(10);
    expect(GEOMETRY.cardRadius).toBe(4);
    expect(GEOMETRY.edgeWidth).toBe(1.25);
    expect(GEOMETRY.edgeWidthActive).toBe(1.75);
    expect(GEOMETRY.edgeWidthMuted).toBe(1);
    expect(GEOMETRY.zIndex).toEqual({ edge: 0, rightGroup: 0, calloutLane: 1, parentCard: 2 });
    expect(GEOMETRY.wrapIndent).toBe(18);
    expect(GEOMETRY.stemMin).toBe(12);
    expect(GEOMETRY.edgeArrowLength).toBe(6);
    expect(GEOMETRY.edgeArrowHalfWidth).toBe(3);
    expect(GEOMETRY.edgeGap).toBe(2);
    expect(GEOMETRY.rowIndent).toBe(26);
    expect(GEOMETRY.trunkInset).toBe(12);
    expect(GEOMETRY.trunkGap).toBe(8);
    expect(GEOMETRY.calloutGap).toBe(16);
    expect(GEOMETRY.calloutMinWidth).toBe(240);
    expect(GEOMETRY.calloutMaxWidth).toBe(480);
    expect(GEOMETRY.callout.maxAnchorOffset).toBe(160);
    expect(GEOMETRY.callout.safeGap).toBe(16);
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

describe('callout safe zone (M3g3)', () => {
  const wide: Rect = { x: 100, y: 100, width: 400, height: 120 };
  const narrow: Rect = { x: 0, y: 0, width: 160, height: 100 };
  const threshold: Rect = { x: 0, y: 0, width: 266, height: 100 };
  const justUnder: Rect = { x: 0, y: 0, width: 265, height: 100 };

  it('derives the right-group trunk and the callout safe right from the lane', () => {
    expect(calloutRightGroupX(wide, 400)).toBe(500 + GEOMETRY.siblingGap);
    expect(calloutSafeRight(wide, 400)).toBe(500);
    expect(calloutSafeZoneWidth(wide, 400)).toBe(500 - (100 + GEOMETRY.rowIndent));
    // A narrow parent's lane floor still derives the group from the lane right.
    expect(calloutSafeRight(narrow, 240)).toBe(240);
    expect(calloutSafeZoneWidth(narrow, 240)).toBe(214);
  });

  it('wraps direct children only when the safe zone cannot fit 240 px', () => {
    // 266 px lane minus the 26 px row indent is exactly the callout minimum.
    expect(calloutSafeZoneWidth(threshold, 266)).toBe(GEOMETRY.calloutMinWidth);
    expect(calloutNeedsWrap(threshold, 266)).toBe(false);
    expect(calloutSafeZoneWidth(justUnder, 265)).toBe(239);
    expect(calloutNeedsWrap(justUnder, 265)).toBe(true);
    expect(calloutNeedsWrap(narrow, 240)).toBe(true);
    expect(calloutNeedsWrap(wide, 400)).toBe(false);
  });

  it('caps a far-right anchor at 160 px and stops 16 px before the group', () => {
    const placement = placeCallout(wide, 400, 390);
    expect(placement.clamped).toBe(true);
    expect(placement.left - wide.x).toBe(GEOMETRY.callout.maxAnchorOffset);
    expect(placement.left).toBe(260);
    expect(placement.safeRight).toBe(500);
    expect(placement.left + placement.width).toBe(placement.safeRight);
    expect(placement.left + placement.width).toBe(calloutSafeRight(wide, 400));
    expect(
      placement.left + placement.width,
    ).toBeLessThanOrEqual(calloutRightGroupX(wide, 400) - GEOMETRY.callout.safeGap);
    expect(placement.width).toBe(GEOMETRY.calloutMinWidth);
  });

  it('keeps a mid-block anchor aligned while it fits inside the safe zone', () => {
    const placement = placeCallout(wide, 400, 100);
    expect(placement.clamped).toBe(false);
    expect(placement.left).toBe(100 + 100 + GEOMETRY.calloutGap);
    expect(placement.left + placement.width).toBeLessThanOrEqual(placement.safeRight);
    expect(placement.width).toBeGreaterThanOrEqual(GEOMETRY.calloutMinWidth);
  });

  it('falls back to the shared row origin at the 240 px lane floor', () => {
    const placement = placeCallout(narrow, 240, 140);
    expect(placement.clamped).toBe(true);
    expect(placement.left).toBe(GEOMETRY.rowIndent);
    expect(placement.left + placement.width).toBe(240);
    expect(placement.width).toBe(240 - GEOMETRY.rowIndent);
  });

  it('keeps a 240 px callout when the lane has exactly enough safe width', () => {
    const placement = placeCallout(threshold, 266, 250);
    expect(placement.clamped).toBe(true);
    expect(placement.left).toBe(GEOMETRY.rowIndent);
    expect(placement.left + placement.width).toBe(266);
    expect(placement.width).toBe(GEOMETRY.calloutMinWidth);
  });
});
