/**
 * Layout picker over the semantic anchor view (batch anchor-resolution-index).
 *
 * The layout owns rectangles, attach points and defects; the state comes from
 * the session index. These tests feed a view directly so no core resolver is
 * involved.
 */

import { describe, expect, it } from 'vitest';
import type {
  AnchorResolutionView,
  BlockMeasurement,
  ContentBlock,
  MeasurementMode,
  MeasurementPort,
  NoteDocument,
} from '../src/types.js';
import { layoutDocument } from '../src/layout.js';
import { DEFAULT_PAGE_SETTINGS } from '../src/page-settings.js';

const ROOT_TEXT = 'Anchor host';

function block(id: string, text = 'Text'): ContentBlock {
  return {
    id,
    content: {
      type: 'doc',
      children: [{ type: 'paragraph', children: [{ type: 'text', text }] }],
    },
  };
}

function document(): NoteDocument {
  return {
    schemaVersion: 2,
    id: 'picker-document',
    title: 'Picker',
    revision: 3,
    blocks: {
      root: block('root', ROOT_TEXT),
      t1: block('t1'),
      t2: block('t2'),
      t3: block('t3'),
      t4: block('t4'),
    },
    anchors: {
      'a-union': { id: 'a-union', blockId: 'root', kind: 'text', selector: { kind: 'text', quote: 'Anchor' } },
      'a-fallback': { id: 'a-fallback', blockId: 'root', kind: 'text', selector: { kind: 'text', quote: 'host' } },
      'a-ambiguous': { id: 'a-ambiguous', blockId: 'root', kind: 'text', selector: { kind: 'text', quote: 'x' } },
      'a-broken': { id: 'a-broken', blockId: 'root', kind: 'text', selector: { kind: 'text', quote: 'missing' } },
      'a-idle': { id: 'a-idle', blockId: 'root', kind: 'text', selector: { kind: 'text', quote: 'Anchor' } },
    },
    branches: {
      'e-union': { id: 'e-union', source: { blockId: 'root', anchorId: 'a-union' }, targetBlockId: 't1', role: 'primary', order: 'a' },
      'e-fallback': { id: 'e-fallback', source: { blockId: 'root', anchorId: 'a-fallback' }, targetBlockId: 't2', role: 'primary', order: 'b' },
      'e-ambiguous': { id: 'e-ambiguous', source: { blockId: 'root', anchorId: 'a-ambiguous' }, targetBlockId: 't3', role: 'primary', order: 'c' },
      'e-broken': { id: 'e-broken', source: { blockId: 'root', anchorId: 'a-broken' }, targetBlockId: 't4', role: 'primary', order: 'd' },
    },
    chapters: [{ id: 'ch', title: 'One', topLevelBlockIds: ['root'] }],
    assets: {},
  };
}

function view(documentId = 'picker-document', revision: number | undefined = 3): AnchorResolutionView {
  return {
    documentId,
    ...(revision === undefined ? {} : { revision }),
    byBlock: {
      root: [
        { anchorId: 'a-union', state: 'resolved', range: { kind: 'text' } },
        { anchorId: 'a-fallback', state: 'resolved', range: { kind: 'text' } },
        { anchorId: 'a-ambiguous', state: 'ambiguous', range: null },
        { anchorId: 'a-broken', state: 'broken', range: null },
        { anchorId: 'a-idle', state: 'idle', range: null },
      ],
      'no-such-block': [{ anchorId: 'a-missing', state: 'block-missing', range: null }],
    },
  };
}

/** Root measurements: two wrappers for a-union, none for the other anchors. */
function port(): MeasurementPort {
  return {
    measure(blockValue: ContentBlock, mode: MeasurementMode): BlockMeasurement {
      const contentWidth = 200;
      const contentHeight = 40;
      const contentTop = 13;
      return {
        blockId: blockValue.id,
        mode,
        cardWidth: contentWidth + 26,
        contentWidth,
        contentHeight,
        contentTop,
        labelHeight: 0,
        cardHeight: contentTop + contentHeight + 13,
        maxContentWidth: contentWidth,
        minContentWidth: 80,
        segments: [
          { index: 0, kind: 'paragraph', nodePath: [0], y: 0, height: contentHeight, breakableBefore: false },
        ],
        anchors:
          blockValue.id === 'root'
            ? [
                { anchorId: 'a-union', x: 10, y: 0, width: 20, height: 10, occurrence: 0 },
                { anchorId: 'a-union', x: 12, y: 10, width: 18, height: 10, occurrence: 1 },
                { anchorId: 'a-ambiguous', x: 30, y: 0, width: 20, height: 10, occurrence: 0 },
              ]
            : [],
        tableColumns: {},
        missingAssetIds: [],
      };
    },
  };
}

function layout(anchorView: AnchorResolutionView | undefined = view()) {
  return layoutDocument(
    document(),
    port(),
    {},
    DEFAULT_PAGE_SETTINGS.setup,
    anchorView,
  );
}

