/**
 * The application command dispatcher.
 *
 * One delivery, one decision: build the context once, ask the manifest once,
 * then run, report or ignore. The native menu, the palette and the key router
 * all enter here, so the three surfaces cannot disagree about a refusal.
 */

import { toast } from 'sonner';
import {
  commandById,
  type AppCommand,
  type AppCommandId,
  type Availability,
} from '../../../shared/commands';
import { activeOverlayOwner, overlayOwnsCommands } from '../shell/overlay-owner';
import { commandContext } from './context';
import { RUNNERS } from './runners';

/** Which surface delivered the command; the palette shows reasons inline. */
export type CommandSurface = 'menu' | 'palette' | 'key';

export type CommandAction =
  | { kind: 'run' }
  | { kind: 'report'; reason: string }
  | { kind: 'ignore' };

/**
 * What one decision means on one surface. `hidden` is silent everywhere and
 * never consumes a chord; `disabled` is offered with its reason, and only the
 * palette renders that reason inline instead of reporting it.
 */
export function commandAction(
  decision: Availability,
  surface: CommandSurface,
): CommandAction {
  if (decision.kind === 'hidden') return { kind: 'ignore' };
  if (decision.kind === 'disabled') {
    return surface === 'palette'
      ? { kind: 'ignore' }
      : { kind: 'report', reason: decision.reason };
  }
  return { kind: 'run' };
}

/**
 * The modal gate (F1). While Settings, the palette or the Export sheet owns the
 * command channel, every app command is ignored except the palette's own ⌘K
 * toggle and `close-window` (a window action, not a shell edit). A palette row
 * is the palette's own surface, so it is never blocked by its own gate.
 */
export function channelAllows(command: AppCommand, surface: CommandSurface): boolean {
  if (surface === 'palette') return true;
  if (!overlayOwnsCommands()) return true;
  if (command.id === 'close-window') return true;
  return command.id === 'command-palette' && activeOverlayOwner() === 'palette';
}

/** Run one decision; the only place that reports a refusal. */
export function runResolvedCommand(
  command: AppCommand,
  decision: Availability,
  surface: CommandSurface,
): void {
  const action = commandAction(decision, surface);
  if (action.kind === 'ignore') return;
  if (action.kind === 'report') {
    toast.info(action.reason);
    return;
  }
  RUNNERS[command.id]();
}

/**
 * One application command from one surface. An unknown id (a stale main/renderer
 * pair) is ignored: the dispatcher never throws and shows nothing.
 */
export function runAppCommand(id: AppCommandId, surface: CommandSurface): void {
  const command = commandById(id);
  if (command === undefined) return;
  if (!channelAllows(command, surface)) return;
  runResolvedCommand(command, command.availability(commandContext()), surface);
}
