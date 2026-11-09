/**
 * Print-only Page model.
 *
 * The model is the complete input of the print compositor: it is built from the
 * same real `layoutDocument` + `paginate` output as Page Read, carries the
 * resolved personal page lens (theme, CSS variables, page settings), the
 * per-block measurements and document content needed by `buildSegments`, the
 * anchor/missing-asset diagnostics, and the shared page-chrome/edge-label
 * layout. It never re-routes edges and never lays out or measures content.
 *
 * Settings identity is enforced before a page record is emitted: the layout's
 * page setup/geometry must equal the resolved settings, and the supplied
 * paginated document is re-derived with the resolved manual breaks. A stale or
 * mismatched pair fails loudly instead of silently printing another page count.
 */

import {
  blockingDefects as layoutBlockingDefects,
  buildPageEdgeModel,
  pageChromeContent,
  pageChromeLayout,
  pageCssVariables,
  pageEdgeLabelLayout,
  pageGeometry,
  pageSettingsFingerprint,
  pageBlockingDefects,
  paginate,
  type AnchorAttachment,
  type AnchorState,
  type BlockMeasurement,
  type BlockRole,
  type ContinuationIn,
  type ContinuationOut,
  type ContinuousLayout,
  type DerivedPage,
  type EdgePlacement,
  type LayoutDefect,
  type NoteDocument,
  type PageChromeContent,
  type PageChromeLayout,
  type PageEdge,
  type PageEdgeDirection,
  type PageEdgeLabelLayout,
  type PageEdgeTrunkView,
  type PageFragment,
  type PageGeometry,
  type PageSettings,
  type PageSetup,
  type PaginatedDocument,
} from '@noteforest/layout';

export type PrintEdgeDirection = PageEdgeDirection;
export type PrintEdge = PageEdge;
export type PrintEdgeLabel = PageEdgeLabelLayout;

/** One block's resolved geometry/measurement record for the compositor. */
export interface PrintBlock {
  blockId: string;
  chapterId: string;
  role: BlockRole;
  placement: EdgePlacement;
  /** R2j B2 below-group split; null for right/shared below groups. */
  trunkGroup: 'callout' | 'child' | null;
  depth: number;
  measurement: BlockMeasurement;
  anchorState: AnchorState;
  anchorPoint: { x: number; y: number; width: number; height: number } | null;
  warningPoint: { x: number; y: number } | null;
}

/** Shared margin-band positions plus the resolved chrome text. */
export interface PrintPageChrome extends PageChromeLayout, PageChromeContent {}

export interface PrintAnchorWarning {
  blockId: string;
  attachments: AnchorAttachment[];
}

export interface PrintPage {
  pageNumber: number;
  chapterId: string;
  chapterIndex: number;
  yStart: number;
  yEnd: number;
  overflow: boolean;
  chapterTitle: string;
  isChapterStart: boolean;
  fragments: PageFragment[];
  continuationIn: ContinuationIn[];
  continuationOut: ContinuationOut[];
  edges: PrintEdge[];
  /** Group-trunk segments for this page, including pass-through pages. */
  trunks: PageEdgeTrunkView[];
  /** Cross-page `← p.N` / `→ p.N` labels at the shared positions. */
  edgeLabels: PrintEdgeLabel[];
  /** Header/ghost/footer/continues positions and text. */
  chrome: PrintPageChrome;
  /** Blocking defects that apply to this page (page or fragment scoped). */
  blockingDefects: LayoutDefect[];
  /** Non-resolved anchor attachments for first fragments on this page. */
  anchorWarnings: PrintAnchorWarning[];
  /** Asset ids whose bytes are missing in this page's measurements. */
  missingAssetIds: string[];
}

export interface PrintModel {
  documentId: string;
  documentTitle: string;
  revision: number | undefined;
  /** Canonical content and anchor/asset records consumed by `buildSegments`. */
  document: NoteDocument;
  /** Resolved personal page lens used for layout, pagination, and print CSS. */
  settings: PageSettings;
  /** Deterministic identity of the resolved settings. */
  fingerprint: string;
  /** Resolved `pageCssVariables(theme)` — never the stylesheet fallback. */
  cssVariables: Record<string, string>;
  pageSetup: PageSetup;
  geometry: PageGeometry;
  pages: PrintPage[];
  pageCount: number;
  pageNumberByBlock: Record<string, number>;
  defects: LayoutDefect[];
  blockingDefects: LayoutDefect[];
  manualBreakWarnings: LayoutDefect[];
  /** Resolved per-block measurements, keyed by block id. */
  blocks: Record<string, PrintBlock>;
  anchors: AnchorAttachment[];
  /** Asset ids whose bytes could not be decoded; they render placeholders. */
  failedAssetIds: string[];
  /** Indexed assets missing from the document; they also render placeholders. */
  missingAssetIds: string[];
  /** Display URLs for available assets; never includes a failed asset. */
  assetUrls: Record<string, string>;
}

