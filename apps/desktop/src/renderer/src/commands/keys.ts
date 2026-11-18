/**
 * The global key router.
 *
 * Every application chord belongs to exactly one manifest command. This module
 * matches the event against that set, keeps the event-target guards (the Page
 * Edit overlay, text inputs, the pager field), suppresses auto-repeat except for
 * the commands that opt in, and consumes a chord only when the command owns it
 * here. A `hidden` decision leaves the key to the local surface (`Esc`, `⌘↑`,
 * `⌃Tab`, `⌘G` outside their context).
 */

import { matches, type KeyEventLike } from '../../../shared/shortcuts';
import {
  APP_COMMANDS,
  ownsGlobalChord,
  type AppCommand,
  type AppCommandId,
  type Availability,
  type CommandContext,
} from '../../../shared/commands';
import { commandContext } from './context';
import { channelAllows, runResolvedCommand } from './run';

/** The commands that own a global chord, in manifest order (chords are unique). */
const KEY_COMMANDS: readonly AppCommand[] = APP_COMMANDS.filter(ownsGlobalChord);

/**
 * The chords that must not reach ProseMirror's own handler as well: document
 * history, the find step, and the reference dialog all mutate through the shell.
 */
const STOP_PROPAGATION: ReadonlySet<AppCommandId> = new Set<AppCommandId>([
  'undo',
  'redo',
  'find-next',
  'find-previous',
  'link-reference',
]);

/** What `matches` needs, plus the repeat flag this router reads. */
export interface AppKeyEvent extends KeyEventLike {
  repeat?: boolean;
}

export interface AppKeyMatch {
  command: AppCommand;
  decision: Availability;
  /** True for the chords ProseMirror must not also handle. */
  stopPropagation: boolean;
}

/**
 * The command one event belongs to in this context, or `null` when the key
 * stays with the local surface (hidden, a suppressed auto-repeat, or unbound).
 */
export function matchAppKey(
  event: AppKeyEvent,
  context: CommandContext,
): AppKeyMatch | null {
  for (const command of KEY_COMMANDS) {
    if (command.shortcutId === undefined) continue;
    if (!matches(event, command.shortcutId)) continue;
    // A held key is a duplicate delivery of the same intent; only history and
    // zoom are meant to repeat (shipped hold behavior).
    if (event.repeat === true && command.repeat !== 'allow') return null;
    const decision = command.availability(context);
    if (decision.kind === 'hidden') return null;
    return {
      command,
      decision,
      stopPropagation: STOP_PROPAGATION.has(command.id),
    };
  }
  return null;
}

function insideElement(target: EventTarget | null, selector: string): boolean {
  return target instanceof Element && target.closest(selector) !== null;
}

function isPlainTextInput(target: Element | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

/**
 * The keydown handler. Installed once on `window` in the capture phase so a
 * command runs before any editor-local binding sees the same event.
 */
export function handleAppKeyDown(event: KeyboardEvent): void {
  const match = matchAppKey(event, commandContext());
  if (match === null) return;
  // A surface that owns the command channel receives no app command; leaving
  // the event untouched keeps its local keys (typing, Escape, arrows) working.
  if (!channelAllows(match.command, 'key')) return;

  const target = event.target;
  const insidePageEdit = insideElement(target, '[data-page-edit-overlay]');
  const id = match.command.id;

  if (insidePageEdit) {
    // The Page Edit overlay is a rich-text editor: its own history and its own
    // commit keys win. Save commits the overlay so the file never reports a
    // saved state that excludes the typed text.
    if (id === 'undo' || id === 'redo' || id === 'close-find') return;
    if (id === 'save') {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent('nf:page-edit-commit'));
      return;
    }
  }

  // Text inputs own their own undo/redo (a settings field, a dialog textarea).
  if ((id === 'undo' || id === 'redo') && isPlainTextInput(document.activeElement)) return;

  // The page arrows never steal a caret key. The pager field is the exception:
  // it only ever holds a page number, so ⌘↑/⌘↓ keep working from it.
  if (id === 'page-previous' || id === 'page-next') {
    const inPager = insideElement(target, '[data-page-position-input]');
    if (!inPager && insideElement(target, 'input, textarea, [contenteditable="true"]')) return;
  }

  event.preventDefault();
  if (match.stopPropagation) event.stopPropagation();
  runResolvedCommand(match.command, match.decision, 'key');
}
