/**
 * The twelve block palette entries that stay outside the command manifest.
 *
 * They are palette rows (and context-menu rows) whose chords, if any, are
 * editor-local, so they do not meet the "menu, wire id, or global chord"
 * criterion. Their behavior is shipped and unchanged; their gate reads the same
 * authoring decision and reason constants as the manifest, so the palette has
 * one rule for both kinds of row.
 */

import { toast } from 'sonner';
import type { Availability, CommandContext } from '../../../shared/commands';
import { COMMAND_REASONS } from '../../../shared/commands';
import { activeRuntime, report } from '../actions';
import { blockedByReadMode } from '../actions';
import { indentTarget, outdentTarget } from '../lib/indent';
import { insertImageFromDialog } from '../lib/image-insert';
import { useShell } from '../state/shell';

export type BlockCommandId =
  | 'add-child'
  | 'add-sibling'
  | 'indent-block'
  | 'outdent-block'
  | 'block-text'
  | 'block-h1'
  | 'block-h2'
  | 'block-h3'
  | 'insert-table'
  | 'insert-image'
  | 'insert-math'
  | 'insert-code';

export interface BlockCommand {
  id: BlockCommandId;
  label: string;
  /** The published chord, when the editor-local binding has one. */
  shortcutId?: string;
  /** `author` needs Continuous Edit on a writable note; `document` needs a note. */
  requirement: 'document' | 'author';
  /** A command-specific refusal (indent/outdent need a block to move). */
  unavailableReason?: () => string | undefined;
  run: () => void;
}

function selectedBlockId(): string | null {
  return activeRuntime()?.selectedBlockId ?? null;
}

function applyBlockType(level: 1 | 2 | 3 | null): void {
  const runtime = activeRuntime();
  if (runtime === null) return;
  if (blockedByReadMode(runtime)) return;
  const blockId = runtime.selectedBlockId;
  if (blockId === null) return;
  runtime.setBlockType(blockId, level);
}

/** The shipped palette order of the block rows. */
export const BLOCK_COMMANDS: readonly BlockCommand[] = [
  {
    id: 'add-child',
    label: 'Add child block',
    shortcutId: 'add-child',
    requirement: 'author',
    run: () => {
      const runtime = activeRuntime();
      const blockId = selectedBlockId();
      if (runtime === null || blockId === null) return;
      report(runtime.addChild(blockId));
    },
  },
  {
    id: 'add-sibling',
    label: 'Add sibling block',
    shortcutId: 'add-sibling',
    requirement: 'author',
    run: () => {
      const runtime = activeRuntime();
      const blockId = selectedBlockId();
      if (runtime === null || blockId === null) return;
      report(runtime.addSibling(blockId));
    },
  },
  {
    id: 'indent-block',
    label: 'Indent block',
    shortcutId: 'indent',
    requirement: 'author',
    unavailableReason: () => {
      const runtime = activeRuntime();
      const blockId = selectedBlockId();
      if (runtime === null || blockId === null) return COMMAND_REASONS.NO_SELECTION;
      const check = indentTarget(runtime.document, blockId);
      return check.ok ? undefined : check.reason;
    },
    run: () => {
      const runtime = activeRuntime();
      const blockId = selectedBlockId();
      if (runtime === null || blockId === null) return;
      report(runtime.indent(blockId));
    },
  },
  {
    id: 'outdent-block',
    label: 'Outdent block',
    shortcutId: 'outdent',
    requirement: 'author',
    unavailableReason: () => {
      const runtime = activeRuntime();
      const blockId = selectedBlockId();
      if (runtime === null || blockId === null) return COMMAND_REASONS.NO_SELECTION;
      const check = outdentTarget(runtime.document, blockId);
      return check.ok ? undefined : check.reason;
    },
    run: () => {
      const runtime = activeRuntime();
      const blockId = selectedBlockId();
      if (runtime === null || blockId === null) return;
      report(runtime.outdent(blockId));
    },
  },
  {
    id: 'block-text',
    label: 'Block type: Text',
    requirement: 'author',
    run: () => applyBlockType(null),
  },
  {
    id: 'block-h1',
    label: 'Block type: Heading 1',
    requirement: 'author',
    run: () => applyBlockType(1),
  },
  {
    id: 'block-h2',
    label: 'Block type: Heading 2',
    requirement: 'author',
    run: () => applyBlockType(2),
  },
  {
    id: 'block-h3',
    label: 'Block type: Heading 3',
    requirement: 'author',
    run: () => applyBlockType(3),
  },
  {
    id: 'insert-table',
    label: 'Insert table',
    requirement: 'author',
    run: () => useShell.getState().openDialog({ kind: 'table-size' }),
  },
  {
    id: 'insert-image',
    label: 'Insert image…',
    requirement: 'author',
    run: () => {
      const runtime = activeRuntime();
      const blockId = selectedBlockId();
      if (runtime === null) return;
      if (blockId === null) {
        toast.error('Select a block before inserting an image.');
        return;
      }
      void insertImageFromDialog(runtime, blockId);
    },
  },
  {
    id: 'insert-math',
    label: 'Insert math…',
    requirement: 'author',
    run: () =>
      useShell.getState().openDialog({ kind: 'math', mathKind: 'inline', latex: '', pos: null }),
  },
  {
    id: 'insert-code',
    label: 'Toggle code block',
    requirement: 'author',
    run: () => activeRuntime()?.editor?.chain().focus().toggleCodeBlock().run(),
  },
];

const BY_ID = new Map<BlockCommandId, BlockCommand>(
  BLOCK_COMMANDS.map((command) => [command.id, command]),
);

export function blockCommandById(id: string): BlockCommand | undefined {
  return BY_ID.get(id as BlockCommandId);
}

/** The palette gate for one block entry, in the same order as the manifest. */
export function blockCommandDecision(
  command: BlockCommand,
  context: CommandContext,
): Availability {
  if (context.document === 'none') {
    return { kind: 'disabled', reason: COMMAND_REASONS.NO_DOCUMENT };
  }
  if (command.requirement === 'author' && !context.canAuthor) {
    return { kind: 'disabled', reason: COMMAND_REASONS.READ_MODE };
  }
  const reason = command.unavailableReason?.();
  return reason === undefined ? { kind: 'enabled' } : { kind: 'disabled', reason };
}
