/**
 * The application menu template (pure, Electron-free at runtime).
 *
 * `main/menu.ts` installs the result; this module only describes the menu so a
 * unit test can assert the label case, the ids, and the accelerators without an
 * Electron process (copy-plan D-03: sentence case everywhere, ids and shortcuts
 * unchanged). The `electron` import is type-only and erased at build time.
 *
 * Application items derive from `shared/commands.ts`: this file owns only the
 * macOS standard roles, the separators, and the pinned ids the UI suites click.
 * A command's label, accelerator and chord come from the manifest and the
 * catalogue, so the menu cannot drift from the palette or the key router.
 */

import type { MenuItemConstructorOptions } from 'electron';
import type { MenuCommand } from '../shared/api.js';
import {
  APP_COMMANDS,
  type AppCommand,
  type MenuSection,
} from '../shared/commands.js';
import { menuAccelerator } from '../shared/shortcuts.js';

export type MenuSender = (command: MenuCommand) => void;

export interface MenuTemplateOptions {
  isMac: boolean;
  send: MenuSender;
  getWindow: () => { close(): void } | null;
}

type MenuRole = NonNullable<MenuItemConstructorOptions['role']>;

/**
 * One position inside a section. A command's `menu.order` shares this scale, so
 * separators and native roles sit between the app items without a second list.
 */
interface MenuSlot {
  order: number;
  separator?: true;
  roles?: readonly MenuRole[];
}

/**
 * The deltas a menu keeps outside the command manifest: separators and the
 * macOS standard roles. Labels, accelerators and click behavior of every app
 * item come from the manifest.
 */
const SECTION_SLOTS: Readonly<Record<MenuSection, readonly MenuSlot[]>> = {
  app: [
    { order: 10, roles: ['about'] },
    { order: 20, separator: true },
    // Settings… (manifest order 30) sits here.
    { order: 40, separator: true },
    { order: 50, roles: ['services'] },
    { order: 60, separator: true },
    { order: 70, roles: ['hide', 'hideOthers', 'unhide'] },
    { order: 100, separator: true },
    { order: 110, roles: ['quit'] },
  ],
  file: [
    // New note, Open note…, Open Markdown…, New chapter (10–40).
    { order: 45, separator: true },
    // Save, Export PDF… (50–60).
    { order: 65, separator: true },
    // Close tab, Reopen closed tab, Close Window (70–90).
  ],
  edit: [
    // Undo, Redo (10–20).
    { order: 30, separator: true },
    // Find…, Find Next, Find Previous (40–60).
    { order: 70, separator: true },
    { order: 80, roles: ['cut', 'copy', 'paste', 'pasteAndMatchStyle', 'delete', 'selectAll'] },
  ],
  view: [
    // Command palette…, Toggle sidebar (10–20).
    { order: 30, separator: true },
    { order: 35, roles: ['reload', 'forceReload', 'toggleDevTools'] },
    { order: 38, separator: true },
    // Fit width … Zoom out (40–90).
    { order: 95, separator: true },
    { order: 100, roles: ['togglefullscreen'] },
  ],
  help: [
    // Keyboard shortcuts (10).
  ],
};

/**
 * The renderer owns every application chord: the native menu displays the
 * catalogue accelerator and registers none, so one keypress has exactly one
 * delivery path (the key router). The standard menu roles keep their own
 * Electron accelerators.
 */
interface OrderedItem {
  order: number;
  item: MenuItemConstructorOptions;
}

function appMenuItem(
  command: AppCommand,
  send: MenuSender,
  getWindow: MenuTemplateOptions['getWindow'],
): MenuItemConstructorOptions {
  if (command.label === undefined) {
    throw new Error('Menu item is missing its label');
  }
  const accelerator =
    command.shortcutId === undefined ? undefined : menuAccelerator(command.shortcutId);
  return {
    ...(command.menu?.itemId === undefined ? {} : { id: command.menu.itemId }),
    label: command.label,
    ...(accelerator === undefined ? {} : { accelerator, registerAccelerator: false }),
    click: () => {
      // Close Window is a window action, not a renderer command with a listener
      // of its own; every other app item sends its wire id.
      if (command.id === 'close-window') getWindow()?.close();
      else if (command.wire !== undefined) send(command.wire);
    },
  };
}

/** One section: the standard roles and the manifest commands on one scale. */
function sectionItems(
  section: MenuSection,
  send: MenuSender,
  getWindow: MenuTemplateOptions['getWindow'],
): MenuItemConstructorOptions[] {
  const ordered: OrderedItem[] = [];
  for (const slot of SECTION_SLOTS[section]) {
    if (slot.separator === true) {
      ordered.push({ order: slot.order, item: { type: 'separator' } });
    }
    for (const role of slot.roles ?? []) {
      ordered.push({ order: slot.order, item: { role } });
    }
  }
  for (const command of APP_COMMANDS) {
    if (command.menu?.section !== section) continue;
    ordered.push({ order: command.menu.order, item: appMenuItem(command, send, getWindow) });
  }
  ordered.sort((left, right) => left.order - right.order);
  return ordered.map((entry) => entry.item);
}

export function buildMenuTemplate(options: MenuTemplateOptions): MenuItemConstructorOptions[] {
  const { isMac, send, getWindow } = options;
  const template: MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({ label: 'NoteForest', submenu: sectionItems('app', send, getWindow) });
  }

  template.push({ label: 'File', submenu: sectionItems('file', send, getWindow) });
  template.push({ label: 'Edit', submenu: sectionItems('edit', send, getWindow) });
  template.push({ label: 'View', submenu: sectionItems('view', send, getWindow) });

  template.push({
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : []),
    ],
  });

  template.push({ role: 'help', submenu: sectionItems('help', send, getWindow) });

  return template;
}
