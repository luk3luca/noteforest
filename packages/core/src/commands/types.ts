/**
 * Typed command shapes: the public contract of the command layer.
 *
 * Every command is pure (the input document is not mutated), validates its
 * preconditions, applies to a deep clone, re-validates the resulting document,
 * and returns a typed success or failure. A success carries the new document,
 * the new revision, affected IDs, and (where practical) an inverse command.
 *
 * Structural edits use canonical primary branches (role "primary"), not a
 * second parent pointer. A primary branch may start at a block or at an anchor
 * inside it. Reference and anchored branches have typed commands in M3.
 */

import type { AnchorBinding } from '../anchors.js';
import type { BlockSplitPoint } from '../block-ops.js';
import type { ValidationIssue } from '../errors.js';
import type { CoreContext } from '../ids.js';
import type {
  Anchor,
  AnchorKind,
  Asset,
  BlockBorder,
  Branch,
  BranchRole,
  ContentBlock,
  ContentNode,
  Document,
  JsonObject,
} from '../types.js';

export type CommandErrorCode =
  | 'invalid-command'
  | 'invalid-document'
  | 'not-found'
  | 'duplicate-id'
  | 'invalid-placement'
  | 'cycle'
  | 'last-chapter'
  | 'chapter-in-use'
  | 'chapter-would-be-empty'
  | 'invalid-content'
  | 'anchor-exists'
  | 'asset-in-use'
  | 'read-only'
  | 'internal-invariant';

export interface AffectedIds {
  documentIds: string[];
  chapterIds: string[];
  blockIds: string[];
  branchIds: string[];
  anchorIds: string[];
  assetIds: string[];
}

/**
 * IDs created by a command. Structural callers must use these instead of
 * inferring the new block from a before/after document diff.
 */
export interface CreatedIds {
  documentIds: string[];
  chapterIds: string[];
  blockIds: string[];
  branchIds: string[];
  anchorIds: string[];
}

export interface CommandSuccess {
  ok: true;
  document: Document;
  revision: number;
  affected: AffectedIds;
  created: CreatedIds;
  inverse: DocumentCommand | null;
  warnings: string[];
}

export interface CommandFailure {
  ok: false;
  code: CommandErrorCode;
  message: string;
  issues?: ValidationIssue[];
}

export type CommandResult = CommandSuccess | CommandFailure;

// ---------------------------------------------------------------------------
// Command shapes
// ---------------------------------------------------------------------------

export interface DocumentCreateCommand {
  type: 'document.create';
  title?: string;
  id?: string;
  chapterId?: string;
  chapterTitle?: string;
  annotations?: unknown[];
  extensions?: JsonObject;
}

export interface DocumentRenameCommand {
  type: 'document.rename';
  title: string;
}

export interface ChapterCreateCommand {
  type: 'chapter.create';
  chapterId?: string;
  title?: string;
  atIndex?: number;
}

export interface ChapterRenameCommand {
  type: 'chapter.rename';
  chapterId: string;
  title: string | null;
}

export interface ChapterReorderCommand {
  type: 'chapter.reorder';
  chapterId: string;
  toIndex: number;
}

export type ChapterBlockHandling =
  | { kind: 'reject-if-not-empty' }
  | { kind: 'move-to-chapter'; chapterId: string }
  | { kind: 'delete-blocks' };

export interface ChapterDeleteCommand {
  type: 'chapter.delete';
  chapterId: string;
  blockHandling: ChapterBlockHandling;
}

export type BlockPlacement =
  | { kind: 'top-level'; chapterId: string; atIndex?: number }
  | { kind: 'child'; parentBlockId: string; atIndex?: number }
  | { kind: 'sibling'; siblingBlockId: string; after?: boolean };

export interface BlockCreateCommand {
  type: 'block.create';
  blockId?: string;
  content?: ContentNode;
  label?: string;
  border?: BlockBorder;
  placement: BlockPlacement;
}

export interface BlockEditContentCommand {
  type: 'block.editContent';
  blockId: string;
  content: ContentNode;
}

export interface BlockRenameCommand {
  type: 'block.rename';
  blockId: string;
  label: string | null;
}

export interface BlockDeleteCommand {
  type: 'block.delete';
  blockId: string;
  children: 'promote' | 'delete-subtree';
  /**
   * Undo exemption for the inverse of `block.create`: removing a freshly
   * created block may leave its chapter with no top-level block, which is a
   * valid (legacy) state. The command layer sets this only on the inverse it
   * generates for `block.create`; every user-facing delete keeps the F6 guard.
   */
  allowEmptyChapter?: boolean;
}

