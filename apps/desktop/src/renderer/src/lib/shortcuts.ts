/**
 * The keyboard catalogue (K1, `docs/design/shortcuts.md` §4).
 *
 * One module owns every application chord: the handlers ask `matches(event, id)`
 * instead of comparing `event.key` by hand, the TipTap keymap asks
 * `tiptapKeys(id)`, the palette, the context menus and the control tooltips ask
 * `shortcutHint(id)`, the native menu accelerators are asserted against `menu`,
 * and the Settings list is `shortcutsForList()`.
 *
 * Pure: no React, no DOM, no Electron. A renamed binding therefore fails the
 * unit tests that compare this module with the menu template, the keymap and
 * the rendered list, instead of drifting silently.
 *
 * Conventions (product owner, 17 November 2026):
 * - one glyph order, Apple's `⌃⌥⇧⌘` + key (`⇧⌘Z`, `⌘↑`, `⌃⏎`);
 * - no bare-Shift chord, because a writing app must never take a printable key
 *   (`⇧1`/`⇧2` are gone; `⇧` is only an extra modifier on `⌘`/`⌃`);
 * - not every binding is listed: `list: false` rows are real bindings the user
 *   discovers from the control itself (a field's own keys, a menu-only command,
 *   fit page/width, the tab digits that were removed).
 *
 * Scopes group the chords a single surface can see. Within one scope no two
 * chords are identical, so `matches` is never ambiguous for a handler that asks
 * about one surface. Page Edit's commit keys live in the `editor` scope because
 * the one-block overlay is a rich-text editor, not the page canvas.
 */

export type Scope = 'global' | 'editor' | 'page' | 'find';

export type ShortcutGroup = 'Shell' | 'View' | 'Editor' | 'Page';

export interface Chord {
  /**
   * The `KeyboardEvent.key` value, case-insensitive for letters. A digit is
   * matched by `KeyboardEvent.code` (`Digit1`), so a shifted digit is the same
   * physical key. The display always comes from this value.
   */
  key: string;
  /**
   * The physical key, when the produced character is not the key the user
   * presses: `⇧⌘]` types `}` on a US layout, so `tab-next-bracket` declares
   * `BracketRight`. A chord with `code` compares `KeyboardEvent.code` only and
   * is therefore layout-independent.
   */
  code?: string;
  /**
   * The primary modifier: `⌘`, or `⌃` where the platform uses it. The shipped
   * handlers accept either, so `mod` means "the platform's command key".
   */
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  /**
   * Narrows `mod`. `true` requires Control with no Command (`⌃Tab`);
   * `false` requires Command with no Control (the editor's own `⌃E` must stay
   * a caret key). Unset means "either", which is how `⌘S` also answers `⌃S`.
   */
  ctrl?: boolean;
  /** The list glyph, when the key's own glyph would read wrong (`Tab` in a tab row). */
  glyph?: string;
}

export interface Shortcut {
  /** Stable command id the handlers ask for. */
  id: string;
  /** The Settings row label; a shared row declares `rowLabel` instead. */
  label: string;
  group: ShortcutGroup;
  scope: Scope;
  /** Normally one; a verb with two accepted keys declares both. */
  chords: Chord[];
  /** The Electron accelerator when the native menu owns (or mirrors) the key. */
  menu?: string;
  /** `false` for a real binding we do not advertise in the Settings list. */
  list?: boolean;
  /** Several ids with the same `row` render as one Settings row. */
  row?: string;
  /** The row label when "A / B" would read wrong. */
  rowLabel?: string;
  /** A scope qualifier shown after the keys (`Continuous`, `caret in a block`). */
  note?: string;
}

