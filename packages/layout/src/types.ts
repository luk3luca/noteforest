/**
 * NoteForest Spike 1 — shared document, measurement, layout, and pagination types.
 *
 * This file is intentionally pure TypeScript: no React, DOM, Electron, or editor
 * dependencies. The DOM measurement adapter implements `MeasurementPort` from
 * outside this package.
 */

export type Orientation = 'portrait' | 'landscape';

export interface MarginsMm {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PageSetup {
  size: 'A4';
  orientation: Orientation;
  margins: MarginsMm;
}

export interface PageGeometry {
  pageWidthMm: number;
  pageHeightMm: number;
  pageWidthPx: number;
  pageHeightPx: number;
  contentWidthPx: number;
  contentHeightPx: number;
  marginsPx: MarginsMm;
}

/** ProseMirror-shaped content node, restricted to the spike subset. */
export interface ContentNode {
  type: string;
  attrs?: Record<string, unknown>;
  text?: string;
  marks?: ContentMark[];
  children?: ContentNode[];
}

export interface ContentMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface ContentBlock {
  id: string;
  label?: string;
  content: ContentNode;
  border?: 'none' | 'subtle';
}

export interface AnchorRecord {
  id: string;
  blockId: string;
  kind: 'text' | 'formula' | 'code' | 'image';
  quote?: string;
  prefix?: string;
  suffix?: string;
  occurrenceHint?: number;
  /** For code anchors: the 1-based line number inside the code block. */
  codeLine?: number;
  /** For code anchors: the token to wrap. */
  codeToken?: string;
}

export interface BranchRecord {
  id: string;
  source: { blockId: string; anchorId?: string };
  targetBlockId: string;
  role: 'primary' | 'reference';
  order?: string;
  label?: string;
}

export interface ChapterRecord {
  id: string;
  title: string;
  topLevelBlockIds: string[];
}

export interface AssetRecord {
  id: string;
  path: string;
  alt?: string;
  width?: number;
  height?: number;
}

export interface NoteDocument {
  schemaVersion: number;
  id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
  revision?: number;
  pageSetup: PageSetup;
  manualBreakBeforeBlockIds: string[];
  blocks: Record<string, ContentBlock>;
  anchors: Record<string, AnchorRecord>;
  branches: Record<string, BranchRecord>;
  chapters: ChapterRecord[];
  assets: Record<string, AssetRecord>;
  annotations?: unknown[];
  viewState?: unknown;
}

/** Kinds that may start a new page fragment. */
export type SegmentKind =
  | 'paragraph'
  | 'heading'
  | 'list-item'
  | 'blockquote-paragraph'
  | 'code-line'
  | 'table-row'
  | 'math'
  | 'image';

export interface MeasuredSegment {
  index: number;
  kind: SegmentKind;
  /** Path to the source node in the block content tree (indices of children). */
  nodePath: number[];
  /** Top of the segment wrapper, relative to the block content box. */
  y: number;
  /** Height of the wrapper, including its top spacing. */
  height: number;
  /** True when a page break may occur immediately before this segment. */
  breakableBefore: boolean;
  /** Optional stable key for table columns / rendering caches. */
  tableKey?: string;
  rowIndex?: number;
}

export interface MeasuredAnchor {
  anchorId: string;
  /** Rectangle relative to the block content box. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** 0-based occurrence in DOM order. */
  occurrence: number;
}

export type MeasurementMode =
  | { kind: 'max-content' }
  | { kind: 'min-content' }
  | { kind: 'fixed'; contentWidth: number };

export interface BlockMeasurement {
  blockId: string;
  mode: MeasurementMode;
  /** Outer card width, including border and padding. */
  cardWidth: number;
  /** Inner content width. */
  contentWidth: number;
  contentHeight: number;
  /** Top of the content box relative to the card (border + padding + label). */
  contentTop: number;
  labelHeight: number;
  cardHeight: number;
  maxContentWidth: number;
  minContentWidth: number;
  segments: MeasuredSegment[];
  anchors: MeasuredAnchor[];
  /** Table path key -> fixed column widths in px, content-box relative. */
  tableColumns: Record<string, number[]>;
  /** Asset ids referenced by the block that could not be resolved. */
  missingAssetIds: string[];
}

export interface MeasurementPort {
  measure(block: ContentBlock, mode: MeasurementMode): BlockMeasurement;
}

export type DefectCode =
  | 'content-too-wide'
  | 'no-safe-break'
  | 'too-tall-row'
  | 'impossible-hint'
  | 'missing-asset'
  | 'broken-anchor'
  | 'ambiguous-anchor'
  | 'layout-overflow'
  | 'unknown-block'
  | 'primary-cycle'
  | 'duplicate-primary'
  | 'orphan-block'
  | 'empty-chapter'
  | 'document-too-wide'
  | 'internal';

export type DefectSeverity = 'warning' | 'error' | 'blocking';

export interface LayoutDefect {
  code: DefectCode;
  severity: DefectSeverity;
  message: string;
  blockId?: string;
  chapterId?: string;
  pageNumber?: number;
  /** Whether this defect prevents PDF export. */
  blocksExport: boolean;
}

export type BlockRole = 'top-level' | 'child' | 'callout';
export type AnchorState = 'resolved' | 'broken' | 'ambiguous' | 'none';

export interface LayoutBlock {
  blockId: string;
  chapterId: string;
  role: BlockRole;
  parentBlockId: string | null;
  anchorId: string | null;
  depth: number;
  /** Card box in chapter-local continuous coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
  contentWidth: number;
  contentTop: number;
  contentHeight: number;
  measurement: BlockMeasurement;
  breakCandidates: BreakCandidate[];
  childIds: string[];
  anchorState: AnchorState;
  /** Resolved anchor rectangle in chapter-local coordinates, when resolved. */
  anchorPoint: { x: number; y: number; width: number; height: number } | null;
  warningPoint: { x: number; y: number } | null;
  /** Bottom of this block's whole subtree. */
  subtreeBottom: number;
}

export interface BreakCandidate {
  kind: SegmentKind;
  nodePath: number[];
  /** Y relative to the block content box. */
  y: number;
  segmentIndex: number;
}

export interface AnchorAttachment {
  anchorId: string;
  blockId: string;
  state: AnchorState;
  /** Chapter-local rectangle, when resolved. */
  rect: { x: number; y: number; width: number; height: number } | null;
  /** Chapter-local warning point, when broken/ambiguous. */
  warningPoint: { x: number; y: number } | null;
}

export interface EdgeLayout {
  branchId: string;
  role: 'primary' | 'reference';
  fromBlockId: string;
  toBlockId: string;
  anchorId: string | null;
  chapterId: string;
  /** Chapter-local start/end points. */
  from: { x: number; y: number };
  to: { x: number; y: number };
  label?: string;
  crossChapter: boolean;
}

export interface ChapterLayout {
  id: string;
  title: string;
  index: number;
  topLevelBlockIds: string[];
  height: number;
}

export interface ContinuousLayout {
  documentId: string;
  title: string;
  pageSetup: PageSetup;
  geometry: PageGeometry;
  chapters: ChapterLayout[];
  blocks: LayoutBlock[];
  blockById: Record<string, LayoutBlock>;
  anchors: AnchorAttachment[];
  edges: EdgeLayout[];
  defects: LayoutDefect[];
  /** Measurement calls made by this layout pass (diagnostics only). */
  measurementCalls: number;
}

export interface PageFragment {
  blockId: string;
  chapterId: string;
  role: BlockRole;
  depth: number;
  /** Continuous chapter-local source box for this fragment. */
  source: { x: number; y: number; width: number; height: number };
  /** Page content-local box. */
  page: { x: number; y: number; width: number; height: number };
  startSegment: number;
  endSegment: number;
  isFirst: boolean;
  isLast: boolean;
  isPageStart: boolean;
  continuesToPage: number | null;
  continuedFromPage: number | null;
}

export interface ContinuationOut {
  blockId: string;
  fromPage: number;
  toPage: number;
  startSegment: number;
  endSegment: number;
}

export interface ContinuationIn {
  blockId: string;
  fromPage: number;
  toPage: number;
  startSegment: number;
  endSegment: number;
  ghostParent: {
    parentBlockId: string | null;
    parentLabel: string;
    blockLabel: string;
    anchorQuote: string | null;
  };
}

export interface DerivedPage {
  pageNumber: number;
  chapterId: string;
  chapterIndex: number;
  chapterTitle: string;
  yStart: number;
  yEnd: number;
  isChapterStart: boolean;
  fragments: PageFragment[];
  continuationOut: ContinuationOut[];
  continuationIn: ContinuationIn[];
  /** True when the paginator had to overflow the content area (defect). */
  overflow: boolean;
}

export interface PaginatedDocument {
  pages: DerivedPage[];
  pageCount: number;
  defects: LayoutDefect[];
  manualBreakWarnings: LayoutDefect[];
}

export interface LayoutOptions {
  minContentWidth: number;
  maxContentWidth: number;
  siblingGap: number;
  wrapIndent: number;
  calloutGap: number;
  chapterGap: number;
  cardPadding: number;
  cardBorder: number;
  segmentGap: number;
}

export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  minContentWidth: 160,
  maxContentWidth: 420,
  siblingGap: 24,
  wrapIndent: 18,
  calloutGap: 20,
  chapterGap: 32,
  cardPadding: 12,
  cardBorder: 1,
  segmentGap: 8,
};

