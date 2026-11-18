import { describe, expect, it } from 'vitest';
import {
  buildPageEdgeModel,
  DEFAULT_PAGE_SETTINGS,
  layoutDocument,
  mergePageSettings,
  normalizePageSettings,
  pageChromeLayout,
  pageCssVariables,
  pageEdgeLabelLayout,
  pageGeometry,
  pageLayoutOptions,
  pageSettingsFingerprint,
  paginate,
  type BlockMeasurement,
  type ContentBlock,
  type MeasurementMode,
  type MeasurementPort,
  type NoteDocument,
  type PageSetup,
} from '@noteforest/layout';
import { buildPrintModel, PrintModelSettingsMismatchError } from '@noteforest/pdf';
import {
  anchorRecordsByBlock,
  projectPageContent,
  segmentsForFragments,
} from '../src/renderer/src/page/projection';
import { buildSegments } from '../src/renderer/src/page/segments';

import { anchorViewForDocument } from './layout-view.js';
/**
 * M4c1 F1/F3 seam parity.
 *
 * Every fixture runs the real `layoutDocument` + `paginate` pipeline. The print
 * model is compared with the exact Page Read projection (the same function the
 * mounted PageView calls), not with a hand-built page list.
 */

const A4_LANDSCAPE: PageSetup = {
  size: 'A4',
  orientation: 'landscape',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
};
const A5_PORTRAIT: PageSetup = {
  size: 'A5',
  orientation: 'portrait',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
};
const A5_STACKED: PageSetup = {
  size: 'A5',
  orientation: 'portrait',
  margins: { top: 46, right: 46, bottom: 46, left: 46 },
};
const LETTER_PORTRAIT: PageSetup = {
  size: 'Letter',
  orientation: 'portrait',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
};

const CHROME = 2 * (DEFAULT_PAGE_SETTINGS.theme.cardPadding + DEFAULT_PAGE_SETTINGS.theme.cardBorder);

interface StubSpec {
  max: number;
  min: number;
  height?: number;
  segmentCount?: number;
  tableColumns?: Record<string, number[]>;
  missingAssetIds?: string[];
  anchors?: Array<{ anchorId: string; x: number; occurrence?: number }>;
}

function stubMeasurement(specs: Record<string, StubSpec>): MeasurementPort {
  return {
    measure(block: ContentBlock, mode: MeasurementMode): BlockMeasurement {
      const spec = specs[block.id] ?? { max: 100, min: 40 };
      const contentWidth =
        mode.kind === 'max-content'
          ? spec.max
          : mode.kind === 'min-content'
            ? spec.min
            : mode.contentWidth;
      const contentHeight = spec.height ?? 40;
      const contentTop =
        DEFAULT_PAGE_SETTINGS.theme.cardPadding + DEFAULT_PAGE_SETTINGS.theme.cardBorder;
      const segmentCount = Math.max(1, spec.segmentCount ?? 1);
      const segmentHeight = contentHeight / segmentCount;
      return {
        blockId: block.id,
        mode,
        cardWidth: contentWidth + CHROME,
        contentWidth,
        contentHeight,
        contentTop,
        labelHeight: 0,
        cardHeight:
          contentTop +
          contentHeight +
          DEFAULT_PAGE_SETTINGS.theme.cardPadding +
          DEFAULT_PAGE_SETTINGS.theme.cardBorder,
        maxContentWidth: spec.max,
        minContentWidth: spec.min,
        segments: Array.from({ length: segmentCount }, (_, index) => ({
          index,
          kind: 'paragraph' as const,
          nodePath: [0],
          y: index * segmentHeight,
          height: segmentHeight,
          breakableBefore: index > 0,
        })),
        anchors: (spec.anchors ?? []).map((anchor) => ({
          anchorId: anchor.anchorId,
          x: anchor.x,
          y: 0,
          width: 20,
          height: 10,
          occurrence: anchor.occurrence ?? 0,
        })),
        tableColumns: spec.tableColumns ?? {},
        missingAssetIds: spec.missingAssetIds ?? [],
      };
    },
  };
}

