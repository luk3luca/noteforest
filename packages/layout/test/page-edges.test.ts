import { describe, expect, it } from 'vitest';
import {
  buildPageEdgeModel,
  buildPageEdges,
  createEstimatedMeasurement,
  DEFAULT_PAGE_SETTINGS,
  EDGE_STYLE,
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

const TOPOLOGY_ROOT_TEXT =
  'A small forest. This block has three direct children and two anchored callouts. It shows layout, markers, and quote chips together.';

function anchoredTextBlock(
  id: string,
  label: string,
  text: string,
  quote: string,
  anchorId: string,
) {
  const start = text.indexOf(quote);
  return {
    id,
    label,
    content: {
      type: 'doc' as const,
      children: [
        {
          type: 'paragraph' as const,
          children: [
            ...(start > 0 ? [{ type: 'text' as const, text: text.slice(0, start) }] : []),
            {
              type: 'text' as const,
              text: quote,
              marks: [{ type: 'anchor' as const, attrs: { anchorId } }],
            },
            ...(start + quote.length < text.length
              ? [{ type: 'text' as const, text: text.slice(start + quote.length) }]
              : []),
          ],
        },
      ],
    },
  };
}

/**
 * The R2f screenshot topology: two right-column siblings (child 2 sits below
 * the parent card), one indented grandchild under child 1, and two anchored
 * callouts below the parent.
 */
function topologyDocument(): NoteDocument {
  const firstQuote = 'three direct children';
  const secondQuote = 'two anchored callouts';
  return {
    schemaVersion: 2,
    id: 'page-edge-topology',
    title: 'Page edge topology',
    blocks: {
      root: anchoredTextBlock('root', 'A small forest', TOPOLOGY_ROOT_TEXT, firstQuote, 'anchor-first'),
      child1: textBlock(
        'child1',
        'Direct child 1',
        'First direct child, with one grandchild to show the indentation rule clearly.',
      ),
      child2: textBlock('child2', 'Direct child 2', 'Second direct child.'),
      grandchild: textBlock('grandchild', 'Grandchild', 'Third level of the same structure.'),
      callout1: textBlock(
        'callout1',
        'Three children',
        'Direct children stay right while there is room; when room runs out they wrap below, after the callouts.',
      ),
      callout2: textBlock(
        'callout2',
        'Two callouts',
        'Callouts stay below the parent, in the safe zone; arrows enter from the left.',
      ),
    },
    anchors: {
      'anchor-first': {
        id: 'anchor-first',
        blockId: 'root',
        kind: 'text',
        selector: { kind: 'text', quote: firstQuote },
        quote: firstQuote,
      },
      'anchor-second': {
        id: 'anchor-second',
        blockId: 'root',
        kind: 'text',
        selector: { kind: 'text', quote: secondQuote },
        quote: secondQuote,
      },
    },
    branches: {
      'branch-child-1': {
        id: 'branch-child-1',
        source: { blockId: 'root' },
        targetBlockId: 'child1',
        role: 'primary',
        order: 'a',
      },
      'branch-child-2': {
        id: 'branch-child-2',
        source: { blockId: 'root' },
        targetBlockId: 'child2',
        role: 'primary',
        order: 'b',
      },
      'branch-grandchild': {
        id: 'branch-grandchild',
        source: { blockId: 'child1' },
        targetBlockId: 'grandchild',
        role: 'primary',
        order: 'a',
      },
      'branch-callout-1': {
        id: 'branch-callout-1',
        source: { blockId: 'root', anchorId: 'anchor-first' },
        targetBlockId: 'callout1',
        role: 'primary',
        order: 'c',
      },
      'branch-callout-2': {
        id: 'branch-callout-2',
        source: { blockId: 'root', anchorId: 'anchor-second' },
        targetBlockId: 'callout2',
        role: 'primary',
        order: 'd',
      },
    },
    chapters: [{ id: 'chapter-1', title: 'Topology', topLevelBlockIds: ['root'] }],
    assets: {},
  };
}

/** Root with one anchored callout and one wrapped direct child. */
function wrappedBelowDocument(): NoteDocument {
  const quote = 'wrapped';
  return {
    schemaVersion: 2,
    id: 'page-edge-wrapped',
    title: 'Page edge wrapped group',
    blocks: {
      root: anchoredTextBlock(
        'root',
        'Wrapped root',
        'This root is wrapped below by a narrow page, with one callout and one direct child.',
        quote,
        'anchor-wrapped',
      ),
      callout: textBlock('callout', 'Callout', 'An anchored callout below the root.'),
      child: textBlock('child', 'Wrapped child', 'A wrapped direct child below the root.'),
    },
    anchors: {
      'anchor-wrapped': {
        id: 'anchor-wrapped',
        blockId: 'root',
        kind: 'text',
        selector: { kind: 'text', quote },
        quote,
      },
    },
    branches: {
      'branch-callout': {
        id: 'branch-callout',
        source: { blockId: 'root', anchorId: 'anchor-wrapped' },
        targetBlockId: 'callout',
        role: 'primary',
        order: 'a',
      },
      'branch-child': {
        id: 'branch-child',
        source: { blockId: 'root' },
        targetBlockId: 'child',
        role: 'primary',
        order: 'b',
      },
    },
    chapters: [{ id: 'chapter-1', title: 'Wrapped', topLevelBlockIds: ['root'] }],
    assets: {},
  };
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
    // trunk, not the source card's right edge. The visible below trunk is
    // detached from the card bottom by the shared trunkGap.
    expect(calloutEdge.from.x).toBeCloseTo(source.page.x + 12, 6);
    expect(calloutEdge.from.y).toBeCloseTo(
      source.page.y + source.page.height + EDGE_STYLE.trunkGap,
      6,
    );
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

  it('continues cross-page primary edges on the group trunk and keeps reference indicators', () => {
    const { layout, pages } = layoutPages(arrowsDocument(), ['callout', 'direct']);
    expect(pages.pageCount).toBeGreaterThanOrEqual(2);
    const model = buildPageEdgeModel(layout, pages.pages);
    const byPage = model.edges;
    const first = byPage[0]!;
    const second = byPage[1]!;

    // The callout is below the parent and lands on page 2. The direct child
    // sits beside the parent, so it stays on page 1: the new tree packing is
    // not a per-component row break.
    const directSamePage = first.find((edge) => edge.branchId === 'branch-direct')!;
    expect(directSamePage.direction).toBe('same-page');

    // Primary tree edges never emit a to-edge/from-edge indicator. Page 1 owns
    // the trunk segment; page 2 owns the left-entering arm.
    expect(first.find((edge) => edge.branchId === 'branch-callout')).toBeUndefined();
    const calloutArm = second.find((edge) => edge.branchId === 'branch-callout')!;
    expect(calloutArm.direction).toBe('trunk');
    expect(calloutArm.targetPage).toBeNull();
    expect(calloutArm.label).toBeUndefined();
    expect(calloutArm.trunk!.id).toBe('source:below');
    expect(calloutArm.from).toEqual(calloutArm.trunkSegment!.start);
    expect(calloutArm.trunkSegment!.pageNumber).toBe(2);
    expect(calloutArm.route.entry).toBe('left');
    expect(calloutArm.route.direction).toBe('right');

    const trunkView = model.trunks[0]!.find(
      (view) => view.trunk.id === 'source:below',
    )!;
    expect(trunkView).toBeDefined();
    expect(trunkView.segment.pageNumber).toBe(1);
    expect(trunkView.segment.start.y).toBeCloseTo(
      trunkView.trunk.port.y + EDGE_STYLE.trunkGap,
      6,
    );
    expect(trunkView.segment.end.y).toBe(layout.geometry.contentHeightPx);

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

    for (const pageEdges of byPage) {
      for (const edge of pageEdges) {
        if (edge.role !== 'primary') continue;
        expect(edge.direction === 'same-page' || edge.direction === 'trunk').toBe(true);
        expect(edge.targetPage).toBeNull();
        expect(edge.label).toBeUndefined();
      }
    }
  });
});