/** What `matches` needs from a DOM or React keyboard event. */
export interface KeyEventLike {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

const GROUP_ORDER: readonly ShortcutGroup[] = ['Shell', 'View', 'Editor', 'Page'];

const KEY_GLYPHS: Readonly<Record<string, string>> = {
  Enter: '⏎',
  Tab: '⇥',
  Escape: 'Esc',
  Backspace: '⌫',
  Delete: '⌦',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ' ': 'Space',
  '-': '−',
  '+': '+',
};

/** `⇧⌘Z`, `⌃⏎`, `⌥↑`: Apple's order, then the key. */
export function display(chord: Chord): string {
  let text = '';
  if (chord.ctrl === true) text += '⌃';
  if (chord.alt === true) text += '⌥';
  if (chord.shift === true) text += '⇧';
  if (chord.mod === true) text += '⌘';
  const glyph =
    chord.glyph ??
    KEY_GLYPHS[chord.key] ??
    (chord.key.length === 1 ? chord.key.toUpperCase() : chord.key);
  return `${text}${glyph}`;
}

function keyMatches(event: KeyEventLike, chord: Chord): boolean {
  // A declared physical key wins: the character it produces depends on the
  // layout and on Shift (`⇧]` is `}` on a US layout).
  if (chord.code !== undefined) return event.code === chord.code;
  const key = chord.key;
  if (/^[0-9]$/.test(key)) return event.code === `Digit${key}`;
  const produced = event.key.toLowerCase();
  if (produced === key.toLowerCase()) return true;
  // `⌘+` is the same physical key as `⌘=`: the plus is a shifted character, not
  // an extra modifier, so the binding accepts both (shipped behaviour).
  if (key === '+' && produced === '=') return true;
  return false;
}

function modifiersMatch(event: KeyEventLike, chord: Chord): boolean {
  // A chord whose key *is* a shifted character (`⌘+`) carries its shift in the
  // character, so its shift state is not constrained.
  if (chord.key !== '+' && event.shiftKey !== (chord.shift === true)) return false;
  if (event.altKey !== (chord.alt === true)) return false;
  if (chord.ctrl === true) return event.ctrlKey && !event.metaKey;
  if (chord.ctrl === false) return event.metaKey && !event.ctrlKey;
  if (chord.mod === true) return event.metaKey || event.ctrlKey;
  return !event.metaKey && !event.ctrlKey;
}

function chordMatches(event: KeyEventLike, chord: Chord): boolean {
  return keyMatches(event, chord) && modifiersMatch(event, chord);
}

const BY_ID = new Map<string, Shortcut>();

function cmd(key: string, extra: Partial<Chord> = {}): Chord {
  return { key, mod: true, ...extra };
}

function cmdShift(key: string, extra: Partial<Chord> = {}): Chord {
  return { key, mod: true, shift: true, ...extra };
}

/**
 * Every application binding. Declaration order is the Settings row order
 * inside a group; `list: false` entries are declared next to their surface.
 */
export const SHORTCUTS: readonly Shortcut[] = [
  /* ------------------------------------------------------------------ Shell */
  {
    id: 'new-note',
    label: 'New note',
    group: 'Shell',
    scope: 'global',
    chords: [cmd('n')],
    menu: 'CmdOrCtrl+N',
  },
  {
    id: 'new-chapter',
    label: 'New chapter',
    group: 'Shell',
    scope: 'global',
    chords: [cmdShift('n')],
    menu: 'CmdOrCtrl+Shift+N',
  },
  {
    id: 'open-note',
    label: 'Open note…',
    group: 'Shell',
    scope: 'global',
    chords: [cmd('o')],
    menu: 'CmdOrCtrl+O',
  },
  {
    id: 'open-markdown',
    label: 'Open Markdown…',
    group: 'Shell',
    scope: 'global',
    chords: [cmdShift('o')],
    menu: 'CmdOrCtrl+Shift+O',
    list: false,
  },
  {
    id: 'save',
    label: 'Save',
    group: 'Shell',
    scope: 'global',
    chords: [cmd('s')],
    menu: 'CmdOrCtrl+S',
  },
  {
    id: 'export-pdf',
    label: 'Export PDF…',
    group: 'Shell',
    scope: 'global',
    // `⌘P` is the universal "produce a document" key (P2). v1 is unreleased,
    // so it replaces the old `⇧⌘E` instead of aliasing it.
    chords: [cmd('p')],
    menu: 'CmdOrCtrl+P',
  },
  {
    id: 'close-tab',
    label: 'Close tab',
    group: 'Shell',
    scope: 'global',
    chords: [cmd('w')],
    menu: 'CmdOrCtrl+W',
  },
  {
    id: 'reopen-tab',
    label: 'Reopen closed tab',
    group: 'Shell',
    scope: 'global',
    chords: [cmdShift('t')],
    menu: 'CmdOrCtrl+Shift+T',
  },
  {
    id: 'close-window',
    label: 'Close window',
    group: 'Shell',
    scope: 'global',
    chords: [cmdShift('w')],
    menu: 'CmdOrCtrl+Shift+W',
    list: false,
  },
  {
    id: 'tab-next',
    label: 'Next tab',
    group: 'Shell',
    scope: 'global',
    chords: [{ key: 'Tab', ctrl: true, glyph: 'Tab' }],
    row: 'tab-cycle',
    rowLabel: 'Next / previous tab',
  },
  {
    id: 'tab-previous',
    label: 'Previous tab',
    group: 'Shell',
    scope: 'global',
    chords: [{ key: 'Tab', ctrl: true, shift: true, glyph: 'Tab' }],
    row: 'tab-cycle',
  },
  {
    // Older browser tab cycling, matched by physical key: with Shift held a US
    // layout reports `{`/`}` as the character, so only `KeyboardEvent.code`
    // identifies the bracket. The list keeps the two discoverable pairs.
    id: 'tab-previous-bracket',
    label: 'Previous tab',
    group: 'Shell',
    scope: 'global',
    chords: [cmdShift('[', { code: 'BracketLeft' })],
    list: false,
  },
  {
    id: 'tab-next-bracket',
    label: 'Next tab',
    group: 'Shell',
    scope: 'global',
    chords: [cmdShift(']', { code: 'BracketRight' })],
    list: false,
  },
  {
    id: 'command-palette',
    label: 'Command palette',
    group: 'Shell',
    scope: 'global',
    chords: [cmd('k')],
    menu: 'CmdOrCtrl+K',
  },
  {
    id: 'find',
    label: 'Find in note',
    group: 'Shell',
    scope: 'global',
    chords: [cmd('f')],
    menu: 'CmdOrCtrl+F',
  },
  {
    id: 'find-next',
    label: 'Next match',
    group: 'Shell',
    scope: 'global',
    chords: [cmd('g')],
    menu: 'CmdOrCtrl+G',
    row: 'find-step',
    rowLabel: 'Next / previous match',
  },
  {
    id: 'find-previous',
    label: 'Previous match',
    group: 'Shell',
    scope: 'global',
    chords: [cmdShift('g')],
    menu: 'CmdOrCtrl+Shift+G',
    row: 'find-step',
  },
  {
    // Escape closes the find bar and restores the selection it saved. `⇧Esc`
    // is the second chord B1 dropped when Escape became an unmodified chord;
    // it is restored here on this entry only, never by loosening every Escape.
    id: 'close-find',
    label: 'Close find',
    group: 'Shell',
    scope: 'global',
    chords: [{ key: 'Escape' }, { key: 'Escape', shift: true }],
    list: false,
  },
  {
    id: 'settings',
    label: 'Settings',
    group: 'Shell',
    scope: 'global',
    chords: [cmd(',')],
    menu: 'CmdOrCtrl+,',
  },
  {
    id: 'toggle-sidebar',
    label: 'Toggle sidebar',
    group: 'Shell',
    scope: 'global',
    chords: [cmd('\\')],
    menu: 'CmdOrCtrl+\\',
  },
  {
    id: 'undo',
    label: 'Undo',
    group: 'Shell',
    scope: 'global',
    chords: [cmd('z')],
    menu: 'CmdOrCtrl+Z',
    row: 'history',
    rowLabel: 'Undo / Redo',
  },
  {
    id: 'redo',
    label: 'Redo',
    group: 'Shell',
    scope: 'global',
    chords: [cmdShift('z')],
    menu: 'CmdOrCtrl+Shift+Z',
    row: 'history',
  },

  // Native responder actions: the OS Edit roles own the key and the renderer
  // never sees it. They are catalogued so the context menu's hints come from
  // one place too; the Settings list does not advertise them.
  {
    id: 'text-cut',
    label: 'Cut',
    group: 'Shell',
    scope: 'global',
    chords: [cmd('x')],
    list: false,
  },
  {
    id: 'text-copy',
    label: 'Copy',
    group: 'Shell',
    scope: 'global',
    chords: [cmd('c')],
    list: false,
  },
  {
    id: 'text-paste',
    label: 'Paste',
    group: 'Shell',
    scope: 'global',
    chords: [cmd('v')],
    list: false,
  },
  {
    id: 'text-select-all',
    label: 'Select All',
    group: 'Shell',
    scope: 'global',
    chords: [cmd('a')],
    list: false,
  },

  /* ------------------------------------------------------------------- View */
  {
    id: 'continuous-layout',
    label: 'Continuous',
    group: 'View',
    scope: 'global',
    chords: [cmd('2')],
    row: 'layout',
    rowLabel: 'Continuous / Page',
  },
  {
    id: 'page-layout',
    label: 'Page',
    group: 'View',
    scope: 'global',
    chords: [cmd('3')],
    row: 'layout',
  },
  {
    id: 'toggle-mode',
    label: 'Edit / Read',
    group: 'View',
    scope: 'global',
    // Command only: Control+E is the editor's native end-of-line key.
    chords: [cmd('e', { ctrl: false })],
  },
  {
    id: 'zoom-in',
    label: 'Zoom in',
    group: 'View',
    scope: 'global',
    chords: [cmd('+')],
    menu: 'CmdOrCtrl+Plus',
    row: 'zoom-step',
    rowLabel: 'Zoom in / out',
  },
  {
    id: 'zoom-out',
    label: 'Zoom out',
    group: 'View',
    scope: 'global',
    chords: [cmd('-')],
    menu: 'CmdOrCtrl+-',
    row: 'zoom-step',
  },
  {
    id: 'reset-zoom',
    label: 'Reset zoom',
    group: 'View',
    scope: 'global',
    chords: [cmd('0')],
    menu: 'CmdOrCtrl+0',
  },
  {
    id: 'fit-width',
    label: 'Fit width',
    group: 'View',
    scope: 'global',
    chords: [cmdShift('0')],
    menu: 'CmdOrCtrl+Shift+0',
    list: false,
  },
  {
    // Menu and palette only: the product owner removed the bare-Shift `⇧1`
    // that used to fit the page, so this verb has no key.
    id: 'fit-page',
    label: 'Fit page',
    group: 'View',
    scope: 'global',
    chords: [],
    list: false,
  },

  /* ----------------------------------------------------------------- Editor */
  {
    id: 'add-child',
    label: 'Add child',
    group: 'Editor',
    scope: 'editor',
    chords: [{ key: 'Enter', ctrl: true }],
  },
  {
    id: 'add-sibling',
    label: 'Add sibling',
    group: 'Editor',
    scope: 'editor',
    chords: [{ key: 'Enter', alt: true }],
  },
  {
    id: 'branch-from-selection',
    label: 'Branch from selection',
    group: 'Editor',
    scope: 'editor',
    chords: [cmdShift('Enter')],
  },
  {
    id: 'indent',
    label: 'Indent',
    group: 'Editor',
    scope: 'editor',
    chords: [{ key: 'Tab' }],
    row: 'indent-step',
    rowLabel: 'Indent / outdent',
  },
  {
    id: 'outdent',
    label: 'Outdent',
    group: 'Editor',
    scope: 'editor',
    chords: [{ key: 'Tab', shift: true }],
    row: 'indent-step',
  },
  {
    id: 'delete-block',
    label: 'Delete block',
    group: 'Editor',
    scope: 'editor',
    chords: [cmd('Backspace')],
    note: 'or ⌫ on a selected block',
  },
  {
    id: 'delete-block-selected',
    label: 'Delete block',
    group: 'Editor',
    scope: 'editor',
    chords: [{ key: 'Delete' }],
    list: false,
  },
  {
    id: 'collapse',
    label: 'Collapse / expand',
    group: 'Editor',
    scope: 'editor',
    chords: [cmd('.')],
  },
  {
    id: 'focus-branch',
    label: 'Focus branch',
    group: 'Editor',
    scope: 'global',
    chords: [cmdShift('f')],
    menu: 'CmdOrCtrl+Shift+F',
  },
  {
    id: 'link',
    label: 'Link',
    group: 'Editor',
    scope: 'editor',
    chords: [cmdShift('k')],
  },
  {
    id: 'link-reference',
    label: 'Link as reference',
    group: 'Editor',
    scope: 'global',
    chords: [cmdShift('l')],
  },
  {
    id: 'highlight',
    label: 'Highlight',
    group: 'Editor',
    scope: 'editor',
    chords: [cmdShift('h')],
  },
  {
    id: 'block-previous',
    label: 'Previous block',
    group: 'Editor',
    scope: 'editor',
    chords: [cmd('ArrowUp')],
    row: 'block-step',
    rowLabel: 'Previous / next block',
    note: 'Continuous, caret in a block',
  },
  {
    id: 'block-next',
    label: 'Next block',
    group: 'Editor',
    scope: 'editor',
    chords: [cmd('ArrowDown')],
    row: 'block-step',
  },
  {
    id: 'block-move-up',
    label: 'Move block up',
    group: 'Editor',
    scope: 'editor',
    chords: [{ key: 'ArrowUp', alt: true }],
    row: 'block-move',
    rowLabel: 'Move block',
    note: 'Continuous',
  },
  {
    id: 'block-move-down',
    label: 'Move block down',
    group: 'Editor',
    scope: 'editor',
    chords: [{ key: 'ArrowDown', alt: true }],
    row: 'block-move',
  },

  /* ------------------------------------------------------------------- Page */
  {
    id: 'page-previous',
    label: 'Previous page',
    group: 'Page',
    scope: 'global',
    // Command only, like the shipped handler: Control+Arrow is word navigation.
    chords: [cmd('ArrowUp', { ctrl: false })],
    row: 'page-step',
    rowLabel: 'Previous / next page',
    note: 'works from the header and the pager',
  },
  {
    id: 'page-next',
    label: 'Next page',
    group: 'Page',
    scope: 'global',
    chords: [cmd('ArrowDown', { ctrl: false })],
    row: 'page-step',
  },
  {
    id: 'page-open-block',
    label: 'Open / edit the selected block',
    group: 'Page',
    scope: 'page',
    chords: [{ key: 'Enter' }],
  },
  {
    id: 'page-clear-selection',
    label: 'Clear selection',
    group: 'Page',
    scope: 'page',
    chords: [{ key: 'Escape' }],
  },
  {
    // The block overlay is a rich-text editor, so its keys are editor-local and
    // the page canvas keeps Escape for the selection.
    id: 'page-commit',
    label: 'Commit Page Edit',
    group: 'Page',
    scope: 'editor',
    chords: [{ key: 'Escape' }, cmd('Enter')],
  },

  /* ------------------------------------------------------------------- Find */
  {
    id: 'find-field-next',
    label: 'Next match',
    group: 'Shell',
    scope: 'find',
    chords: [{ key: 'Enter' }],
    list: false,
  },
  {
    id: 'find-field-previous',
    label: 'Previous match',
    group: 'Shell',
    scope: 'find',
    chords: [{ key: 'Enter', shift: true }],
    list: false,
  },
  {
    id: 'find-field-down',
    label: 'Next match',
    group: 'Shell',
    scope: 'find',
    chords: [{ key: 'ArrowDown' }],
    list: false,
  },
  {
    id: 'find-field-up',
    label: 'Previous match',
    group: 'Shell',
    scope: 'find',
    chords: [{ key: 'ArrowUp' }],
    list: false,
  },
  {
    id: 'find-field-first',
    label: 'First match',
    group: 'Shell',
    scope: 'find',
    chords: [{ key: 'Home' }],
    list: false,
  },
  {
    id: 'find-field-last',
    label: 'Last match',
    group: 'Shell',
    scope: 'find',
    chords: [{ key: 'End' }],
    list: false,
  },
  {
    id: 'find-field-close',
    label: 'Close find',
    group: 'Shell',
    scope: 'find',
    chords: [{ key: 'Escape' }],
    list: false,
  },
];

for (const shortcut of SHORTCUTS) {
  if (BY_ID.has(shortcut.id)) {
    throw new Error(`Duplicate shortcut id: ${shortcut.id}`);
  }
  BY_ID.set(shortcut.id, shortcut);
}

function shortcutFor(id: string): Shortcut {
  const shortcut = BY_ID.get(id);
  if (shortcut === undefined) throw new Error(`Unknown shortcut id: ${id}`);
  return shortcut;
}

/** True when `event` is one of the chords of `id`. */
export function matches(event: KeyEventLike, id: string): boolean {
  return shortcutFor(id).chords.some((chord) => chordMatches(event, chord));
}

/**
 * The display strings for one id, joined with ` / ` when it has two chords.
 * `undefined` for a verb with no key (Fit page), which is exactly what a
 * palette row with no hint needs.
 */
export function shortcutHint(id: string): string | undefined {
  const chords = shortcutFor(id).chords.map(display);
  return chords.length === 0 ? undefined : chords.join(' / ');
}

const TIPTAP_KEY_GLYPHS: Readonly<Record<string, string>> = {
  ' ': 'Space',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
};

function tipTapKeyName(key: string): string {
  return TIPTAP_KEY_GLYPHS[key] ?? (key.length === 1 ? key.toLowerCase() : key);
}

/**
 * `['Mod-Shift-k']` for the TipTap keymap, generated from the same chords.
 * `ctrl: true` is `Ctrl-`, `mod` is `Mod-`, and the two are never combined.
 */
export function tiptapKeys(id: string): string[] {
  return shortcutFor(id).chords.map((chord) => {
    const parts: string[] = [];
    if (chord.ctrl === true) parts.push('Ctrl');
    else if (chord.mod === true) parts.push('Mod');
    if (chord.alt === true) parts.push('Alt');
    if (chord.shift === true) parts.push('Shift');
    parts.push(tipTapKeyName(chord.key));
    return parts.join('-');
  });
}

export interface ShortcutListRow {
  /** The row id: the shortcut id, or the shared `row` when several ids share it. */
  id: string;
  label: string;
  /** Every chord of the row, in declaration order, joined with ` / `. */
  keys: string;
  note?: string;
}

export interface ShortcutListGroup {
  group: ShortcutGroup;
  rows: ShortcutListRow[];
}

/** The curated rows the Settings page renders, in group order. */
export function shortcutsForList(): ShortcutListGroup[] {
  const groups: ShortcutListGroup[] = [];
  for (const group of GROUP_ORDER) {
    const seen = new Set<string>();
    const rows: ShortcutListRow[] = [];
    for (const shortcut of SHORTCUTS) {
      if (shortcut.group !== group || shortcut.list === false) continue;
      const rowId = shortcut.row ?? shortcut.id;
      if (seen.has(rowId)) continue;
      seen.add(rowId);
      const members = SHORTCUTS.filter(
        (item) =>
          item.group === group &&
          item.list !== false &&
          (item.row ?? item.id) === rowId,
      );
      const label =
        members.find((item) => item.rowLabel !== undefined)?.rowLabel ??
        members.map((item) => item.label).join(' / ');
      const keys = members
        .map((item) => item.chords.map(display).join(' / '))
        .filter((value) => value.length > 0)
        .join(' / ');
      const note = members.find((item) => item.note !== undefined)?.note;
      rows.push({ id: rowId, label, keys, ...(note === undefined ? {} : { note }) });
    }
    groups.push({ group, rows });
  }
  return groups;
}

/** Every id, for the source guard and the tests. */
export function shortcutIds(): string[] {
  return SHORTCUTS.map((shortcut) => shortcut.id);
}
