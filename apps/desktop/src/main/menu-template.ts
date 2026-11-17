/**
 * The application menu template (pure, Electron-free at runtime).
 *
 * `main/menu.ts` installs the result; this module only describes the menu so a
 * unit test can assert the label case, the ids, and the accelerators without an
 * Electron process (copy-plan D-03: sentence case everywhere, ids and shortcuts
 * unchanged). The `electron` import is type-only and erased at build time.
 */

import type { MenuItemConstructorOptions } from 'electron';
import type { MenuCommand } from '../shared/api.js';

export type MenuSender = (command: MenuCommand) => void;

export interface MenuTemplateOptions {
  isMac: boolean;
  send: MenuSender;
  getWindow: () => { close(): void } | null;
}

export function buildMenuTemplate(options: MenuTemplateOptions): MenuItemConstructorOptions[] {
  const { isMac, send, getWindow } = options;
  const template: MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({
      label: 'NoteForest',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Settings…',
          accelerator: 'CmdOrCtrl+,',
          click: () => send('settings'),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  template.push({
    label: 'File',
    submenu: [
      {
        label: 'New note',
        accelerator: 'CmdOrCtrl+N',
        click: () => send('new-document'),
      },
      {
        label: 'Open note…',
        accelerator: 'CmdOrCtrl+O',
        click: () => send('open-document'),
      },
      {
        label: 'Open Markdown…',
        accelerator: 'CmdOrCtrl+Shift+O',
        click: () => send('open-markdown'),
      },
      {
        label: 'New chapter',
        accelerator: 'CmdOrCtrl+Shift+N',
        click: () => send('new-chapter'),
      },
      { type: 'separator' },
      {
        label: 'Save',
        accelerator: 'CmdOrCtrl+S',
        click: () => send('save'),
      },
      {
        id: 'menu-export-pdf',
        label: 'Export PDF…',
        accelerator: 'CmdOrCtrl+P',
        click: () => send('export-pdf'),
      },
      { type: 'separator' },
      {
        label: 'Close tab',
        accelerator: 'CmdOrCtrl+W',
        click: () => send('close-tab'),
      },
      {
        label: 'Reopen closed tab',
        accelerator: 'CmdOrCtrl+Shift+T',
        click: () => send('reopen-tab'),
      },
      {
        label: 'Close Window',
        accelerator: 'CmdOrCtrl+Shift+W',
        click: () => getWindow()?.close(),
      },
    ],
  });

  template.push({
    label: 'Edit',
    submenu: [
      {
        id: 'menu-undo',
        label: 'Undo',
        accelerator: 'CmdOrCtrl+Z',
        // The renderer owns the shortcut so one keypress has exactly one
        // delivery path. The menu item still shows the accelerator and clicks
        // still send the same routed command.
        registerAccelerator: false,
        click: () => send('undo'),
      },
      {
        id: 'menu-redo',
        label: 'Redo',
        accelerator: 'CmdOrCtrl+Shift+Z',
        registerAccelerator: false,
        click: () => send('redo'),
      },
      { type: 'separator' },
      // The find is renderer-owned: the menu shows the standard accelerators
      // and a click sends the same command the keys send.
      {
        id: 'menu-find',
        label: 'Find…',
        accelerator: 'CmdOrCtrl+F',
        registerAccelerator: false,
        click: () => send('find-open'),
      },
      {
        id: 'menu-find-next',
        label: 'Find Next',
        accelerator: 'CmdOrCtrl+G',
        registerAccelerator: false,
        click: () => send('find-next'),
      },
      {
        id: 'menu-find-previous',
        label: 'Find Previous',
        accelerator: 'CmdOrCtrl+Shift+G',
        registerAccelerator: false,
        click: () => send('find-previous'),
      },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'pasteAndMatchStyle' },
      { role: 'delete' },
      { role: 'selectAll' },
    ],
  });

  template.push({
    label: 'View',
    submenu: [
      {
        label: 'Command palette…',
        accelerator: 'CmdOrCtrl+K',
        // Renderer-owned accelerator: one keypress is one toggle path. The menu
        // still shows the shortcut and a menu click sends the same command.
        registerAccelerator: false,
        click: () => send('command-palette'),
      },
      {
        label: 'Toggle sidebar',
        accelerator: 'CmdOrCtrl+\\',
        click: () => send('toggle-sidebar'),
      },
      { type: 'separator' },
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      {
        label: 'Fit width',
        accelerator: 'CmdOrCtrl+Shift+0',
        registerAccelerator: false,
        click: () => send('fit-width'),
      },
      {
        // No accelerator: the bare-Shift `⇧1` that used to fit the page was
        // removed (it swallowed `!` and `"` in the Page find field).
        id: 'menu-fit-page',
        label: 'Fit page',
        click: () => send('fit-page'),
      },
      {
        label: 'Focus branch',
        accelerator: 'CmdOrCtrl+Shift+F',
        registerAccelerator: false,
        click: () => send('focus-branch'),
      },
      {
        label: 'Reset zoom',
        accelerator: 'CmdOrCtrl+0',
        registerAccelerator: false,
        click: () => send('zoom-reset'),
      },
      {
        label: 'Zoom in',
        accelerator: 'CmdOrCtrl+Plus',
        registerAccelerator: false,
        click: () => send('zoom-in'),
      },
      {
        label: 'Zoom out',
        accelerator: 'CmdOrCtrl+-',
        registerAccelerator: false,
        click: () => send('zoom-out'),
      },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  });

  template.push({
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : []),
    ],
  });

  template.push({
    role: 'help',
    submenu: [
      {
        id: 'menu-keyboard-shortcuts',
        // Opens Settings on the Editor page instead of the default Page page:
        // the menu item promises the shortcut list, not the whole Settings modal.
        label: 'Keyboard shortcuts',
        click: () => send('settings-shortcuts'),
      },
    ],
  });

  return template;
}