function textBlock(id: string, text = `Text for ${id}`): ContentBlock {
  return {
    id,
    label: id,
    content: {
      type: 'doc',
      children: [{ type: 'paragraph', children: [{ type: 'text', text }] }],
    },
  };
}

function makeDocument(input: {
  id: string;
  blocks: string[];
  edges?: Array<{ from: string; to: string; anchorId?: string; role?: 'primary' | 'reference' }>;
  anchors?: Array<{ id: string; blockId: string }>;
  specialBlocks?: ContentBlock[];
  chapters?: Array<{ id: string; title: string; topLevelBlockIds: string[] }>;
}): NoteDocument {
  const blocks: Record<string, ContentBlock> = {};
  for (const id of input.blocks) blocks[id] = textBlock(id);
  for (const block of input.specialBlocks ?? []) blocks[block.id] = block;
  const branches: Record<string, import('@noteforest/layout').BranchRecord> = {};
  for (const [index, edge] of (input.edges ?? []).entries()) {
    const id = `branch-${String(index + 1).padStart(2, '0')}`;
    branches[id] = {
      id,
      source: {
        blockId: edge.from,
        ...(edge.anchorId === undefined ? {} : { anchorId: edge.anchorId }),
      },
      targetBlockId: edge.to,
      role: edge.role ?? 'primary',
      order: id,
    };
  }
  const anchors: Record<string, import('@noteforest/layout').AnchorRecord> = {};
  for (const anchor of input.anchors ?? []) {
    anchors[anchor.id] = { id: anchor.id, blockId: anchor.blockId, kind: 'text', quote: anchor.id };
  }
  return {
    schemaVersion: 2,
    id: input.id,
    title: `Fixture ${input.id}`,
    revision: 3,
    blocks,
    anchors,
    branches,
    chapters:
      input.chapters ??
      [{ id: 'chapter-1', title: 'Chapter 1', topLevelBlockIds: [input.blocks[0]!] }],
    assets: {},
  };
}

function pipeline(
  document: NoteDocument,
  specs: Record<string, StubSpec>,
  setup: PageSetup,
  overrides: Parameters<typeof normalizePageSettings>[0] = {},
) {
  const settings = normalizePageSettings({ setup, ...overrides });
  return pipelineWithSettings(document, specs, settings);
}

function pipelineWithSettings(
  document: NoteDocument,
  specs: Record<string, StubSpec>,
  settings: ReturnType<typeof normalizePageSettings>,
) {
  const layout = layoutDocument(
    document,
    stubMeasurement(specs),
    pageLayoutOptions(settings.theme),
    settings.setup,
      anchorViewForDocument(document),
  );
  const paginated = paginate(layout, document, {
    manualBreakBeforeBlockIds: [...settings.manualBreakBeforeBlockIds],
  });
  const print = buildPrintModel(document, layout, paginated, {
    settings,
    pageModelFingerprint: pageSettingsFingerprint(settings),
  });
  const projection = projectPageContent({
    document,
    blocks: layout.blockById,
    pages: paginated.pages,
    defects: paginated.defects,
    anchors: layout.anchors,
    settings,
    geometry: layout.geometry,
    assets: {},
  });
  return { document, settings, layout, paginated, print, projection };
}

function modeAFixture() {
  return makeDocument({
    id: 'mode-a',
    blocks: ['root', 'c1', 'c2', 'k1', 'k2'],
    edges: [
      { from: 'root', to: 'c1', anchorId: 'a1' },
      { from: 'root', to: 'c2', anchorId: 'a2' },
      { from: 'root', to: 'k1' },
      { from: 'root', to: 'k2' },
    ],
    anchors: [
      { id: 'a1', blockId: 'root' },
      { id: 'a2', blockId: 'root' },
    ],
  });
}

