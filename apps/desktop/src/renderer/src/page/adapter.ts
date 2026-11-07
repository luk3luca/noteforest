/**
 * Renderer-side adapter from the canonical core document to the pure layout
 * model in `@noteforest/layout`.
 *
 * The adapter is deliberately a pure copy: it never mutates the canonical
 * document, never resolves asset URLs, and never reads view state. The same
 * `NoteDocument` shape feeds the page layout now and the print compositor in
 * M4c, so the page renderer and the future PDF cannot drift onto a second
 * document model.
 */

import type { Anchor, Document } from '@noteforest/core';
import { DEFAULT_MARGINS_MM } from '@noteforest/core';
import type {
  AnchorRecord,
  AssetRecord,
  BranchRecord,
  ChapterRecord,
  ContentBlock as LayoutContentBlock,
  ContentNode as LayoutContentNode,
  LayoutOptions,
  NoteDocument,
  PageGeometry,
  PageSetup,
} from '@noteforest/layout';
import { DEFAULT_LAYOUT_OPTIONS, pageGeometry } from '@noteforest/layout';

/**
 * Page/print layout options. The page layout, the measurement host CSS, and the
 * future print compositor all read these values, so card chrome and segment
 * spacing cannot diverge between the screen and the PDF.
 */
export const PAGE_LAYOUT_OPTIONS: LayoutOptions = Object.freeze({
  ...DEFAULT_LAYOUT_OPTIONS,
});

/**
 * CSS custom properties derived from `PAGE_LAYOUT_OPTIONS`. They are written to
 * the measurement host and to the page sheet; `styles.css` only consumes the
 * variables. This keeps the CSS card box identical to the measured card box.
 */
export const PAGE_CSS_VARIABLES: Readonly<Record<string, string>> = Object.freeze({
  '--nf-page-card-padding': `${PAGE_LAYOUT_OPTIONS.cardPadding}px`,
  '--nf-page-card-border': `${PAGE_LAYOUT_OPTIONS.cardBorder}px`,

  '--nf-page-segment-gap': `${PAGE_LAYOUT_OPTIONS.segmentGap}px`,
});

export interface PageCssTarget {
  style: {
    setProperty(name: string, value: string): void;
  };
}

/** Apply the page/print box variables to a host or page element. */
export function applyPageCssVariables(target: PageCssTarget): void {
  for (const [name, value] of Object.entries(PAGE_CSS_VARIABLES)) {
    target.style.setProperty(name, value);
  }
}

function finiteMargin(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : DEFAULT_MARGINS_MM.top;
}

/** Page setup copy with the A4 invariant made explicit. */
export function pageSetupOf(document: Document): PageSetup {
  const setup = document.pageSetup;
  const orientation = setup?.orientation === 'portrait' ? 'portrait' : 'landscape';
  return {
    size: 'A4',
    orientation,
    margins: {
      top: finiteMargin(setup?.margins?.top),
      right: finiteMargin(setup?.margins?.right),
      bottom: finiteMargin(setup?.margins?.bottom),
      left: finiteMargin(setup?.margins?.left),
    },
  };
}

/** Geometry for the loading/empty page before a layout model exists. */
export function corePageGeometry(document: Document): PageGeometry {
  return pageGeometry(pageSetupOf(document));
}

