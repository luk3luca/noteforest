import { describe, expect, it } from 'vitest';
import {
  buildPageEdgeModel,
  DEFAULT_PAGE_SETTINGS,
  layoutDocument,
  normalizePageSettings,
  pageChromeLayout,
  pageCssVariables,
  pageGeometry,
  pageLayoutOptions,
  pageSettingsFingerprint,
  paginate,
  type AnchorRecord,
  type BlockMeasurement,
  type BranchRecord,
  type ContentBlock,
  type MeasurementMode,
  type MeasurementPort,
  type NoteDocument,
  type PageSetup,
} from '@noteforest/layout';
import {
  buildPrintModel,
  PrintModelDocumentMismatchError,
  PrintModelSettingsMismatchError,
  type PrintModel,
} from '../src/printModel.js';

/**
 * M4c1 print-model tests.
 *
 * Every case runs the real `layoutDocument` + `paginate` pipeline over a
 * deterministic measurement port. Hand-built page/layout objects are never the
 * seam evidence (the old fixture that only exercised the shared-builder
 * callback was the F1 finding).
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

interface StubSpec {
  max: number;
  min: number;
  height?: number;
  /** Number of equal safe segments (default 1). */
  segmentCount?: number;
  tableColumns?: Record<string, number[]>;
  missingAssetIds?: string[];
  /** Explicit measured anchor rects for this block. */
  anchors?: Array<{ anchorId: string; x: number; occurrence?: number }>;
}

function stubMeasurement(specs: Record<string, StubSpec>): MeasurementPort {
  const chrome = 2 * (DEFAULT_PAGE_SETTINGS.theme.cardPadding + DEFAULT_PAGE_SETTINGS.theme.cardBorder);
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
        cardWidth: contentWidth + chrome,
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

interface EdgeSpec {
  from: string;
  to: string;
  anchorId?: string;
  role?: 'primary' | 'reference';
  label?: string;
}

interface AnchorSpec {
  id: string;
  blockId: string;
  kind?: AnchorRecord['kind'];
  quote?: string;
}

function makeDocument(input: {
  id?: string;
  blocks: string[];
  edges?: EdgeSpec[];
  anchors?: AnchorSpec[];
  chapters?: Array<{ id: string; title: string; topLevelBlockIds: string[] }>;
}): NoteDocument {
  const blocks: Record<string, ContentBlock> = {};
  for (const blockId of input.blocks) {
    blocks[blockId] = {
      id: blockId,
      label: blockId,
      content: {
        type: 'doc',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: `Text for ${blockId}` }],
          },
        ],
      },
    };
  }
  const branches: Record<string, BranchRecord> = {};
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
      ...(edge.label === undefined ? {} : { label: edge.label }),
    };
  }
  const anchors: Record<string, AnchorRecord> = {};
  for (const anchor of input.anchors ?? []) {
    anchors[anchor.id] = {
      id: anchor.id,
      blockId: anchor.blockId,
      kind: anchor.kind ?? 'text',
      quote: anchor.quote ?? anchor.id,
    };
  }
  return {
    schemaVersion: 2,
    id: input.id ?? 'print-model-fixture',
    title: 'Print model fixture',
    revision: 7,
    blocks,
    anchors,
    branches,
    chapters:
      input.chapters ??
      [{ id: 'chapter-1', title: 'Chapter 1', topLevelBlockIds: [input.blocks[0]!] }],
    assets: {},
  };
}

function layoutFor(
  document: NoteDocument,
  specs: Record<string, StubSpec>,
  setup: PageSetup = A4_LANDSCAPE,
  pageSettingsOverrides: Parameters<typeof normalizePageSettings>[0] = {},
) {
  const settings = normalizePageSettings({
    setup,
    ...pageSettingsOverrides,
  });
  const layout = layoutDocument(
    document,
    stubMeasurement(specs),
    pageLayoutOptions(settings.theme),
    settings.setup,
  );
  const paginated = paginate(layout, document, {
    manualBreakBeforeBlockIds: [...settings.manualBreakBeforeBlockIds],
  });
  return { settings, layout, paginated };
}

/**
 * Build with the required measured-run identity (M4c2 R1). Tests that need a
 * mismatch override one option explicitly.
 */
