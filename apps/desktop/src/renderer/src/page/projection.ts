/**
 * The single Page content projection used by Page Read/Edit and print.
 *
 * It turns the canonical document, the resolved layout measurements, and the
 * paginator's derived pages into the static card segments, per-page blocking
 * defects, anchor warnings, and shared chrome records. Page Read and the print
 * compositor call this same function, so their segment HTML and chrome text
 * cannot drift even though one is interactive and the other is static.
 *
 * Pure: no React, no DOM reads, no renderer state. Segment building uses the
 * same `buildSegments` module as the measurement host and the page surface.
 */

import {
  blockingDefects,
  pageBlockingDefects,
  pageChromeContent,
  pageChromeLayout,
  type AnchorAttachment,
  type AnchorRecord,
  type BlockMeasurement,
  type DerivedPage,
  type LayoutDefect,
  type NoteDocument,
  type PageChromeContent,
  type PageChromeLayout,
  type PageFragment,
  type PageGeometry,
  type PageSettings,
} from '@noteforest/layout';
import { buildSegments, type PageContentBlock, type PageRenderSegment } from './segments';

/** The measurement record shape the static segment builder needs. */
export interface ProjectionBlock {
  measurement: Pick<BlockMeasurement, 'tableColumns'>;
}

export interface PageProjectionInput {
  document: NoteDocument;
  /**
   * Optional fresher canonical content for card HTML. Page Read passes the
   * live runtime blocks so a committed edit renders immediately while the
   * measured model re-runs; print passes nothing and uses `document.blocks`.
   */
  contentBlocks?: Readonly<Record<string, PageContentBlock>>;
  /** Resolved layout records keyed by block id (layout.blockById or PrintModel.blocks). */
  blocks: Readonly<Record<string, ProjectionBlock>>;
  pages: readonly DerivedPage[];
  defects: readonly LayoutDefect[];
  anchors: readonly AnchorAttachment[];
  settings: PageSettings;
  geometry: PageGeometry;
  /** Display URLs; failed assets must already be removed. */
  assets: Readonly<Record<string, string>>;
}

export interface ProjectedPageChrome extends PageChromeLayout, PageChromeContent {}

export interface ProjectedPage {
  page: DerivedPage;
  /** One segment list per block id present on this page. */
  segmentsByBlock: Record<string, PageRenderSegment[]>;
  /** All non-resolved attachments for the first fragment of a block. */
  anchorWarningsByBlock: Record<string, AnchorAttachment[]>;
  /** Blocking defects scoped to this page. */
  blocking: LayoutDefect[];
  /** Shared header/ghost/footer/continues positions and text. */
  chrome: ProjectedPageChrome;
}

export interface PageProjection {
  pages: ProjectedPage[];
  /** Every blocking defect in the document (the page banner count). */
  blockingDefects: LayoutDefect[];
}

/**
 * Canonical anchor records grouped by source block.
 *
 * The adapter's `AnchorRecord` is already the layout record; sorting by id
 * matches the canonical renderer helper so code-token hints wrap identically.
 */
export function anchorRecordsByBlock(
  anchors: Readonly<Record<string, AnchorRecord>>,
): Map<string, AnchorRecord[]> {
  const grouped = new Map<string, AnchorRecord[]>();
  for (const anchor of Object.values(anchors)) {
    const list = grouped.get(anchor.blockId) ?? [];
    list.push(anchor);
    grouped.set(anchor.blockId, list);
  }
  for (const list of grouped.values()) {
    list.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  }
  return grouped;
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

/** Static segment HTML for every block fragment on one page. */
export function segmentsForFragments(input: {
  document: NoteDocument;
  /** Optional fresher content override, keyed by block id. */
  contentBlocks?: Readonly<Record<string, PageContentBlock>>;
  fragments: readonly PageFragment[];
  blocks: Readonly<Record<string, ProjectionBlock>>;
  anchorsByBlock: ReadonlyMap<string, readonly AnchorRecord[]>;
  assets: Readonly<Record<string, string>>;
  listIndent: number;
  /**
   * Optional projection-wide cache. Segment lists depend only on the block
   * (content, measurements, anchors, assets, indent), never on the page, so a
   * block that continues across pages is built once (M4c2 R9).
   */
  segmentCache?: Map<string, PageRenderSegment[]>;
}): Record<string, PageRenderSegment[]> {
  const result: Record<string, PageRenderSegment[]> = {};
  for (const fragment of input.fragments) {
    if (Object.prototype.hasOwnProperty.call(result, fragment.blockId)) continue;
    const cached = input.segmentCache?.get(fragment.blockId);
    if (cached !== undefined) {
      result[fragment.blockId] = cached;
      continue;
    }
    const block =
      input.contentBlocks?.[fragment.blockId] ?? input.document.blocks[fragment.blockId];
    if (block === undefined) continue;
    const measurement = input.blocks[fragment.blockId]?.measurement;
    const segments = buildSegments(block, {
      assets: input.assets,
      tableColumns: measurement?.tableColumns ?? {},
      anchors: input.anchorsByBlock.get(fragment.blockId) ?? [],
      listIndent: input.listIndent,
    });
    result[fragment.blockId] = segments;
    input.segmentCache?.set(fragment.blockId, segments);
  }
  return result;
}

/**
 * Chrome for a page without a derived model (loading/empty placeholder).
 * Positions still come from the shared margin-band function.
 */
export function emptyPageChrome(input: {
  geometry: PageGeometry;
  documentTitle: string;
  chapterTitle: string;
  pageNumber: number;
  pageCount: number;
}): ProjectedPageChrome {
  return {
    ...pageChromeLayout(input.geometry),
    documentTitle: input.documentTitle,
    chapterTitle: input.chapterTitle,
    pageLabel: `Page ${input.pageNumber} of ${input.pageCount}`,
    continuedFrom: [],
    continuesOn: [],
  };
}

/** Project every derived page from one document/settings/layout pass. */
export function projectPageContent(input: PageProjectionInput): PageProjection {
  const blocking = blockingDefects(input.defects);
  const anchorsByBlock = anchorRecordsByBlock(input.document.anchors);
  const warnings = anchorWarningsByBlock(input.anchors);
  const chromeLayout = pageChromeLayout(input.geometry);
  const listIndent = input.settings.theme.wrapIndent;
  // Per-projection cache: a block continuing across pages shares one segment
  // list instead of rebuilding it on every page (R9).
  const segmentCache = new Map<string, PageRenderSegment[]>();

  const pages: ProjectedPage[] = input.pages.map((page) => {
    const anchorWarningsByBlockForPage: Record<string, AnchorAttachment[]> = {};
    for (const fragment of page.fragments) {
      if (!fragment.isFirst) continue;
      const attachments = warnings.get(fragment.blockId);
      if (attachments !== undefined) {
        anchorWarningsByBlockForPage[fragment.blockId] = attachments;
      }
    }
    const content = pageChromeContent({
      document: input.document,
      page,
      documentTitle: input.document.title,
      pageCount: input.pages.length,
    });
    return {
      page,
      segmentsByBlock: segmentsForFragments({
        document: input.document,
        contentBlocks: input.contentBlocks,
        fragments: page.fragments,
        blocks: input.blocks,
        anchorsByBlock,
        assets: input.assets,
        listIndent,
        segmentCache,
      }),
      anchorWarningsByBlock: anchorWarningsByBlockForPage,
      blocking: pageBlockingDefects(input.defects, page),
      chrome: { ...chromeLayout, ...content },
    };
  });

  return { pages, blockingDefects: blocking };
}