describe('layout anchor picker', () => {
  it('uses the union box and the last-line attach point for several rects', () => {
    const result = layout();
    const root = result.blockById['root']!;
    const contentLeft = root.x + 13;
    const contentTop = root.y + 13;
    const attachment = result.anchors.find((candidate) => candidate.anchorId === 'a-union')!;
    expect(attachment.state).toBe('resolved');
    expect(attachment.rect).toEqual({
      x: contentLeft + 10,
      y: contentTop,
      width: 20,
      height: 20,
    });
    expect(attachment.attachPoint).toEqual({
      x: contentLeft + 12 + 18,
      y: contentTop + 10 + 5,
    });
    expect(result.defects.filter((defect) => defect.message.includes('a-union'))).toEqual([]);
    // The card never starts left of the callout lane (38): the below trunk
    // sits at 24, so the stem stays visible even when the range starts left of
    // the lane.
    expect(attachment.calloutX).toBe(root.x + 38);
    expect(attachment.calloutTrunkInset).toBe(24);
    expect(result.blockById['t1']?.trunkInset).toBe(24);
    expect(result.anchorGeometryFallbacks).toEqual(['a-fallback']);
  });

  it('attaches a resolved anchor with no rect to the whole content box', () => {
    const result = layout();
    const root = result.blockById['root']!;
    const contentLeft = root.x + 13;
    const contentTop = root.y + 13;
    const attachment = result.anchors.find((candidate) => candidate.anchorId === 'a-fallback')!;
    expect(attachment.state).toBe('resolved');
    expect(attachment.rect).toEqual({
      x: contentLeft,
      y: contentTop,
      width: 200,
      height: 40,
    });
    expect(attachment.calloutX).toBe(root.x + 38);
    expect(attachment.calloutTrunkInset).toBe(24);
    expect(attachment.attachPoint).toEqual({
      x: root.x + 24,
      y: contentTop + 20,
    });
    // The callout card uses the lane offset, never the page content left.
    expect(result.blockById['t2']?.x).toBe(root.x + 38);
    expect(result.blockById['t2']?.trunkInset).toBe(24);
    expect(result.anchorGeometryFallbacks).toEqual(['a-fallback']);
    expect(result.defects.filter((defect) => defect.message.includes('a-fallback'))).toEqual([]);
  });

  it('keeps warning points and one defect for ambiguous and broken anchors', () => {
    const result = layout();
    const root = result.blockById['root']!;
    const contentLeft = root.x + 13;
    for (const anchorId of ['a-ambiguous', 'a-broken']) {
      const attachment = result.anchors.find((candidate) => candidate.anchorId === anchorId)!;
      expect(attachment.rect).toBeNull();
      expect(attachment.attachPoint).toBeNull();
      expect(attachment.warningPoint).toEqual({
        x: root.x + root.width - 16,
        y: root.y + Math.max(8, 13 / 2),
      });
    }
    // The ambiguous anchor keeps the measured lane (one math-like rect at x 30);
    // the broken anchor has no rect and uses the callout indent.
    expect(
      result.anchors.find((anchor) => anchor.anchorId === 'a-ambiguous')?.calloutX,
    ).toBe(contentLeft + 30);
    expect(result.anchors.find((anchor) => anchor.anchorId === 'a-broken')?.calloutX).toBe(
      root.x + 38,
    );
    // The warning states place their callout cards in the same below lane as a
    // resolved anchor with that measured rect, while the dot stays top-right.
    expect(result.blockById['t3']?.x).toBe(contentLeft + 30);
    expect(result.blockById['t4']?.x).toBe(root.x + 38);
    for (const [anchorId, targetId] of [
      ['a-union', 't1'],
      ['a-fallback', 't2'],
      ['a-ambiguous', 't3'],
      ['a-broken', 't4'],
    ] as const) {
      expect(
        result.anchors.find((anchor) => anchor.anchorId === anchorId)?.calloutTrunkInset,
      ).toBe(24);
      expect(result.blockById[targetId]?.trunkInset).toBe(24);
    }
    expect(
      result.defects
        .filter((defect) => defect.code === 'ambiguous-anchor' || defect.code === 'broken-anchor')
        .map((defect) => `${defect.code}:${defect.blockId}`)
        .sort(),
    ).toEqual(['ambiguous-anchor:root', 'broken-anchor:root']);
  });

  it('skips idle and block-missing anchors entirely', () => {
    const result = layout();
    expect(result.anchors.some((anchor) => anchor.anchorId === 'a-idle')).toBe(false);
    expect(result.anchors.some((anchor) => anchor.anchorId === 'a-missing')).toBe(false);
    expect(result.defects.filter((defect) => defect.message.includes('a-idle'))).toEqual([]);
    expect(result.defects.filter((defect) => defect.message.includes('a-missing'))).toEqual([]);
    expect(result.defects.filter((defect) => defect.code === 'broken-anchor')).toHaveLength(1);
  });

  it('throws when an anchored document has no view', () => {
    expect(() =>
      layoutDocument(document(), port(), {}, DEFAULT_PAGE_SETTINGS.setup),
    ).toThrow(/has anchors but no anchor resolution view/);
  });

  it('throws on a view identity or revision mismatch', () => {
    expect(() => layout(view('another-document'))).toThrow(/anchor view is for/);
    expect(() => layout(view('picker-document', 2))).toThrow(/revision 2/);
    expect(() =>
      layout({ ...view('picker-document', 3), revision: undefined }),
    ).not.toThrow();
  });
});
