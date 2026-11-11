/**
 * Page chrome and cross-page label geometry shared by Page Read and print.
 *
 * The header/footer/ghost/continues bands live in the page margin, so their
 * positions are a pure function of the resolved page geometry. The Page
 * renderer and the print compositor consume these records instead of each
 * keeping a private copy of the margin fractions: a one-line drift would be
 * invisible in every other test.
 *
 * Edge labels (`← p.N` / `→ p.N`) are positioned in the page content
 * coordinate system and reach into the page margin by exactly the margin size;
 * that placement is shared here as well.
 */

import { contentBlockTitle } from './document.js';
import type { PageEdge } from './page-edges.js';
import type { PageChrome, PageChromeSource, PageGeometry } from './page-settings.js';
import type { ContinuationIn, ContinuationOut, DerivedPage, NoteDocument } from './types.js';

/** Margin-band positions for one page (content-local x is the content box). */
export interface PageChromeLayout {
  /** Page-local left margin band inset. */
  left: number;
  /** Page-local right margin band inset. */
  right: number;
  /** Top of the running header. */
  headerTop: number;
  /** Top of the continued-from ghost list. */
  ghostTop: number;
  /** Bottom of the running footer. */
  footerBottom: number;
  /** Bottom of the continues-on list. */
  continuesBottom: number;
}

/**
 * The one chrome geometry function. Page Read and print both render at these
 * offsets; changing one fraction here moves both surfaces together.
 */
export function pageChromeLayout(geometry: PageGeometry): PageChromeLayout {
  const margins = geometry.marginsPx;
  return {
    left: margins.left,
    right: margins.right,
    headerTop: margins.top * 0.3,
    ghostTop: margins.top * 0.62,
    footerBottom: margins.bottom * 0.3,
    continuesBottom: margins.bottom * 0.6,
  };
}

export interface PageChromeContinuationIn {
  blockId: string;
  fromPage: number;
  toPage: number;
  blockLabel: string;
  parentLabel: string;
  anchorQuote: string | null;
}

export interface PageChromeContinuationOut {
  blockId: string;
  fromPage: number;
  toPage: number;
  blockLabel: string;
}

/** Page chrome text, derived once for Page Read and print. */
export interface PageChromeContent {
  documentTitle: string;
  chapterTitle: string;
  /** Resolved running header text; null when the header source is None. */
  headerText: string | null;
  /** Resolved running footer text; null when the footer source is None. */
  footerText: string | null;
  /** `Page N of M`, or null when the page number is turned off. */
  pageLabel: string | null;
  continuedFrom: PageChromeContinuationIn[];
  continuesOn: PageChromeContinuationOut[];
}

/** Resolve one chrome source to its generated text. */
export function pageChromeText(
  source: PageChromeSource,
  documentTitle: string,
  chapterTitle: string,
): string | null {
  switch (source) {
    case 'document':
      return documentTitle;
    case 'chapter':
      return chapterTitle;
    case 'none':
    default:
      return null;
  }
}

/** `Page N of M` when the number is on; null when it is off. */
export function pageChromeLabel(
  chrome: PageChrome,
  pageNumber: number,
  pageCount: number,
): string | null {
  return chrome.pageNumber ? `Page ${pageNumber} of ${pageCount}` : null;
}

function continuedFromEntry(
  document: NoteDocument,
  continuation: ContinuationIn,
): PageChromeContinuationIn {
  const block = document.blocks[continuation.blockId];
  return {
    blockId: continuation.blockId,
    fromPage: continuation.fromPage,
    toPage: continuation.toPage,
    // A labeled block wins; otherwise the paginator's ghost label is kept.
    blockLabel: block?.label ?? continuation.ghostParent.blockLabel,
    parentLabel: continuation.ghostParent.parentLabel,
    anchorQuote: continuation.ghostParent.anchorQuote,
  };
}

function continuesOnEntry(
  document: NoteDocument,
  continuation: ContinuationOut,
): PageChromeContinuationOut {
  return {
    blockId: continuation.blockId,
    fromPage: continuation.fromPage,
    toPage: continuation.toPage,
    blockLabel: contentBlockTitle(document.blocks[continuation.blockId]),
  };
}

