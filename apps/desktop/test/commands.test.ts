import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildMenuTemplate } from '../src/main/menu-template';
import { MENU_COMMANDS } from '../src/shared/api';
import {
  APP_COMMANDS,
  appCommandIds,
  commandById,
  ownsGlobalChord,
  type AppCommandId,
} from '../src/shared/commands';
import {
  SHORTCUTS,
  hasChord,
  menuAccelerator,
  shortcutScope,
} from '../src/shared/shortcuts';
import {
  GUEST_PALETTE_ORDER,
  NOTE_PALETTE_ORDER,
} from '../src/renderer/src/commands/palette';
import {
  BLOCK_COMMANDS,
  blockCommandById,
} from '../src/renderer/src/commands/block-commands';

const root = resolve(import.meta.dirname, '..');

/** The shipped IPC contract, written out once. A change here is a contract change. */
const SHIPPED_MENU_COMMANDS = [
  'new-document',
  'open-document',
  'open-markdown',
  'save',
  'close-tab',
  'close-window',
  'reopen-tab',
  'toggle-sidebar',
  'command-palette',
  'settings',
  'settings-shortcuts',
  'new-chapter',
  'add-block',
  'flush',
  'export-pdf',
  'undo',
  'redo',
  'zoom-in',
  'zoom-out',
  'zoom-reset',
  'fit-width',
  'fit-page',
  'focus-branch',
  'find-open',
  'find-next',
  'find-previous',
];