export interface PrintModelOptions {
  /** Resolved page settings used for the measured layout/pages. */
  settings: PageSettings;
  /**
   * Fingerprint returned by the page-model run that produced `layout`/`pages`.
   * When supplied it must equal the resolved settings fingerprint.
   */
  pageModelFingerprint?: string;
  /** Asset ids whose bytes failed to load/decode during measurement. */
  failedAssetIds?: readonly string[];
  /** Renderer-safe asset URLs for the available assets. */
  assetUrls?: Readonly<Record<string, string>>;
}

export class PrintModelSettingsMismatchError extends Error {
  readonly fingerprint: string;

  constructor(message: string, fingerprint: string) {
    super(message);
    this.name = 'PrintModelSettingsMismatchError';
    this.fingerprint = fingerprint;
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function paginationSignature(pages: readonly DerivedPage[]): string {
  return JSON.stringify(
    pages.map((page) => ({
      pageNumber: page.pageNumber,
      chapterId: page.chapterId,
      chapterIndex: page.chapterIndex,
      chapterTitle: page.chapterTitle,
      yStart: page.yStart,
      yEnd: page.yEnd,
      isChapterStart: page.isChapterStart,
      overflow: page.overflow,
      fragments: page.fragments.map((fragment) => ({
        blockId: fragment.blockId,
        chapterId: fragment.chapterId,
        role: fragment.role,
        depth: fragment.depth,
        source: fragment.source,
        page: fragment.page,
        startSegment: fragment.startSegment,
        endSegment: fragment.endSegment,
        isFirst: fragment.isFirst,
        isLast: fragment.isLast,
        isPageStart: fragment.isPageStart,
        continuesToPage: fragment.continuesToPage,
        continuedFromPage: fragment.continuedFromPage,
      })),
      continuationOut: page.continuationOut,
      continuationIn: page.continuationIn,
    })),
  );
}

function assertSettingsIdentity(
  layout: ContinuousLayout,
  settings: PageSettings,
  pageModelFingerprint: string | undefined,
): string {
  const fingerprint = pageSettingsFingerprint(settings);
  if (pageModelFingerprint !== undefined && pageModelFingerprint !== fingerprint) {
    throw new PrintModelSettingsMismatchError(
      `Print model does not match the resolved page settings: page model fingerprint ${pageModelFingerprint} != resolved ${fingerprint}.`,
      fingerprint,
    );
  }
  if (!sameJson(layout.pageSetup, settings.setup)) {
    throw new PrintModelSettingsMismatchError(
      'Print model does not match the resolved page setup; the layout was measured with different page size, orientation, or margins.',
      fingerprint,
    );
  }
  if (!sameJson(layout.geometry, pageGeometry(settings.setup))) {
    throw new PrintModelSettingsMismatchError(
      'Print model geometry does not match the resolved page settings.',
      fingerprint,
    );
  }
  return fingerprint;
}

function anchorWarningsByBlock(
  anchors: readonly AnchorAttachment[],
): Map<string, AnchorAttachment[]> {
  const grouped = new Map<string, AnchorAttachment[]>();
  for (const attachment of anchors) {
    if (attachment.state === 'resolved') continue;
    const list = grouped.get(attachment.blockId) ?? [];
    list.push(attachment);
    grouped.set(attachment.blockId, list);
  }
  return grouped;
}

function pageAnchorWarnings(
  page: DerivedPage,
  warnings: ReadonlyMap<string, AnchorAttachment[]>,
): PrintAnchorWarning[] {
  const result: PrintAnchorWarning[] = [];
  for (const fragment of page.fragments) {
    if (!fragment.isFirst) continue;
    const attachments = warnings.get(fragment.blockId);
    if (attachments !== undefined) {
      result.push({ blockId: fragment.blockId, attachments: [...attachments] });
    }
  }
  return result;
}

function pageMissingAssets(page: DerivedPage, blocks: Readonly<Record<string, PrintBlock>>): string[] {
  const ids = new Set<string>();
  for (const fragment of page.fragments) {
    const block = blocks[fragment.blockId];
    for (const assetId of block?.measurement.missingAssetIds ?? []) ids.add(assetId);
  }
  return [...ids].sort();
}

/**
 * Build the complete print model.
 *
 * `paginated` is optional: when omitted the model derives it from the resolved
 * settings. When supplied it is validated against a fresh `paginate` run with
 * the resolved personal manual breaks, so a stale page list cannot be printed.
 */
export function buildPrintModel(
  document: NoteDocument,
  layout: ContinuousLayout,
  paginated: PaginatedDocument | undefined,
  options: PrintModelOptions,
): PrintModel {
  const { settings } = options;
  const fingerprint = assertSettingsIdentity(layout, settings, options.pageModelFingerprint);
  const expected = paginate(layout, document, {
    manualBreakBeforeBlockIds: [...settings.manualBreakBeforeBlockIds],
  });
  if (
    paginated !== undefined &&
    paginationSignature(expected.pages) !== paginationSignature(paginated.pages)
  ) {
    throw new PrintModelSettingsMismatchError(
      'Print model does not match the resolved settings/manual breaks: the supplied pages were not paginated with this page lens.',
      fingerprint,
    );
  }
  const derived = paginated ?? expected;
  const pages = derived.pages;

  // One edge mapper is shared with the Page renderer (`buildPageEdgeModel`), so
  // the print compositor cannot drift onto a second page-edge router. It
  // consumes the same group trunks and page-local segments, including
  // pass-through pages with no child of a parent group.
  const edgeModel = buildPageEdgeModel(layout, pages);
  const blocks: Record<string, PrintBlock> = {};
  for (const block of layout.blocks) {
    blocks[block.blockId] = {
      blockId: block.blockId,
      chapterId: block.chapterId,
      role: block.role,
      placement: block.placement,
      trunkGroup: block.trunkGroup ?? null,
      depth: block.depth,
      measurement: block.measurement,
      anchorState: block.anchorState,
      anchorPoint: block.anchorPoint,
      warningPoint: block.warningPoint,
    };
  }
  const anchorWarnings = anchorWarningsByBlock(layout.anchors);
  const chromeLayout = pageChromeLayout(layout.geometry);

  const printPages: PrintPage[] = pages.map((page, index) => {
    const edges = edgeModel.edges[index] ?? [];
    const content = pageChromeContent({
      document,
      page,
      documentTitle: layout.title,
      pageCount: pages.length,
    });
    return {
      pageNumber: page.pageNumber,
      chapterId: page.chapterId,
      chapterIndex: page.chapterIndex,
      yStart: page.yStart,
      yEnd: page.yEnd,
      overflow: page.overflow,
      chapterTitle: page.chapterTitle,
      isChapterStart: page.isChapterStart,
      fragments: page.fragments,
      continuationIn: page.continuationIn,
      continuationOut: page.continuationOut,
      edges,
      trunks: edgeModel.trunks[index] ?? [],
      edgeLabels: pageEdgeLabelLayout(edges, layout.geometry),
      chrome: { ...chromeLayout, ...content },
      blockingDefects: pageBlockingDefects(derived.defects, page),
      anchorWarnings: pageAnchorWarnings(page, anchorWarnings),
      missingAssetIds: pageMissingAssets(page, blocks),
    };
  });

  const pageNumberByBlock: Record<string, number> = {};
  for (const page of printPages) {
    for (const fragment of page.fragments) {
      if (pageNumberByBlock[fragment.blockId] === undefined) {
        pageNumberByBlock[fragment.blockId] = page.pageNumber;
      }
    }
  }

  const failedAssetIds = [...new Set(options.failedAssetIds ?? [])].sort();
  const missingAssetIds = [...new Set(printPages.flatMap((page) => page.missingAssetIds))].sort();
  const assetUrls: Record<string, string> = {};
  for (const [assetId, url] of Object.entries(options.assetUrls ?? {})) {
    if (!failedAssetIds.includes(assetId)) assetUrls[assetId] = url;
  }

  return {
    documentId: layout.documentId,
    documentTitle: layout.title,
    revision: document.revision,
    document,
    settings,
    fingerprint,
    cssVariables: pageCssVariables(settings.theme),
    pageSetup: layout.pageSetup,
    geometry: layout.geometry,
    pages: printPages,
    pageCount: printPages.length,
    pageNumberByBlock,
    defects: derived.defects,
    blockingDefects: layoutBlockingDefects(derived.defects),
    manualBreakWarnings: derived.manualBreakWarnings,
    blocks,
    anchors: [...layout.anchors],
    failedAssetIds,
    missingAssetIds,
    assetUrls,
  };
}
