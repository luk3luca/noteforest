import { describe, expect, it } from 'vitest';
import type { Document } from '@noteforest/core';
import {
  buildPageEdges,
  createEstimatedMeasurement,
  DEFAULT_PAGE_SETTINGS,
  layoutDocument,
  pageLayoutOptions,
  paginate,
  type EdgePlacement as LayoutEdgePlacement,
  type NoteDocument,
} from '@noteforest/layout';
import {
  edgePairs,
  type EdgePlacement as ContinuousEdgePlacement,
} from '../src/renderer/src/lib/tree';

import { anchorViewForDocument } from './layout-view.js';
/**
 * R2f Continuous/Page parity: both surfaces consume one `EdgePlacement` type
 * and classify the same primary branches the same way. Coordinates may differ
 * (Continuous is page-free), but the placement name is the same contract.
 */

const ROOT_TEXT =
  'A root with one anchored callout and two direct children in one right group.';
const QUOTE = 'anchored callout';

function paragraph(text: string) {
  return { type: 'paragraph', children: [{ type: 'text', text }] };
}

function textBlock(id: string, label: string, text: string) {
  return { id, label, content: { type: 'doc', children: [paragraph(text)] } };
}

function fixtureDocument(): NoteDocument {
  const start = ROOT_TEXT.indexOf(QUOTE);
  return {
    schemaVersion: 2,
    id: 'parity-doc',
    title: 'Parity',
    createdAt: '2026-11-08T00:00:00.000Z',
    updatedAt: '2026-11-08T00:00:00.000Z',
    revision: 0,
    blocks: {
      root: {
        id: 'root',
        label: 'Root',
        content: {
          type: 'doc',
          children: [
            {
              type: 'paragraph',
              children: [
                { type: 'text', text: ROOT_TEXT.slice(0, start) },
                {
                  type: 'text',
                  text: QUOTE,
                  marks: [{ type: 'anchor', attrs: { anchorId: 'anchor-1' } }],
                },
                { type: 'text', text: ROOT_TEXT.slice(start + QUOTE.length) },
              ],
            },
          ],
        },
      },
      child1: textBlock('child1', 'Child 1', 'First direct child.'),
      child2: textBlock('child2', 'Child 2', 'Second direct child.'),
      callout: textBlock('callout', 'Callout', 'An anchored callout below the root.'),
    },
    anchors: {
      'anchor-1': {
        id: 'anchor-1',
        blockId: 'root',
        kind: 'text',
        selector: { kind: 'text', quote: QUOTE },
        quote: QUOTE,
      },
    },
    branches: {
      'branch-callout': {
        id: 'branch-callout',
        source: { blockId: 'root', anchorId: 'anchor-1' },
        targetBlockId: 'callout',
        role: 'primary',
        order: 'a',
      },
      'branch-child-1': {
        id: 'branch-child-1',
        source: { blockId: 'root' },
        targetBlockId: 'child1',
        role: 'primary',
        order: 'b',
      },
      'branch-child-2': {
        id: 'branch-child-2',
        source: { blockId: 'root' },
        targetBlockId: 'child2',
        role: 'primary',
        order: 'c',
      },
    },
    chapters: [{ id: 'chapter-1', title: 'Parity', topLevelBlockIds: ['root'] }],
    assets: {},
  };
}

describe('Continuous/Page edge placement parity', () => {
  it('uses the same EdgePlacement type and the same branch classification', () => {
    const pagePlacement: LayoutEdgePlacement = 'right';
    const continuousPlacement: ContinuousEdgePlacement = pagePlacement;
    expect(continuousPlacement).toBe('right');

    const document = fixtureDocument();
    const measurement = createEstimatedMeasurement(document);
    const layout = layoutDocument(
      document,
      measurement,
      pageLayoutOptions(DEFAULT_PAGE_SETTINGS.theme),
      DEFAULT_PAGE_SETTINGS.setup,
        anchorViewForDocument(document),
    );
    const pages = paginate(layout, document);
    const pageEdges = buildPageEdges(layout, pages.pages).flat();
    const pageByBranch = new Map(
      pageEdges
        .filter((edge) => edge.role === 'primary')
        .map((edge) => [edge.branchId, edge]),
    );

    const belowChildIds = new Set(
      Object.values(layout.blockById)
        .filter((block) => block.role === 'child' && block.placement === 'below')
        .map((block) => block.blockId),
    );
    const continuous = edgePairs(
      document as unknown as Document,
      new Set(),
      belowChildIds,
    );

    expect(continuous.length).toBe(3);
    for (const edge of continuous) {
      const pageEdge = pageByBranch.get(edge.id);
      expect(pageEdge, `page edge for ${edge.id}`).toBeDefined();
      // Tree edges enter from the left on both surfaces; Continuous has no
      // top/right tree entry.
      expect(pageEdge!.route.entry).toBe('left');
    }
    // Direct children keep the same placement name on both surfaces.
    const child1 = pageByBranch.get('branch-child-1')!;
    const child2 = pageByBranch.get('branch-child-2')!;
    expect(child1.placement).toBe('below');
    expect(child2.placement).toBe('below');
    expect(child1.trunk!.id).toBe('root:below');
    expect(child2.trunk!.id).toBe(child1.trunk!.id);

    // R2j mode A is a Page/PDF-only lane decision: the anchored callout moves
    // to the parent's right side even though Continuous keeps its callouts
    // below. The `EdgePlacement` value is still the shared contract.
    const callout = pageByBranch.get('branch-callout')!;
    expect(callout.placement).toBe('right');
    expect(callout.trunk).not.toBeNull();
    expect(callout.trunk!.placement).toBe('right');
    expect(callout.trunk!.id).toBe('root:right');
    const continuousCallout = continuous.find((edge) => edge.id === 'branch-callout')!;
    expect(continuousCallout.placement).toBe('below');
  });
});