describe('page edge topology (R2f)', () => {
  it('groups right siblings and below callouts onto separate shared trunks', () => {
    const { layout, pages } = layoutPages(topologyDocument());
    expect(pages.pageCount).toBe(1);
    const page = pages.pages[0]!;
    const fragment = (blockId: string) =>
      page.fragments.find((candidate) => candidate.blockId === blockId)!;
    const root = layout.blockById['root']!;
    const child1Block = layout.blockById['child1']!;
    const child2Block = layout.blockById['child2']!;
    const grandchildBlock = layout.blockById['grandchild']!;
    const callout1Block = layout.blockById['callout1']!;
    const callout2Block = layout.blockById['callout2']!;

    // Placement is the layout decision, not a y comparison: child 2 is lower
    // than the parent card but still belongs to the right level column.
    expect(child1Block.placement).toBe('right');
    expect(child2Block.placement).toBe('right');
    expect(fragment('child2').page.y).toBeGreaterThan(root.y + root.height - 0.5);
    expect(grandchildBlock.placement).toBe('below');
    expect(callout1Block.placement).toBe('below');
    expect(callout2Block.placement).toBe('below');

    const edges = buildPageEdges(layout, pages.pages)[0]!;
    const edge = (branchId: string) => edges.find((candidate) => candidate.branchId === branchId)!;
    const child1 = edge('branch-child-1');
    const child2 = edge('branch-child-2');
    const grandchild = edge('branch-grandchild');
    const callout1 = edge('branch-callout-1');
    const callout2 = edge('branch-callout-2');

    // Every same-page primary tree edge is a left entry.
    const primarySamePage = edges.filter(
      (candidate) => candidate.role === 'primary' && candidate.direction === 'same-page',
    );
    expect(primarySamePage.length).toBe(5);
    for (const candidate of primarySamePage) {
      expect(candidate.route.entry).toBe('left');
      expect(candidate.route.direction).toBe('right');
      expect(candidate.route.blocked).toBe(false);
    }

    // Right-group siblings share one trunk and enter left.
    expect(child1.placement).toBe('right');
    expect(child2.placement).toBe('right');
    expect(child1.trunk).not.toBeNull();
    expect(child2.trunk).not.toBeNull();
    expect(child1.trunk!.id).toBe('root:right');
    expect(child2.trunk!.id).toBe(child1.trunk!.id);
    expect(child2.trunk!.x).toBe(child1.trunk!.x);
    expect(child1.trunk!.placement).toBe('right');
    expect(child1.from).toEqual({
      x: fragment('root').page.x + fragment('root').page.width,
      y: fragment('root').page.y + Math.min(fragment('root').page.height / 2, 60),
    });
    expect(child2.from).toEqual(child1.from);
    expect(child2.trunk!.id).not.toBe(callout1.trunk!.id);
    for (const candidate of [child1, child2]) {
      const tip = candidate.route.points.at(-1)!;
      const before = candidate.route.points.at(-2)!;
      expect(tip).toEqual(candidate.to);
      expect(Math.abs(before.y - tip.y)).toBeLessThan(0.01);
      expect(tip.x - before.x).toBeGreaterThanOrEqual(EDGE_STYLE.stemMin - 0.01);
      expect(
        candidate.route.points.some(
          (point) => Math.abs(point.x - candidate.trunk!.x) < 0.01,
        ),
      ).toBe(true);
    }

    // Both anchored callouts are below the parent, share one below trunk, and
    // enter from the left; child 2 never uses this trunk.
    expect(callout1.trunk!.id).toBe('root:below');
    expect(callout2.trunk!.id).toBe(callout1.trunk!.id);
    expect(callout2.trunk!.x).toBe(callout1.trunk!.x);
    expect(callout1.trunk!.placement).toBe('below');
    const rootBottom = fragment('root').page.y + fragment('root').page.height;
    expect(callout1.from).toEqual({
      x: callout1.trunk!.x,
      y: rootBottom + EDGE_STYLE.trunkGap,
    });
    expect(callout2.from).toEqual(callout1.from);

    // The grandchild is an indented below target of child 1, not a top entry.
    expect(grandchild.placement).toBe('below');
    expect(grandchild.trunk!.id).toBe('child1:below');
    expect(grandchild.trunk!.id).not.toBe(callout1.trunk!.id);
    expect(grandchild.from).toEqual({
      x: grandchild.trunk!.x,
      y: fragment('child1').page.y + fragment('child1').page.height + EDGE_STYLE.trunkGap,
    });
    expect(grandchild.route.entry).toBe('left');
    const grandchildTip = grandchild.route.points.at(-1)!;
    const grandchildBefore = grandchild.route.points.at(-2)!;
    expect(Math.abs(grandchildBefore.y - grandchildTip.y)).toBeLessThan(0.01);
    expect(grandchildTip.x - grandchildBefore.x).toBeGreaterThanOrEqual(
      EDGE_STYLE.stemMin - 0.01,
    );

    // Determinism: the DOM and print model get the same order/data.
    expect(JSON.stringify(buildPageEdges(layout, pages.pages))).toBe(
      JSON.stringify(buildPageEdges(layout, pages.pages)),
    );
  });

  it('shares one below trunk between callouts and wrapped direct children', () => {
    const document = wrappedBelowDocument();
    const measurement = createEstimatedMeasurement(document);
    const layout = layoutDocument(
      document,
      measurement,
      pageLayoutOptions(DEFAULT_PAGE_SETTINGS.theme),
      {
        size: 'A5',
        orientation: 'portrait',
        margins: { top: 12, right: 12, bottom: 12, left: 12 },
      },
    );
    const pages = paginate(layout, document);
    expect(pages.pageCount).toBe(1);

    expect(layout.blockById['callout']!.placement).toBe('below');
    expect(layout.blockById['child']!.placement).toBe('below');
    const edges = buildPageEdges(layout, pages.pages)[0]!;
    const callout = edges.find((candidate) => candidate.branchId === 'branch-callout')!;
    const child = edges.find((candidate) => candidate.branchId === 'branch-child')!;
    expect(callout.trunk).not.toBeNull();
    expect(child.trunk).not.toBeNull();
    expect(callout.trunk!.id).toBe('root:below');
    expect(child.trunk!.id).toBe(callout.trunk!.id);
    expect(child.trunk!.x).toBe(callout.trunk!.x);
    const rootFragment = pages.pages[0]!.fragments.find(
      (fragment) => fragment.blockId === 'root',
    )!;
    expect(callout.from.y).toBeCloseTo(
      rootFragment.page.y + rootFragment.page.height + EDGE_STYLE.trunkGap,
      6,
    );
    expect(child.from.y).toBe(callout.from.y);
    expect(callout.route.entry).toBe('left');
    expect(child.route.entry).toBe('left');
    expect(child.route.stem).toBeGreaterThanOrEqual(EDGE_STYLE.stemMin - 0.01);
  });
});