/**
 * Chrome text for one derived page. Titles and continuation labels use the
 * canonical document, never renderer state.
 */
export function pageChromeContent(input: {
  document: NoteDocument;
  page: DerivedPage;
  documentTitle: string;
  pageCount: number;
  /** Resolved personal chrome sources and page-number switch (R2). */
  chrome: PageChrome;
}): PageChromeContent {
  const { document, page, documentTitle, pageCount, chrome } = input;
  return {
    documentTitle,
    chapterTitle: page.chapterTitle,
    headerText: pageChromeText(chrome.header, documentTitle, page.chapterTitle),
    footerText: pageChromeText(chrome.footer, documentTitle, page.chapterTitle),
    pageLabel: pageChromeLabel(chrome, page.pageNumber, pageCount),
    continuedFrom: page.continuationIn.map((continuation) =>
      continuedFromEntry(document, continuation),
    ),
    continuesOn: page.continuationOut.map((continuation) =>
      continuesOnEntry(document, continuation),
    ),
  };
}

/** One cross-page edge label, positioned in the page content box. */
export interface PageEdgeLabelLayout {
  edge: PageEdge;
  /** `to-edge` (right margin) or `from-edge` (left margin). */
  direction: 'to-edge' | 'from-edge';
  /** Short visual text (`→ p.N` / `← p.N`). */
  text: string;
  /** Full accessible sentence. */
  accessibleLabel: string;
  /** Content-local left offset; null when the label is anchored right. */
  left: number | null;
  /** Content-local right offset; null when the label is anchored left. */
  right: number | null;
  /** Content-local top of the label center. */
  top: number;
  /** Available margin width for clipping/ellipsis. */
  maxWidth: number;
}

/**
 * Short print-style marker. The full sentence stays in the accessible label.
 * Same-page branch quotes already live inside the callout card, so the page
 * layer never duplicates them.
 */
export function pageEdgeLabelText(edge: PageEdge): string | null {
  if (edge.direction === 'to-edge' && edge.targetPage !== null) {
    return `→ p.${edge.targetPage}`;
  }
  if (edge.direction === 'from-edge' && edge.targetPage !== null) {
    return `← p.${edge.targetPage}`;
  }
  return null;
}

export function pageEdgeAccessibleLabel(edge: PageEdge): string {
  const parts: string[] = [];
  parts.push(edge.role === 'reference' ? 'Reference' : 'Branch');
  if (edge.branchLabel !== undefined) parts.push(edge.branchLabel);
  if (edge.direction === 'to-edge' && edge.targetPage !== null) {
    parts.push(`continues on page ${edge.targetPage}`);
  } else if (edge.direction === 'from-edge' && edge.targetPage !== null) {
    parts.push(`continued from page ${edge.targetPage}`);
  }
  return parts.join(' · ');
}

/**
 * Every cross-page label on one page. Positions are content-local and match
 * Page Read exactly: `to-edge` sits in the right margin at the route start,
 * `from-edge` in the left margin at the target.
 */
export function pageEdgeLabelLayout(
  edges: readonly PageEdge[],
  geometry: PageGeometry,
): PageEdgeLabelLayout[] {
  const margins = geometry.marginsPx;
  const labels: PageEdgeLabelLayout[] = [];
  for (const edge of edges) {
    if (edge.direction === 'same-page') continue;
    const text = pageEdgeLabelText(edge);
    if (text === null) continue;
    if (edge.direction === 'to-edge') {
      labels.push({
        edge,
        direction: 'to-edge',
        text,
        accessibleLabel: pageEdgeAccessibleLabel(edge),
        left: null,
        right: -margins.right + 2,
        top: edge.from.y,
        maxWidth: Math.max(18, margins.right - 4),
      });
      continue;
    }
    labels.push({
      edge,
      direction: 'from-edge',
      text,
      accessibleLabel: pageEdgeAccessibleLabel(edge),
      left: -margins.left + 2,
      right: null,
      top: edge.to.y,
      maxWidth: Math.max(18, margins.left - 4),
    });
  }
  return labels;
}
