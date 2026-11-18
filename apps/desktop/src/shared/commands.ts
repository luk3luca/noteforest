/**
 * The application command manifest (one declaration per command).
 *
 * A command is an action the user reaches from the native menu, the command
 * palette, or a global chord. Each record declares its label, its menu
 * placement, its palette membership, its chord link and one availability rule.
 * The four adapters (the native menu, the palette, the global key router and the
 * renderer runner map) derive from this data, so a label, a chord or a refusal
 * reason has exactly one home.
 *
 * Pure data plus one pure decision: no React, no store, no Electron, no runner.
 * `shared/api.ts` owns the 26 wire ids; this manifest names each of them once and
 * adds the palette-only and chord-only commands that never cross the bridge.
 * Behavior lives in the renderer runner map (`renderer/src/commands/runners.ts`).
 */

import type { MenuCommand } from './api.js';
import { hasChord, shortcutScope } from './shortcuts.js';

/** Every application command id, in inventory order. */
export type AppCommandId =
  | 'new-document'
  | 'open-document'
  | 'open-markdown'
  | 'save'
  | 'close-tab'
  | 'close-window'
  | 'reopen-tab'
  | 'new-chapter'
  | 'add-block'
  | 'export-pdf'
  | 'rename-document'
  | 'reveal'
  | 'undo'
  | 'redo'
  | 'find-open'
  | 'find-next'
  | 'find-previous'
  | 'link-reference'
  | 'command-palette'
  | 'toggle-sidebar'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'fit-width'
  | 'fit-page'
  | 'focus-branch'
  | 'continuous-layout'
  | 'page-layout'
  | 'toggle-interaction-mode'
  | 'anchor-health'
  | 'tab-next'
  | 'tab-previous'
  | 'tab-next-bracket'
  | 'tab-previous-bracket'
  | 'close-find'
  | 'page-previous'
  | 'page-next'
  | 'settings'
  | 'settings-shortcuts'
  | 'flush';

/**
 * The decision a command makes for one context. `hidden` is not offered here:
 * no row, no menu report, and the chord stays with the local surface.
 */
export type Availability =
  | { kind: 'enabled' }
  | { kind: 'disabled'; reason: string }
  | { kind: 'hidden' };

/** Everything an availability rule may read. Built once per delivery. */
export interface CommandContext {
  /** `note` requires an open document runtime; a recovery or missing tab is `none`. */
  document: 'none' | 'note' | 'guest';
  layout: 'continuous' | 'page';
  mode: 'edit' | 'read';
  /** The shipped editingEnabledFor(): Continuous + Edit on a writable note. */
  canAuthor: boolean;
  hasSelection: boolean;
  /** The find bar is open (Escape closes it). */
  findBarOpen: boolean;
  /** The find bar or the Search sidebar owns a result set (⌘G / ⇧⌘G step it). */
  findActive: boolean;
  tabCount: number;
}

/** The five refusal sentences, verbatim from the shipped surfaces. */
export const COMMAND_REASONS = {
  NO_DOCUMENT: 'Open a document first',
  READ_MODE: 'Read mode — switch to Continuous Edit to run this command',
  GUEST_EXPORT: 'Markdown files have no Page or PDF export.',
  NO_SELECTION: 'Select a block first.',
  EXPORT_NO_NOTE: 'Open a note before exporting a PDF.',
} as const;

export type CommandReason = (typeof COMMAND_REASONS)[keyof typeof COMMAND_REASONS];

/** The native menu sections a command may be placed in. */
export type MenuSection = 'app' | 'file' | 'edit' | 'view' | 'help';

export interface MenuPlacement {
  section: MenuSection;
  /** Relative position inside the section; roles and separators share the scale. */
  order: number;
  /** The pinned Electron item id the UI suites address. */
  itemId?: string;
}

export interface AppCommand {
  id: AppCommandId;
  /** The group orders the documentation and the inventory, never the palette. */
  group: 'File' | 'Edit' | 'View' | 'Navigate' | 'App';
  /** The row/menu text; omitted only for a wire-only command (`flush`). */
  label?: string;
  /** A palette row whose text depends on the context (reveal, mode switch). */
  paletteLabel?: (context: CommandContext) => string;
  /** Present when the command has a palette row in the note context. */
  palette?: { guest?: boolean };
  menu?: MenuPlacement;
  /** The IPC id, when the command crosses the bridge. */
  wire?: MenuCommand;
  /** The catalogue link; a command without a chord has none. */
  shortcutId?: string;
  /** Auto-repeat is suppressed unless the command opts in (history, zoom). */
  repeat?: 'allow';
  availability: (context: CommandContext) => Availability;
}

