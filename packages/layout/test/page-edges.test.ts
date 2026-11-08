import { describe, expect, it } from 'vitest';
import {
  buildPageEdges,
  createEstimatedMeasurement,
  DEFAULT_PAGE_SETTINGS,
  layoutDocument,
  pageLayoutOptions,
  paginate,
  type AnchorRecord,
  type NoteDocument,
} from '../src/index.js';

const SOURCE_TEXT = 'An eigenvalue is a scalar. A nonzero vector v satisfies Av = λv for some λ, and the spectrum is the set of all eigenvalues.';
const QUOTE = 'eigenvalue';

function textBlock(id: string, label: string, text: string) {
  return {
    id,
    label,
    content: {
      type: 'doc' as const,
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', text }],
        },
      ],
    },
  };
}

function arrowsDocument(): NoteDocument {
  const start = SOURCE_TEXT.indexOf(QUOTE);
  return {
    schemaVersion: 2,
    id: 'page-edges-unit',
    title: 'Page edges',
    blocks: {
      source: {
        id: 'source',
        label: 'Source',
        content: {
          type: 'doc',
          children: [
            {
              type: 'paragraph',
              children: [
                { type: 'text', text: SOURCE_TEXT.slice(0, start) },
                {
                  type: 'text',
                  text: QUOTE,
                  marks: [{ type: 'anchor', attrs: { anchorId: 'anchor-1' } }],
                },
                { type: 'text', text: SOURCE_TEXT.slice(start + QUOTE.length) },
              ],
            },
          ],
        },
      },
      direct: textBlock('direct', 'Direct child', 'A direct primary child.'),
      callout: textBlock('callout', 'Anchored callout', 'An anchored callout.'),
      ref: textBlock('ref', 'Reference target', 'A labeled reference target.'),
    },
    anchors: {
      'anchor-1': {
        id: 'anchor-1',
        blockId: 'source',
        kind: 'text',
        selector: { kind: 'text', quote: QUOTE },
        quote: QUOTE,
      } satisfies AnchorRecord,
    },
    branches: {
      'branch-direct': {
        id: 'branch-direct',
        source: { blockId: 'source' },
        targetBlockId: 'direct',
        role: 'primary',
        order: 'a',
      },
      'branch-callout': {
        id: 'branch-callout',
        source: { blockId: 'source', anchorId: 'anchor-1' },
        targetBlockId: 'callout',
        role: 'primary',
        order: 'b',
      },
      'branch-reference': {
        id: 'branch-reference',
        source: { blockId: 'source' },
        targetBlockId: 'ref',
        role: 'reference',
        order: 'c',
        label: 'also uses',
      },
    },
    chapters: [
      {
        id: 'chapter-1',
        title: 'Arrows',
        topLevelBlockIds: ['source', 'ref'],
      },
    ],
    assets: {},
  };
}

function layoutPages(document: NoteDocument, manualBreakBeforeBlockIds: string[] = []) {
  const measurement = createEstimatedMeasurement(document);
  const layout = layoutDocument(
    document,
    measurement,
    pageLayoutOptions(DEFAULT_PAGE_SETTINGS.theme),
    DEFAULT_PAGE_SETTINGS.setup,
  );
  const pages = paginate(layout, document, { manualBreakBeforeBlockIds });
  return { layout, pages };
}