const MODE_A_SPECS: Record<string, StubSpec> = {
  root: { max: 200, min: 100, anchors: [{ anchorId: 'a1', x: 20 }, { anchorId: 'a2', x: 60 }] },
  c1: { max: 120, min: 60 },
  c2: { max: 120, min: 60 },
  k1: { max: 200, min: 100 },
  k2: { max: 200, min: 100 },
};

/** Representative R2i: the whole first-child subtree fails right and wraps. */
function r2iFixture() {
  return makeDocument({
    id: 'r2i-wrap',
    blocks: ['root', 'c1', 'g1'],
    edges: [
      { from: 'root', to: 'c1' },
      { from: 'c1', to: 'g1' },
    ],
    chapters: [{ id: 'chapter-1', title: 'R2i wrap', topLevelBlockIds: ['root'] }],
  });
}

const R2I_SPECS: Record<string, StubSpec> = {
  root: { max: 200, min: 100 },
  c1: { max: 500, min: 100 },
  g1: { max: 500, min: 100 },
};

function expectSeamParity(result: ReturnType<typeof pipeline>): void {
  const { print, projection, layout, paginated, settings } = result;
  expect(print.pageCount).toBe(paginated.pageCount);
  expect(print.geometry).toEqual(pageGeometry(settings.setup));
  expect(print.fingerprint).toBe(pageSettingsFingerprint(settings));
  expect(print.cssVariables).toEqual(pageCssVariables(settings.theme));
  expect(projection.pages).toHaveLength(print.pageCount);
  const shared = buildPageEdgeModel(layout, paginated.pages);
  const anchorsByBlock = anchorRecordsByBlock(print.document.anchors);
  for (const [index, printPage] of print.pages.entries()) {
    const projected = projection.pages[index]!;
    expect(printPage.pageNumber).toBe(projected.page.pageNumber);
    expect(printPage.fragments).toEqual(projected.page.fragments);
    expect(printPage.edges).toEqual(shared.edges[index]);
    expect(printPage.trunks).toEqual(shared.trunks[index]);
    expect(printPage.chrome).toEqual(projected.chrome);
    expect(printPage.chrome).toMatchObject(pageChromeLayout(layout.geometry));
    expect(printPage.blockingDefects).toEqual(projected.blocking);
    expect(printPage.edgeLabels).toEqual(
      pageEdgeLabelLayout(printPage.edges, layout.geometry),
    );
    // The print model's own records (document + per-block measurements) build
    // exactly the Page Read segments.
    expect(
      segmentsForFragments({
        document: print.document,
        fragments: printPage.fragments,
        blocks: print.blocks,
        anchorsByBlock,
        assets: {},
        listIndent: pageLayoutOptions(settings.theme).wrapIndent,
      }),
    ).toEqual(projected.segmentsByBlock);
    // And every card's static HTML is byte-identical.
    for (const fragment of printPage.fragments) {
      const block = print.document.blocks[fragment.blockId]!;
      const segments = projected.segmentsByBlock[fragment.blockId] ?? [];
      const fromModel = print.blocks[fragment.blockId]!.measurement.tableColumns;
      expect(
        buildSegments(block, {
          assets: {},
          tableColumns: fromModel,
          anchors: anchorsByBlock.get(fragment.blockId) ?? [],
          listIndent: pageLayoutOptions(settings.theme).wrapIndent,
        }),
      ).toEqual(segments);
    }
  }
  const expectedPageByBlock: Record<string, number> = {};
  for (const projected of projection.pages) {
    for (const fragment of projected.page.fragments) {
      if (expectedPageByBlock[fragment.blockId] === undefined) {
        expectedPageByBlock[fragment.blockId] = projected.page.pageNumber;
      }
    }
  }
  expect(print.pageNumberByBlock).toEqual(expectedPageByBlock);
  expect(print.defects).toEqual(paginated.defects);
}