/** The shipped palette inventory, in the order the adapter renders it. */
const SHIPPED_NOTE_PALETTE = [
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

const SHIPPED_GUEST_PALETTE = [
  'open-markdown',
  'toggle-interaction-mode',
  'reveal',
  'close-tab',
  'toggle-sidebar',
  'settings',
];

interface FlatItem {
  label?: string;
  role?: string;
  type?: string;
  id?: string;
  accelerator?: string;
  registerAccelerator?: boolean;
}

function submenu(
  template: ReturnType<typeof buildMenuTemplate>,
  label: string,
): FlatItem[] {
  const top = template.find(
    (entry) => entry.label === label || (entry.role === 'help' && label === 'Help'),
  );
  return (top?.submenu ?? []) as FlatItem[];
}

/** One menu as the user reads it: separators, roles, and app labels. */
function sequence(items: FlatItem[]): string[] {
  return items.map((item) => {
    if (item.type === 'separator') return '─';
    if (typeof item.role === 'string') return item.role;
    return item.label ?? '';
  });
}

function macTemplate() {
  return buildMenuTemplate({ isMac: true, send: () => undefined, getWindow: () => null });
}

describe('the wire contract', () => {
  it('keeps the 26 shipped ids, unchanged and unique', () => {
    expect(MENU_COMMANDS).toEqual(SHIPPED_MENU_COMMANDS);
    expect(new Set(MENU_COMMANDS).size).toBe(26);
  });

  it('is covered by the manifest exactly once, both directions', () => {
    const wire = APP_COMMANDS.flatMap((command) =>
      command.wire === undefined ? [] : [command.wire],
    );
    expect(new Set(wire).size, 'no duplicated wire id').toBe(wire.length);
    expect([...wire].sort()).toEqual([...MENU_COMMANDS].sort());
  });
});

describe('the command manifest', () => {
  it('declares every command once', () => {
    const ids = appCommandIds();
    expect(ids.length).toBe(40);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every command at least one surface', () => {
    const orphans = APP_COMMANDS.filter((command) => {
      const surfaces = [
        command.menu !== undefined,
        command.palette !== undefined,
        command.wire !== undefined,
        command.shortcutId !== undefined,
      ];
      return !surfaces.includes(true);
    });
    expect(orphans.map((command) => command.id)).toEqual([]);
  });

  it('labels every command a menu or the palette renders', () => {
    const unlabeled = APP_COMMANDS.filter(
      (command) =>
        (command.menu !== undefined || command.palette !== undefined) &&
        command.label === undefined,
    );
    expect(unlabeled.map((command) => command.id)).toEqual([]);
  });

  it('links only real shortcut ids and never shares one', () => {
    const seen = new Map<string, string>();
    for (const command of APP_COMMANDS) {
      if (command.shortcutId === undefined) continue;
      // Throws on an unknown id: the manifest cannot link a typo.
      expect(() => shortcutScope(command.shortcutId ?? ''), command.id).not.toThrow();
      const owner = seen.get(command.shortcutId);
      expect(owner, `${command.id} repeats ${command.shortcutId}`).toBeUndefined();
      seen.set(command.shortcutId, command.id);
    }
    // Fit page is the one verb with no chord at all.
    expect(hasChord('fit-page')).toBe(false);
  });

  it('places every menu item once, with a label and a wire id', () => {
    const positions = new Set<string>();
    for (const command of APP_COMMANDS) {
      if (command.menu === undefined) continue;
      expect(command.label, `${command.id} has a menu label`).toBeDefined();
      expect(command.wire, `${command.id} has a wire id`).toBeDefined();
      const position = `${command.menu.section}:${command.menu.order}`;
      expect(positions.has(position), `${command.id} collides at ${position}`).toBe(false);
      positions.add(position);
    }
  });

  it('maps every global chord to exactly one command, except the four native roles', () => {
    const roles = new Set(['text-cut', 'text-copy', 'text-paste', 'text-select-all']);
    const globalWithChord = SHORTCUTS.filter(
      (shortcut) =>
        shortcut.scope === 'global' && shortcut.chords.length > 0 && !roles.has(shortcut.id),
    );
    for (const shortcut of globalWithChord) {
      const owners = APP_COMMANDS.filter((command) => command.shortcutId === shortcut.id);
      expect(owners.length, `${shortcut.id} has one command owner`).toBe(1);
      expect(ownsGlobalChord(owners[0]!), `${shortcut.id} is routed`).toBe(true);
    }
    // The reverse direction: every chord the router maps is a global chord.
    for (const command of APP_COMMANDS.filter(ownsGlobalChord)) {
      expect(shortcutScope(command.shortcutId ?? '')).toBe('global');
    }
  });
});

describe('the derived native menu', () => {
  const template = macTemplate();

  it('reproduces the shipped File sequence', () => {
    expect(sequence(submenu(template, 'File'))).toEqual([
      'New note',
      'Open note…',
      'Open Markdown…',
      'New chapter',
      '─',
      'Save',
      'Export PDF…',
      '─',
      'Close tab',
      'Reopen closed tab',
      'Close Window',
    ]);
  });

  it('reproduces the shipped Edit sequence', () => {
    expect(sequence(submenu(template, 'Edit'))).toEqual([
      'Undo',
      'Redo',
      '─',
      'Find…',
      'Find Next',
      'Find Previous',
      '─',
      'cut',
      'copy',
      'paste',
      'pasteAndMatchStyle',
      'delete',
      'selectAll',
    ]);
  });

  it('reproduces the shipped View sequence', () => {
    expect(sequence(submenu(template, 'View'))).toEqual([
      'Command palette…',
      'Toggle sidebar',
      '─',
      'reload',
      'forceReload',
      'toggleDevTools',
      '─',
      'Fit width',
      'Fit page',
      'Focus branch',
      'Reset zoom',
      'Zoom in',
      'Zoom out',
      '─',
      'togglefullscreen',
    ]);
  });

  it('reproduces the shipped App, Window and Help sequences', () => {
    expect(sequence(submenu(template, 'NoteForest'))).toEqual([
      'about',
      '─',
      'Settings…',
      '─',
      'services',
      '─',
      'hide',
      'hideOthers',
      'unhide',
      '─',
      'quit',
    ]);
    expect(sequence(submenu(template, 'Window'))).toEqual([
      'minimize',
      'zoom',
      '─',
      'front',
    ]);
    expect(sequence(submenu(template, 'Help'))).toEqual(['Keyboard shortcuts']);
  });

  it('keeps the eight pinned item ids in document order', () => {
    const ids: string[] = [];
    const collect = (items: readonly FlatItem[]): void => {
      for (const item of items) {
        if (item.id !== undefined) ids.push(item.id);
        const nested = (item as { submenu?: FlatItem[] }).submenu;
        if (Array.isArray(nested)) collect(nested);
      }
    };
    collect(template as unknown as FlatItem[]);
    expect(ids).toEqual([
      'menu-export-pdf',
      'menu-undo',
      'menu-redo',
      'menu-find',
      'menu-find-next',
      'menu-find-previous',
      'menu-fit-page',
      'menu-keyboard-shortcuts',
    ]);
  });

  it('displays the catalogue accelerator and registers no app accelerator', () => {
    const expected = new Map(
      SHORTCUTS.flatMap((shortcut) =>
        shortcut.menu === undefined ? [] : [[shortcut.menu, shortcut.id] as const],
      ),
    );
    const seen: string[] = [];
    const walk = (items: readonly FlatItem[]): void => {
      for (const item of items) {
        if (item.accelerator !== undefined) {
          expect(item.registerAccelerator, `${item.accelerator} is renderer-owned`).toBe(false);
          expect(expected.has(item.accelerator), `${item.accelerator} is catalogued`).toBe(true);
          seen.push(item.accelerator);
        }
        const nested = (item as { submenu?: FlatItem[] }).submenu;
        if (Array.isArray(nested)) walk(nested);
      }
    };
    walk(template as unknown as FlatItem[]);
    expect([...seen].sort()).toEqual([...expected.keys()].sort());

    // Every menu item's displayed accelerator is the one its command declares.
    for (const command of APP_COMMANDS) {
      if (command.menu === undefined) continue;
      const items = submenu(template, sectionLabel(command.menu.section));
      const target = items.find((item) => item.label === command.label);
      expect(target, `${command.id} is in its section`).toBeDefined();
      const accelerator =
        command.shortcutId === undefined ? undefined : menuAccelerator(command.shortcutId);
      expect(target?.accelerator, `${command.id} accelerator`).toBe(accelerator);
    }
  });

  it('keeps the only accelerator strings in the catalogue', async () => {
    const source = await readFile(resolve(root, 'src/main/menu-template.ts'), 'utf8');
    expect(source).not.toMatch(/CmdOrCtrl|CommandOrControl/);
    const catalogue = await readFile(resolve(root, 'src/shared/shortcuts.ts'), 'utf8');
    expect(catalogue).toContain("menu: 'CmdOrCtrl+N'");
  });
});

function sectionLabel(section: 'app' | 'file' | 'edit' | 'view' | 'help'): string {
  return {
    app: 'NoteForest',
    file: 'File',
    edit: 'Edit',
    view: 'View',
    help: 'Help',
  }[section];
}

describe('the palette inventory', () => {
  it('keeps the shipped note order and the six guest rows', () => {
    expect(NOTE_PALETTE_ORDER).toEqual(SHIPPED_NOTE_PALETTE);
    expect(GUEST_PALETTE_ORDER).toEqual(SHIPPED_GUEST_PALETTE);
    expect(GUEST_PALETTE_ORDER.length).toBe(6);
  });

  it('resolves every row and keeps the guest curation inside the note list', () => {
    const blockIds = new Set(BLOCK_COMMANDS.map((command) => command.id));
    for (const id of NOTE_PALETTE_ORDER) {
      expect(
        commandById(id) !== undefined || blockIds.has(id as never),
        `${id} resolves`,
      ).toBe(true);
    }
    for (const id of GUEST_PALETTE_ORDER) {
      expect(NOTE_PALETTE_ORDER).toContain(id);
      const command = commandById(id);
      expect(command?.palette?.guest, `${id} is a guest row`).toBe(true);
      expect(command?.label, `${id} has a row label`).toBeDefined();
    }
  });

  it('keeps the twelve block rows and their author gate', () => {
    expect(BLOCK_COMMANDS.map((command) => command.id)).toEqual([
      'add-child',
      'add-sibling',
      'indent-block',
      'outdent-block',
      'block-text',
      'block-h1',
      'block-h2',
      'block-h3',
      'insert-table',
      'insert-image',
      'insert-math',
      'insert-code',
    ]);
    expect(BLOCK_COMMANDS.map((command) => command.label)).toEqual([
      'Add child block',
      'Add sibling block',
      'Indent block',
      'Outdent block',
      'Block type: Text',
      'Block type: Heading 1',
      'Block type: Heading 2',
      'Block type: Heading 3',
      'Insert table',
      'Insert image…',
      'Insert math…',
      'Toggle code block',
    ]);
    for (const command of BLOCK_COMMANDS) {
      expect(command.requirement, `${command.id} is authoring`).toBe('author');
      expect(blockCommandById(command.id)).toBe(command);
    }
  });

  it('keeps every app row declared in the manifest, and no hidden surface', () => {
    const appIds = new Set<AppCommandId>(appCommandIds());
    for (const id of NOTE_PALETTE_ORDER) {
      if (blockCommandById(id) !== undefined) continue;
      expect(appIds.has(id as AppCommandId), `${id} is a manifest command`).toBe(true);
    }
  });
});