/**
 * R2g multi-page fixture. The root's right group has child 1 on page 1 and
 * child 2 on page 3; page 2 is a pass-through page for the root group. Child 1
 * owns an independent below trunk that crosses to its grandchild on page 2.
 */
function trunkContinuityDocument(): NoteDocument {
  return {
    schemaVersion: 2,
    id: 'page-trunk-continuity',
    title: 'Page trunk continuity',
    blocks: {
      'trunk-root': textBlock(
        'trunk-root',
        'Trunk root',
        'A short root whose children continue across pages.',
      ),
      'trunk-child-1': textBlock(
        'trunk-child-1',
        'Child one',
        'First child, with a nested trunk that crosses a page. This sentence is long enough that the card takes the full readable maximum width, so the nested group cannot fit beside it and wraps below instead.',
      ),
      'trunk-grandchild': textBlock(
        'trunk-grandchild',
        'Grandchild',
        'Nested child on a later page with enough text to keep a readable card width when the page measures it.',
      ),
      'trunk-child-2': textBlock(
        'trunk-child-2',
        'Child two',
        'Second child on the last page of the trunk.',
      ),
    },
    anchors: {},
    branches: {
      'branch-child-1': {
        id: 'branch-child-1',
        source: { blockId: 'trunk-root' },
        targetBlockId: 'trunk-child-1',
        role: 'primary',
        order: 'a',
      },
      'branch-grandchild': {
        id: 'branch-grandchild',
        source: { blockId: 'trunk-child-1' },
        targetBlockId: 'trunk-grandchild',
        role: 'primary',
        order: 'a',
      },
      'branch-child-2': {
        id: 'branch-child-2',
        source: { blockId: 'trunk-root' },
        targetBlockId: 'trunk-child-2',
        role: 'primary',
        order: 'b',
      },
    },
    chapters: [{ id: 'chapter-1', title: 'Trunk', topLevelBlockIds: ['trunk-root'] }],
    assets: {},
  };
}

