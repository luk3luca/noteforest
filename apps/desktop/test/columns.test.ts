import { describe, expect, it } from 'vitest';
import {
  clampColumnWidth,
  columnLayout,
  columnX,
  computeColumnWidths,
  contentWidth,
  fitsViewport,
  groupLeft,
  groupOffset,
} from '../src/renderer/src/lib/columns';
import { GEOMETRY } from '../src/renderer/src/lib/geometry';

const GAP = GEOMETRY.columnGap;

/** Editor viewport at a 1440 px window with the default 264 px sidebar. */
const viewport1440 = 1440 - 264 - 1;
/** Editor viewport at a 1024 px window with the default 264 px sidebar. */
const viewport1024 = 1024 - 264 - 1;

describe('depth columns', () => {
  it('gives every block at the same depth the same x, even under different parents', () => {
    const widths = computeColumnWidths([
      { depth: 0, width: 300 },
      { depth: 0, width: 420 },
      { depth: 1, width: 260 }, // child of parent A
      { depth: 1, width: 180 }, // child of parent B
      { depth: 2, width: 144 }, // grandchild of A
      { depth: 2, width: 210 }, // grandchild of B
    ]);
    expect(widths).toEqual([420, 260, 210]);
    const layout = columnLayout(widths, GAP);
    expect(layout.map((column) => column.x)).toEqual([0, 436, 712]);
    // Two different parents at depth 0, with different card widths, both align
    // their child groups to the same depth-1 origin.
    expect(groupLeft(widths, 0, 300, GAP)).toBe(436);
    expect(groupLeft(widths, 0, 180, GAP)).toBe(436);
    // Deeper groups align too.
    expect(groupLeft(widths, 1, 260, GAP)).toBe(712);
    expect(groupLeft(widths, 1, 120, GAP)).toBe(712);
  });

  it('takes the column width from the widest measured card, clamped', () => {
    expect(computeColumnWidths([{ depth: 1, width: 200 }, { depth: 1, width: 320 }])).toEqual([
      GEOMETRY.topLevelMinWidth,
      320,
    ]);
    expect(clampColumnWidth(0, 900)).toBe(GEOMETRY.topLevelMaxWidth);
    expect(clampColumnWidth(0, 20)).toBe(GEOMETRY.topLevelMinWidth);
    expect(clampColumnWidth(1, 900)).toBe(GEOMETRY.childMaxWidth);
    expect(clampColumnWidth(1, 20)).toBe(GEOMETRY.childMinWidth);
  });

  it('never lets an empty block stretch its column', () => {
    const widths = computeColumnWidths([
      { depth: 0, width: 400, empty: true },
      { depth: 0, width: 180 },
      { depth: 1, width: 380, empty: true },
    ]);
    expect(widths).toEqual([180, GEOMETRY.childMinWidth]);
    // With only empty cards the column is the minimum.
    expect(computeColumnWidths([{ depth: 1, width: 400, empty: true }])).toEqual([
      GEOMETRY.topLevelMinWidth,
      GEOMETRY.childMinWidth,
    ]);
  });

  it('fits the 4-level empty chain at 1440 without horizontal overflow', () => {
    const widths = [
      GEOMETRY.topLevelMinWidth,
      GEOMETRY.childMinWidth,
      GEOMETRY.childMinWidth,
      GEOMETRY.childMinWidth,
    ];
    expect(contentWidth(widths, GAP)).toBe(160 + 144 * 3 + GAP * 3);
    expect(fitsViewport(widths, viewport1440, GAP, GEOMETRY.editorPaddingX)).toBe(true);
    // …and still fits at the 1024 window used by the second screenshot gate.
    expect(fitsViewport(widths, viewport1024, GAP, 28)).toBe(true);
  });

  it('overflows so the editor must scroll horizontally when columns exceed it', () => {
    const emptySix = [
      GEOMETRY.topLevelMinWidth,
      ...Array.from({ length: 5 }, () => GEOMETRY.childMinWidth),
    ];
    // Six empty levels fit a 1440 window by construction; at 1024 they do not.
    expect(fitsViewport(emptySix, viewport1440, GAP, GEOMETRY.editorPaddingX)).toBe(true);
    expect(fitsViewport(emptySix, viewport1024, GAP, 28)).toBe(false);
    // Six levels with readable content overflow at 1440 as well.
    const filledSix = [
      GEOMETRY.topLevelMaxWidth,
      ...Array.from({ length: 5 }, () => GEOMETRY.childMaxWidth),
    ];
    expect(fitsViewport(filledSix, viewport1440, GAP, GEOMETRY.editorPaddingX)).toBe(false);
    // A seventh empty level is the first empty chain that overflows at 1440.
    const emptySeven = [
      GEOMETRY.topLevelMinWidth,
      ...Array.from({ length: 6 }, () => GEOMETRY.childMinWidth),
    ];
    expect(fitsViewport(emptySeven, viewport1440, GAP, GEOMETRY.editorPaddingX)).toBe(false);
    // Column origins stay deterministic and ordered.
    const origins = emptySix.map((_value, depth) => columnX(emptySix, depth, GAP));
    expect(origins).toEqual([0, 176, 336, 496, 656, 816]);
  });

  it('resets columns per chapter', () => {
    const chapterA = computeColumnWidths([
      { depth: 0, width: 460 },
      { depth: 1, width: 300 },
    ]);
    const chapterB = computeColumnWidths([
      { depth: 0, width: 160 },
      { depth: 1, width: 144 },
    ]);
    expect(chapterA).toEqual([460, 300]);
    expect(chapterB).toEqual([160, 144]);
    expect(columnX(chapterA, 0, GAP)).toBe(0);
    expect(columnX(chapterB, 0, GAP)).toBe(0);
    expect(columnX(chapterB, 1, GAP)).toBe(176);
  });

  it('computes the group offset that aligns a narrow card to its column', () => {
    expect(groupOffset(420, 420, GAP)).toBe(GAP);
    expect(groupOffset(300, 420, GAP)).toBe(GAP + 120);
    // A stale column narrower than the card never produces a negative gap.
    expect(groupOffset(420, 300, GAP)).toBe(GAP);
  });
});
