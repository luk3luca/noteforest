/**
 * The command-palette adapter.
 *
 * Membership and labels come from the manifest; the row order (including the
 * six-row guest curation) is this surface's own curation, pinned here. Block
 * entries are spliced in at their shipped positions. A row's enabled/disabled
 * state is the manifest decision, never a second whitelist.
 */

import {
  commandById,
  paletteLabelFor,
  type AppCommand,
  type AppCommandId,
  type CommandContext,
} from '../../../shared/commands';
import { shortcutHint } from '../../../shared/shortcuts';
import type { MenuEntry } from '../state/shell';
import {
  blockCommandById,
  blockCommandDecision,
  type BlockCommand,
  type BlockCommandId,
} from './block-commands';
import { commandContext } from './context';
import { runAppCommand } from './run';

type PaletteId = AppCommandId | BlockCommandId;

/** The shipped note-context order: 24 app rows with the block rows spliced in. */
export const NOTE_PALETTE_ORDER: readonly PaletteId[] = [
  'new-document',
  'open-markdown',
  'new-chapter',
  'save',
  'export-pdf',
  'close-tab',
  'toggle-sidebar',
  'zoom-in',
  'zoom-out',
  'zoom-reset',
  'fit-width',
  'fit-page',
  'continuous-layout',
  'page-layout',
  'toggle-interaction-mode',
  'focus-branch',
  'rename-document',
  'reveal',
  'add-block',
  'add-child',
  'add-sibling',
  'link-reference',
  'indent-block',
  'outdent-block',
  'anchor-health',
  'block-text',
  'block-h1',
  'block-h2',
  'block-h3',
  'undo',
  'redo',
  'settings',
  'insert-table',
  'insert-image',
  'insert-math',
  'insert-code',
];

/** The six command rows a Markdown guest file offers, as shipped. */
export const GUEST_PALETTE_ORDER: readonly AppCommandId[] = [
  'open-markdown',
  'toggle-interaction-mode',
  'reveal',
  'close-tab',
  'toggle-sidebar',
  'settings',
];

function appRow(command: AppCommand, context: CommandContext): MenuEntry | null {
  const decision = command.availability(context);
  if (decision.kind === 'hidden') return null;
  const shortcut =
    command.shortcutId === undefined ? undefined : shortcutHint(command.shortcutId);
  return {
    id: command.id,
    label: paletteLabelFor(command, context),
    ...(shortcut === undefined ? {} : { shortcut }),
    ...(decision.kind === 'disabled'
      ? { disabled: true, reason: decision.reason }
      : {}),
    ...(decision.kind === 'enabled'
      ? { onSelect: () => runAppCommand(command.id, 'palette') }
      : {}),
  };
}

function blockRow(command: BlockCommand, context: CommandContext): MenuEntry {
  const decision = blockCommandDecision(command, context);
  const shortcut =
    command.shortcutId === undefined ? undefined : shortcutHint(command.shortcutId);
  return {
    id: command.id,
    label: command.label,
    ...(shortcut === undefined ? {} : { shortcut }),
    ...(decision.kind === 'disabled'
      ? { disabled: true, reason: decision.reason }
      : {}),
    ...(decision.kind === 'enabled' ? { onSelect: command.run } : {}),
  };
}

function rowFor(id: PaletteId, context: CommandContext): MenuEntry | null {
  const command = commandById(id);
  if (command !== undefined) return appRow(command, context);
  const block = blockCommandById(id);
  if (block !== undefined) return blockRow(block, context);
  throw new Error(`Unknown palette command id: ${id}`);
}

export function paletteCommands(): MenuEntry[] {
  const context = commandContext();
  const order: readonly PaletteId[] =
    context.document === 'guest' ? GUEST_PALETTE_ORDER : NOTE_PALETTE_ORDER;
  return order.flatMap((id) => {
    const row = rowFor(id, context);
    return row === null ? [] : [row];
  });
}