describe('F1 real-layout print parity (Page Read vs print model)', () => {
  it('mode A: segments, fragments, edges, trunks, chrome, and page numbers match', () => {
    const result = pipeline(modeAFixture(), MODE_A_SPECS, A4_LANDSCAPE);
    expectSeamParity(result);
    const page = result.print.pages[0]!;
    const callouts = page.edges.filter(
      (edge) => edge.branchId === 'branch-01' || edge.branchId === 'branch-02',
    );
    expect(callouts).toHaveLength(2);
    for (const edge of callouts) {
      expect(edge.placement).toBe('right');
      expect(edge.trunk?.id).toBe('root:right');
      expect(edge.route.entry).toBe('left');
    }
    // Print ignores nothing: the shared trunk records are the Page records.
    expect(page.trunks.map((view) => view.trunk.id)).toContain('root:right');
  });

  it('mode B2: both below trunks and all arms match Page Read', () => {
    const result = pipeline(modeAFixture(), MODE_A_SPECS, A5_PORTRAIT);
    expectSeamParity(result);
    const page = result.print.pages[0]!;
    const callout = page.edges.find((edge) => edge.branchId === 'branch-01')!;
    const child = page.edges.find((edge) => edge.branchId === 'branch-03')!;
    expect(callout.trunk!.id).toBe('root:below:callout');
    expect(child.trunk!.id).toBe('root:below:child');
    expect(child.trunk!.x).toBeLessThan(callout.trunk!.x);
    for (const edge of page.edges) expect(edge.route.entry).toBe('left');
  });

  it('stacked: legacy shared below trunk stays identical', () => {
    const result = pipeline(modeAFixture(), MODE_A_SPECS, A5_STACKED, {
      theme: { pagePacking: 'stacked' },
    });
    expect(result.settings.theme.pagePacking).toBe('stacked');
    expectSeamParity(result);
    const page = result.print.pages[0]!;
    expect(new Set(page.edges.map((edge) => edge.trunk?.id))).toEqual(new Set(['root:below']));
  });

  it('R2i: wrapped subtree placement and its trunks match Page Read', () => {
    const result = pipeline(r2iFixture(), R2I_SPECS, A4_LANDSCAPE);
    expectSeamParity(result);
    const root = result.layout.blockById.root!;
    const child = result.layout.blockById.c1!;
    const grandchild = result.layout.blockById.g1!;
    expect(child.placement).toBe('below');
    expect(root.x + 26).toBeCloseTo(child.x, 5);
    expect(grandchild.placement).toBe('right');
    expect(grandchild.x).toBeGreaterThan(child.x + child.width);
    expect(result.print.pages[0]!.fragments.find((item) => item.blockId === 'c1')!.page.x).toBe(
      child.x,
    );
  });

  it('keeps real continuation and cross-page reference records in the print model', () => {
    const document = makeDocument({
      id: 'continuations',
      blocks: ['a', 'b', 'long', 'ref-source'],
      edges: [{ from: 'ref-source', to: 'long', role: 'reference' }],
      chapters: [
        {
          id: 'chapter-1',
          title: 'Continuations',
          topLevelBlockIds: ['a', 'b', 'long', 'ref-source'],
        },
      ],
    });
    const specs: Record<string, StubSpec> = {
      a: { max: 200, min: 100, height: 80 },
      b: { max: 200, min: 100, height: 80 },
      long: { max: 300, min: 120, height: 2000, segmentCount: 20 },
      'ref-source': { max: 200, min: 100, height: 80 },
    };
    const result = pipeline(document, specs, A5_PORTRAIT, {
      manualBreakBeforeBlockIds: ['long'],
    });
    expectSeamParity(result);
    const continuationPages = result.print.pages.filter(
      (page) => page.chrome.continuesOn.length > 0 || page.chrome.continuedFrom.length > 0,
    );
    expect(continuationPages.length).toBeGreaterThan(0);
    expect(
      result.print.pages.some((page) =>
        page.edgeLabels.some((label) => label.direction === 'from-edge'),
      ),
    ).toBe(true);
    // R9: a block continuing across pages shares one projected segment list
    // instead of rebuilding it on every page.
    const pagesWithLong = result.projection.pages.filter(
      (page) => page.segmentsByBlock.long !== undefined,
    );
    expect(pagesWithLong.length).toBeGreaterThan(1);
    const firstSegments = pagesWithLong[0]!.segmentsByBlock.long;
    for (const page of pagesWithLong) {
      expect(page.segmentsByBlock.long).toBe(firstSegments);
    }
  });
});

