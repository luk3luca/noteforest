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
export const CURRENT_SCHEMA_VERSION = 2;

export type BlockBorder = 'none' | 'subtle' | 'strong';
export type BranchRole = 'primary' | 'reference';
export type AnchorKind = 'text' | 'formula' | 'code' | 'image';

/** Any JSON object. Unknown keys are kept on purpose. */
export interface JsonObject {
  [key: string]: unknown;
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

/**
 * Inline mark. Marks are open data, not a whitelist: an unknown mark survives
 * validation and save. The product marks are `anchor` (a semantic binding, see
 * anchors.ts) and `highlight` (one `tone`, see `highlights.ts`); both are
 * additive and need no `schemaVersion` bump.
 */
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
  /**
   * Repair hints that survive undo/redo and save round-trips. A split through
   * an anchor, for example, stores `split-inside-anchor` without rewriting the
   * stored selector. Flags are advisory: the anchor record and branch stay.
   */
  repairFlags?: string[];
  createdAt?: string;
  extensions?: JsonObject;
}

export interface BranchSource extends JsonObject {
  blockId: string;
  anchorId?: string;
}

/**
 * A structural edge. M2 persists **primary** branches to represent the block
 * tree (spec §4.5–4.6). M3 adds reference branches and branches sourced from
 * anchors; all share this record shape.
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

export interface Document extends JsonObject {
  schemaVersion: number;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  chapters: Chapter[];
  blocks: Record<string, ContentBlock>;
  anchors: Record<string, Anchor>;
  branches: Record<string, Branch>;
  assets: Record<string, Asset>;
  /** Reserved study layer; empty in v1. Optional for M2 forward tolerance. */
  annotations?: unknown[];
  extensions?: JsonObject;
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