const ENABLED: Availability = { kind: 'enabled' };
const HIDDEN: Availability = { kind: 'hidden' };

function disabled(reason: string): Availability {
  return { kind: 'disabled', reason };
}

/**
 * A command a note (never a Markdown guest) must be open for. The optional
 * decision runs only after the document-kind and no-document steps, so a
 * predicate never re-checks what the kind already answered.
 */
function noteOnly(
  decide: (context: CommandContext) => Availability = () => ENABLED,
): (context: CommandContext) => Availability {
  return (context) => {
    if (context.document === 'guest') return HIDDEN;
    if (context.document === 'none') return disabled(COMMAND_REASONS.NO_DOCUMENT);
    return decide(context);
  };
}

/** A command that authors the note: Continuous Edit on a writable note. */
const authorOnly = noteOnly((context) =>
  context.canAuthor ? ENABLED : disabled(COMMAND_REASONS.READ_MODE),
);

/** History and layout verbs: a guest keeps its renderer-local history. */
function historyAvailability(context: CommandContext): Availability {
  if (context.document === 'guest') return ENABLED;
  if (context.document === 'none') return disabled(COMMAND_REASONS.NO_DOCUMENT);
  return context.canAuthor ? ENABLED : disabled(COMMAND_REASONS.READ_MODE);
}

/** The find steps need an open note and an active find surface. */
function findStepAvailability(context: CommandContext): Availability {
  if (context.document !== 'note' || !context.findActive) return HIDDEN;
  return ENABLED;
}

/** The page arrows exist only in the Page layout of a note. */
function pageStepAvailability(context: CommandContext): Availability {
  if (context.document !== 'note' || context.layout !== 'page') return HIDDEN;
  return ENABLED;
}

function tabAvailability(context: CommandContext): Availability {
  return context.tabCount >= 2 ? ENABLED : HIDDEN;
}

/** The mode pair's palette row names the mode it switches to. */
function modePaletteLabel(context: CommandContext): string {
  return context.mode === 'edit' ? 'Switch to Read mode' : 'Switch to Edit mode';
}

/** The reveal row names the kind of thing it reveals, as shipped. */
function revealPaletteLabel(context: CommandContext): string {
  return context.document === 'guest'
    ? 'Reveal Markdown file in Finder'
    : 'Reveal document in Finder';
}

/**
 * The 40 application commands. Menu orders follow the shipped menu positions;
 * separators and native roles live in `main/menu-template.ts` on the same scale.
 */
