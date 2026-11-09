import { describe, expect, it } from 'vitest';
import {
  createEstimatedMeasurement,
  effectivePageTheme,
  layoutDocument,
  normalizePageSettings,
  pageLayoutOptions,
  type ContentBlock,
  type NoteDocument,
  type PageSetup,
} from '../src/index.js';

/**
 * M4e2 Page density topology probe.
 *
 * Page callout topology (A / B2 / stacked) is geometric: it uses the placed
 * parent width, the free right lane, and the mode-A minimum width. Density
 * scales the parent card and the box metrics, so on some documents density can
 * flip one parent from A to B2. The product-owner decision (9 November 2026)
 * accepts that adaptive behavior; this test records it instead of freezing the
 * modes, and it proves the post-flip B2 groups still use the two R2j trunks.
 */

const A4_PORTRAIT: PageSetup = {
  size: 'A4',
  orientation: 'portrait',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
};

const ROOT_TEXT =
  'A root card deliberately wider than the largest page card cap so the free right lane shrinks as density grows and the callout mode is forced to react to the placed width instead of a fixed column.';

function textBlock(id: string, text: string): ContentBlock {
  return {
    id,
    content: {
      type: 'doc',
      children: [{ type: 'paragraph', children: [{ type: 'text', text }] }],
    },
  };
}

function anchoredRoot(): ContentBlock {
  const first = ROOT_TEXT.indexOf('deliberately');
  const second = ROOT_TEXT.indexOf('callout mode');
  const before = ROOT_TEXT.slice(0, first);
  const middle = ROOT_TEXT.slice(first + 'deliberately'.length, second);
  const after = ROOT_TEXT.slice(second + 'callout mode'.length);
  return {
    id: 'root',
    content: {
      type: 'doc',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: before },
            { type: 'text', text: 'deliberately', marks: [{ type: 'anchor', attrs: { anchorId: 'a1' } }] },
            { type: 'text', text: middle },
            { type: 'text', text: 'callout mode', marks: [{ type: 'anchor', attrs: { anchorId: 'a2' } }] },
            { type: 'text', text: after },
          ],
        },
      ],
    },
  };
}

function densityDocument(): NoteDocument {
  return {
    schemaVersion: 2,
    id: 'm4e2-density-topology',
    title: 'Density topology',
    blocks: {
      root: anchoredRoot(),
      c1: textBlock('c1', 'A short anchored callout.'),
      c2: textBlock('c2', 'A second anchored callout.'),
      k1: textBlock('k1', 'A direct child with a readable width.'),
      k2: textBlock('k2', 'A second direct child.'),
    },
    anchors: {
      a1: { id: 'a1', blockId: 'root', kind: 'text', quote: 'deliberately' },
      a2: { id: 'a2', blockId: 'root', kind: 'text', quote: 'callout mode' },
    },
    branches: {
      b1: { id: 'b1', source: { blockId: 'root', anchorId: 'a1' }, targetBlockId: 'c1', role: 'primary', order: 'a' },
      b2: { id: 'b2', source: { blockId: 'root', anchorId: 'a2' }, targetBlockId: 'c2', role: 'primary', order: 'b' },
      b3: { id: 'b3', source: { blockId: 'root' }, targetBlockId: 'k1', role: 'primary', order: 'c' },
      b4: { id: 'b4', source: { blockId: 'root' }, targetBlockId: 'k2', role: 'primary', order: 'd' },
    },
    chapters: [{ id: 'ch1', title: 'Chapter', topLevelBlockIds: ['root'] }],
    assets: {},
  };
}

function layoutAt(document: NoteDocument, density: number) {
  const settings = normalizePageSettings({ theme: { density } });
  const options = pageLayoutOptions(settings.theme);
  const layout = layoutDocument(
    document,
    createEstimatedMeasurement(document, options),
    options,
    A4_PORTRAIT,
  );
  return { settings, options, layout, effective: effectivePageTheme(settings.theme) };
}

describe('M4e2 density topology (S2-4)', () => {
  it('lets density flip one parent between mode A and B2 deterministically', () => {
    const document = densityDocument();
    const steps = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2];
    const rows = steps.map((density) => {
      const { layout, effective } = layoutAt(document, density);
      const root = layout.blockById['root']!;
      const callout = layout.blockById['c1']!;
      const child = layout.blockById['k1']!;
      return {
        density,
        bodyPt: effective.bodyPt,
        rootWidth: root.width,
        lane: layout.geometry.contentWidthPx - (root.x + root.width + effective.calloutRightGap),
        calloutPlacement: callout.placement,
        calloutTrunkGroup: callout.trunkGroup ?? null,
        childTrunkGroup: child.trunkGroup ?? null,
      };
    });
    console.log('\n', rows.map((row) => `${row.density * 100}% body ${row.bodyPt} root ${row.rootWidth.toFixed(1)} lane ${row.lane.toFixed(1)} ${row.calloutPlacement}`).join('\n '));

    // Density is monotone in the parent card width and the free lane.
    for (let index = 1; index < rows.length; index += 1) {
      expect(rows[index]!.rootWidth).toBeGreaterThan(rows[index - 1]!.rootWidth);
    }
    // At least one step flips; the same density always resolves the same way.
    const placements = new Set(rows.map((row) => row.calloutPlacement));
    expect(placements.size).toBeGreaterThan(1);
    for (const row of rows) {
      const again = layoutAt(document, row.density);
      expect(again.layout.blockById['c1']!.placement).toBe(row.calloutPlacement);
    }
    // The low end keeps the right lane; the high end uses the two B2 trunks.
    const low = rows[0]!;
    expect(low.calloutPlacement).toBe('right');
    expect(low.calloutTrunkGroup).toBeNull();
    const high = rows[rows.length - 1]!;
    expect(high.calloutPlacement).toBe('below');
    expect(high.calloutTrunkGroup).toBe('callout');
    expect(high.childTrunkGroup).toBe('child');
  });

  it('keeps the R2j geometry rules while the mode adapts', () => {
    const document = densityDocument();
    const dense = layoutAt(document, 0.6);
    const spacious = layoutAt(document, 1.2);
    const rootLow = dense.layout.blockById['root']!;
    const calloutLow = dense.layout.blockById['c1']!;
    const childLow = dense.layout.blockById['k1']!;
    // Mode A: callout card starts in the right lane, children below at the
    // resolved child indent. Both are unchanged R2j rules.
    expect(calloutLow.x).toBeCloseTo(
      rootLow.x + rootLow.width + dense.effective.calloutRightGap,
      6,
    );
    expect(childLow.x).toBeCloseTo(rootLow.x + dense.effective.childIndent, 6);

    const rootHigh = spacious.layout.blockById['root']!;
    const calloutHigh = spacious.layout.blockById['c1']!;
    const childHigh = spacious.layout.blockById['k1']!;
    // B2: callouts on the inner trunk, children on the outer trunk, both below.
    expect(calloutHigh.x).toBeCloseTo(rootHigh.x + spacious.effective.calloutCardIndent, 6);
    expect(childHigh.x).toBeCloseTo(rootHigh.x + spacious.effective.childIndent, 6);
    expect(calloutHigh.trunkInset).toBe(spacious.effective.calloutTrunkInset);
    expect(childHigh.trunkInset).toBe(spacious.effective.childTrunkInset);
    expect(calloutHigh.y).toBeGreaterThan(rootHigh.y + rootHigh.height);
    // No blocking defect at either end of the slider.
    for (const result of [dense.layout, spacious.layout]) {
      expect(result.defects.filter((defect) => defect.blocksExport)).toEqual([]);
    }
  });
});