function buildModel(
  document: NoteDocument,
  run: Pick<ReturnType<typeof layoutFor>, 'layout' | 'paginated' | 'settings'>,
  overrides: Partial<Parameters<typeof buildPrintModel>[3]> = {},
) {
  return buildPrintModel(document, run.layout, run.paginated, {
    settings: run.settings,
    pageModelFingerprint: pageSettingsFingerprint(run.settings),
    ...overrides,
  });
}

function modeADocument(): { document: NoteDocument; specs: Record<string, StubSpec> } {
  const document = makeDocument({
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
  return {
    document,
    specs: {
      root: { max: 200, min: 100, anchors: [{ anchorId: 'a1', x: 20 }, { anchorId: 'a2', x: 60 }] },
      c1: { max: 120, min: 60 },
      c2: { max: 120, min: 60 },
      k1: { max: 200, min: 100 },
      k2: { max: 200, min: 100 },
    },
  };
}

function modeB2Document(): { document: NoteDocument; specs: Record<string, StubSpec> } {
  return modeADocument();
}

describe('print model from the real Page pipeline', () => {
  it('maps real layout pages, shared page edges/trunks, and page-number records (mode A)', () => {
    const { document, specs } = modeADocument();
    const { settings, layout, paginated } = layoutFor(document, specs);
    const model = buildModel(document, { settings, layout, paginated });

    expect(model.pageCount).toBe(paginated.pageCount);
    expect(model.pages.map((page) => page.pageNumber)).toEqual(
      paginated.pages.map((page) => page.pageNumber),
    );
    expect(model.pages.map((page) => page.fragments)).toEqual(
      paginated.pages.map((page) => page.fragments),
    );
    const shared = buildPageEdgeModel(layout, paginated.pages);
    for (const [index, page] of model.pages.entries()) {
      expect(page.edges).toEqual(shared.edges[index]);
      expect(page.trunks).toEqual(shared.trunks[index]);
      for (const edge of page.edges) {
        expect(edge.route.points.length).toBeGreaterThanOrEqual(2);
        expect(edge.route.tip).toEqual(edge.route.points.at(-1));
      }
    }
    // Mode A: both callouts share one right trunk at the parent's right lane.
    const calloutEdges = model.pages[0]!.edges.filter(
      (edge) => edge.branchId === 'branch-01' || edge.branchId === 'branch-02',
    );
    expect(calloutEdges).toHaveLength(2);
    for (const edge of calloutEdges) {
      expect(edge.placement).toBe('right');
      expect(edge.trunk?.id).toBe('root:right');
      expect(edge.route.entry).toBe('left');
      expect(edge.targetPage).toBeNull();
      expect(edge.label).toBeUndefined();
    }
    // pageNumberByBlock is the first page each block appears on.
    for (const page of model.pages) {
      for (const fragment of page.fragments) {
        if (model.pageNumberByBlock[fragment.blockId] === page.pageNumber) {
          expect(page.fragments.some((item) => item.blockId === fragment.blockId)).toBe(true);
        }
      }
    }
    expect(model.pageNumberByBlock.root).toBe(1);
    expect(model.fingerprint).toBe(pageSettingsFingerprint(settings));
  });

  it('keeps the two R2j B2 below trunks independent (A5 portrait)', () => {
    const { document, specs } = modeB2Document();
    const { settings, layout, paginated } = layoutFor(document, specs, A5_PORTRAIT);
    const model = buildModel(document, { settings, layout, paginated });
    const page = model.pages[0]!;
    const callout = page.edges.find((edge) => edge.branchId === 'branch-01')!;
    const child = page.edges.find((edge) => edge.branchId === 'branch-03')!;
    expect(callout.trunk!.id).toBe('root:below:callout');
    expect(callout.trunk!.trunkGroup).toBe('callout');
    expect(child.trunk!.id).toBe('root:below:child');
    expect(child.trunk!.trunkGroup).toBe('child');
    expect(child.trunk!.x).toBeLessThan(callout.trunk!.x);
    expect(page.trunks.map((view) => view.trunk.id).sort()).toEqual([
      'root:below:callout',
      'root:below:child',
    ]);
    for (const edge of page.edges) expect(edge.route.entry).toBe('left');
  });

  it('keeps the explicit stacked legacy geometry when the resolved theme asks for it', () => {
    const { document, specs } = modeADocument();
    const { settings, layout, paginated } = layoutFor(
      document,
      specs,
      A5_STACKED,
      { theme: { pagePacking: 'stacked' } },
    );
    expect(settings.theme.pagePacking).toBe('stacked');
    const model = buildModel(document, { settings, layout, paginated });
    const page = model.pages[0]!;
    const primary = page.edges.filter((edge) => edge.role === 'primary');
    expect(primary).toHaveLength(4);
    // One shared below trunk owns every child in the stacked geometry.
    expect(new Set(primary.map((edge) => edge.trunk?.id))).toEqual(new Set(['root:below']));
    for (const edge of primary) {
      expect(edge.placement).toBe('below');
      expect(edge.route.entry).toBe('left');
    }
  });

  it('carries resolved theme, CSS variables, document content, measurements, anchors, assets, and chrome', () => {
    const document = makeDocument({
      id: 'complete-inputs',
      blocks: ['root', 'child', 'resolved', 'broken', 'ambiguous', 'table', 'image'],
      edges: [
        { from: 'root', to: 'resolved', anchorId: 'a-resolved' },
        { from: 'root', to: 'broken', anchorId: 'a-broken' },
        { from: 'root', to: 'ambiguous', anchorId: 'a-ambiguous' },
        { from: 'root', to: 'child' },
      ],
      anchors: [
        { id: 'a-resolved', blockId: 'root' },
        { id: 'a-broken', blockId: 'root' },
        { id: 'a-ambiguous', blockId: 'root' },
      ],
      chapters: [
        {
          id: 'chapter-1',
          title: 'Complete inputs',
          topLevelBlockIds: ['root', 'table', 'image'],
        },
      ],
    });
    const specs: Record<string, StubSpec> = {
      root: {
        max: 200,
        min: 100,
        anchors: [
          { anchorId: 'a-resolved', x: 12 },
          { anchorId: 'a-ambiguous', x: 24, occurrence: 0 },
          { anchorId: 'a-ambiguous', x: 44, occurrence: 1 },
        ],
      },
      child: { max: 120, min: 60 },
      resolved: { max: 120, min: 60 },
      broken: { max: 120, min: 60 },
      ambiguous: { max: 120, min: 60 },
      table: { max: 300, min: 120, tableColumns: { '0': [140, 90] } },
      image: { max: 200, min: 80, missingAssetIds: ['img-missing'] },
    };
    const { settings, layout, paginated } = layoutFor(document, specs);
    const model = buildModel(document, { settings, layout, paginated }, {
      failedAssetIds: ['img-failed'],
      assetUrls: { 'img-ok': 'noteforest-asset://ok', 'img-failed': 'noteforest-asset://bad' },
    });

    // Resolved theme and CSS map are the compositor's only metric source.
    expect(model.settings).toEqual(settings);
    expect(model.cssVariables).toEqual(pageCssVariables(settings.theme));
    expect(model.pageSetup).toEqual(settings.setup);
    expect(model.geometry).toEqual(pageGeometry(settings.setup));
    // The previous unused `document` argument is now the content record.
    expect(model.document).toBe(document);
    expect(model.document.blocks.table!.content.children?.[0]?.type).toBe('paragraph');
    // Measurements/table columns come from the real layout records.
    expect(model.blocks.table!.measurement.tableColumns).toEqual({ '0': [140, 90] });
    expect(model.blocks.root!.measurement.contentHeight).toBe(40);
    // Resolved/broken/ambiguous anchor attachments are carried unchanged.
    expect(model.anchors.find((anchor) => anchor.anchorId === 'a-resolved')?.state).toBe('resolved');
    expect(model.anchors.find((anchor) => anchor.anchorId === 'a-broken')?.state).toBe('broken');
    expect(model.anchors.find((anchor) => anchor.anchorId === 'a-ambiguous')?.state).toBe('ambiguous');
    // Failed and indexed-missing assets are explicit.
    expect(model.failedAssetIds).toEqual(['img-failed']);
    expect(model.missingAssetIds).toEqual(['img-missing']);
    expect(model.assetUrls).toEqual({ 'img-ok': 'noteforest-asset://ok' });
    // Page chrome positions/text and cross-page labels are model records.
    expect(model.pages[0]!.chrome).toMatchObject(pageChromeLayout(model.geometry));
    expect(model.pages[0]!.chrome.documentTitle).toBe('Print model fixture');
    expect(model.pages[0]!.chrome.chapterTitle).toBe('Complete inputs');
    expect(model.pages[0]!.chrome.headerText).toBe('Print model fixture');
    expect(model.pages[0]!.chrome.footerText).toBe('Complete inputs');
    expect(model.pages[0]!.chrome.pageLabel).toBe(`Page 1 of ${model.pageCount}`);
    // Defects are carried with the model, including non-blocking anchor warnings.
    expect(model.defects.some((defect) => defect.code === 'broken-anchor')).toBe(true);
    expect(model.defects.some((defect) => defect.code === 'ambiguous-anchor')).toBe(true);
    expect(model.blockingDefects).toEqual([]);
  });

  it('records cross-page labels and continuation chrome from real pagination', () => {
    const document = makeDocument({
      id: 'cross-page',
      blocks: ['a', 'b', 'long'],
      edges: [{ from: 'a', to: 'b', role: 'reference', label: 'See also' }],
      chapters: [{ id: 'chapter-1', title: 'Cross page', topLevelBlockIds: ['a', 'b', 'long'] }],
    });
    const specs: Record<string, StubSpec> = {
      a: { max: 200, min: 100, height: 300 },
      b: { max: 200, min: 100, height: 300 },
      long: { max: 300, min: 120, height: 2000, segmentCount: 20 },
    };
    const { settings, layout, paginated } = layoutFor(document, specs, A5_PORTRAIT, {
      manualBreakBeforeBlockIds: ['b'],
    });
    expect(paginated.pageCount).toBeGreaterThan(1);
    const model = buildModel(document, { settings, layout, paginated });
    const targetPage = model.pageNumberByBlock.b!;
    const target = model.pages[targetPage - 1]!;
    const label = target.edgeLabels.find((item) => item.edge.branchId === 'branch-01');
    expect(label).toBeDefined();
    expect(label!.direction).toBe('from-edge');
    expect(label!.text).toBe(`← p.${model.pageNumberByBlock.a}`);
    expect(label!.accessibleLabel).toContain('Reference');
    expect(label!.accessibleLabel).toContain('continued from page');
    const continuationPages = model.pages.filter(
      (page) => page.chrome.continuesOn.length > 0 || page.chrome.continuedFrom.length > 0,
    );
    expect(continuationPages.length).toBeGreaterThan(0);
  });

  it('renders the resolved R2 chrome sources and page-number switch on every page', () => {
    const { document, specs } = modeADocument();
    const custom = layoutFor(document, specs, A4_LANDSCAPE, {
      chrome: { header: 'chapter', footer: 'none', pageNumber: false },
    });
    const model = buildModel(document, custom);
    expect(model.settings.chrome).toEqual({
      header: 'chapter',
      footer: 'none',
      pageNumber: false,
    });
    for (const page of model.pages) {
      expect(page.chrome.headerText).toBe(page.chapterTitle);
      expect(page.chrome.footerText).toBeNull();
      expect(page.chrome.pageLabel).toBeNull();
      // Titles stay available for the ghost/continues bands.
      expect(page.chrome.documentTitle).toBe('Print model fixture');
      expect(page.chrome.chapterTitle.length).toBeGreaterThan(0);
    }
    // Nothing is suppressed on page 1: the default number is on for every page.
    const defaults = buildModel(document, layoutFor(document, specs));
    expect(defaults.pages[0]!.chrome.pageLabel).toBe(`Page 1 of ${defaults.pageCount}`);
    expect(defaults.pages.at(-1)!.chrome.pageLabel).toBe(
      `Page ${defaults.pageCount} of ${defaults.pageCount}`,
    );
    expect(defaults.pages[0]!.chrome.headerText).toBe('Print model fixture');
    expect(defaults.pages[0]!.chrome.footerText).toBe(defaults.pages[0]!.chapterTitle);
  });
});

describe('print model identity (M4c2 R1/R4/R5)', () => {
  it('fails loudly when the layout was measured with a different page setup', () => {
    const { document, specs } = modeADocument();
    const { layout, paginated } = layoutFor(document, specs, A4_LANDSCAPE);
    const other = normalizePageSettings({ setup: A5_PORTRAIT });
    const options = {
      settings: other,
      pageModelFingerprint: pageSettingsFingerprint(other),
    };
    expect(() => buildPrintModel(document, layout, paginated, options)).toThrow(
      PrintModelSettingsMismatchError,
    );
    expect(() => buildPrintModel(document, layout, paginated, options)).toThrow(/page setup/);
  });

  it('requires the measured-run fingerprint (no opt-out)', () => {
    const { document, specs } = modeADocument();
    const { settings, layout, paginated } = layoutFor(document, specs);
    // A JS caller (or a stale build) that omits the argument must fail, not
    // silently pair a layout with a different resolved theme.
    expect(() =>
      buildPrintModel(document, layout, paginated, { settings } as never),
    ).toThrow(PrintModelSettingsMismatchError);
    expect(() =>
      buildPrintModel(document, layout, paginated, { settings } as never),
    ).toThrow(/fingerprint of the measured page model run/);
    expect(() =>
      buildPrintModel(document, layout, paginated, {
        settings,
        pageModelFingerprint: '',
      }),
    ).toThrow(/fingerprint of the measured page model run/);
  });

  it('rejects a layout measured under a different theme, even with the same page setup', () => {
    const { document, specs } = modeADocument();
    const compact = layoutFor(document, specs, A4_LANDSCAPE);
    const comfortable = normalizePageSettings({
      setup: A4_LANDSCAPE,
      theme: { preset: 'comfortable' },
    });
    expect(comfortable.theme.bodyPt).not.toBe(compact.settings.theme.bodyPt);
    // The stale fingerprint of the compact run does not match the comfortable
    // resolved settings, so the model cannot claim one run while printing another.
    expect(() =>
      buildPrintModel(document, compact.layout, compact.paginated, {
        settings: comfortable,
        pageModelFingerprint: pageSettingsFingerprint(compact.settings),
      }),
    ).toThrow(PrintModelSettingsMismatchError);
    // Even a fabricated matching fingerprint cannot pass: the measured layout
    // records its resolved LayoutOptions and must equal the resolved theme.
    expect(() =>
      buildPrintModel(document, compact.layout, compact.paginated, {
        settings: comfortable,
        pageModelFingerprint: pageSettingsFingerprint(comfortable),
      }),
    ).toThrow(/PageTheme/);
  });

  it('treats a layout without recorded layoutOptions as a theme mismatch (S3-1)', () => {
    const { document, specs } = modeADocument();
    const { settings, layout, paginated } = layoutFor(document, specs);
    const stripped = { ...layout };
    delete stripped.layoutOptions;
    expect(() =>
      buildPrintModel(document, stripped, paginated, {
        settings,
        pageModelFingerprint: pageSettingsFingerprint(settings),
      }),
    ).toThrow(PrintModelSettingsMismatchError);
    expect(() =>
      buildPrintModel(document, stripped, paginated, {
        settings,
        pageModelFingerprint: pageSettingsFingerprint(settings),
      }),
    ).toThrow(/PageTheme/);
  });

  it('treats a chrome change as part of the measured/print identity', () => {
    const { document, specs } = modeADocument();
    const measured = layoutFor(document, specs);
    const chromeOnly = normalizePageSettings({
      setup: A4_LANDSCAPE,
      chrome: { header: 'none' },
    });
    expect(pageSettingsFingerprint(chromeOnly)).not.toBe(
      pageSettingsFingerprint(measured.settings),
    );
    // A stale measured run cannot be printed with a different chrome setting,
    // even though chrome does not change page geometry.
    expect(() =>
      buildPrintModel(document, measured.layout, measured.paginated, {
        settings: chromeOnly,
        pageModelFingerprint: pageSettingsFingerprint(measured.settings),
      }),
    ).toThrow(PrintModelSettingsMismatchError);
    const fresh = layoutFor(document, specs, A4_LANDSCAPE, {
      chrome: { header: 'none' },
    });
    const model = buildModel(document, fresh);
    expect(model.pages[0]!.chrome.headerText).toBeNull();
  });

  it('fails loudly when the pages were paginated with different manual breaks', () => {
    const document = makeDocument({
      id: 'manual-break-identity',
      blocks: ['b1', 'b2'],
      chapters: [{ id: 'chapter-1', title: 'Two blocks', topLevelBlockIds: ['b1', 'b2'] }],
    });
    const specs: Record<string, StubSpec> = {
      b1: { max: 200, min: 100, height: 60 },
      b2: { max: 200, min: 100, height: 60 },
    };
    const withoutBreaks = layoutFor(document, specs, A4_LANDSCAPE);
    expect(withoutBreaks.paginated.pageCount).toBe(1);
    const withBreaks = normalizePageSettings({
      setup: A4_LANDSCAPE,
      manualBreakBeforeBlockIds: ['b2'],
    });
    expect(() =>
      buildPrintModel(document, withoutBreaks.layout, withoutBreaks.paginated, {
        settings: withBreaks,
        pageModelFingerprint: pageSettingsFingerprint(withBreaks),
      }),
    ).toThrow(/manual breaks/);
  });

  it('fails loudly when the page-model fingerprint belongs to a stale settings run', () => {
    const { document, specs } = modeADocument();
    const { settings, layout, paginated } = layoutFor(document, specs);
    expect(() =>
      buildPrintModel(document, layout, paginated, {
        settings,
        pageModelFingerprint: 'stale-page-model',
      }),
    ).toThrow(/fingerprint/);
    const model = buildPrintModel(document, layout, paginated, {
      settings,
      pageModelFingerprint: pageSettingsFingerprint(settings),
    });
    expect(model.fingerprint).toBe(pageSettingsFingerprint(settings));
  });

  it('fails loudly when the layout/pages belong to another document', () => {
    const { document, specs } = modeADocument();
    const { settings, layout, paginated } = layoutFor(document, specs);
    const other = makeDocument({
      id: 'other-document',
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
    expect(() =>
      buildPrintModel(other, layout, paginated, {
        settings,
        pageModelFingerprint: pageSettingsFingerprint(settings),
      }),
    ).toThrow(PrintModelDocumentMismatchError);
    expect(() =>
      buildPrintModel(other, layout, paginated, {
        settings,
        pageModelFingerprint: pageSettingsFingerprint(settings),
      }),
    ).toThrow(/not other-document/);
  });

  it('fails loudly when the document revision advanced after the measured run', () => {
    const { document, specs } = modeADocument();
    const { settings, layout, paginated } = layoutFor(document, specs);
    const advanced = { ...document, revision: (document.revision ?? 0) + 1 };
    expect(() =>
      buildPrintModel(advanced, layout, paginated, {
        settings,
        pageModelFingerprint: pageSettingsFingerprint(settings),
      }),
    ).toThrow(PrintModelDocumentMismatchError);
    expect(() =>
      buildPrintModel(advanced, layout, paginated, {
        settings,
        pageModelFingerprint: pageSettingsFingerprint(settings),
      }),
    ).toThrow(/revision/);
  });

  it('takes defects and manual-break warnings from the validated run (R4)', () => {
    const document = makeDocument({
      id: 'warning-carry',
      blocks: ['b1', 'b2'],
      chapters: [{ id: 'chapter-1', title: 'Warnings', topLevelBlockIds: ['b1', 'b2'] }],
    });
    const specs: Record<string, StubSpec> = {
      b1: { max: 200, min: 100, height: 60 },
      b2: { max: 200, min: 100, height: 60 },
    };
    const settings = normalizePageSettings({
      setup: A4_LANDSCAPE,
      manualBreakBeforeBlockIds: ['unknown-block'],
    });
    const layout = layoutDocument(
      document,
      stubMeasurement(specs),
      pageLayoutOptions(settings.theme),
      settings.setup,
    );
    const validated = paginate(layout, document, {
      manualBreakBeforeBlockIds: [...settings.manualBreakBeforeBlockIds],
    });
    expect(validated.manualBreakWarnings.length).toBeGreaterThan(0);
    // A caller-supplied page list with the same geometry but stale diagnostics
    // must not erase the warning: the validated run owns defects/warnings.
    const stale = {
      ...validated,
      defects: [],
      manualBreakWarnings: [],
    };
    const model = buildPrintModel(document, layout, stale, {
      settings,
      pageModelFingerprint: pageSettingsFingerprint(settings),
    });
    expect(model.manualBreakWarnings).toEqual(validated.manualBreakWarnings);
    expect(
      model.manualBreakWarnings.some((warning) => warning.code === 'impossible-hint'),
    ).toBe(true);
    expect(model.defects.length).toBeGreaterThan(0);
  });

  it('can derive pagination itself from the resolved settings when pages are omitted', () => {
    const { document, specs } = modeADocument();
    const { settings, layout, paginated } = layoutFor(document, specs);
    const model = buildModel(document, { settings, layout, paginated: undefined });
    expect(model.pageCount).toBe(paginated.pageCount);
    expect(model.pages.map((page) => page.fragments)).toEqual(
      paginated.pages.map((page) => page.fragments),
    );
  });
});

/** Type-level guard: the compositor input is a plain serializable record. */
export type PrintModelRecord = PrintModel;