describe('F3 shared chrome and edge-label positions', () => {
  it('uses the exact Page Read margin-band fractions and label offsets', () => {
    const result = pipeline(modeAFixture(), MODE_A_SPECS, A4_LANDSCAPE);
    const margins = result.layout.geometry.marginsPx;
    for (const page of result.print.pages) {
      expect(page.chrome.left).toBe(margins.left);
      expect(page.chrome.right).toBe(margins.right);
      expect(page.chrome.headerTop).toBeCloseTo(margins.top * 0.3, 10);
      expect(page.chrome.ghostTop).toBeCloseTo(margins.top * 0.62, 10);
      expect(page.chrome.footerBottom).toBeCloseTo(margins.bottom * 0.3, 10);
      expect(page.chrome.continuesBottom).toBeCloseTo(margins.bottom * 0.6, 10);
      expect(page.chrome.headerText).toBe(result.print.documentTitle);
      expect(page.chrome.footerText).toBe(page.chapterTitle);
      expect(page.chrome.pageLabel).toBe(
        `Page ${page.pageNumber} of ${result.print.pageCount}`,
      );
    }
  });

  it('keeps the chrome sources and page-number switch identical in Page Read and print', () => {
    const custom = pipeline(modeAFixture(), MODE_A_SPECS, A4_LANDSCAPE, {
      chrome: { header: 'none', footer: 'document', pageNumber: false },
    });
    expectSeamParity(custom);
    for (const page of custom.projection.pages) {
      expect(page.chrome.headerText).toBeNull();
      expect(page.chrome.footerText).toBe(page.chrome.documentTitle);
      expect(page.chrome.pageLabel).toBeNull();
      // Ghost/continues labels stay available regardless of chrome sources.
      expect(Array.isArray(page.chrome.continuedFrom)).toBe(true);
      expect(Array.isArray(page.chrome.continuesOn)).toBe(true);
    }
    const defaults = pipeline(modeAFixture(), MODE_A_SPECS, A4_LANDSCAPE);
    expectSeamParity(defaults);
    for (const projected of defaults.projection.pages) {
      expect(projected.chrome.headerText).toBe(projected.chrome.documentTitle);
      expect(projected.chrome.footerText).toBe(projected.chrome.chapterTitle);
      expect(projected.chrome.pageLabel).toBe(
        `Page ${projected.page.pageNumber} of ${defaults.print.pageCount}`,
      );
    }
  });
});

