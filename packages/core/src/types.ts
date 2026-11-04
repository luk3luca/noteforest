/**
 * NoteForest canonical document model (M2 subset).
 *
 * This module is pure TypeScript: no Node, DOM, React, or editor imports.
 * Content is the canonical structured JSON body (ProseMirror-shaped, see
 * docs/spec.md §4.11). Unknown fields at every level and unknown content nodes
 * are preserved because the model is treated as open JSON, not projected onto
 * a closed shape.
 */

/** Current document format version. Migrations increment this. */
export const CURRENT_SCHEMA_VERSION = 1;

export type PageOrientation = 'portrait' | 'landscape';
export type BlockBorder = 'none' | 'subtle' | 'strong';
export type BranchRole = 'primary' | 'reference';
export type AnchorKind = 'text' | 'formula' | 'code' | 'image';
export type ViewMode = 'outline' | 'reader' | 'page';

/** Any JSON object. Unknown keys are kept on purpose. */
export interface JsonObject {
  [key: string]: unknown;
}

export interface MarginsMm extends JsonObject {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PageSetup extends JsonObject {
  size: 'A4';
  orientation: PageOrientation;
  margins: MarginsMm;
}

export interface Chapter extends JsonObject {
  id: string;
  title?: string;
  topLevelBlockIds: string[];
  extensions?: JsonObject;
}

/**
 * ProseMirror-shaped content node.
 *
 * The spec's illustrative schema uses `children` (docs/spec.md §4.11); this is
 * the canonical M2 subset. Unknown node/mark types are preserved verbatim.
 */
export interface ContentNode extends JsonObject {
  type: string;
  attrs?: JsonObject;
  text?: string;
  marks?: ContentMark[];
  children?: ContentNode[];
}

export interface ContentMark extends JsonObject {
  type: string;
  attrs?: JsonObject;
}

export interface ContentBlock extends JsonObject {
  id: string;
  label?: string;
  content: ContentNode;
  border?: BlockBorder;
  createdAt?: string;
  updatedAt?: string;
  extensions?: JsonObject;
}

export interface Anchor extends JsonObject {
  id: string;
  blockId: string;
  kind: AnchorKind;
  selector: JsonObject;
  quote?: string;
  prefix?: string;
  suffix?: string;
  occurrenceHint?: number;
  lastKnown?: JsonObject;
  createdAt?: string;
  extensions?: JsonObject;
}

export interface BranchSource extends JsonObject {
  blockId: string;
  anchorId?: string;
}

/**
 * A structural edge. M2 persists **primary** branches to represent the block
 * tree (spec §4.5–4.6). Reference and anchor branches are validated when
 * present but have no commands in M2.
 */
export interface Branch extends JsonObject {
  id: string;
  source: BranchSource;
  targetBlockId: string;
  role: BranchRole;
  order: string;
  label?: string;
  createdAt?: string;
  extensions?: JsonObject;
}

export interface Asset extends JsonObject {
  id: string;
  path: string;
  mime: string;
  bytes?: number;
  width?: number;
  height?: number;
  alt?: string;
  originalName?: string;
  extensions?: JsonObject;
}

export interface ViewState extends JsonObject {
  mode?: ViewMode;
  currentChapterId?: string;
  currentPage?: number;
  zoom?: number;
  outlineScroll?: number;
  readerScroll?: number;
  focusedBlockId?: string;
  collapsed?: string[];
  selectedBlockIds?: string[];
}

export interface Document extends JsonObject {
  schemaVersion: number;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  pageSetup: PageSetup;
  manualBreakBeforeBlockIds: string[];
  chapters: Chapter[];
  blocks: Record<string, ContentBlock>;
  anchors: Record<string, Anchor>;
  branches: Record<string, Branch>;
  assets: Record<string, Asset>;
  /** Reserved study layer; empty in v1. Optional for M2 forward tolerance. */
  annotations?: unknown[];
  viewState?: ViewState;
  extensions?: JsonObject;
}

/** Default A4 page setup: landscape, 20 mm margins (spec §4.7). */
export const DEFAULT_MARGINS_MM: Readonly<MarginsMm> = Object.freeze({
  top: 20,
  right: 20,
  bottom: 20,
  left: 20,
});

/** New documents default to A4 landscape; existing documents keep their orientation. */
export const DEFAULT_PAGE_ORIENTATION: PageOrientation = 'landscape';

export function defaultPageSetup(): PageSetup {
  return {
    size: 'A4',
    orientation: DEFAULT_PAGE_ORIENTATION,
    margins: { ...DEFAULT_MARGINS_MM },
  };
}

/** An empty content body: a ProseMirror doc node with no children. */
export function emptyContent(): ContentNode {
  return { type: 'doc', children: [] };
}

export interface DocumentStats {
  blocks: number;
  chapters: number;
  branches: number;
  anchors: number;
  assets: number;
}

export function documentStats(document: Document): DocumentStats {
  return {
    blocks: Object.keys(document.blocks).length,
    chapters: document.chapters.length,
    branches: Object.keys(document.branches).length,
    anchors: Object.keys(document.anchors).length,
    assets: Object.keys(document.assets).length,
  };
}