/** One fixed conversion from layout px (96 dpi) to millimetres. */
export const PX_PER_MM = 96 / 25.4;
export const MM_PER_PX = 25.4 / 96;

export function pxToMm(px: number): number {
  return px * MM_PER_PX;
}

export function mmToPx(mm: number): number {
  return mm * PX_PER_MM;
}

export function pageGeometry(pageSetup: PageSetup): PageGeometry {
  const portrait = pageSetup.orientation === 'portrait';
  const pageWidthMm = portrait ? 210 : 297;
  const pageHeightMm = portrait ? 297 : 210;
  const pageWidthPx = mmToPx(pageWidthMm);
  const pageHeightPx = mmToPx(pageHeightMm);
  const marginsPx: MarginsMm = {
    top: mmToPx(pageSetup.margins.top),
    right: mmToPx(pageSetup.margins.right),
    bottom: mmToPx(pageSetup.margins.bottom),
    left: mmToPx(pageSetup.margins.left),
  };
  return {
    pageWidthMm,
    pageHeightMm,
    pageWidthPx,
    pageHeightPx,
    contentWidthPx: pageWidthPx - marginsPx.left - marginsPx.right,
    contentHeightPx: pageHeightPx - marginsPx.top - marginsPx.bottom,
    marginsPx,
  };
}
