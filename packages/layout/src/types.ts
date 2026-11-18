/**
 * NoteForest Spike 1 — shared document, measurement, layout, and pagination types.
 *
 * This file is intentionally pure TypeScript: no React, DOM, Electron, or editor
 * dependencies. The DOM measurement adapter implements `MeasurementPort` from
 * outside this package.
 */

import type { MarginsMm, PageGeometry, PageSetup } from './page-settings.js';

export type Orientation = 'portrait' | 'landscape';

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
  blocks: Record<string, ContentBlock>;
  anchors: Record<string, AnchorRecord>;
  branches: Record<string, BranchRecord>;
  chapters: ChapterRecord[];
  assets: Record<string, AssetRecord>;
  annotations?: unknown[];
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

/** Semantic anchor state, mirrored from the core `AnchorResolutionView`. */
export type AnchorViewState =
  | 'resolved'
  | 'ambiguous'
  | 'broken'
  | 'idle'
  | 'block-missing';

/** Structural mirror of the core resolved range; the layout reads `kind`. */
export interface AnchorViewRange {
  kind: 'text' | 'formula' | 'code' | 'image';
  nodePath?: readonly number[];
}

export interface AnchorViewEntry {
  anchorId: string;
  state: AnchorViewState;
  range: AnchorViewRange | null;
}

/**
 * The layout-facing anchor projection, produced by `DocumentSession`'s index
 * and carried across the print snapshot. `packages/layout` does not import
 * core; the desktop parity test assigns the core type here so drift fails to
 * compile.
 */
export interface AnchorResolutionView {
  documentId: string;
  revision?: number;
  /** Every anchor, including idle and block-missing, under its declared block. */
  byBlock: Readonly<Record<string, readonly AnchorViewEntry[]>>;
}

/**
 * Semantic primary-child placement, shared by Continuous edge descriptors and
 * Page/PDF tree edges. `right` is the beside/level-column language; `below` is
 * the below-stack language for anchored callouts and wrapped children. Page
 * edges group by `(parent, placement)`, so this value must come from the actual
 * placement decision, never from a target's y coordinate.
 */
export type EdgePlacement = 'right' | 'below';

/**
 * Child-group placement policy.
 *
 * - `group-left-origin` is the production rule from ADR-0006: a direct-child
 *   group stays to the right only when every child's own card fits; otherwise
 *   the whole group moves below the parent at one capped left origin.
 * - `right-first-per-child` reproduces the pre-M4a geometry exactly and is kept
 *   as a regression oracle for the layout lab.
 * - `subtree-aware` is the lab-only per-child comparison: children that fit stay
 *   right while a non-fitting child wraps at the capped left origin.
 */
export type WrapPolicy = 'group-left-origin' | 'right-first-per-child' | 'subtree-aware';

/**
 * Page/PDF packing policy (ADR-0007/0008). Continuous does not use the page
 * layout engine and is unaffected.
 *
 * - `stacked` is the historical page geometry: anchored callouts sit below the
 *   parent and the direct-child group starts after them.
 * - `beside` keeps anchored callouts below the parent in the left column while
 *   the direct-child group starts at the parent's y in the right column. The
 *   callout lane ends at the parent's right edge, so it is always at least one
 *   sibling gap left of the right group at every recursion depth.
 * - `compaction` is the finite-space page packer: the parent card starts a row,
 *   anchored callouts and primary direct children are ordered components that
 *   fill that row left-to-right at their measured widths, and the rest wrap to
 *   the next row at one capped wrap indent. Every component owns a column for
 *   its own recursive row, so a subtree never collides with the next sibling.
 *   Reference targets stay at their primary home; only primary edges are
 *   layout components.
 */
/** `compaction` is a legacy row-fill lab oracle; presets use beside/stacked. */
export type PagePacking = 'stacked' | 'beside' | 'compaction';