describe('A5/Letter and portrait/landscape geometry smoke', () => {
  const setups: Array<{ name: string; setup: PageSetup; widthMm: number; heightMm: number }> = [
    { name: 'A4 portrait', setup: { ...A4_LANDSCAPE, orientation: 'portrait' }, widthMm: 210, heightMm: 297 },
    { name: 'A4 landscape', setup: A4_LANDSCAPE, widthMm: 297, heightMm: 210 },
    { name: 'A5 portrait', setup: A5_PORTRAIT, widthMm: 148, heightMm: 210 },
    { name: 'A5 landscape', setup: { ...A5_PORTRAIT, orientation: 'landscape' }, widthMm: 210, heightMm: 148 },
    {
      name: 'Letter portrait',
      setup: { size: 'Letter', orientation: 'portrait', margins: { top: 12, right: 12, bottom: 12, left: 12 } },
      widthMm: 215.9,
      heightMm: 279.4,
    },
    {
      name: 'Letter landscape',
      setup: { size: 'Letter', orientation: 'landscape', margins: { top: 12, right: 12, bottom: 12, left: 12 } },
      widthMm: 279.4,
      heightMm: 215.9,
    },
  ];

  for (const { name, setup, widthMm, heightMm } of setups) {
    it(`${name}: page size, content size, and page count equal the paginator`, () => {
      const document = makeDocument({
        id: `geometry-${name}`,
        blocks: ['b1', 'b2', 'b3'],
        chapters: [{ id: 'chapter-1', title: 'Geometry', topLevelBlockIds: ['b1', 'b2', 'b3'] }],
      });
      const specs: Record<string, StubSpec> = {
        b1: { max: 300, min: 120, height: 600, segmentCount: 6 },
        b2: { max: 300, min: 120, height: 600, segmentCount: 6 },
        b3: { max: 300, min: 120, height: 600, segmentCount: 6 },
      };
      const result = pipeline(document, specs, setup);
      expectSeamParity(result);
      const geometry = pageGeometry(setup);
      expect(result.print.geometry).toEqual(geometry);
      expect(geometry.pageWidthMm).toBe(widthMm);
      expect(geometry.pageHeightMm).toBe(heightMm);
      expect(result.print.pageCount).toBe(result.paginated.pageCount);
      for (const page of result.print.pages) {
        for (const fragment of page.fragments) {
          expect(fragment.page.x).toBeGreaterThanOrEqual(-0.25);
          expect(fragment.page.y).toBeGreaterThanOrEqual(-0.25);
          expect(fragment.page.x + fragment.page.width).toBeLessThanOrEqual(
            geometry.contentWidthPx + 0.25,
          );
          expect(fragment.page.y + fragment.page.height).toBeLessThanOrEqual(
            geometry.contentHeightPx + 0.25,
          );
        }
      }
    });
  }
});

describe('M4d1 density identity (Page Read vs print model)', () => {
  it('keeps Page Read, print segments, and CSS identity under a density lens', () => {
    const result = pipeline(modeAFixture(), MODE_A_SPECS, A4_LANDSCAPE, {
      theme: { density: 0.9 },
    });
    expectSeamParity(result);
    expect(result.settings.theme.density).toBe(0.9);
    expect(result.layout.layoutOptions).toEqual(pageLayoutOptions(result.settings.theme));
    expect(result.print.fingerprint).toBe(pageSettingsFingerprint(result.settings));
    expect(result.print.cssVariables).toEqual(pageCssVariables(result.settings.theme));
    expect(result.print.cssVariables['--nf-page-body-size']).toBe('8.5pt');
    expect(result.print.cssVariables['--nf-page-card-padding']).toBe('7.2px');
    expect(result.print.cssVariables['--nf-page-max-card-width']).toBe('378px');
  });

  it('rejects a print model paired with a different density fingerprint', () => {
    const result = pipeline(modeAFixture(), MODE_A_SPECS, A4_LANDSCAPE, {
      theme: { density: 0.9 },
    });
    const other = normalizePageSettings({
      setup: A4_LANDSCAPE,
      theme: { density: 1 },
    });
    expect(() =>
      buildPrintModel(result.document, result.layout, undefined, {
        settings: result.settings,
        pageModelFingerprint: pageSettingsFingerprint(other),
      }),
    ).toThrow(PrintModelSettingsMismatchError);
    // The layout options themselves are also an identity input: a 100% layout
    // cannot claim the 90% settings even with a matching fingerprint string.
    expect(result.layout.layoutOptions).not.toEqual(pageLayoutOptions(other.theme));
  });
});