function cloneContent(content: Document['blocks'][string]['content']): LayoutContentNode {
  if (content === undefined || content === null || typeof content !== 'object') {
    return { type: 'doc', children: [] };
  }
  return structuredClone(content) as unknown as LayoutContentNode;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function selectorString(selector: unknown, key: string): string | undefined {
  if (selector === null || typeof selector !== 'object' || Array.isArray(selector)) return undefined;
  const value = (selector as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

function selectorInteger(selector: unknown, key: string): number | undefined {
  if (selector === null || typeof selector !== 'object' || Array.isArray(selector)) return undefined;
  const value = (selector as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

function anchorQuote(anchor: Anchor): string | undefined {
  const selector = anchor.selector;
  if (anchor.kind === 'formula') {
    return selectorString(selector, 'latex') ?? optionalString(anchor.quote);
  }
  if (anchor.kind === 'image') {
    return selectorString(selector, 'label') ?? optionalString(anchor.quote);
  }
  return selectorString(selector, 'quote') ?? optionalString(anchor.quote);
}

/**
 * Map one canonical anchor to the layout anchor record.
 *
 * Layout anchors only need a quote plus an optional occurrence hint. Code
 * anchors additionally expose the quote as a token hint so the static segments
 * renderer can place the same anchor span the measurement pass resolves. A
 * multi-line code quote stays a whole-code anchor (no token hint); full code
 * range geometry is M4d work.
 */
export function toLayoutAnchorRecord(anchor: Anchor): AnchorRecord {
  const quote = anchorQuote(anchor);
  const record: AnchorRecord = {
    id: anchor.id,
    blockId: anchor.blockId,
    kind: anchor.kind,
  };
  if (quote !== undefined) record.quote = quote;

  const prefix =
    selectorString(anchor.selector, 'prefix') ??
    selectorString(anchor.selector, 'latexPrefix') ??
    optionalString(anchor.prefix);
  if (prefix !== undefined) record.prefix = prefix;
  const suffix =
    selectorString(anchor.selector, 'suffix') ??
    selectorString(anchor.selector, 'latexSuffix') ??
    optionalString(anchor.suffix);
  if (suffix !== undefined) record.suffix = suffix;

  const occurrence =
    positiveInteger(selectorInteger(anchor.selector, 'occurrenceHint')) ??
    positiveInteger(anchor.occurrenceHint);
  if (occurrence !== undefined) record.occurrenceHint = occurrence;

  if (anchor.kind === 'code') {
    const line = positiveInteger(selectorInteger(anchor.selector, 'lineStart'));
    if (line !== undefined) record.codeLine = line;
    if (quote !== undefined && !quote.includes('\n')) record.codeToken = quote;
  }
  return record;
}

/** Layout anchor records grouped by source block for the static renderer. */
export function anchorHintsForDocument(document: Document): Map<string, AnchorRecord[]> {
  const grouped = new Map<string, AnchorRecord[]>();
  for (const anchor of Object.values(document.anchors)) {
    const list = grouped.get(anchor.blockId) ?? [];
    list.push(toLayoutAnchorRecord(anchor));
    grouped.set(anchor.blockId, list);
  }
  for (const list of grouped.values()) list.sort((left, right) => (left.id < right.id ? -1 : 1));
  return grouped;
}

function layoutBlock(block: Document['blocks'][string]): LayoutContentBlock {
  const result: LayoutContentBlock = {
    id: block.id,
    content: cloneContent(block.content),
  };
  if (typeof block.label === 'string') result.label = block.label;
  if (block.border === 'none') result.border = 'none';
  else if (block.border !== undefined) result.border = 'subtle';
  return result;
}

function layoutBranch(branch: Document['branches'][string]): BranchRecord {
  const result: BranchRecord = {
    id: branch.id,
    source: {
      blockId: branch.source.blockId,
      ...(branch.source.anchorId === undefined ? {} : { anchorId: branch.source.anchorId }),
    },
    targetBlockId: branch.targetBlockId,
    role: branch.role,
    order: branch.order,
  };
  if (typeof branch.label === 'string') result.label = branch.label;
  return result;
}

function layoutChapter(chapter: Document['chapters'][number]): ChapterRecord {
  return {
    id: chapter.id,
    title:
      typeof chapter.title === 'string' && chapter.title.trim().length > 0
        ? chapter.title
        : 'Untitled chapter',
    topLevelBlockIds: [...chapter.topLevelBlockIds],
  };
}

function layoutAsset(asset: Document['assets'][string]): AssetRecord {
  const result: AssetRecord = {
    id: asset.id,
    path: asset.path,
  };
  if (typeof asset.alt === 'string') result.alt = asset.alt;
  if (typeof asset.width === 'number') result.width = asset.width;
  if (typeof asset.height === 'number') result.height = asset.height;
  return result;
}

/**
 * Pure core -> layout document mapping.
 *
 * Identity and order are preserved: chapter order, top-level block order,
 * branch IDs/source/target, anchor IDs, block keys, and manual break hints.
 * Unknown content fields survive through `structuredClone`; unknown root fields
 * are not copied because the layout package does not consume them.
 */
export function toLayoutDocument(document: Document): NoteDocument {
  const blocks: Record<string, LayoutContentBlock> = {};
  for (const [id, block] of Object.entries(document.blocks)) {
    blocks[id] = layoutBlock({ ...block, id });
  }

  const anchors: Record<string, AnchorRecord> = {};
  for (const [id, anchor] of Object.entries(document.anchors)) {
    anchors[id] = toLayoutAnchorRecord(anchor);
  }

  const branches: Record<string, BranchRecord> = {};
  for (const [id, branch] of Object.entries(document.branches)) {
    branches[id] = layoutBranch(branch);
  }

  const assets: Record<string, AssetRecord> = {};
  for (const [id, asset] of Object.entries(document.assets)) {
    assets[id] = layoutAsset(asset);
  }

  const noteDocument: NoteDocument = {
    schemaVersion: document.schemaVersion,
    id: document.id,
    title: document.title,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    revision: document.revision,
    pageSetup: pageSetupOf(document),
    manualBreakBeforeBlockIds: [...document.manualBreakBeforeBlockIds],
    blocks,
    anchors,
    branches,
    chapters: document.chapters.map(layoutChapter),
    assets,
  };
  if (Array.isArray(document.annotations)) {
    noteDocument.annotations = structuredClone(document.annotations);
  }
  return noteDocument;
}

/** A stable content key for measurement caches and renderer memoization. */
export function blockContentKey(block: {
  label?: string;
  border?: unknown;
  content: unknown;
}): string {
  return JSON.stringify([block.label ?? '', block.border ?? '', block.content]);
}