export interface LayoutBlock {
  blockId: string;
  chapterId: string;
  role: BlockRole;
  /** Semantic placement relative to `parentBlockId` (from the layout decision). */
  placement: EdgePlacement;
  /**
   * Page R2j below-trunk split for callout mode B2. When both an anchored
   * callout group and a direct-child group sit below the same parent, the two
   * groups own independent trunks. Absent for right groups, Continuous, and
   * the shared/legacy stacked below group.
   */
  trunkGroup?: 'callout' | 'child';
  /**
   * Page below-trunk inset from the parent left. Absent falls back to
   * `PAGE_EDGE_STYLE.trunkInset` (12 px). Page mode B2 sets 24 for callouts and 12
   * for children; Continuous never reads it.
   */
  trunkInset?: number;
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
  /**
   * Chapter-local x where a callout card is placed. A resolved range uses its
   * rect; a broken/ambiguous anchor keeps the measured lane it had before the
   * state became a dot; a range with no measured rect uses the callout indent.
   */
  calloutX: number;
  /**
   * Below-trunk inset when this callout needs its own lane (a fallback range
   * with no measured rect). Absent keeps the shared trunk inset.
   */
  calloutTrunkInset?: number;
  /**
   * Chapter-local point an edge leaves from: the resolved range's last line
   * right-centre, or the callout trunk inset for a geometry fallback.
   */
  attachPoint: { x: number; y: number } | null;
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
  /** Canonical revision this run measured; absent on legacy/hand-built layouts. */
  revision?: number;
  title: string;
  pageSetup: PageSetup;
  /**
   * Resolved layout options this run used. Page/print identity checks compare
   * it with `pageLayoutOptions(settings.theme)` so a measured run can never be
   * paired with a different theme, even if a caller fabricates a fingerprint.
   */
  layoutOptions?: LayoutOptions;
  geometry: PageGeometry;
  chapters: ChapterLayout[];
  blocks: LayoutBlock[];
  blockById: Record<string, LayoutBlock>;
  anchors: AnchorAttachment[];
  edges: EdgeLayout[];
  defects: LayoutDefect[];
  /**
   * Resolved anchors whose range had no measured rect; they attach to the whole
   * block content box. Diagnostic only: the state stays resolved and no dot is
   * drawn (spec §8.7).
   */
  anchorGeometryFallbacks: string[];
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

/**
 * Layout tuning options.
 *
 * The future block-resize slice may add an optional per-block preferred width
 * here (or as a measurement input); M4a deliberately does not add `widthHint`,
 * `displayWidth`, or any document field for resize.
 */
export interface LayoutOptions {
  minContentWidth: number;
  maxContentWidth: number;
  siblingGap: number;
  /** Per-level left-origin indent used when a child group wraps below its parent. */
  wrapIndent: number;
  /**
   * Per-level cap on the indent added from the wrapped group's parent left
   * edge. It is applied at every level and does not accumulate across
   * ancestors; each nested group gets the same cap from its own parent.
   */
  maxWrapIndent: number;
  /**
   * Page-only direct-child indent from the parent left when a whole child group
   * wraps below it. It leaves room for the below trunk and its left stem.
   *
   * Page production always passes the resolved `PageTheme.childIndent` through
   * `pageLayoutOptions`; `DEFAULT_LAYOUT_OPTIONS.childIndent` is only the
   * DOM-free engine fallback for tests, labs, and the estimator. The Continuous
   * renderer does not call `layoutDocument`, so this is not a Continuous token.
   */
  childIndent: number;
  /**
   * Page-only below-trunk inset from the parent left for the direct-child group
   * in callout mode B2. Continuous does not read this field.
   */
  childTrunkInset: number;
  /**
   * Page-only below-trunk inset from the parent left for the anchored-callout
   * group in callout mode B2 (the inner/right trunk).
   */
  calloutTrunkInset: number;
  /**
   * Page-only callout card left offset from the parent left in mode B2 (the
   * inner/right card column).
   */
  calloutCardIndent: number;
  /** Page-only gap from the parent right edge to the mode A callout lane. */
  calloutRightGap: number;
  /** Minimum free right space that selects callout mode A. */
  calloutModeMinWidth: number;
  /**
   * Page-only A/B2 callout lane modes. Continuous keeps this false, and the
   * explicit legacy `stacked` Page packing does not enable it either.
   */
  calloutModes: boolean;
  wrapPolicy: WrapPolicy;
  /** Page/PDF packing policy; ignored by the Continuous renderer. */
  pagePacking: PagePacking;
  calloutGap: number;
  chapterGap: number;
  cardPadding: number;
  cardBorder: number;
  segmentGap: number;
}

/**
 * DOM-free engine fallback for the Page direct-child indent.
 *
 * This is not a design token and not a Continuous value: production Page
 * layout supplies `PageTheme.childIndent` via `pageLayoutOptions`. The literal
 * is named here so a future engine default change is a one-line, reviewable
 * decision instead of a hidden read of a Page theme preset.
 */
const ENGINE_DEFAULT_CHILD_INDENT = 26;

export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  minContentWidth: 160,
  maxContentWidth: 420,
  siblingGap: 24,
  wrapIndent: 18,
  maxWrapIndent: 54,
  childIndent: ENGINE_DEFAULT_CHILD_INDENT,
  childTrunkInset: 12,
  calloutTrunkInset: 24,
  calloutCardIndent: 38,
  calloutRightGap: 24,
  calloutModeMinWidth: 240,
  calloutModes: false,
  wrapPolicy: 'group-left-origin',
  // Continuous and every DOM-free layout keep the R2a stacked geometry by
  // default. Page/PDF opts into the resolved PageTheme, whose presets use
  // `beside`; `compaction` is only a lab oracle.
  pagePacking: 'stacked',
  calloutGap: 20,
  chapterGap: 32,
  cardPadding: 12,
  cardBorder: 1,
  segmentGap: 8,
};

/**
 * Layout px (96 dpi) and millimetre conversions live in `page-settings.ts`
 * together with the page geometry they describe.
 */