describe('Batch B Page settings parity (size, orientation, margins, density)', () => {
  const baseDocument = makeDocument({
    id: 'batch-b-parity',
    blocks: ['b1', 'b2', 'b3'],
    chapters: [{ id: 'chapter-1', title: 'Batch B', topLevelBlockIds: ['b1', 'b2', 'b3'] }],
  });
  const baseSpecs: Record<string, StubSpec> = {
    b1: { max: 300, min: 120, height: 420, segmentCount: 4 },
    b2: { max: 260, min: 100, height: 380, segmentCount: 3 },
    b3: { max: 320, min: 120, height: 520, segmentCount: 5 },
  };

  const setups: Array<{ name: string; setup: PageSetup }> = [
    { name: 'A4 portrait', setup: { ...A4_LANDSCAPE, orientation: 'portrait' } },
    { name: 'A4 landscape', setup: A4_LANDSCAPE },
    { name: 'A5 portrait', setup: A5_PORTRAIT },
    { name: 'A5 landscape', setup: { ...A5_PORTRAIT, orientation: 'landscape' } },
    { name: 'Letter portrait', setup: LETTER_PORTRAIT },
    { name: 'Letter landscape', setup: { ...LETTER_PORTRAIT, orientation: 'landscape' } },
  ];

  for (const { name, setup } of setups) {
    it(`${name}: Page Read projection and print model stay identical`, () => {
      const result = pipeline(baseDocument, baseSpecs, setup);
      expectSeamParity(result);
    });
  }

  const densityCases: Array<{ name: string; setup: PageSetup; density: number }> = [
    {
      name: 'A4 landscape 25 mm 60%',
      setup: { ...A4_LANDSCAPE, margins: { top: 25, right: 25, bottom: 25, left: 25 } },
      density: 0.6,
    },
    {
      name: 'A5 portrait 25 mm 100%',
      setup: { ...A5_PORTRAIT, margins: { top: 25, right: 25, bottom: 25, left: 25 } },
      density: 1,
    },
    {
      name: 'Letter landscape 25 mm 120%',
      setup: {
        ...LETTER_PORTRAIT,
        orientation: 'landscape',
        margins: { top: 25, right: 25, bottom: 25, left: 25 },
      },
      density: 1.2,
    },
  ];

  for (const { name, setup, density } of densityCases) {
    it(`${name}: non-default margins and density keep print parity`, () => {
      const result = pipeline(baseDocument, baseSpecs, setup, { theme: { density } });
      expectSeamParity(result);
      expect(result.settings.theme.density).toBeCloseTo(density, 10);
      expect(result.print.cssVariables).toEqual(pageCssVariables(result.settings.theme));
    });
  }

  it('resolves a document override with the global defaults and keeps one print model', () => {
    const global = mergePageSettings(DEFAULT_PAGE_SETTINGS, undefined);
    const resolved = mergePageSettings(global, {
      setup: {
        size: 'Letter',
        orientation: 'portrait',
        margins: { top: 20, right: 25, bottom: 20, left: 25 },
      },
      theme: { density: 1.2 },
    });
    expect(resolved.setup.size).toBe('Letter');
    expect(resolved.setup.orientation).toBe('portrait');
    expect(resolved.setup.margins).toEqual({ top: 20, right: 25, bottom: 20, left: 25 });
    expect(resolved.theme.density).toBe(1.2);
    // The global object is untouched by the override.
    expect(global.setup.size).toBe('A4');
    expect(global.setup.margins).toEqual({ top: 12, right: 12, bottom: 12, left: 12 });
    expect(global.theme.density).toBe(1);

    const result = pipelineWithSettings(baseDocument, baseSpecs, resolved);
    expectSeamParity(result);
    expect(result.print.geometry.pageWidthMm).toBe(215.9);
    expect(result.print.geometry.pageHeightMm).toBe(279.4);
    expect(result.projection.pages[0]!.chrome.left).toBeCloseTo(
      pageGeometry(resolved.setup).marginsPx.left,
      10,
    );
  });
});