describe('page edge mapper', () => {
  it('maps same-page primary, anchored, and reference edges exactly once', () => {
    const { layout, pages } = layoutPages(arrowsDocument());
    expect(pages.pageCount).toBe(1);
    const edges = buildPageEdges(layout, pages.pages)[0]!;
    expect(edges.map((edge) => edge.branchId).sort()).toEqual([
      'branch-callout',
      'branch-direct',
      'branch-reference',
    ]);

    const source = pages.pages[0]!.fragments.find((fragment) => fragment.blockId === 'source')!;
    const direct = pages.pages[0]!.fragments.find((fragment) => fragment.blockId === 'direct')!;
    const ref = pages.pages[0]!.fragments.find((fragment) => fragment.blockId === 'ref')!;

    const directEdge = edges.find((edge) => edge.branchId === 'branch-direct')!;
    expect(directEdge.role).toBe('primary');
    expect(directEdge.direction).toBe('same-page');
    expect(directEdge.targetPage).toBeNull();
    expect(directEdge.from).toEqual({
      x: source.page.x + source.page.width,
      y: source.page.y + Math.min(source.page.height / 2, 60),
    });
    expect(directEdge.to).toEqual({
      x: direct.page.x,
      y: direct.page.y + Math.min(direct.page.height / 2, 60),
    });

    const calloutEdge = edges.find((edge) => edge.branchId === 'branch-callout')!;
    const anchor = layout.anchors.find((attachment) => attachment.anchorId === 'anchor-1')!;
    expect(anchor.rect).not.toBeNull();
    expect(calloutEdge.anchorId).toBe('anchor-1');
    expect(calloutEdge.direction).toBe('same-page');
    // The callout sits below the source and shares the Continuous-style left
    // trunk, not the source card's right edge.
    expect(calloutEdge.from.x).toBeCloseTo(source.page.x + 12, 6);
    expect(calloutEdge.from.y).toBeCloseTo(source.page.y + source.page.height, 6);
    expect(calloutEdge.route.entry).toBe('left');

    const reference = edges.find((edge) => edge.branchId === 'branch-reference')!;
    expect(reference.role).toBe('reference');
    expect(reference.direction).toBe('same-page');
    expect(reference.branchLabel).toBe('also uses');
    expect(reference.to.x).toBe(ref.page.x);

    expect(buildPageEdges(layout, pages.pages)[0]!.map((edge) => edge.branchId)).toEqual(
      edges.map((edge) => edge.branchId),
    );
  });

  it('uses page-edge indicators for cross-page primary edges and target-only references', () => {
    const { layout, pages } = layoutPages(arrowsDocument(), ['callout', 'direct']);
    expect(pages.pageCount).toBeGreaterThanOrEqual(2);
    const byPage = buildPageEdges(layout, pages.pages);
    const first = byPage[0]!;
    const second = byPage[1]!;

    // The callout is below the parent and lands on page 2. The direct child
    // sits beside the parent, so it stays on page 1: the new tree packing is
    // not a per-component row break.
    const directSamePage = first.find((edge) => edge.branchId === 'branch-direct')!;
    expect(directSamePage.direction).toBe('same-page');
    const calloutOut = first.find((edge) => edge.branchId === 'branch-callout')!;
    expect(calloutOut.direction).toBe('to-edge');
    expect(calloutOut.targetPage).toBe(2);
    expect(calloutOut.label).toBe('p.2');
    expect(calloutOut.to.x).toBe(layout.geometry.contentWidthPx);
    const calloutIn = second.find((edge) => edge.branchId === 'branch-callout')!;
    expect(calloutIn.direction).toBe('from-edge');
    expect(calloutIn.targetPage).toBe(1);
    expect(calloutIn.label).toBe('p.1');
    expect(calloutIn.from.x).toBe(0);

    // Reference edges never draw a line out of the source page: the target page
    // gets one from-edge chip and the source page has no matching indicator.
    const referenceOut = first.find((edge) => edge.branchId === 'branch-reference');
    expect(referenceOut).toBeUndefined();
    const refPage = byPage.find((edges) =>
      edges.some((edge) => edge.branchId === 'branch-reference'),
    )!;
    const referenceIn = refPage.find((edge) => edge.branchId === 'branch-reference')!;
    expect(referenceIn.direction).toBe('from-edge');
    expect(referenceIn.targetPage).toBe(1);
    expect(referenceIn.branchLabel).toBe('also uses');
  });
});
