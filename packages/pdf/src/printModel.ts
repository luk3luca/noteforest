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
 * Settings identity is enforced before a page record is emitted: the required
 * page-model fingerprint (same measured run), the layout's page setup/geometry,
 * the document id/revision, and the supplied paginated document (re-derived with
 * the resolved manual breaks) must all agree. A stale or mismatched pair fails
 * loudly instead of silently printing another page count, theme, or document.
 */

import {
  blockingDefects as layoutBlockingDefects,
  buildPageEdgeModel,
  DEFAULT_CODE_FONT,
  pageChromeContent,
  pageChromeLayout,
  pageCssVariables,
  pageEdgeLabelLayout,
  pageGeometry,
  pageLayoutOptions,
  pageSettingsFingerprint,
  pageBlockingDefects,
  paginate,
  type AnchorAttachment,
  type AnchorState,
  type BlockMeasurement,
  type BlockRole,
  type CodeFontId,
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
  /** Deterministic identity of the resolved settings + code font. */
  fingerprint: string;
  /**
   * Code font that produced this model. It is the only appearance value the
   * paper reads; the print root publishes its stack as `--mono-font`.
   */
  codeFont: CodeFontId;
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
   * Code font used for the measured run. The print/measure identity includes
   * it: a layout measured with another code font is refused instead of
   * printing different code metrics. Defaults to the product code font.
   */
  codeFont?: CodeFontId;
  /**
   * Fingerprint returned by the page-model run that produced `layout`/`pages`.
   *
   * Required (M4c2 R1): a print model cannot pair a layout measured under one
   * resolved theme with a different resolved theme. The caller must pass the
   * fingerprint from the same measured run (never fabricate it); omitting it is
   * an identity failure, not an opt-out.
   */
  pageModelFingerprint: string;
  /** Asset ids whose bytes failed to load/decode during measurement. */
  failedAssetIds?: readonly string[];
  /** Renderer-safe asset URLs for the available assets. */
  assetUrls?: Readonly<Record<string, string>>;
}

/** Base class for print-model identity failures (settings or document). */
export class PrintModelIdentityError extends Error {
  readonly fingerprint: string;

  constructor(message: string, fingerprint: string) {
    super(message);
    this.name = 'PrintModelIdentityError';
    this.fingerprint = fingerprint;
  }
}

/** The measured run and the resolved page settings do not belong together. */
export class PrintModelSettingsMismatchError extends PrintModelIdentityError {
  constructor(message: string, fingerprint: string) {
    super(message, fingerprint);
    this.name = 'PrintModelSettingsMismatchError';
  }
}

/** The layout/pages and the canonical document do not belong together. */
export class PrintModelDocumentMismatchError extends PrintModelIdentityError {
  constructor(message: string, fingerprint: string) {
    super(message, fingerprint);
    this.name = 'PrintModelDocumentMismatchError';
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
  codeFont: CodeFontId,
): string {
  const fingerprint = pageSettingsFingerprint(settings, codeFont);
  if (typeof pageModelFingerprint !== 'string' || pageModelFingerprint.length === 0) {
    throw new PrintModelSettingsMismatchError(
      'Print model requires the fingerprint of the measured page model run; the theme/settings identity cannot be verified without it.',
      fingerprint,
    );
  }
  if (pageModelFingerprint !== fingerprint) {
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
  // S3-1: the measured-run identity is unbypassable. A hand-built layout that
  // omits `layoutOptions` cannot claim a fabricated fingerprint, so `undefined`
  // is a mismatch, not an opt-out.
  if (
    layout.layoutOptions === undefined ||
    !sameJson(layout.layoutOptions, pageLayoutOptions(settings.theme))
  ) {
    throw new PrintModelSettingsMismatchError(
      'Print model does not match the resolved PageTheme; the layout was measured with different layout options.',
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

/**
 * R1/R5: the layout/pages must be the measured run of this document revision.
 * A mixed pair would print another document's content with this one's pages.
 */
function assertDocumentIdentity(
  document: NoteDocument,
  layout: ContinuousLayout,
  fingerprint: string,
): void {
  if (layout.documentId !== document.id) {
    throw new PrintModelDocumentMismatchError(
      `Print model does not match the document: the layout was measured for document ${layout.documentId}, not ${document.id}.`,
      fingerprint,
    );
  }
  if (
    layout.revision !== undefined &&
    document.revision !== undefined &&
    layout.revision !== document.revision
  ) {
    throw new PrintModelDocumentMismatchError(
      `Print model does not match the document revision: the layout measured revision ${layout.revision}, the document is revision ${document.revision}.`,
      fingerprint,
    );
  }
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
  const codeFont = options.codeFont ?? DEFAULT_CODE_FONT;
  const fingerprint = assertSettingsIdentity(
    layout,
    settings,
    options.pageModelFingerprint,
    codeFont,
  );
  assertDocumentIdentity(document, layout, fingerprint);
  // The validated run is the only source of pages and defects. A supplied
  // `paginated` document is accepted only when its page/fragment signature
  // matches, then discarded: defects and manual-break warnings (R4) must come
  // from the run validated with this exact page lens, never from a stale copy.
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
  const pages = expected.pages;

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
      chrome: settings.chrome,
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
      blockingDefects: pageBlockingDefects(expected.defects, page),
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
    codeFont,
    cssVariables: pageCssVariables(settings.theme),
    pageSetup: layout.pageSetup,
    geometry: layout.geometry,
    pages: printPages,
    pageCount: printPages.length,
    pageNumberByBlock,
    defects: expected.defects,
    blockingDefects: layoutBlockingDefects(expected.defects),
    manualBreakWarnings: expected.manualBreakWarnings,
    blocks,
    anchors: [...layout.anchors],
    failedAssetIds,
    missingAssetIds,
    assetUrls,
  };
}