describe('Batch C advanced typography/layout parity', () => {
  const document = makeDocument({
    id: 'batch-c-advanced',
    blocks: ['b1', 'b2', 'b3'],
    chapters: [{ id: 'chapter-1', title: 'Batch C', topLevelBlockIds: ['b1', 'b2', 'b3'] }],
  });
  const specs: Record<string, StubSpec> = {
    b1: { max: 300, min: 120, height: 500, segmentCount: 4 },
    b2: { max: 260, min: 100, height: 460, segmentCount: 3 },
    b3: { max: 320, min: 120, height: 620, segmentCount: 5 },
  };
  const advanced = {
    bodyPt: 11,
    bodyLine: 1.5,
    heading1Pt: 18,
    heading2Pt: 15,
    heading3Pt: 12,
    codePt: 9,
    codeLine: 1.4,
    tablePt: 9,
    tableLine: 1.3,
    labelPt: 10,
    minContentWidth: 180,
    cardPadding: 14,
    cardBorder: 2,
    segmentGap: 6,
    siblingGap: 20,
    calloutGap: 22,
    wrapIndent: 22,
    maxWrapIndent: 64,
    childIndent: 34,
    maxCardWidth: 360,
  } as const;

  it('keeps Page Read and the print model identical for every advanced field at 100%', () => {
    const result = pipeline(document, specs, A4_LANDSCAPE, { theme: advanced });
    expectSeamParity(result);
    expect(result.settings.theme).toMatchObject(advanced);
    expect(result.layout.layoutOptions).toEqual(pageLayoutOptions(result.settings.theme));
    expect(result.print.cssVariables).toEqual(pageCssVariables(result.settings.theme));
    expect(result.print.cssVariables).toMatchObject({
      '--nf-page-body-size': '11pt',
      '--nf-page-body-line': '1.5',
      '--nf-page-heading-1': '18pt',
      '--nf-page-heading-2': '15pt',
      '--nf-page-heading-3': '12pt',
      '--nf-page-code-size': '9pt',
      '--nf-page-code-line': '1.4',
      '--nf-page-table-size': '9pt',
      '--nf-page-table-line': '1.3',
      '--nf-page-label-size': '10pt',
      '--nf-page-card-padding': '14px',
      '--nf-page-card-border': '2px',
      '--nf-page-segment-gap': '6px',
      '--nf-page-max-card-width': '360px',
    });
    expect(result.layout.layoutOptions).toMatchObject({
      minContentWidth: 180,
      maxContentWidth: 360,
      cardPadding: 14,
      cardBorder: 2,
      segmentGap: 6,
      // The stored legacy corridor is kept on the theme but the engine uses
      // the fixed Page corridor.
      siblingGap: 18,
      calloutGap: 16,
      wrapIndent: 22,
      maxWrapIndent: 64,
      childIndent: 26,
    });
    expect(result.settings.theme.siblingGap).toBe(20);
    expect(result.settings.theme.childIndent).toBe(34);
  });

  it('applies the density lens once to advanced type and boxes', () => {
    const result = pipeline(document, specs, A4_LANDSCAPE, {
      theme: { ...advanced, density: 0.8 },
    });
    expectSeamParity(result);
    expect(result.settings.theme.density).toBe(0.8);
    // Stored values stay raw; the effective theme and print map agree.
    expect(result.settings.theme.bodyPt).toBe(11);
    expect(result.print.cssVariables['--nf-page-body-size']).toBe('9pt');
    expect(result.print.cssVariables['--nf-page-card-padding']).toBe('11.2px');
    expect(result.print.cssVariables['--nf-page-max-card-width']).toBe('288px');
    expect(result.layout.layoutOptions).toMatchObject({
      minContentWidth: 144,
      maxContentWidth: 288,
      cardPadding: 11.2,
      segmentGap: 4.8,
      siblingGap: 18,
      calloutGap: 16,
      wrapIndent: 22,
      maxWrapIndent: 64,
      childIndent: 26,
    });
  });

  it('keeps the density card band for preset-range caps and custom scaling outside it', () => {
    const inBand = pipeline(document, specs, A4_LANDSCAPE, {
      theme: { maxCardWidth: 360, density: 0.6 },
    });
    expectSeamParity(inBand);
    // 360 × 0.6 = 216 is lifted to the 240 px band floor.
    expect(inBand.layout.layoutOptions.maxContentWidth).toBe(240);

    const custom = pipeline(document, specs, A4_LANDSCAPE, {
      theme: { maxCardWidth: 700, density: 0.6 },
    });
    expectSeamParity(custom);
    // A custom cap outside 240–560 keeps its own proportional scaling.
    expect(custom.layout.layoutOptions.maxContentWidth).toBe(420);
    expect(custom.print.cssVariables['--nf-page-max-card-width']).toBe('420px');
  });
});