export interface BlockMoveCommand {
  type: 'block.move';
  blockId: string;
  to: BlockPlacement;
}

/**
 * Split one block at a text caret. Content after the caret moves to a new block
 * with a fresh ID; anchors after the cut move with it and a spanning anchor
 * keeps its ID, clips to the original side, and is flagged for repair.
 */
export interface BlockSplitCommand {
  type: 'block.split';
  blockId: string;
  at: BlockSplitPoint;
  /** Optional explicit new-block ID (tests/recovery); a fresh one by default. */
  newBlockId?: string;
}

/**
 * Merge `blockId` into `intoBlockId` (or its previous sibling by default).
 * Same primary parent port or both top-level in the same chapter only.
 */
export interface BlockMergeCommand {
  type: 'block.merge';
  blockId: string;
  intoBlockId?: string;
}

/**
 * Add one content-addressed asset record to `document.assets`.
 *
 * The bytes are copied into the package by the Node asset store first; this
 * command only records the canonical metadata. Adding the same id again keeps
 * the existing record (identical bytes share one asset) and is a harmless
 * no-op. The inverse removes the record that this command added.
 */
export interface AssetAddCommand {
  type: 'asset.add';
  asset: Asset;
}

/** Remove one asset record; used as the inverse of `asset.add`. */
export interface AssetRemoveCommand {
  type: 'asset.remove';
  assetId: string;
}

export interface AnchorCreateCommand {
  type: 'anchor.create';
  anchorId?: string;
  blockId: string;
  kind: AnchorKind;
  selector: JsonObject;
  binding: AnchorBinding;
  quote?: string;
  prefix?: string;
  suffix?: string;
  occurrenceHint?: number;
  /**
   * When the same selection is already bound to an existing anchor, return
   * that anchor (`affected.anchorIds`) instead of failing with
   * `anchor-exists`. False by default: callers must opt in.
   */
  reuseExisting?: boolean;
}

export interface AnchorRepairCommand {
  type: 'anchor.repair';
  anchorId: string;
  selector: JsonObject;
  binding: AnchorBinding;
  quote?: string;
  prefix?: string;
  suffix?: string;
  occurrenceHint?: number;
}

export interface AnchorAttachToBlockCommand {
  type: 'anchor.attachToBlock';
  anchorId: string;
}

export type AnchorBranchHandling = 'attach' | 'delete';

export interface AnchorDeleteCommand {
  type: 'anchor.delete';
  anchorId: string;
  /**
   * Required when the anchor has outgoing branches. `attach` keeps them as
   * block-sourced branches; `delete` retires them and promotes primary targets.
   */
  branches?: AnchorBranchHandling;
}

export interface BranchCreateCommand {
  type: 'branch.create';
  branchId?: string;
  sourceBlockId: string;
  /** Anchor port inside `sourceBlockId`; omitted for a block port. */
  sourceAnchorId?: string;
  targetBlockId: string;
  /** Explicit role. Defaults to primary for the M2 command shape. */
  role?: BranchRole;
  atIndex?: number;
  label?: string;
}

export type BranchFromSelectionTarget =
  | {
      kind: 'new';
      /** Optional explicit block ID; a fresh one is generated by default. */
      blockId?: string;
      content?: ContentNode;
    }
  | { kind: 'existing'; blockId: string };

/**
 * One user action: anchor (new or reused) + target block (new or existing) +
 * branch, with one exact inverse. `selector` is optional for text anchors: the
 * command derives quote/context/occurrence from the binding when omitted.
 */
export interface BranchCreateFromSelectionCommand {
  type: 'branch.createFromSelection';
  /** Block containing the selection. */
  blockId: string;
  kind: AnchorKind;
  binding: AnchorBinding;
  selector?: JsonObject;
  target: BranchFromSelectionTarget;
  /** Defaults to primary; a new target always gets a primary branch. */
  role?: BranchRole;
  atIndex?: number;
  label?: string;
  branchId?: string;
  /** Optional explicit anchor ID when a new anchor is needed. */
  anchorId?: string;
}

export type BranchTargetHandling = { kind: 'promote' } | { kind: 'delete-subtree' };