describe('page trunk continuity (R2g)', () => {
  it('keeps one group trunk aligned across pages, pass-through, and the last arm', () => {
    const { layout, pages } = layoutPages(trunkContinuityDocument(), [
      'trunk-grandchild',
      'trunk-child-2',
    ]);
    expect(pages.pageCount).toBe(3);
    const model = buildPageEdgeModel(layout, pages.pages);
    const contentHeight = layout.geometry.contentHeightPx;

    // Group keys are stable across pages and scoped to one parent + placement.
    const rootView = model.trunks[0]!.find(
      (view) => view.trunk.id === 'trunk-root:right',
    )!;
    expect(rootView).toBeDefined();
    const rootTrunk = rootView.trunk;
    expect(rootTrunk.parentBlockId).toBe('trunk-root');
    expect(rootTrunk.placement).toBe('right');
    expect(rootTrunk.portPage).toBe(1);
    expect(rootTrunk.segments.map((segment) => segment.pageNumber)).toEqual([1, 2, 3]);
    expect(rootTrunk.segments).toHaveLength(3);
    for (const segment of rootTrunk.segments) {
      expect(segment.start.x).toBe(rootTrunk.x);
      expect(segment.end.x).toBe(rootTrunk.x);
    }
    expect(rootTrunk.x).toBeGreaterThan(
      layout.blockById['trunk-root']!.x + layout.blockById['trunk-root']!.width,
    );
    expect(rootTrunk.x).toBeLessThan(layout.blockById['trunk-child-1']!.x);

    // Parent page: the horizontal lead leaves the parent port, then the
    // vertical trunk runs to the content bottom because a child is on a later
    // page.
    expect(rootTrunk.segments[0]!.start).toEqual({
      x: rootTrunk.x,
      y: rootTrunk.port.y,
    });
    expect(rootTrunk.segments[0]!.lead).toEqual({
      from: rootTrunk.port,
      to: rootTrunk.segments[0]!.start,
    });
    expect(rootTrunk.segments[0]!.end.y).toBeCloseTo(contentHeight, 6);

    // Pass-through page: no root-group child, still one full vertical segment.
    expect(rootTrunk.segments[1]!.start).toEqual({ x: rootTrunk.x, y: 0 });
    expect(rootTrunk.segments[1]!.end).toEqual({ x: rootTrunk.x, y: contentHeight });
    expect(
      model.edges[1]!.some(
        (edge) =>
          edge.branchId === 'branch-child-1' || edge.branchId === 'branch-child-2',
      ),
    ).toBe(false);

    // Last child page: the trunk stops exactly at the last child's left arm.
    const child2Edge = model.edges[2]!.find(
      (edge) => edge.branchId === 'branch-child-2',
    )!;
    expect(child2Edge).toBeDefined();
    expect(child2Edge.direction).toBe('trunk');
    expect(child2Edge.targetPage).toBeNull();
    expect(child2Edge.label).toBeUndefined();
    expect(child2Edge.trunk!.id).toBe(rootTrunk.id);
    expect(child2Edge.from).toEqual({ x: rootTrunk.x, y: 0 });
    expect(child2Edge.route.entry).toBe('left');
    expect(child2Edge.route.direction).toBe('right');
    expect(rootTrunk.segments[2]!.end).toEqual({
      x: rootTrunk.x,
      y: child2Edge.to.y,
    });
    expect(rootTrunk.segments[2]!.end.x).toBe(rootTrunk.x);

    // Every root-group child shares that one right trunk; no primary tree edge
    // carries a to-edge/from-edge indicator or a p.N chip.
    const child1Edge = model.edges[0]!.find(
      (edge) => edge.branchId === 'branch-child-1',
    )!;
    expect(child1Edge.direction).toBe('same-page');
    expect(child1Edge.trunk!.id).toBe(rootTrunk.id);
    expect(child1Edge.trunk!.x).toBe(rootTrunk.x);
    for (const pageEdges of model.edges) {
      for (const edge of pageEdges) {
        if (edge.role !== 'primary') continue;
        expect(edge.targetPage).toBeNull();
        expect(edge.label).toBeUndefined();
        expect(edge.direction === 'same-page' || edge.direction === 'trunk').toBe(true);
      }
    }

    // The nested parent opens its own trunk: distinct id and x, its own page
    // segments, and the same 8 px gap below its card on the parent page.
    const nestedView = model.trunks[0]!.find(
      (view) => view.trunk.id === 'trunk-child-1:below',
    )!;
    expect(nestedView).toBeDefined();
    const nestedTrunk = nestedView.trunk;
    expect(nestedTrunk.parentBlockId).toBe('trunk-child-1');
    expect(nestedTrunk.placement).toBe('below');
    expect(nestedTrunk.id).not.toBe(rootTrunk.id);
    expect(nestedTrunk.x).not.toBe(rootTrunk.x);
    expect(nestedTrunk.segments.map((segment) => segment.pageNumber)).toEqual([1, 2]);
    const child1Bottom =
      layout.blockById['trunk-child-1']!.y + layout.blockById['trunk-child-1']!.height;
    expect(nestedTrunk.segments[0]!.start.y - child1Bottom).toBeCloseTo(
      EDGE_STYLE.trunkGap,
      6,
    );
    expect(nestedTrunk.segments[0]!.end.y).toBeCloseTo(contentHeight, 6);

    const grandchildEdge = model.edges[1]!.find(
      (edge) => edge.branchId === 'branch-grandchild',
    )!;
    expect(grandchildEdge.direction).toBe('trunk');
    expect(grandchildEdge.trunk!.id).toBe(nestedTrunk.id);
    expect(nestedTrunk.segments[0]!.lead).toBeNull();
    expect(nestedTrunk.segments[1]!.end).toEqual({
      x: nestedTrunk.x,
      y: grandchildEdge.to.y,
    });
    expect(model.trunks[2]!.some((view) => view.trunk.id === nestedTrunk.id)).toBe(false);

    // The shared model is deterministic for Page Read/Edit and print.
    expect(JSON.stringify(buildPageEdgeModel(layout, pages.pages))).toBe(
      JSON.stringify(buildPageEdgeModel(layout, pages.pages)),
    );
  });

  it('keeps a single-child cross-page trunk on the same group contract', () => {
    const quote = 'one child';
    const rootText = 'A root with one child on the next page.';
    const start = rootText.indexOf(quote);
    const document: NoteDocument = {
      schemaVersion: 2,
      id: 'page-trunk-single',
      title: 'Single trunk',
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
                  ...(start > 0 ? [{ type: 'text', text: rootText.slice(0, start) }] : []),
                  {
                    type: 'text',
                    text: quote,
                    marks: [{ type: 'anchor', attrs: { anchorId: 'anchor-one' } }],
                  },
                  ...(start + quote.length < rootText.length
                    ? [{ type: 'text', text: rootText.slice(start + quote.length) }]
                    : []),
                ],
              },
            ],
          },
        },
        child: textBlock('child', 'Child', 'The only child of this parent.'),
      },
      anchors: {
        'anchor-one': {
          id: 'anchor-one',
          blockId: 'root',
          kind: 'text',
          selector: { kind: 'text', quote },
          quote,
        },
      },
      branches: {
        branch: {
          id: 'branch',
          source: { blockId: 'root', anchorId: 'anchor-one' },
          targetBlockId: 'child',
          role: 'primary',
          order: 'a',
        },
      },
      chapters: [{ id: 'chapter-1', title: 'Single', topLevelBlockIds: ['root'] }],
      assets: {},
    };
    const { layout, pages } = layoutPages(document, ['child']);
    expect(pages.pageCount).toBe(2);
    const model = buildPageEdgeModel(layout, pages.pages);
    const trunkView = model.trunks[0]!.find(
      (view) => view.trunk.id === 'root:below',
    )!;
    expect(trunkView).toBeDefined();
    expect(trunkView.segment.lead).toBeNull();
    expect(trunkView.trunk.segments.map((segment) => segment.pageNumber)).toEqual([1, 2]);
    const rootFragment = pages.pages[0]!.fragments.find(
      (fragment) => fragment.blockId === 'root',
    )!;
    expect(trunkView.segment.start.y).toBeCloseTo(
      rootFragment.page.y + rootFragment.page.height + EDGE_STYLE.trunkGap,
      6,
    );
    expect(trunkView.segment.end.y).toBe(layout.geometry.contentHeightPx);
    const arm = model.edges[1]!.find((edge) => edge.branchId === 'branch')!;
    expect(arm.direction).toBe('trunk');
    expect(arm.label).toBeUndefined();
    expect(model.trunks[1]![0]!.segment.end).toEqual({
      x: trunkView.trunk.x,
      y: arm.to.y,
    });
  });
});