export const APP_COMMANDS: readonly AppCommand[] = [
  /* ------------------------------------------------------------------ File */
  {
    id: 'new-document',
    group: 'File',
    label: 'New note',
    palette: {},
    menu: { section: 'file', order: 10 },
    wire: 'new-document',
    shortcutId: 'new-note',
    availability: () => ENABLED,
  },
  {
    id: 'open-document',
    group: 'File',
    label: 'Open note…',
    menu: { section: 'file', order: 20 },
    wire: 'open-document',
    shortcutId: 'open-note',
    availability: () => ENABLED,
  },
  {
    id: 'open-markdown',
    group: 'File',
    label: 'Open Markdown…',
    palette: { guest: true },
    menu: { section: 'file', order: 30 },
    wire: 'open-markdown',
    shortcutId: 'open-markdown',
    availability: () => ENABLED,
  },
  {
    id: 'new-chapter',
    group: 'File',
    label: 'New chapter',
    palette: {},
    menu: { section: 'file', order: 40 },
    wire: 'new-chapter',
    shortcutId: 'new-chapter',
    availability: authorOnly,
  },
  {
    id: 'save',
    group: 'File',
    label: 'Save',
    palette: {},
    menu: { section: 'file', order: 50 },
    wire: 'save',
    shortcutId: 'save',
    availability: (context) =>
      context.document === 'none' ? disabled(COMMAND_REASONS.NO_DOCUMENT) : ENABLED,
  },
  {
    id: 'export-pdf',
    group: 'File',
    label: 'Export PDF…',
    palette: {},
    menu: { section: 'file', order: 60, itemId: 'menu-export-pdf' },
    wire: 'export-pdf',
    shortcutId: 'export-pdf',
    availability: (context) => {
      if (context.document === 'guest') return disabled(COMMAND_REASONS.GUEST_EXPORT);
      if (context.document === 'none') return disabled(COMMAND_REASONS.EXPORT_NO_NOTE);
      return ENABLED;
    },
  },
  {
    id: 'close-tab',
    group: 'File',
    label: 'Close tab',
    palette: { guest: true },
    menu: { section: 'file', order: 70 },
    wire: 'close-tab',
    shortcutId: 'close-tab',
    availability: () => ENABLED,
  },
  {
    id: 'reopen-tab',
    group: 'File',
    label: 'Reopen closed tab',
    menu: { section: 'file', order: 80 },
    wire: 'reopen-tab',
    shortcutId: 'reopen-tab',
    availability: () => ENABLED,
  },
  {
    id: 'close-window',
    group: 'File',
    label: 'Close Window',
    menu: { section: 'file', order: 90 },
    wire: 'close-window',
    shortcutId: 'close-window',
    availability: () => ENABLED,
  },
  {
    id: 'add-block',
    group: 'File',
    label: 'Add top-level block',
    palette: {},
    wire: 'add-block',
    availability: authorOnly,
  },
  {
    id: 'rename-document',
    group: 'File',
    label: 'Rename document…',
    palette: {},
    availability: noteOnly(),
  },
  {
    id: 'reveal',
    group: 'File',
    label: 'Reveal document in Finder',
    paletteLabel: revealPaletteLabel,
    palette: { guest: true },
    availability: (context) =>
      context.document === 'none' ? disabled(COMMAND_REASONS.NO_DOCUMENT) : ENABLED,
  },

  /* ------------------------------------------------------------------ Edit */
  {
    id: 'undo',
    group: 'Edit',
    label: 'Undo',
    palette: {},
    menu: { section: 'edit', order: 10, itemId: 'menu-undo' },
    wire: 'undo',
    shortcutId: 'undo',
    repeat: 'allow',
    availability: historyAvailability,
  },
  {
    id: 'redo',
    group: 'Edit',
    label: 'Redo',
    palette: {},
    menu: { section: 'edit', order: 20, itemId: 'menu-redo' },
    wire: 'redo',
    shortcutId: 'redo',
    repeat: 'allow',
    availability: historyAvailability,
  },
  {
    id: 'find-open',
    group: 'Edit',
    label: 'Find…',
    menu: { section: 'edit', order: 40, itemId: 'menu-find' },
    wire: 'find-open',
    shortcutId: 'find',
    availability: (context) => (context.document === 'note' ? ENABLED : HIDDEN),
  },
  {
    id: 'find-next',
    group: 'Edit',
    label: 'Find Next',
    menu: { section: 'edit', order: 50, itemId: 'menu-find-next' },
    wire: 'find-next',
    shortcutId: 'find-next',
    availability: findStepAvailability,
  },
  {
    id: 'find-previous',
    group: 'Edit',
    label: 'Find Previous',
    menu: { section: 'edit', order: 60, itemId: 'menu-find-previous' },
    wire: 'find-previous',
    shortcutId: 'find-previous',
    availability: findStepAvailability,
  },
  {
    id: 'link-reference',
    group: 'Edit',
    label: 'Link as reference…',
    palette: {},
    shortcutId: 'link-reference',
    availability: noteOnly((context) => {
      if (!context.canAuthor) return disabled(COMMAND_REASONS.READ_MODE);
      return context.hasSelection ? ENABLED : disabled(COMMAND_REASONS.NO_SELECTION);
    }),
  },

  /* ------------------------------------------------------------------ View */
  {
    id: 'command-palette',
    group: 'View',
    label: 'Command palette…',
    menu: { section: 'view', order: 10 },
    wire: 'command-palette',
    shortcutId: 'command-palette',
    availability: () => ENABLED,
  },
  {
    id: 'toggle-sidebar',
    group: 'View',
    label: 'Toggle sidebar',
    palette: { guest: true },
    menu: { section: 'view', order: 20 },
    wire: 'toggle-sidebar',
    shortcutId: 'toggle-sidebar',
    availability: () => ENABLED,
  },
  {
    id: 'fit-width',
    group: 'View',
    label: 'Fit width',
    palette: {},
    menu: { section: 'view', order: 40 },
    wire: 'fit-width',
    shortcutId: 'fit-width',
    availability: noteOnly(),
  },
  {
    id: 'fit-page',
    group: 'View',
    label: 'Fit page',
    palette: {},
    menu: { section: 'view', order: 50, itemId: 'menu-fit-page' },
    wire: 'fit-page',
    shortcutId: 'fit-page',
    availability: noteOnly(),
  },
  {
    id: 'focus-branch',
    group: 'View',
    label: 'Focus branch',
    palette: {},
    menu: { section: 'view', order: 60 },
    wire: 'focus-branch',
    shortcutId: 'focus-branch',
    availability: noteOnly(),
  },
  {
    id: 'zoom-reset',
    group: 'View',
    label: 'Reset zoom',
    palette: {},
    menu: { section: 'view', order: 70 },
    wire: 'zoom-reset',
    shortcutId: 'reset-zoom',
    availability: noteOnly(),
  },
  {
    id: 'zoom-in',
    group: 'View',
    label: 'Zoom in',
    palette: {},
    menu: { section: 'view', order: 80 },
    wire: 'zoom-in',
    shortcutId: 'zoom-in',
    repeat: 'allow',
    availability: noteOnly(),
  },
  {
    id: 'zoom-out',
    group: 'View',
    label: 'Zoom out',
    palette: {},
    menu: { section: 'view', order: 90 },
    wire: 'zoom-out',
    shortcutId: 'zoom-out',
    repeat: 'allow',
    availability: noteOnly(),
  },
  {
    id: 'continuous-layout',
    group: 'View',
    label: 'Switch to Continuous',
    palette: {},
    shortcutId: 'continuous-layout',
    availability: noteOnly(),
  },
  {
    id: 'page-layout',
    group: 'View',
    label: 'Switch to Page',
    palette: {},
    shortcutId: 'page-layout',
    availability: noteOnly(),
  },
  {
    id: 'toggle-interaction-mode',
    group: 'View',
    label: 'Switch to Read mode',
    paletteLabel: modePaletteLabel,
    palette: { guest: true },
    shortcutId: 'toggle-mode',
    availability: () => ENABLED,
  },
  {
    id: 'anchor-health',
    group: 'View',
    label: 'Document health',
    palette: {},
    availability: (context) => (context.document === 'guest' ? HIDDEN : ENABLED),
  },

  /* -------------------------------------------------------------- Navigate */
  {
    id: 'tab-next',
    group: 'Navigate',
    label: 'Next tab',
    shortcutId: 'tab-next',
    availability: tabAvailability,
  },
  {
    id: 'tab-previous',
    group: 'Navigate',
    label: 'Previous tab',
    shortcutId: 'tab-previous',
    availability: tabAvailability,
  },
  {
    id: 'tab-next-bracket',
    group: 'Navigate',
    label: 'Next tab',
    shortcutId: 'tab-next-bracket',
    availability: tabAvailability,
  },
  {
    id: 'tab-previous-bracket',
    group: 'Navigate',
    label: 'Previous tab',
    shortcutId: 'tab-previous-bracket',
    availability: tabAvailability,
  },
  {
    id: 'close-find',
    group: 'Navigate',
    label: 'Close find',
    shortcutId: 'close-find',
    availability: (context) => (context.findBarOpen ? ENABLED : HIDDEN),
  },
  {
    id: 'page-previous',
    group: 'Navigate',
    label: 'Previous page',
    shortcutId: 'page-previous',
    availability: pageStepAvailability,
  },
  {
    id: 'page-next',
    group: 'Navigate',
    label: 'Next page',
    shortcutId: 'page-next',
    availability: pageStepAvailability,
  },

  /* ------------------------------------------------------------------- App */
  {
    id: 'settings',
    group: 'App',
    label: 'Settings…',
    palette: { guest: true },
    menu: { section: 'app', order: 30 },
    wire: 'settings',
    shortcutId: 'settings',
    availability: () => ENABLED,
  },
  {
    id: 'settings-shortcuts',
    group: 'App',
    label: 'Keyboard shortcuts',
    menu: { section: 'help', order: 10, itemId: 'menu-keyboard-shortcuts' },
    wire: 'settings-shortcuts',
    availability: () => ENABLED,
  },
  {
    id: 'flush',
    group: 'App',
    wire: 'flush',
    availability: () => ENABLED,
  },
];

const BY_ID = new Map<AppCommandId, AppCommand>(
  APP_COMMANDS.map((command) => [command.id, command]),
);

if (BY_ID.size !== APP_COMMANDS.length) {
  throw new Error('Duplicate application command id in the manifest');
}

/** The command record, or `undefined` for an unknown id (a stale bridge pair). */
export function commandById(id: string): AppCommand | undefined {
  return BY_ID.get(id as AppCommandId);
}

/** The one decision for one command in one context. */
export function availabilityFor(id: AppCommandId, context: CommandContext): Availability {
  const command = commandById(id);
  if (command === undefined) return HIDDEN;
  return command.availability(context);
}

/** Every id in inventory order (the wire parity and runner coverage guards). */
export function appCommandIds(): AppCommandId[] {
  return APP_COMMANDS.map((command) => command.id);
}

/** The palette row text for one context. */
export function paletteLabelFor(command: AppCommand, context: CommandContext): string {
  return command.paletteLabel?.(context) ?? command.label ?? command.id;
}

/** True when the command owns a global chord the key router must map. */
export function ownsGlobalChord(command: AppCommand): boolean {
  if (command.shortcutId === undefined) return false;
  return shortcutScope(command.shortcutId) === 'global' && hasChord(command.shortcutId);
}