export interface BranchDeleteCommand {
  type: 'branch.delete';
  branchId: string;
  /** Required for primary branches; must be absent for reference branches. */
  targetHandling?: BranchTargetHandling;
}

export interface BranchReorderCommand {
  type: 'branch.reorder';
  branchId: string;
  toIndex: number;
}

export interface BranchRelabelCommand {
  type: 'branch.relabel';
  branchId: string;
  label: string | null;
}

/**
 * Promote a reference to the target's primary home and demote the old primary
 * edge to a reference (spec §5.3, design §7.4). Both branch IDs survive; the
 * target's subtree moves under the new parent.
 */
export interface BranchMakeHomeCommand {
  type: 'branch.makeHome';
  branchId: string;
}

/**
 * Promote a reference to primary and retire the target's old primary edge.
 * The target may be a root or already have a primary parent.
 */
export interface BranchMoveHereCommand {
  type: 'branch.moveHere';
  branchId: string;
}

/**
 * Convert a primary edge to a reference. The target becomes a top-level block
 * after the former top-level block of the source block's chapter.
 */
export interface BranchDemoteCommand {
  type: 'branch.demote';
  branchId: string;
}

/**
 * Exact record-level snapshot for structural commands that no ordinary command
 * can reverse with the same identity.
 *
 * `block.delete`, `branch.delete`, `block.move`, `branch.create` and the restore
 * itself remove, repoint or reorder records (IDs, timestamps, labels, branch
 * order, chapter placement) that a second command invocation cannot reproduce.
 * This command restores named records verbatim, removes records the target
 * snapshot no longer contains, and writes exact chapter top-level lists.
 *
 * It is generated by the command layer, never typed by a user. Callers may
 * apply it, but it only touches the records it names; surviving blocks keep
 * any text written after the original command.
 *
 * Destructive delete/detach snapshots keep `redoCommand` so redo re-applies the
 * exact delete. Snapshots without it derive their inverse by diffing the
 * pre/post state, which makes move and branch-create undo/redo exact.
 */
export interface StructureRestoreCommand {
  type: 'structure.restore';
  /** Full block records to restore; their IDs must be free. */
  blocks: ContentBlock[];
  /**
   * Full block records to overwrite in place, used when an anchor command
   * changed the content of a surviving block. Restored verbatim (including
   * `updatedAt`) so repair/attach/delete undo is exact.
   */
  replaceBlocks?: ContentBlock[];
  /**
   * Post-command records for `replaceBlocks`. A mismatch means the block was
   * edited after the command: undo must surface that instead of silently
   * discarding later text.
   */
  expectedReplaceBlocks?: ContentBlock[];
  /** Full branch records to restore or overwrite by ID. */
  branches: Branch[];
  /** Full anchor records to restore. */
  anchors: Anchor[];
  /** Exact top-level membership for every chapter the command changed. */
  chapters: Array<{ chapterId: string; topLevelBlockIds: string[] }>;
  /** Blocks present before the restore that the target snapshot omits. */
  removeBlocks?: string[];
  /** Branches present before the restore that the target snapshot omits. */
  removeBranches?: string[];
  /** Anchors present before the restore that the target snapshot omits. */
  removeAnchors?: string[];
  /** Deterministic redo for destructive deletes; omitted for diffed snapshots. */
  redoCommand?: DocumentCommand;
}

export type DocumentCommand =
  | DocumentCreateCommand
  | DocumentRenameCommand
  | ChapterCreateCommand
  | ChapterRenameCommand
  | ChapterReorderCommand
  | ChapterDeleteCommand
  | BlockCreateCommand
  | BlockEditContentCommand
  | BlockRenameCommand
  | BlockDeleteCommand
  | BlockMoveCommand
  | BlockSplitCommand
  | BlockMergeCommand
  | AssetAddCommand
  | AssetRemoveCommand
  | AnchorCreateCommand
  | AnchorRepairCommand
  | AnchorAttachToBlockCommand
  | AnchorDeleteCommand
  | BranchCreateCommand
  | BranchCreateFromSelectionCommand
  | BranchDeleteCommand
  | BranchReorderCommand
  | BranchRelabelCommand
  | BranchMakeHomeCommand
  | BranchMoveHereCommand
  | BranchDemoteCommand
  | StructureRestoreCommand;

export interface ExecuteCommandOptions {
  context?: Partial<CoreContext>;
  /** Skip the initial full validation (only for trusted, just-validated docs). */
  skipInputValidation?: boolean;
}
